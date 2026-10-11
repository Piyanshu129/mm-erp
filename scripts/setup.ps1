# One-time setup of MM ERP on a new Windows PC that has nothing installed.
# Run it through setup.bat (double-click). Safe to run again: every step
# skips itself if it's already done.
#
# Everything is installed inside this folder (tools\), with no admin rights
# needed: Node.js, PostgreSQL, and ngrok. Then it creates the database,
# loads the data brought over by prepare-transfer.bat, and builds the backend.
# Without that data (e.g. a copy of the code from GitHub) it starts a fresh,
# empty system instead: it writes backend\.env with new passwords and asks
# for the admin login.
# Failures are caught explicitly: Check() after each program, -ErrorAction
# Stop on downloads. ("Stop" globally would also trip on harmless warnings
# that npm and PostgreSQL print.)
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"   # makes downloads much faster in Windows PowerShell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root "tools"
$Backend = Join-Path $Root "backend"
$PostgresPackage = "https://registry.npmjs.org/@embedded-postgres/windows-x64/-/windows-x64-18.4.0-beta.17.tgz"
$NgrokZip = "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Download($url, $file) {
  Write-Host "    downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -ErrorAction Stop
}
# Native programs report failure by exit code, not by throwing.
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }
function RandomText($length) {
  -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $length | ForEach-Object { [char]$_ })
}

# Any failure ends here, with a clear message before the window waits.
trap {
  Write-Host ""
  Write-Host "SETUP FAILED: $_" -ForegroundColor Red
  Write-Host "Fix the problem above (often: no internet), then run setup.bat again - it continues where it stopped." -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Force $Tools | Out-Null
$Temp = Join-Path $Tools "_downloads"
New-Item -ItemType Directory -Force $Temp | Out-Null

# A fresh system (no settings carried over): write backend\.env.
if (-not (Test-Path "$Backend\.env")) {
  Step "Creating the settings for a new, empty system"
  $adminEmail = Read-Host "Admin login email (press Enter for admin@mm.com)"
  if (-not $adminEmail) { $adminEmail = "admin@mm.com" }
  do {
    $adminPassword = Read-Host "Admin password (at least 6 characters)"
  } while ($adminPassword.Length -lt 6)
  $settings = @"
DATABASE_URL="postgresql://mm_erp:$(RandomText 20)@localhost:5432/mm_erp?schema=public"

PORT=4000
NODE_ENV=development

CORS_ORIGIN="http://localhost:3000,https://mm-erp-git-master-piyanshu-sainis-projects.vercel.app,https://mm-erp-nine.vercel.app"

JWT_ACCESS_SECRET="$(RandomText 48)"
JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN_DAYS=7

REFRESH_COOKIE_NAME="mm_erp_refresh"

ADMIN_NAME="Admin"
ADMIN_EMAIL="$adminEmail"
ADMIN_PASSWORD="$adminPassword"
"@
  # UTF-8 without a byte-order mark, so the settings loader reads the first line.
  [IO.File]::WriteAllText("$Backend\.env", $settings, (New-Object Text.UTF8Encoding $false))
  Write-Host "    saved backend\.env"
}
$envText = Get-Content "$Backend\.env" -Raw
if ($envText -notmatch 'DATABASE_URL="?postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?"\s]+)') {
  throw "Could not read DATABASE_URL from backend\.env"
}
$DbUser = $Matches[1]; $DbPassword = $Matches[2]; $DbPort = $Matches[4]; $DbName = $Matches[5]

# ---- 1. Node.js (portable) -------------------------------------------------
$NodeDir = Join-Path $Tools "node"
if (-not (Test-Path "$NodeDir\node.exe")) {
  Step "Installing Node.js"
  $sums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" -UseBasicParsing -ErrorAction Stop).Content
  $zipName = ([regex]::Match($sums, "node-v[\d.]+-win-x64\.zip")).Value
  if (-not $zipName) { throw "Could not find the Node.js download" }
  Download "https://nodejs.org/dist/latest-v22.x/$zipName" "$Temp\$zipName"
  Expand-Archive "$Temp\$zipName" -DestinationPath $Temp -Force -ErrorAction Stop
  Move-Item "$Temp\$($zipName -replace '\.zip$','')" $NodeDir -ErrorAction Stop
} else { Step "Node.js already installed" }
$env:Path = "$NodeDir;$env:Path"
& node --version

# ---- 2. PostgreSQL (portable) ----------------------------------------------
$PgDir = Join-Path $Tools "pgsql"
if (-not (Test-Path "$PgDir\bin\pg_ctl.exe")) {
  Step "Installing PostgreSQL"
  Download $PostgresPackage "$Temp\postgres.tgz"
  # Windows' own tar: Git's tar, if it comes first on PATH, misreads "C:" paths.
  & "$env:SystemRoot\System32\tar.exe" -xzf "$Temp\postgres.tgz" -C $Temp; Check "Unpacking PostgreSQL"
  Move-Item "$Temp\package\native" $PgDir -ErrorAction Stop
} else { Step "PostgreSQL already installed" }

# PostgreSQL needs the Microsoft Visual C++ runtime, which a brand-new
# Windows may not have yet. Installing it asks for permission once.
& "$PgDir\bin\postgres.exe" --version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Step "Installing the Microsoft Visual C++ runtime (click Yes if Windows asks)"
  Download "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$Temp\vc_redist.x64.exe"
  Start-Process "$Temp\vc_redist.x64.exe" -ArgumentList "/install", "/quiet", "/norestart" -Verb RunAs -Wait
  & "$PgDir\bin\postgres.exe" --version; Check "PostgreSQL"
}

