@echo off
title Kirana System - 1-Click Sync & GitHub Push
cd /d "%~dp0"

echo =======================================================
echo    Kirana System - Syncing Files to GitHub & Vercel
echo =======================================================
echo.
echo [1/3] Syncing Customer App...
robocopy "C:\Users\dines\Downloads\kirana web for customer" "C:\Users\dines\Downloads\kirana-flow-system\customer-app" /E /XD node_modules dist .git /NFL /NDL /NJH /NJS

echo [2/3] Syncing Owner App...
robocopy "C:\Users\dines\Downloads\kirana web\kirana-store-app-main\kirana-store-app-main" "C:\Users\dines\Downloads\kirana-flow-system\owner-app" /E /XD node_modules dist .git /NFL /NDL /NJH /NJS

echo [3/3] Syncing Admin App...
robocopy "C:\Users\dines\Downloads\kirana-super-admin" "C:\Users\dines\Downloads\kirana-flow-system\admin-app" /E /XD node_modules dist .git /NFL /NDL /NJH /NJS

echo.
echo Pushing changes to GitHub repository...
git add .
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Auto-sync updates: %date% %time%"
    git push origin main
    echo.
    echo =======================================================
    echo   SUCCESS! All changes pushed to GitHub & Vercel!
    echo =======================================================
) else (
    echo.
    echo No new changes found to push. Everything is up-to-date!
)

echo.
pause
