@echo off
rem Double-click to set a new password for a login (e.g. a forgotten admin password)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\reset-password.ps1"
echo.
pause
