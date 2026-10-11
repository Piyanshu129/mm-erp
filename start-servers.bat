@echo off
rem Double-click to run scripts\start-servers.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-servers.ps1"
echo.
pause
