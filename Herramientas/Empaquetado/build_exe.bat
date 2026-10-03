@echo off
setlocal
set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
cd /d "%ROOT%"

py -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
  echo PyInstaller no esta instalado.
  echo Ejecuta: py -m pip install pyinstaller
  pause
  exit /b 1
)

echo Creando LAqP Website Generator.exe...
py -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onefile ^
  --windowed ^
  --name "LAqP Website Generator" ^
  --distpath "Herramientas\Salidas\dist" ^
  --workpath "Herramientas\Salidas\build" ^
  --specpath "Herramientas\Empaquetado" ^
  --add-data "Herramientas\Generadores\templates;templates" ^
  Herramientas\Generadores\generar_web.py

if errorlevel 1 (
  echo.
  echo No se pudo crear el ejecutable.
  pause
  exit /b 1
)

echo.
echo Ejecutable creado en:
echo Herramientas\Salidas\dist\LAqP Website Generator.exe
pause
