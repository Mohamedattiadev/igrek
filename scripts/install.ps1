# Installs or updates Igrek on Windows, without Docker and without the source code. In PowerShell:
#   irm https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/scripts/install.ps1 | iex
# It downloads the ready-made server of the latest release (igrek-server.tar.gz) and installs Bun when
# missing (from bun.sh, Bun's own installer). Nothing runs as administrator. Claude Code needs Git for
# Windows (git-scm.com) for its bash. $env:IGREK_DIR chooses the folder (default %LOCALAPPDATA%\igrek-app);
# $env:IGREK_PACKAGE installs a package file you already have. Your data is never touched.
$ErrorActionPreference = "Stop"

$Releases = if ($env:IGREK_RELEASES) { $env:IGREK_RELEASES } else { "https://github.com/Mohamedattiadev/igrek/releases/latest/download" }
$Dir = if ($env:IGREK_DIR) { $env:IGREK_DIR } else { Join-Path $env:LOCALAPPDATA "igrek-app" }
$Bin = Join-Path $env:LOCALAPPDATA "igrek-bin"

$BunHome = Join-Path $env:USERPROFILE ".bun\bin"
if (-not (Get-Command bun -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $BunHome "bun.exe"))) {
  Write-Host "Installing Bun (bun.sh)..."
  powershell -c "irm bun.sh/install.ps1 | iex"
}
$env:Path = "$BunHome;$env:Path"

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("igrek-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Force -Path (Join-Path $Tmp "new") | Out-Null
try {
  $Package = Join-Path $Tmp "igrek-server.tar.gz"
  if ($env:IGREK_PACKAGE) {
    Copy-Item $env:IGREK_PACKAGE $Package
  } else {
    Write-Host "Downloading Igrek..."
    Invoke-WebRequest -UseBasicParsing -Uri "$Releases/igrek-server.tar.gz" -OutFile $Package
  }
  # tar.exe comes with Windows 10 and later.
  tar -xzf $Package -C (Join-Path $Tmp "new")
  if ($LASTEXITCODE -ne 0) { throw "Igrek install: the download is damaged; run this again." }
  if (-not (Test-Path (Join-Path $Tmp "new\server\desktop.js"))) { throw "Igrek install: the download is not an Igrek server package." }
  # An older install from the source code, or an older package: replaced whole (the data lives elsewhere).
  if (Test-Path $Dir) { Remove-Item -Recurse -Force $Dir }
  New-Item -ItemType Directory -Force -Path (Split-Path $Dir) | Out-Null
  Move-Item (Join-Path $Tmp "new") $Dir
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $Bin | Out-Null
$Launcher = @"
@echo off
rem Starts Igrek (installed by scripts/install.ps1). "igrek doctor" and the other commands pass through.
set "PATH=$BunHome;%PATH%"
set "IGREK_RESOURCES=$Dir"
set "IGREK_STDIN_LIFELINE=0"
if "%~1"=="" (bun "$Dir\server\desktop.js") else (bun "$Dir\server\cli.js" %*)
"@
Set-Content -Path (Join-Path $Bin "igrek.cmd") -Value $Launcher -Encoding ASCII

# A new account can have no user Path at all: then the folder is the whole of it.
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $UserPath) {
  [Environment]::SetEnvironmentVariable("Path", $Bin, "User")
} elseif (-not ($UserPath -split ";" | Where-Object { $_ -eq $Bin })) {
  [Environment]::SetEnvironmentVariable("Path", "$($UserPath.TrimEnd(';'));$Bin", "User")
}

Write-Host ""
Write-Host "Igrek is installed. Open a new terminal and start it with:  igrek"
Write-Host "Then open http://localhost:7777 (Settings > Igrek as an app gives it a window of its own)."
Write-Host "You also need Claude Code: https://docs.claude.com/en/docs/claude-code (run 'claude' once to log in)."
