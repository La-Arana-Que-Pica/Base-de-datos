param(
  [string]$PlayersCsv = "database\All players exported.csv",
  [string]$PlayersImageDir = "img\players",
  [string]$UnusedDirName = "unused",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path ".").Path
$csvPath = (Resolve-Path $PlayersCsv).Path
$playersDir = (Resolve-Path $PlayersImageDir).Path
$unusedDir = Join-Path $playersDir $UnusedDirName

if (-not $csvPath.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "El CSV resuelto queda fuera del workspace: $csvPath"
}

if (-not $playersDir.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "La carpeta de minifaces queda fuera del workspace: $playersDir"
}

$ids = [System.Collections.Generic.HashSet[string]]::new()
Import-Csv -LiteralPath $csvPath -Delimiter ";" | ForEach-Object {
  if ($_.Id) { [void]$ids.Add([string]$_.Id) }
}

$files = Get-ChildItem -LiteralPath $playersDir -File |
  Where-Object { $_.Extension -match "^\.(webp|png|jpg|jpeg)$" }

$unused = $files | Where-Object {
  $_.BaseName -match "^\d+$" -and -not $ids.Contains($_.BaseName)
}

$summary = [pscustomobject]@{
  CsvIds = $ids.Count
  ImageFiles = $files.Count
  UnusedMinifaces = $unused.Count
  Destination = $unusedDir
  DryRun = [bool]$DryRun
}

if ($DryRun) {
  $summary
  $unused | Select-Object -First 30 Name
  return
}

if (-not (Test-Path -LiteralPath $unusedDir)) {
  New-Item -ItemType Directory -Path $unusedDir | Out-Null
}

$resolvedUnusedDir = (Resolve-Path $unusedDir).Path
if (-not $resolvedUnusedDir.StartsWith($playersDir, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "La carpeta unused resuelta no queda dentro de img\players: $resolvedUnusedDir"
}

$moved = 0
foreach ($file in $unused) {
  $destination = Join-Path $resolvedUnusedDir $file.Name
  if (Test-Path -LiteralPath $destination) {
    $destination = Join-Path $resolvedUnusedDir ("{0}_{1}{2}" -f $file.BaseName, [guid]::NewGuid().ToString("N"), $file.Extension)
  }
  Move-Item -LiteralPath $file.FullName -Destination $destination
  $moved++
}

[pscustomobject]@{
  CsvIds = $ids.Count
  ImageFilesScanned = $files.Count
  Moved = $moved
  Destination = $resolvedUnusedDir
}
