@echo off
setlocal
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generar-index-dts.ps1" %*
if errorlevel 1 (
  echo.
  echo Error generando los HTML de DTs.
  pause
  exit /b 1
)
endlocal
