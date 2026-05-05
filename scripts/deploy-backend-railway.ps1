param(
  [string]$Service = "dessert-ai-backend",
  [string]$Project = "",
  [string]$Environment = "production",
  [string]$Message = "Backend-only Railway deploy"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "dessert-ai-system"

if (-not (Test-Path -LiteralPath $backendDir)) {
  throw "Backend directory not found: $backendDir"
}

Push-Location $backendDir
try {
  Write-Host "Deploying Railway backend from $backendDir" -ForegroundColor Cyan

  $command = @("up", "-c", "-s", $Service, "-e", $Environment, "-m", $Message)
  if ($Project) {
    $command += @("-p", $Project)
  }

  & railway.cmd @command
} finally {
  Pop-Location
}
