# Run on the OLD PC (through prepare-transfer.bat). Makes one folder,
# Desktop\MM-transfer\MM, holding everything the new PC needs:
#   - the application code (without downloaded packages - setup.bat fetches those)
#   - backend\.env (database login, secrets, admin login)
#   - backend\uploads (every uploaded photo: items, bills, RC, job cards, ...)
#   - backend\backups\transfer-data.json (all business data, taken right now)
#   - transfer\ngrok.yml (the tunnel login, so the public address stays the same)
# Copy that MM folder to the new PC, then run setup.bat there.
#
# Anything entered after this runs is NOT in the copy, so run it right
# before moving, once nobody is using the system.
$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path (Split-Path -Parent $Root) "MM-transfer\MM"
$Backend = Join-Path $Root "backend"

if (Test-Path $Out) {
  Write-Host "Removing the previous $Out"
  Remove-Item $Out -Recurse -Force
}
New-Item -ItemType Directory -Force $Out | Out-Null

Write-Host "Copying the application..."
# /XD skips downloaded packages, build output, old local tools and old backups.
robocopy $Root $Out /E /NFL /NDL /NJH /NP /XD node_modules .next dist tools backups exports _downloads | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copying failed (robocopy code $LASTEXITCODE)" }

Write-Host "Taking a copy of all the data..."
Push-Location $Backend
& npx ts-node --transpile-only scripts/backup.ts
$ok = $LASTEXITCODE -eq 0
Pop-Location
if (-not $ok) { throw "Taking the data backup failed - is the database running?" }
$latest = Get-ChildItem "$Backend\backups\backup-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
New-Item -ItemType Directory -Force "$Out\backend\backups" | Out-Null
Copy-Item $latest.FullName "$Out\backend\backups\transfer-data.json"

$ngrokYml = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
if (Test-Path $ngrokYml) {
  New-Item -ItemType Directory -Force "$Out\transfer" | Out-Null
  Copy-Item $ngrokYml "$Out\transfer\ngrok.yml"
} else {
  Write-Host "No ngrok login found on this PC - setup.bat will ask for the ngrok authtoken." -ForegroundColor Yellow
}

$size = "{0:N0} MB" -f ((Get-ChildItem $Out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Host ""
Write-Host "Ready: $Out ($size)" -ForegroundColor Green
Write-Host "1. Copy that MM folder to the new PC (e.g. to its Desktop) with a USB drive."
Write-Host "2. On the new PC, double-click setup.bat inside it (once)."
Write-Host "3. Close the backend and tunnel windows on THIS PC - only one PC can use the public address."
Write-Host "4. On the new PC, double-click start-servers.bat."
Write-Host ""
Write-Host "The folder contains passwords and customer data - keep the USB drive safe and wipe it afterwards." -ForegroundColor Yellow
