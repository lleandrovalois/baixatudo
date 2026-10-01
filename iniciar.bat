@echo off
title YouTube Downloader Pro
echo ========================================================
echo   Iniciando YouTube Downloader Pro...
echo ========================================================
echo.
cd /d "%~dp0"
start http://localhost:3333
node server.js
pause
