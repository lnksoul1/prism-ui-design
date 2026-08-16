@echo off
setlocal
cd /d D:\Prism

echo [1/5] Checking git repository...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Initializing git repository...
  git init
)

echo [2/5] Setting remote...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/lnksoul1/prism-ui-design.git

echo [3/5] Staging all changes...
git add -A

echo [4/5] Committing...
git commit -m "refactor: align Prism with DESIGN.md v1.1 and VibeHub design library"

echo [5/5] Pushing...
git branch -M main
git fetch origin
git pull --rebase origin main --allow-unrelated-histories || echo Pull failed, continuing...
git push -u origin main

endlocal
