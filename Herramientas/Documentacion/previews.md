# Generador de previews de kits PES

Convierte texturas UV de PES en previews 3D frontales de camiseta, con fondo transparente. No modifica nunca la carpeta de entrada.

## Instalación

```powershell
python -m pip install -r Herramientas/Previews/requirements.txt
```

También se requiere Blender 4.x. El programa detecta Blender en `PATH` y en la instalación estándar de Windows. En la primera ejecución crea `Herramientas/Recursos/Previews/shirt_template.blend`: el modelo, iluminación y cámara se reutilizan para toda la colección.

## Uso

Colocá las texturas de kit en `Herramientas/Recursos/Previews/WEPES/` (pueden estar en subcarpetas) y ejecutá:

```powershell
python Herramientas/Previews/generar_previews.py
```

Los PNG, WEBP, JPG y JPEG cuadrados que tengan `Kit` en el nombre se analizan; se ignoran logos y escudos. Las previews se guardan como WEBP transparentes de 512×512 en `Herramientas/Salidas/output/previews/`, conservando las subcarpetas. La hoja de prueba queda en `Herramientas/Salidas/output/debug/contact_sheet.png`.

Opciones frecuentes:

```powershell
python Herramientas/Previews/generar_previews.py --input Herramientas/Recursos/Previews/WEPES --output Herramientas/Salidas/output/previews
python Herramientas/Previews/generar_previews.py --force
python Herramientas/Previews/generar_previews.py --format png
python Herramientas/Previews/generar_previews.py --limit 16 --debug
python Herramientas/Previews/generar_previews.py --sample 16 --force
```

La regeneración inteligente usa fecha, tamaño, hash y versión del renderer: sólo vuelve a renderizar un kit nuevo, modificado o sin preview. `--force` vuelve a crear todos.

## Calibración

`Herramientas/Previews/config/pes_kit_uv.json` separa la calibración UV PES de la geometría. El programa compone un atlas intermedio de torso, mangas y cuello; el modelo 3D tiene una UV propia para ese atlas. Sus coordenadas UV PES están normalizadas, por lo que se adaptan automáticamente a plantillas cuadradas de otra resolución.
