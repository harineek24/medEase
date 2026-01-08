@echo off
REM MedEase EHR Summarizer - Startup Script (Windows)
REM This script helps you set up and run the application

setlocal enabledelayedexpansion

:menu
cls
echo ============================================
echo    MedEase EHR Summarizer
echo ============================================
echo.
echo 1. Setup (First Time Installation)
echo 2. Run Backend Only
echo 3. Run Frontend Only
echo 4. Run Both Backend and Frontend
echo 5. Exit
echo.
set /p choice="Select an option (1-5): "

if "%choice%"=="1" goto setup
if "%choice%"=="2" goto run_backend
if "%choice%"=="3" goto run_frontend
if "%choice%"=="4" goto run_both
if "%choice%"=="5" goto exit_script
echo Invalid option. Please select 1-5.
timeout /t 2 >nul
goto menu

:setup
cls
echo ============================================
echo    Setting Up MedEase
echo ============================================
echo.

REM Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.9 or higher.
    echo Download from: https://www.python.org/downloads/
    pause
    goto menu
)
echo [OK] Python found
python --version

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18 or higher.
    echo Download from: https://nodejs.org/
    pause
    goto menu
)
echo [OK] Node.js found
node --version

REM Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found. Please install npm.
    pause
    goto menu
)
echo [OK] npm found
npm --version

echo.
echo ============================================
echo    Setting Up Backend
echo ============================================
echo.

cd backend

REM Create virtual environment
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
    echo [OK] Virtual environment created
) else (
    echo [WARNING] Virtual environment already exists
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install Python dependencies
echo Installing Python dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
echo [OK] Python dependencies installed

REM Setup .env file
if not exist ".env" (
    echo.
    echo [WARNING] Setting up environment variables...
    copy .env.example .env >nul
    echo.
    echo Please enter your Gemini API key:
    echo Get your key from: https://aistudio.google.com/app/apikey
    set /p API_KEY="API Key: "

    if not "!API_KEY!"=="" (
        echo GEMINI_API_KEY=!API_KEY!> .env
        echo [OK] .env file created with your API key
    ) else (
        echo [WARNING] .env file created, but you need to add your API key manually
    )
) else (
    echo [WARNING] .env file already exists
)

cd ..

echo.
echo ============================================
echo    Setting Up Frontend
echo ============================================
echo.

cd frontend

echo Installing Node.js dependencies...
call npm install
echo [OK] Node.js dependencies installed

cd ..

REM Create outputs directory
if not exist "outputs\summaries" mkdir outputs\summaries
echo [OK] Outputs directory created

echo.
echo ============================================
echo    Setup Complete!
echo ============================================
echo.
echo [OK] Backend configured
echo [OK] Frontend configured
echo [OK] Ready to run!
echo.
echo Run this script again and choose option 4 to start the application.
echo.
pause
goto menu

:run_backend
cls
echo ============================================
echo    Starting Backend Server
echo ============================================
echo.

if not exist "backend\.env" (
    echo [ERROR] .env file not found. Please run setup first (option 1).
    pause
    goto menu
)

cd backend

if not exist "venv" (
    echo [ERROR] Virtual environment not found. Please run setup first (option 1).
    pause
    cd ..
    goto menu
)

call venv\Scripts\activate.bat

echo Starting FastAPI server on http://localhost:8000
echo.
python main.py

cd ..
pause
goto menu

:run_frontend
cls
echo ============================================
echo    Starting Frontend Server
echo ============================================
echo.

if not exist "frontend\node_modules" (
    echo [ERROR] Node modules not found. Please run setup first (option 1).
    pause
    goto menu
)

cd frontend

echo Starting Vite dev server on http://localhost:3000
echo.
call npm run dev

cd ..
pause
goto menu

:run_both
cls
echo ============================================
echo    Starting MedEase Application
echo ============================================
echo.

if not exist "backend\.env" (
    echo [ERROR] .env file not found. Please run setup first (option 1).
    pause
    goto menu
)

if not exist "frontend\node_modules" (
    echo [ERROR] Node modules not found. Please run setup first (option 1).
    pause
    goto menu
)

REM Start backend in new window
echo Starting backend server...
start "MedEase Backend" cmd /k "%~dp0run_backend.bat"
echo [OK] Backend started in new window

REM Wait a moment for backend to start
timeout /t 3 >nul

REM Start frontend in new window
echo Starting frontend server...
start "MedEase Frontend" cmd /k "%~dp0run_frontend.bat"
echo [OK] Frontend started in new window

echo.
echo ============================================
echo    Application Started!
echo ============================================
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Both servers are running in separate windows.
echo Close those windows to stop the servers.
echo.
pause
goto menu

:exit_script
echo Goodbye!
exit /b 0
