# Starts everything needed for the live (Vercel-facing) deployment:
# Postgres, the backend in production mode (needed so the cross-site
# refresh cookie uses SameSite=None+Secure — see auth.controller.ts), and
# the ngrok tunnel on the reserved static domain.
$Root = Split-Path -Parent $PSScriptRoot

& "$PSScriptRoot\db-start.ps1"

Write-Host "Building backend..."
Push-Location "$Root\backend"
npm run build
Pop-Location

$NgrokExe = "C:\Users\pisaini\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; `$env:NODE_ENV='production'; npm start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$NgrokExe' http --url=https://les-unhesitative-blandishingly.ngrok-free.dev 4000"

Write-Host ""
Write-Host "Started in separate windows: backend (production mode) and the ngrok tunnel."
Write-Host "Public backend URL: https://les-unhesitative-blandishingly.ngrok-free.dev"
Write-Host "Close those two windows (or Ctrl+C in each) to take the site offline."
