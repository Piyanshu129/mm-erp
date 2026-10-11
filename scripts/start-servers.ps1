# Puts MM ERP live on a PC set up with setup.bat: starts PostgreSQL, the
# backend (production mode, needed for the website's login cookie), and the
# ngrok tunnel on the fixed public address the Vercel website talks to.
# Run it through start-servers.bat (double-click).
$ErrorActionPreference = "Continue"

$PublicUrl = "https://les-unhesitative-blandishingly.ngrok-free.dev"

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root "tools"
$Backend = Join-Path $Root "backend"
$NodeDir = Join-Path $Tools "node"
$PgDir = Join-Path $Tools "pgsql"
$Ngrok = Join-Path $Tools "ngrok\ngrok.exe"
$NgrokConfig = Join-Path $Tools "ngrok\ngrok.yml"

if (-not (Test-Path "$NodeDir\node.exe") -or -not (Test-Path "$Backend\dist\server.js")) {
  throw "MM ERP isn't set up on this PC yet - run setup.bat first."
}

$envText = Get-Content "$Backend\.env" -Raw
$DbPort = if ($envText -match 'DATABASE_URL="?postgresql://[^@]+@[^:/]+:(\d+)/') { $Matches[1] } else { "5432" }
$AppPort = if ($envText -match '(?m)^PORT=(\d+)') { $Matches[1] } else { "4000" }

# 1. Database. "Running" means its port is answering. pg_ctl's own status
# check can miss a server that setup.bat started, and starting a second one
# then fails on the log file the first one holds open.
if (Get-NetTCPConnection -LocalPort $DbPort -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "Database already running."
} else {
  Write-Host "Starting the database..."
  & "$PgDir\bin\pg_ctl.exe" -D "$PgDir\data" -l "$PgDir\server.log" -o "-p $DbPort" -w start
  if ($LASTEXITCODE -ne 0) { throw "The database didn't start - see $PgDir\server.log" }
}

# Double-clicking again while it's running must not start second copies (a
# second backend can't get the port; a second tunnel can't get the address).

# 2. Backend, in its own window
if (Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "Backend already running."
} else {
  Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle = 'MM ERP backend - keep open'; `$env:Path = '$NodeDir;' + `$env:Path; cd '$Backend'; `$env:NODE_ENV = 'production'; npm start"
}

# 3. Public tunnel, in its own window
if (Get-Process ngrok -ErrorAction SilentlyContinue) {
  Write-Host "Tunnel already running."
} else {
  Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle = 'MM ERP tunnel - keep open'; & '$Ngrok' http --config '$NgrokConfig' --url=$PublicUrl $AppPort"
}

Write-Host ""
Write-Host "MM ERP is running (backend and tunnel windows)." -ForegroundColor Green
Write-Host "If the tunnel window says the endpoint 'is already online', another PC is still using the address - close its tunnel first."
Write-Host "Public backend address: $PublicUrl"
Write-Host "Keep both windows open. Closing them takes the site offline."
