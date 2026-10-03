"""Crea el modelo base de camiseta con UV para el atlas intermedio."""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector

def atlas_uv(left, top, right, bottom):
    """Pillow usa Y hacia abajo; Blender, V hacia arriba."""
    return (left/1024, 1-bottom/1024, right/1024, 1-top/1024)
ATLAS = {"front": atlas_uv(300,148,724,792), "left": atlas_uv(70,180,270,455), "right": atlas_uv(754,180,954,455), "collar": atlas_uv(337,828,687,885)}

def look_at(obj, target): obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def fabric():
    mat=bpy.data.materials.new('Kit fabric'); mat.use_nodes=True
    n=mat.node_tree.nodes; l=mat.node_tree.links; n.clear()
    out=n.new('ShaderNodeOutputMaterial'); bs=n.new('ShaderNodeBsdfPrincipled'); bs.inputs['Roughness'].default_value=.66; bs.inputs['Specular IOR Level'].default_value=.18
    tex=n.new('ShaderNodeTexImage'); tex.name='kit_texture'; tex.interpolation='Linear'
    noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=115; noise.inputs['Detail'].default_value=2
    bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.045; bump.inputs['Distance'].default_value=.018
    l.new(noise.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs['Normal'],bs.inputs['Normal']); l.new(tex.outputs['Color'],bs.inputs['Base Color']); l.new(bs.outputs['BSDF'],out.inputs['Surface'])
    return mat

def grid(name, rows, widths, zs, atlas, mat, sleeve=False):
    cols=8 if sleeve else 13; verts=[]; uv=[]; faces=[]
    for r in range(rows):
        for c in range(cols):
            f=c/(cols-1); half=widths[r]; x=-half+2*half*f
            bulge=-.12*(1-(x/max(half,.01))**2)*(.82 if sleeve else 1); fold=-.012*math.sin((f*3+r*.37)*math.pi)*(.3+r/max(1,rows-1))
            # El cuello recorta el centro de las tres filas superiores; los
            # hombros quedan altos y caen de forma natural hacia él.
            neckline = 0 if sleeve or r > 2 else (.34, .17, .045)[r] * (1 - abs(x) / max(half, .01)) ** 1.7
            hem_curve = .075 * (1 - abs(x) / max(half, .01)) ** 2 if not sleeve and r == rows - 1 else 0
            verts.append((x,bulge+fold,zs[r]-neckline-hem_curve)); uv.append((atlas[0]+f*(atlas[2]-atlas[0]),atlas[3]-r/(rows-1)*(atlas[3]-atlas[1])))
    for r in range(rows-1):
        for c in range(cols-1):
            a=r*cols+c; faces.append((a,a+1,a+cols+1,a+cols))
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices: me.uv_layers[0].data[li].uv=uv[me.loops[li].vertex_index]; poly.use_smooth=True
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); me.materials.append(mat)
    solid=ob.modifiers.new('Soft fabric thickness','SOLIDIFY'); solid.thickness=.036; solid.offset=.35
    sub=ob.modifiers.new('Gentle smoothing','SUBSURF'); sub.levels=1; sub.render_levels=1
    return ob

def sleeve(name, side, atlas, mat):
    ob=grid(name,6,[.56,.61,.59,.55,.49,.45],[2.30,2.07,1.78,1.50,1.28,1.15],atlas,mat,True); ob.location.x=side*1.92; ob.rotation_euler.y=side*math.radians(17); return ob

def collar(mat):
    seg=48; vs=[]; fs=[]
    for i in range(seg):
        a=2*math.pi*i/seg
        for rx,rz in ((.78,.31),(.56,.19)): vs.append((rx*math.cos(a),-.175-.025*math.sin(a),2.53+rz*math.sin(a)))
    for i in range(seg): n=(i+1)%seg; fs.append((i*2,n*2,n*2+1,i*2+1))
    me=bpy.data.meshes.new('Round collar'); me.from_pydata(vs,[],fs); me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            vi=me.loops[li].vertex_index; i,ring=vi//2,vi%2; me.uv_layers[0].data[li].uv=(ATLAS['collar'][0]+i/seg*(ATLAS['collar'][2]-ATLAS['collar'][0]),ATLAS['collar'][1]+ring*(ATLAS['collar'][3]-ATLAS['collar'][1])); p.use_smooth=True
    ob=bpy.data.objects.new('Round collar',me); bpy.context.collection.objects.link(ob); me.materials.append(mat); mod=ob.modifiers.new('Collar thickness','SOLIDIFY'); mod.thickness=.055

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False); mat=fabric()
grid('Torso',17,[1.48,1.64,1.72,1.68,1.58,1.48,1.40,1.36,1.34,1.35,1.37,1.39,1.42,1.44,1.46,1.47,1.45],[2.46,2.36,2.18,1.95,1.62,1.29,.96,.63,.30,-.03,-.36,-.69,-1.02,-1.35,-1.68,-2.00,-2.16],ATLAS['front'],mat)
sleeve('Left sleeve',-1,ATLAS['left'],mat); sleeve('Right sleeve',1,ATLAS['right'],mat); collar(mat)
bpy.ops.object.camera_add(location=(0,-10.8,.16)); cam=bpy.context.object; cam.data.lens=58; look_at(cam,(0,-.05,.2)); bpy.context.scene.camera=cam
for name,loc,energy,size in [('Key softbox',(-3.5,-4.5,6.5),720,5.5),('Fill softbox',(4,-3,2),360,4),('Top rim',(0,1.5,6.5),260,3.5)]:
    bpy.ops.object.light_add(type='AREA',location=loc); light=bpy.context.object; light.name=name; light.data.energy=energy; light.data.shape='DISK'; light.data.size=size; look_at(light,(0,0,.15))
sc=bpy.context.scene; sc.render.engine='BLENDER_EEVEE_NEXT'; sc.eevee.taa_render_samples=16; sc.render.resolution_x=512; sc.render.resolution_y=512; sc.render.resolution_percentage=100; sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'; sc.render.film_transparent=True; sc.view_settings.look='AgX - Medium High Contrast'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
output = Path(args[0]).resolve() if args else Path(__file__).resolve().parents[2] / 'Recursos' / 'Previews' / 'shirt_template.blend'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output))
