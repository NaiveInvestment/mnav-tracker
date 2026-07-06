@echo off
cd /d %~dp0
start "mNAV tracker server" node server.js
timeout /t 1 >nul
start "" http://localhost:8787
