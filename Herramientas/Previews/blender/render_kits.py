import bpy, json, sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
jobs=json.loads(Path(args[0]).read_text(encoding='utf-8'))
node=bpy.data.materials['Kit fabric'].node_tree.nodes['kit_texture']
for job in jobs:
    if node.image: bpy.data.images.remove(node.image)
    node.image=bpy.data.images.load(str(Path(job['texture']).resolve()),check_existing=False); node.image.colorspace_settings.name='sRGB'
    bpy.context.scene.render.filepath=str(Path(job['output']).resolve()); bpy.ops.render.render(write_still=True)
