@echo off
setlocal
set "LOG=%~dp0inspect-dsh.log"
(
  echo === system ===
  echo USERPROFILE=%USERPROFILE%
  echo LOCALAPPDATA=%LOCALAPPDATA%
  echo APPDATA=%APPDATA%
  echo.
  echo === where ===
  where node
  where npm
  where dsh
  where dsh-do
  echo.
  echo === npm global root ===
  npm root -g
  echo.
  echo === LOCALAPPDATA ===
  dir "%LOCALAPPDATA%" /b
  echo.
  echo === LOCALAPPDATA\Programs ===
  dir "%LOCALAPPDATA%\Programs" /b 2>nul
  echo.
  echo === APPDATA\npm\node_modules ===
  dir "%APPDATA%\npm\node_modules" /b
  echo.
  echo === USERPROFILE\.dsh ===
  dir "%USERPROFILE%\.dsh" /b
  echo.
  echo === USERPROFILE\.dsh\profiles\web ===
  dir "%USERPROFILE%\.dsh\profiles\web" /b
  echo.
  echo === DSH env vars ===
  set DSH
) > "%LOG%" 2>&1
type "%LOG%"
echo.
echo Log written to %LOG%
pause
