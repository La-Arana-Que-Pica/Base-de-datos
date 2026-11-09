# Vista previa por defecto. Nunca interpreta ausencias como eliminaciones.
[CmdletBinding()]
param(
 [switch]$Recompilar,
 [switch]$VerificarPages,
 [switch]$Aplicar,
 [switch]$Push,
 [string]$Mensaje = 'Actualizar LAqP.website sin retirar rutas',
 [string]$Python = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
function Run([string]$exe, [string[]]$arguments) {
 & $exe @arguments
 if ($LASTEXITCODE -ne 0) { throw "Falló $exe (código $LASTEXITCODE). No se continúa." }
}
if ($Push -and -not $Aplicar) { throw '-Push requiere -Aplicar y confirmaciones explícitas.' }
Push-Location -LiteralPath $root
$oldProject=$env:LAQP_PROJECT_ROOT; $oldPython=$env:LAQP_PYTHON; $oldIndex=$env:GIT_INDEX_FILE
$oldConsoleEncoding=[Console]::OutputEncoding; $oldOutputEncoding=$OutputEncoding
try {
 [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
 $OutputEncoding=New-Object System.Text.UTF8Encoding
 if ($oldIndex -or $env:GIT_OBJECT_DIRECTORY -or $env:GIT_ALTERNATE_OBJECT_DIRECTORIES) { throw 'Hay variables Git de otra operación. Cerrá esa operación primero.' }
 $actualRoot=(& git rev-parse --show-toplevel).Trim()
 if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($actualRoot) -ne [IO.Path]::GetFullPath($root)) { throw 'La raíz Git no coincide con la ubicación del comando.' }
 & git diff --cached --quiet
 if ($LASTEXITCODE -ne 0) { throw 'El índice ya tiene cambios preparados. Se conservan intactos.' }
 $branch=(& git branch --show-current).Trim()
 if (-not $branch) { throw 'HEAD separado: elegí una rama primero.' }
 $initialHead=(& git rev-parse HEAD).Trim()
 $helper=Join-Path $root 'Herramientas\Mantenimiento\repository-release.cjs'
 function AssertRepositoryUnchanged {
  if ((& git rev-parse HEAD).Trim() -ne $initialHead -or (& git branch --show-current).Trim() -ne $branch) { throw 'La rama o HEAD cambió. Prepará otra vista previa.' }
  $temporaryIndex=$env:GIT_INDEX_FILE
  try {
   $env:GIT_INDEX_FILE=$null
   & git diff --cached --quiet
   if ($LASTEXITCODE -ne 0) { throw 'El índice normal cambió durante la revisión. Se conserva sin tocar.' }
  } finally { $env:GIT_INDEX_FILE=$temporaryIndex }
 }
 $stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
 $snapshot=Join-Path $root ".tmp\release-$stamp"
 $argsSnapshot=@($helper,'snapshot',$snapshot)
 if ($Recompilar) { $argsSnapshot+='--build' }
 Run 'node' $argsSnapshot
 $pagesFile=Join-Path $snapshot 'pages-verification.json'
 function VerifyPublicationTarget {
  Run 'node' @($helper,'pages',$pagesFile)
  $pages=Get-Content -LiteralPath $pagesFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $origin=(& git remote get-url origin).Trim()
  $domain=(Get-Content -LiteralPath (Join-Path $snapshot 'CNAME') -Raw -Encoding UTF8).Trim()
  Write-Host "Pages: $($pages.source.branch) $($pages.source.path) | $($pages.cname) | $($pages.buildType) | remoto $($pages.remoteHead)"
  if ($Push) {
   if ($pages.remote -ne $origin) { throw 'El remoto cambió. No se hace commit ni push.' }
   Run 'node' @($helper,'target',$pagesFile,$branch,$domain)
   Run 'node' @($helper,'ancestor',$pages.remoteHead)
  }
 }
 if ($VerificarPages -or $Push) { VerifyPublicationTarget }
 else { Write-Host 'Pages no consultado en esta ejecución. -VerificarPages consulta sólo lectura; -Push exige verificación actual.' }
 if ($Recompilar) {
  if (-not $Python) {
   $bundled=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
   if ($env:LAQP_PYTHON) { $Python=$env:LAQP_PYTHON }
   elseif (Test-Path -LiteralPath $bundled) { $Python=$bundled }
   else { $Python='python' }
  }
  Run $Python @('--version')
  $env:LAQP_PROJECT_ROOT=$snapshot; $env:LAQP_PYTHON=$Python
  Run 'node' @((Join-Path $snapshot 'Herramientas\Mantenimiento\build-site.js'))
 }
 AssertRepositoryUnchanged
 Run 'node' @($helper,'prepare',$snapshot)
 Run 'node' @($helper,'check',$snapshot)
 if ($Recompilar) { Run 'node' @((Join-Path $snapshot 'Herramientas\Mantenimiento\validate-site.js')) }
 $planFile=Join-Path $snapshot 'release-plan.json'
 $plan=Get-Content -LiteralPath $planFile -Raw -Encoding UTF8 | ConvertFrom-Json
 foreach ($large in $plan.large) { Write-Warning ('Archivo grande: {0} ({1:N1} MiB). Se conserva en la revisión.' -f $large.path,($large.bytes/1MB)) }
 Write-Host "Rama: $branch | Base: $initialHead"
 Write-Host "Eliminaciones: 0. Rutas ausentes preservadas en Git: $($plan.preservedMissing.Count). Desarrollo versionado preservado: $($plan.nonpublic.Count)."
 Write-Host "Archivos idénticos omitidos del diff: $($plan.unchanged). Cambios A/M: $($plan.changes.Count)."
 $plan.changes | Select-Object -First 100 | Format-Table status,path -AutoSize | Out-Host
 Write-Host "Vista completa: $snapshot\release-changes.csv"
 Write-Host "Diff de texto y avisos binarios: $snapshot\release-diff.patch"
 Write-Host "Plan con todas las rutas preservadas: $planFile"
 if (-not $plan.changes.Count) { Write-Host 'No hay altas ni modificaciones.'; return }
 if (-not $Aplicar) { Write-Host 'Vista previa terminada: sin commit, push ni modificaciones del índice/objetos Git original.'; return }
 if ((Read-Host "Revisá CSV y diff completos. Escribí CONFIRMAR para crear el commit en $branch, sin eliminaciones") -cne 'CONFIRMAR') { Write-Host 'Cancelado.'; return }
 AssertRepositoryUnchanged
 if ($Push) { VerifyPublicationTarget }
 Run 'node' @($helper,'verify',$snapshot)
 # Única fase que escribe objetos en el Git original; requiere la confirmación anterior.
 Run 'node' @($helper,'promote',$snapshot)
 $env:GIT_INDEX_FILE=Join-Path $snapshot 'release.index'
 Run 'git' @('-c','gc.auto=0','-c','maintenance.auto=false','commit','-m',$Mensaje)
 $env:GIT_INDEX_FILE=$null
 Run 'git' @('--literal-pathspecs','reset','--quiet','HEAD',('--pathspec-from-file='+(Join-Path $snapshot 'release-paths.bin')),'--pathspec-file-nul')
 if ($Push) {
  if ((Read-Host "Escribí PUBLICAR para subir origin/$branch, sin force") -ceq 'PUBLICAR') { Run 'git' @('push','--set-upstream','origin',"HEAD:refs/heads/$branch") }
 }
} finally { $env:LAQP_PROJECT_ROOT=$oldProject; $env:LAQP_PYTHON=$oldPython; $env:GIT_INDEX_FILE=$oldIndex; [Console]::OutputEncoding=$oldConsoleEncoding; $OutputEncoding=$oldOutputEncoding; Pop-Location }
