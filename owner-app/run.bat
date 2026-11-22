@echo off
title Kirana App Server
cd /d "%~dp0"
echo Starting Kirana Store App...
start http://localhost:5173
call npm run dev
pause
