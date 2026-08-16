@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0app-run.log"

echo ============================================
echo  Prism - Start Desktop App
echo ============================================

if not exist node_modules (
  echo [Prism] Installing dependencies...
  call npm install >> "%LOG%" 2>&1
  if errorlevel 1 goto :failed
)

echo [Prism] Building and launching Electron app...
call npm run app >> "%LOG%" 2>&1
if errorlevel 1 goto :failed
goto :eof

:failed
echo.
echo [Prism] Start failed. Check the error output above.
pause
exit /b 1
