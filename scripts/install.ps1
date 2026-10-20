# Installs or updates Igrek on Windows, without Docker. In PowerShell:
#   irm https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.ps1 | iex
# It needs Git for Windows (git-scm.com), which also brings the bash Claude Code uses. Bun is installed
# when missing (from bun.sh, Bun's own installer). Nothing runs as administrator.
# $env:IGREK_DIR chooses the folder (default %LOCALAPPDATA%\igrek-app).
$ErrorActionPreference = "Stop"

$Repo = if ($env:IGREK_REPO) { $env:IGREK_REPO } else { "https://github.com/Mohamedattiadev/igrek.git" }
$Dir = if ($env:IGREK_DIR) { $env:IGREK_DIR } else { Join-Path $env:LOCALAPPDATA "igrek-app" }
$Bin = Join-Path $env:LOCALAPPDATA "igrek-bin"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Igrek install: git is needed. Install Git for Windows from https://git-scm.com/download/win and run this again."
}

$BunHome = Join-Path $env:USERPROFILE ".bun\bin"
if (-not (Get-Command bun -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $BunHome "bun.exe"))) {
  Write-Host "Installing Bun (bun.sh)..."
  powershell -c "irm bun.sh/install.ps1 | iex"
}
$env:Path = "$BunHome;$env:Path"

if (Test-Path (Join-Path $Dir ".git")) {
  Write-Host "Updating Igrek in $Dir..."
  git -C $Dir pull --ff-only
} else {
  Write-Host "Downloading Igrek into $Dir..."
  git clone --depth 1 $Repo $Dir
}

Push-Location $Dir
try {
  bun install --frozen-lockfile
  bun run build
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $Bin | Out-Null
$Launcher = @"
@echo off
rem Starts Igrek (installed by scripts/install.ps1). "igrek doctor" and the other commands pass through.
set "PATH=$BunHome;%PATH%"
cd /d "$Dir"
if "%~1"=="" (bun run start) else (bun run apps\server\src\cli.ts %*)
"@
Set-Content -Path (Join-Path $Bin "igrek.cmd") -Value $Launcher -Encoding ASCII

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not ($UserPath -split ";" | Where-Object { $_ -eq $Bin })) {
  [Environment]::SetEnvironmentVariable("Path", "$UserPath;$Bin", "User")
}

Write-Host ""
Write-Host "Igrek is installed. Open a new terminal and start it with:  igrek"
Write-Host "Then open http://localhost:7777 (Settings > Igrek as an app gives it a window of its own)."
Write-Host "You also need Claude Code: https://docs.claude.com/en/docs/claude-code (run 'claude' once to log in)."
