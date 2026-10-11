@echo off
rem Double-click to run scripts\setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
echo.
pause
