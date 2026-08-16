@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0run-checks.log"

echo ============================================
echo  Prism - Build and Test
echo  Results are written to:
echo  %LOG%
echo ============================================

if not exist node_modules (
  echo [Prism] Installing dependencies...
  call npm install > "%LOG%" 2>&1
  if errorlevel 1 goto :failed
)

echo [Prism] Build started...
call npm run build > "%LOG%" 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"
echo BUILD_EXIT=%BUILD_EXIT% >> "%LOG%"
if not "%BUILD_EXIT%"=="0" goto :build_failed

echo [Prism] Build OK. Tests started...
call npm test >> "%LOG%" 2>&1
set "TEST_EXIT=%ERRORLEVEL%"
echo TEST_EXIT=%TEST_EXIT% >> "%LOG%"

if "%TEST_EXIT%"=="0" (
  echo [Prism] Build and tests PASSED.
) else (
  echo [Prism] Tests FAILED. See log.
  start notepad "%LOG%"
)
echo [Prism] Log file: %LOG%
pause
exit /b %TEST_EXIT%

:build_failed
echo [Prism] Build FAILED. See log:
echo   %LOG%
start notepad "%LOG%"
pause
exit /b %BUILD_EXIT%

:failed
echo [Prism] npm install failed. Check %LOG%.
pause
exit /b 1
