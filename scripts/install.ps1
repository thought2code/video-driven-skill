# Install and run Video Driven Skill from GHCR images (no git clone).
# Usage: .\scripts\install.ps1 [-InstallDir $env:USERPROFILE\video-driven-skill] [-Ref main] [-Tag latest] [-NoOpen]
# Image tag: v1.0.0 (release) or latest (newest v* release). Images publish on v* Git tags only.

param(
  [string]$InstallDir = $(if ($env:VD_SKILL_INSTALL_DIR) { $env:VD_SKILL_INSTALL_DIR } else { Join-Path $env:USERPROFILE "video-driven-skill" }),
  [string]$Ref = $(if ($env:VD_SKILL_REF) { $env:VD_SKILL_REF } else { "main" }),
  [string]$Tag = $(if ($env:VD_SKILL_IMAGE_TAG) { $env:VD_SKILL_IMAGE_TAG } else { "latest" }),
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$Repo = "thought2code/video-driven-skill"
$RawBase = "https://raw.githubusercontent.com/$Repo/$Ref"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker is not installed. See https://docs.docker.com/get-docker/"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Set-Location $InstallDir

Write-Host "Installing to $InstallDir (images: $Tag, ref: $Ref)"

$composePath = Join-Path $InstallDir "docker-compose.release.yml"
Invoke-WebRequest -Uri "$RawBase/docker-compose.release.yml" -OutFile $composePath -UseBasicParsing

$envPath = Join-Path $InstallDir ".env"
if (-not (Test-Path $envPath)) {
  Invoke-WebRequest -Uri "$RawBase/.env.example" -OutFile $envPath -UseBasicParsing
  Write-Host "Created .env from .env.example — set AI_API_KEY before using AI features."
}

$env:VD_SKILL_IMAGE_TAG = $Tag

# Piped via "irm ... | iex" has no $PSScriptRoot; download helper into the install dir.
$resolveUrlScript = Join-Path $InstallDir "resolve-ui-url.ps1"
Invoke-WebRequest -Uri "$RawBase/scripts/resolve-ui-url.ps1" -OutFile $resolveUrlScript -UseBasicParsing
$Url = & $resolveUrlScript -EnvFile $envPath
if (-not $Url) {
  Write-Error "Failed to resolve web UI URL from $envPath"
}

Write-Host "Pulling images from GHCR..."
docker compose -f docker-compose.release.yml pull
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting containers..."
docker compose -f docker-compose.release.yml up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for $Url ..."

$maxAttempts = if ($Url -like 'https://*') { 150 } else { 90 }
$ready = $false
for ($i = 0; $i -lt $maxAttempts; $i++) {
  curl.exe -fsS -o $null -m 3 $Url 2>$null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Write-Error "Timed out waiting for the UI. Check: docker compose -f docker-compose.release.yml logs -f"
}

Write-Host "Ready: $Url"
Write-Host "Data volume: video-driven-skill_app-data (docker volume inspect video-driven-skill_app-data)"
if (-not $NoOpen -and $Url) {
  Start-Process $Url
}
