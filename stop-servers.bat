@echo off
rem Double-click to stop everything start-servers.bat started on this PC:
rem the database, the backend (node) and the tunnel (ngrok).
cd /d "%~dp0"
echo Stopping the database...
if exist "tools\pgsql\bin\pg_ctl.exe" tools\pgsql\bin\pg_ctl.exe -D tools\pgsql\data stop -m fast
taskkill /F /IM postgres.exe >nul 2>&1
if exist "tools\pgsql\data\postmaster.pid" del /f "tools\pgsql\data\postmaster.pid"
echo Stopping the backend...
taskkill /F /IM node.exe >nul 2>&1
echo Stopping the tunnel...
taskkill /F /IM ngrok.exe >nul 2>&1
echo.
echo All stopped. Double-click start-servers.bat to start again.
pause
