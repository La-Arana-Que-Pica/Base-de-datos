"""Generador masivo: UV PES -> atlas intermedio -> modelo 3D Blender -> preview."""
from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, sys
from pathlib import Path
from typing import Iterator
from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
from renderer import ShirtRenderer

SUPPORTED={'.png','.webp','.jpg','.jpeg'}
TOOL_DIR=Path(__file__).resolve().parent
ROOT=TOOL_DIR.parents[1]
RENDER_REVISION='blender-3d-2'

def is_compatible_kit(path:Path)->bool:
    if 'kit' not in path.stem.lower() or 'logo' in path.stem.lower() or 'escudo' in path.stem.lower(): return False
    try:
        with Image.open(path) as im: return im.width==im.height and im.width>=512
    except (UnidentifiedImageError,OSError): return False

def kit_files(folder:Path)->Iterator[Path]:
    yield from (p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in SUPPORTED and is_compatible_kit(p))

def fingerprint(path:Path)->dict:
    st=path.stat(); return {'mtime_ns':st.st_mtime_ns,'size':st.st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'renderer':RENDER_REVISION}

def blender_executable()->Path|None:
    found=shutil.which('blender')
    candidates=[Path(found)] if found else []
    candidates += [Path(r'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe'),Path(r'C:\Program Files\Blender Foundation\Blender\blender.exe')]
    return next((p for p in candidates if p.is_file()),None)

def load_manifest(path:Path)->dict:
    try: return json.loads(path.read_text(encoding='utf-8'))
    except (OSError,json.JSONDecodeError): return {'version':2,'files':{}}

def save_manifest(path:Path,data:dict)->None:
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')

def output_for(source:Path,input_dir:Path,output_dir:Path,extension:str)->Path: return (output_dir/source.relative_to(input_dir)).with_suffix(extension)

def contact_sheet(paths:list[Path], output:Path)->None:
    if not paths:return
    paths=sorted(paths,key=lambda p:str(p).lower()); paths=paths if len(paths)<=16 else [paths[round(i*(len(paths)-1)/15)] for i in range(16)]
    cell,title=220,34; sheet=Image.new('RGBA',(880,4*(cell+title)),(28,32,40,255)); draw=ImageDraw.Draw(sheet)
    for i,path in enumerate(paths):
        im=Image.open(path).convert('RGBA'); im.thumbnail((cell-16,cell-16),Image.Resampling.LANCZOS); x=(i%4)*cell+(cell-im.width)//2; y=(i//4)*(cell+title)+5
        sheet.alpha_composite(im,(x,y)); draw.text(((i%4)*cell+8,y+cell-2),path.stem[:27],fill='white',font=ImageFont.load_default())
    output.parent.mkdir(parents=True,exist_ok=True); sheet.convert('RGB').save(output)

def convert_render(render:Path,destination:Path,fmt:str)->None:
    im=Image.open(render).convert('RGBA'); destination.parent.mkdir(parents=True,exist_ok=True)
    if fmt=='webp': im.save(destination,'WEBP',lossless=True,method=4)
    else: im.save(destination,'PNG')

def main()->int:
    parser=argparse.ArgumentParser(description='Genera previews 3D desde texturas UV de PES.')
    parser.add_argument('--input',type=Path,default=ROOT/'Herramientas'/'Recursos'/'Previews'/'WEPES'); parser.add_argument('--output',type=Path,default=ROOT/'Herramientas'/'Salidas'/'output'/'previews')
    parser.add_argument('--force',action='store_true'); parser.add_argument('--format',choices=('webp','png'),default='webp'); parser.add_argument('--limit',type=int); parser.add_argument('--sample',type=int,help='Procesa una muestra repartida de N kits para validar visualmente'); parser.add_argument('--debug',action='store_true')
    args=parser.parse_args()
    if not args.input.is_dir(): print(f'Error: no existe {args.input}',file=sys.stderr); return 2
    blender=blender_executable(); template=ROOT/'Herramientas'/'Recursos'/'Previews'/'shirt_template.blend'
    if not blender: print('Error: Blender no está instalado ni disponible en PATH.',file=sys.stderr); return 2
    if not template.exists():
        print('Creando el modelo base 3D…')
        result=subprocess.run([str(blender),'--background','--python',str(TOOL_DIR/'blender'/'create_shirt_template.py'),'--',str(template)],cwd=ROOT)
        if result.returncode: return result.returncode
    files=list(kit_files(args.input))
    if args.sample and len(files)>args.sample:
        files=sorted(files,key=lambda p:str(p).lower()); files=[files[round(i*(len(files)-1)/(args.sample-1))] for i in range(args.sample)]
    elif args.limit is not None: files=files[:args.limit]
    manifest_path=args.output.parent/'.preview-manifest.json'; manifest=load_manifest(manifest_path); renderer=ShirtRenderer(TOOL_DIR/'config'/'pes_kit_uv.json')
    pending=[]; outputs=[]; texture_root=args.output.parent/'.render_textures'; png_root=args.output.parent/'.blender_renders'
    for source in files:
        key=source.relative_to(args.input).as_posix(); destination=output_for(source,args.input,args.output,'.'+args.format); outputs.append(destination); sig=fingerprint(source)
        if not args.force and destination.exists() and manifest['files'].get(key)==sig: continue
        atlas=(texture_root/source.relative_to(args.input)).with_suffix('.png'); render=(png_root/source.relative_to(args.input)).with_suffix('.png')
        try: renderer.compose_texture(source,atlas); pending.append((key,sig,atlas,render,destination))
        except Exception as exc: print(f'ERR {key}: {exc}',file=sys.stderr)
    if pending:
        jobs_path=args.output.parent/'.blender-jobs.json'; jobs_path.write_text(json.dumps([{'texture':str(a),'output':str(r)} for _,_,a,r,_ in pending]),encoding='utf-8')
        print(f'Renderizando {len(pending)} kits con el modelo 3D fijo…')
        result=subprocess.run([str(blender),'--background',str(template),'--python',str(TOOL_DIR/'blender'/'render_kits.py'),'--',str(jobs_path)],cwd=ROOT)
        if result.returncode: return result.returncode
        for key,sig,_,render,destination in pending:
            try: convert_render(render,destination,args.format); manifest['files'][key]=sig; print(f'OK  {key}')
            except Exception as exc: print(f'ERR {key}: {exc}',file=sys.stderr)
    if args.debug and files:
        debug=args.output.parent/'debug'; debug.mkdir(parents=True,exist_ok=True); renderer.debug_uv(files[0]).save(debug/'uv_regions.png')
    existing=[p for p in outputs if p.exists()]; contact_sheet(existing,args.output.parent/'debug'/'contact_sheet.png'); save_manifest(manifest_path,manifest)
    print(f'Finalizado: {len(pending)} generados, {len(files)-len(pending)} sin cambios; {len(files)} kits compatibles.')
    return 0
if __name__=='__main__': raise SystemExit(main())
