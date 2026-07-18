@echo off
chcp 65001 >nul
title Smelt
echo.
echo   Smelt — .card format reference implementation
echo   https://github.com/Che-A-Lu/smelt
echo.
echo   Installing dependencies...
call npm install
echo.
echo   Starting Smelt...
start http://localhost:5173
npx vite
pause