$PgData = Join-Path $PgDir "data"
$SuperPasswordFile = Join-Path $PgDir "superuser-password.txt"
if (-not (Test-Path "$PgData\PG_VERSION")) {
  Step "Creating the database server"
  $superPassword = RandomText 24
  Set-Content -Path $SuperPasswordFile -Value $superPassword -NoNewline -Encoding ascii
  & "$PgDir\bin\initdb.exe" -D $PgData -U postgres --pwfile=$SuperPasswordFile -A scram-sha-256 -E UTF8; Check "initdb"
}

# Running = its port is answering (pg_ctl's own status check can miss it).
if (-not (Get-NetTCPConnection -LocalPort $DbPort -State Listen -ErrorAction SilentlyContinue)) {
  Step "Starting the database server on port $DbPort"
  # Not answering, so any lock file is left over from a crash - it would block the start.
  Remove-Item "$PgData\postmaster.pid" -Force -ErrorAction SilentlyContinue
  # A new log file per start: an old one can stay locked after a crash.
  New-Item -ItemType Directory -Force "$PgDir\logs" | Out-Null
  $PgLog = "$PgDir\logs\server-$(Get-Date -Format yyyyMMdd-HHmmss).log"
  & "$PgDir\bin\pg_ctl.exe" -D $PgData -l $PgLog -o "-p $DbPort" -w start; Check "Starting PostgreSQL (log: $PgLog)"
}

# ---- 3. Backend packages, database and app login ---------------------------
Step "Installing backend packages (a few minutes)"
Push-Location $Backend
try {
  & npm ci --no-audit --no-fund; Check "npm ci"

  Step "Creating the '$DbName' database"
  $env:PG_SUPER_PASSWORD = Get-Content $SuperPasswordFile -Raw
  $env:PG_PORT = $DbPort; $env:APP_DB_USER = $DbUser; $env:APP_DB_PASSWORD = $DbPassword; $env:APP_DB_NAME = $DbName
  & node "$PSScriptRoot\setup-db.js"; Check "Creating the database"

  & npx prisma migrate deploy; Check "Database migrations"
  & npx prisma generate; Check "prisma generate"
  & npm run build; Check "Backend build"

  # ---- 4. Data ---------------------------------------------------------------
  $marker = Join-Path $Tools "data-loaded.txt"
  $dataFile = Join-Path $Backend "backups\transfer-data.json"
  if (Test-Path $marker) {
    Step "Data already loaded"
  } elseif (Test-Path $dataFile) {
    Step "Loading the transferred data"
    & npx ts-node --transpile-only scripts/restore.ts $dataFile --yes; Check "Loading data"
    Set-Content $marker "Loaded from $dataFile on $(Get-Date)"
  } else {
    Step "No transferred data - creating a fresh, empty system with the admin login"
    & npx prisma db seed; Check "Seeding"
    Set-Content $marker "Empty system created on $(Get-Date)"
  }
} finally {
  Pop-Location
}

# ---- 5. ngrok (the public address the live website talks to) --------------
$NgrokDir = Join-Path $Tools "ngrok"
if (-not (Test-Path "$NgrokDir\ngrok.exe")) {
  Step "Installing ngrok"
  Download $NgrokZip "$Temp\ngrok.zip"
  Expand-Archive "$Temp\ngrok.zip" -DestinationPath $NgrokDir -Force -ErrorAction Stop
}
$NgrokConfig = Join-Path $NgrokDir "ngrok.yml"
if (-not (Test-Path $NgrokConfig)) {
  $carried = Join-Path $Root "transfer\ngrok.yml"
  if (Test-Path $carried) {
    Copy-Item $carried $NgrokConfig -ErrorAction Stop
  } else {
    $token = Read-Host "Paste your ngrok authtoken (from dashboard.ngrok.com)"
    & "$NgrokDir\ngrok.exe" config add-authtoken $token --config $NgrokConfig; Check "ngrok setup"
  }
}

Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Double-click start-servers.bat to put the site live."
