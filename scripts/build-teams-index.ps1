$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$teamsDir = Join-Path $root 'database/teams'
$outPath = Join-Path $teamsDir 'index.json'
$required = @('team', 'players', 'appearence', 'formation', 'squad')

function Get-DisplayNameFromFolder([string]$folderName) {
  return ($folderName -split '-' | Where-Object { $_ } | ForEach-Object {
    if ($_.Length -gt 0) { $_.Substring(0,1).ToUpper() + $_.Substring(1).ToLower() } else { $_ }
  }) -join ' '
}

function Get-TeamDisplayName([string]$teamFolder, [string]$teamCsvName, [string]$fallbackName) {
  if (-not $teamCsvName) { return $fallbackName }
  $teamCsvPath = Join-Path $teamFolder $teamCsvName
  if (-not (Test-Path $teamCsvPath)) { return $fallbackName }

  $lines = Get-Content -Path $teamCsvPath -TotalCount 2
  if ($lines.Count -lt 2) { return $fallbackName }

  $headers = $lines[0] -split ';'
  $values = $lines[1] -split ';'
  $nameIndex = [Array]::IndexOf($headers, 'Name')
  if ($nameIndex -lt 0 -or $nameIndex -ge $values.Count) { return $fallbackName }

  $rawName = $values[$nameIndex].Trim()
  if ([string]::IsNullOrWhiteSpace($rawName)) { return $fallbackName }

  return (($rawName.ToLower() -split ' ') | ForEach-Object {
    if ($_.Length -gt 0) { $_.Substring(0,1).ToUpper() + $_.Substring(1) } else { $_ }
  }) -join ' '
}

if (-not (Test-Path $teamsDir)) {
  throw "Teams directory not found: $teamsDir"
}

$teams = @()
$teamFolders = Get-ChildItem -Path $teamsDir -Directory | Sort-Object Name

foreach ($folder in $teamFolders) {
  $csvFiles = Get-ChildItem -Path $folder.FullName -File -Filter '*.csv'
  $filesMap = [ordered]@{}

  foreach ($csv in $csvFiles) {
    if ($csv.Name -match '_([^_]+)\.csv$') {
      $type = $Matches[1].ToLower()
      if ($required -contains $type) {
        $filesMap[$type] = $csv.Name
      }
    }
  }

  $fallback = Get-DisplayNameFromFolder -folderName $folder.Name
  $displayName = Get-TeamDisplayName -teamFolder $folder.FullName -teamCsvName $filesMap['team'] -fallbackName $fallback
  $missing = @($required | Where-Object { -not $filesMap.Contains($_) })

  $teamObj = [ordered]@{
    folder = $folder.Name
    displayName = $displayName
    files = $filesMap
    missingRequired = $missing
  }
  $teams += $teamObj
}

$manifest = [ordered]@{
  generatedAt = [DateTime]::UtcNow.ToString('o')
  requiredFileTypes = $required
  teams = $teams
}

$json = $manifest | ConvertTo-Json -Depth 10
Set-Content -Path $outPath -Value $json -Encoding UTF8

$missingCount = @($teams | Where-Object { $_.missingRequired.Count -gt 0 }).Count
Write-Output "Generated database/teams/index.json for $($teams.Count) team(s)."
if ($missingCount -gt 0) {
  Write-Warning "$missingCount team(s) are missing one or more required CSV files."
}