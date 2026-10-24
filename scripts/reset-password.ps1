# Sets a new password for a login (e.g. an admin who forgot theirs). Run on
# the server PC through reset-password.bat. The database must be running
# (start-servers.bat starts it).
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$NodeDir = Join-Path $Root "tools\node"
# A PC set up with setup.bat has its own Node.js in tools\; otherwise the
# installed one is used.
if (Test-Path "$NodeDir\node.exe") { $env:Path = "$NodeDir;$env:Path" }
Set-Location (Join-Path $Root "backend")
& npx ts-node --transpile-only scripts/reset-password.ts
