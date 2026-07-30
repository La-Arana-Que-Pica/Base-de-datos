$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir "..")
$builder = Join-Path $scriptDir "build-database-version.js"

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

Push-Location $rootDir
try {
  & $nodePath $builder
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
