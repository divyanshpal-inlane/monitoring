@echo off
rem Starts the local monitoring window and opens it in your browser.
rem Lives OUTSIDE the inlane-web-app repo on purpose - never commit it.
cd /d "%~dp0"
start "" /min cmd /c "timeout /t 2 >nul & start http://127.0.0.1:4455/"
node server.mjs
echo.
echo Server stopped. Press any key to close.
pause >nul
