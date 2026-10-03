param(
  [switch]$NoPause,
  [switch]$Refresh,
  [string]$CoachId,
  [string]$ProjectRoot,
  [string]$OutputRoot
)

$ErrorActionPreference = "Stop"
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = if ($ProjectRoot) { Resolve-Path -LiteralPath $ProjectRoot } else { Resolve-Path (Join-Path $toolDir "..\..") }
$resolvedOutputRoot = if ($OutputRoot) { (Resolve-Path -LiteralPath $OutputRoot).Path } else { $null }
$dtsDir = Join-Path $rootDir "database\DTs"
$generator = Join-Path $toolDir "..\Generadores\generar_web.py"
$masterConfig = Join-Path $rootDir "Herramientas\Recursos\Base-de-datos\DTs\config.csv"

Write-Host ""
Write-Host "Generador de paginas de DTs" -ForegroundColor Yellow
Write-Host "Carpeta DTs: $dtsDir"

if (!(Test-Path -LiteralPath $generator)) {
  throw "No se encontro el generador principal: $generator"
}

if (!(Test-Path -LiteralPath $masterConfig)) {
  throw "No se encontro el CSV maestro: $masterConfig"
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (!$python) {
  throw "No se encontro Python."
}
$configs = Import-Csv -LiteralPath $masterConfig -Delimiter ";"

Write-Host "DTs detectados: $($configs.Count)"
Write-Host "CSV maestro: Herramientas/Recursos/Base-de-datos/DTs/config.csv"
Write-Host "Formato: UTF-8 con separador ; recomendado para Excel"
Write-Host "Usando Python: $($python.Source)"
Write-Host ""

Push-Location $rootDir
try {
  $generatorArgs = @($generator, "--cli", "--managers-only", "--project-root", $rootDir.Path)
  if ($resolvedOutputRoot) {
    $generatorArgs += @("--output-root", $resolvedOutputRoot)
  }
  if ($Refresh) {
    $generatorArgs += "--refresh-coaches"
  }
  if ($CoachId) {
    $generatorArgs += @("--refresh-coach", $CoachId)
  }
  & $python.Source @generatorArgs
  if ($LASTEXITCODE -ne 0) {
    throw "El generador termino con codigo $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Listo. Se regeneraron:" -ForegroundColor Green
Write-Host "- database/DTs/index.html"
foreach ($config in $configs) {
  Write-Host "- database/DTs/$($config.carpeta)/index.html"
}
Write-Host ""

if (!$NoPause) {
  Write-Host "Presiona Enter para cerrar..."
  [void][Console]::ReadLine()
}
