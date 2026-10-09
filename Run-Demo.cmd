@echo off
cd /d "%~dp0"
node src\cli.mjs demo --out "outputs\demo-%RANDOM%-%RANDOM%"
pause
