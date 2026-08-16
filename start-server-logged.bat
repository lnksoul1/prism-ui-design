@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0server.log"

echo Starting Prism HTTP service. Output is written to:
echo   %LOG%

if not exist node_modules (
  call npm install > "%LOG%" 2>&1
  if errorlevel 1 goto :failed
)

echo [%date% %time%] Starting Prism server >> "%LOG%"
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3100'"
npm start >> "%LOG%" 2>&1
goto :eof

:failed
echo [Prism] Build failed. See %LOG%
start notepad "%LOG%"
pause
exit /b 1
