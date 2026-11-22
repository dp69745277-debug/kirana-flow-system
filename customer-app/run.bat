@echo off
title Kirana B2B Customer Portal
cd /d "%~dp0"
echo Starting Kirana Wholesale B2B Customer App...
start http://localhost:5174
call npm run dev
pause
