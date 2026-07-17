@echo off
cd /d "%~dp0"
echo.
echo Deploying Simply Pay to Cloudflare Pages...
echo.
npx wrangler whoami >nul 2>nul
if errorlevel 1 (
  echo Cloudflare needs you to log in first.
  npx wrangler login
)
npx wrangler pages deploy . --project-name simply-pay --branch main
echo.
pause
