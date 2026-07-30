param(
  [string]$Version = "v2",
  [string]$Only = "leagues,teams,players",
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir "..")
$builder = Join-Path $scriptDir "create-missing-database-html.js"

if (-not (Test-Path $builder)) {
  throw "No encontre el generador: $builder"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }

if (-not $nodePath) {
  $codexNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $codexNode) {
    $nodePath = $codexNode
  }
}

if (-not $nodePath) {
  throw "No encontre Node.js. Instala Node o ejecuta este script desde Codex, donde esta disponible el runtime bundled."
}

$argsList = @(
  $builder,
  "--version=$Version",
  "--only=$Only"
)

if ($DryRun) {
  $argsList += "--dry-run"
}

if ($Force) {
  $argsList += "--force"
}

Write-Host ""
Write-Host "Generando HTML faltantes de la base de datos..." -ForegroundColor Cyan
Write-Host "Version: $Version"
Write-Host "Secciones: $Only"
if ($DryRun) { Write-Host "Modo prueba: no se escribiran archivos" -ForegroundColor Yellow }
if ($Force) { Write-Host "Force: se regeneraran tambien paginas existentes" -ForegroundColor Yellow }
Write-Host ""

Push-Location $rootDir
try {
  & $nodePath @argsList
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Listo." -ForegroundColor Green
