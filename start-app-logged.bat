@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0app-run.log"

echo Starting Prism desktop app. Output is written to:
echo   %LOG%

if not exist node_modules (
  call npm install > "%LOG%" 2>&1
  if errorlevel 1 goto :failed
)

echo [%date% %time%] Starting Prism app >> "%LOG%"
call npm run app >> "%LOG%" 2>&1
if errorlevel 1 goto :failed
goto :eof

:failed
echo [Prism] Start failed. See %LOG%
start notepad "%LOG%"
pause
exit /b 1
