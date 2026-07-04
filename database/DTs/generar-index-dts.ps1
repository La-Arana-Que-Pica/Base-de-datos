param(
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Find-Node {
  if ($env:NODE_EXE -and (Test-Path -LiteralPath $env:NODE_EXE)) {
    return $env:NODE_EXE
  }

  $globalNode = Get-Command node -ErrorAction SilentlyContinue
  if ($globalNode) {
    return $globalNode.Source
  }

  $codexNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path -LiteralPath $codexNode) {
    return $codexNode
  }

  return $null
}

$dtsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $dtsDir "..\..")
$generator = Join-Path $rootDir "scripts\build-dts-pages.js"

Write-Host ""
Write-Host "Generador de paginas de DTs" -ForegroundColor Yellow
Write-Host "Carpeta DTs: $dtsDir"

if (!(Test-Path -LiteralPath $generator)) {
  throw "No se encontro el generador principal: $generator"
}

$node = Find-Node
if (!$node) {
  throw "No se encontro Node.js. Instala Node o define la variable NODE_EXE con la ruta a node.exe."
}

$configs = Get-ChildItem -LiteralPath $dtsDir -Directory |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "config.csv") }

Write-Host "DTs detectados: $($configs.Count)"
Write-Host "Formato config.csv: UTF-8 con separador ; recomendado para Excel"
Write-Host "Usando Node: $node"
Write-Host ""

Push-Location $rootDir
try {
  & $node $generator
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
  Write-Host "- database/DTs/$($config.Name)/index.html"
}
Write-Host "- sitemap-dts.xml"
Write-Host ""

if (!$NoPause) {
  Write-Host "Presiona Enter para cerrar..."
  [void][Console]::ReadLine()
}
