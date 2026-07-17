@echo off
set PORT=8787
cd /d "%~dp0"
start "" "http://localhost:%PORT%/index.html"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server %PORT% --bind 127.0.0.1
) else (
  python -m http.server %PORT% --bind 127.0.0.1
)
