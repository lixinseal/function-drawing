@echo off
cd /d "%~dp0"
set "npm_config_cache=%~dp0.npm-cache"
if not exist "node_modules" (
  call npm install
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 exit /b 1
echo.
echo Build complete: %~dp0dist
