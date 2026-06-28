@echo off
echo =======================================================================
echo Kashtbhanjan Medical Shop Management System - Production Startup
echo =======================================================================

:: Check for backend env configuration file
if not exist "backend\.env" (
    echo [ERROR] backend\.env configuration file is missing!
    echo Please copy backend\.env.example to backend\.env and configure variables.
    pause
    exit /b 1
)

:: Install root and backend dependencies
echo Checking and installing dependencies...
call npm install --production=false
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install root dependencies.
    pause
    exit /b 1
)

call npm install --prefix backend --production=false
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install backend dependencies.
    pause
    exit /b 1
)

:: Rebuild frontend assets if missing or needed
if not exist "dist\index.html" (
    echo Built assets missing. Building React frontend for production...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend build failed.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Built React assets found. If you have modified the UI, run 'npm run build' manually.
)

:: Verify PM2 globally or locally
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    echo Starting server in production mode using PM2...
    call pm2 start ecosystem.config.json --env production
    echo Server successfully registered and started in background under PM2!
    echo To check logs, run: pm2 logs
    echo To check status, run: pm2 status
) else (
    echo [WARNING] PM2 is not installed globally. Starting server in foreground via Node.js...
    set NODE_ENV=production
    set PORT=5000
    node backend/server.js
)

pause
