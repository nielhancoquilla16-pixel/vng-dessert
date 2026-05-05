param(
  [string]$Service = "",
  [string]$Environment = "production",
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "dessert-ai-system"

if (-not $EnvFile) {
  $EnvFile = Join-Path $backendDir "server\.env"
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

if (-not $Service) {
  throw "Pass -Service with the Railway service name or ID."
}

$lines = Get-Content -LiteralPath $EnvFile

Push-Location $backendDir
try {
  foreach ($line in $lines) {
    $trimmed = $line.Trim()

    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1)

    if (-not $key) {
      continue
    }

    Write-Host "Syncing Railway variable $key" -ForegroundColor Cyan
    $value | railway.cmd variable set $key --stdin -s $Service -e $Environment --skip-deploys | Out-Null
  }
} finally {
  Pop-Location
}

Write-Host "Railway environment sync complete." -ForegroundColor Green
