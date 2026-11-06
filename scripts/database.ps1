# Shared by setup.ps1 and start-servers.ps1 (dot-sourced).
#
# Starts PostgreSQL in a console of its own that has no window. Started
# straight from a script's window, the database would shut down whenever that
# window closed: Windows sends the close to every program attached to the
# window, and PostgreSQL treats it as "shut down now". That is how the live
# database stopped after setup.bat's window was closed while the site was in
# use (2026-11). stop-servers.bat is the way to stop it.
function Start-Database([string]$PgDir, [string]$Port) {
  # Not answering, so any lock file is left over from a crash or power cut —
  # it would make the start fail.
  Remove-Item "$PgDir\data\postmaster.pid" -Force -ErrorAction SilentlyContinue
  # A new log file per start: an old one can stay locked after a crash.
  New-Item -ItemType Directory -Force "$PgDir\logs" | Out-Null
  $log = "$PgDir\logs\server-$(Get-Date -Format yyyyMMdd-HHmmss).log"

  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = "$PgDir\bin\pg_ctl.exe"
  $start.Arguments = "-D `"$PgDir\data`" -l `"$log`" -o `"-p $Port`" -w start"
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $pgCtl = [System.Diagnostics.Process]::Start($start)
  $pgCtl.WaitForExit()
  # pg_ctl -w has waited for the server to be ready; double-check the port.
  $up = $pgCtl.ExitCode -eq 0 -and [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  return [pscustomobject]@{ Started = $up; Log = $log }
}
