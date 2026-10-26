@echo off
rem Double-click to run scripts\start-servers.ps1. The backend and tunnel
rem windows start minimized; this window closes by itself when all went well
rem and stays open if something failed, so the error can be read.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-servers.ps1"
if errorlevel 1 (
  echo.
  echo Something went wrong - see the message above.
  pause
  exit /b 1
)
echo.
echo This window closes in 8 seconds.
timeout /t 8 >nul
