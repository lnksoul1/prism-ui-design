@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0server.log"

echo ============================================
echo  Prism - Start HTTP Dashboard Service
echo ============================================

if not exist node_modules (
  echo [Prism] Installing dependencies...
  call npm install >> "%LOG%" 2>&1
  if errorlevel 1 goto :failed
)

echo [Prism] Building TypeScript...
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

echo [Prism] Service will listen on http://127.0.0.1:3100
echo [Prism] Press Ctrl+C to stop.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3100'"
npm start >> "%LOG%" 2>&1
goto :eof

:failed
echo.
echo [Prism] Start failed. Check the error output above.
pause
exit /b 1
