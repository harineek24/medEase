#!/bin/bash

# MedEase EHR Summarizer - Startup Script (Mac/Linux)
# This script helps you set up and run the application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Python
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        print_success "Python found: $PYTHON_VERSION"
        PYTHON_CMD="python3"
    elif command_exists python; then
        PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
        print_success "Python found: $PYTHON_VERSION"
        PYTHON_CMD="python"
    else
        print_error "Python not found. Please install Python 3.9 or higher."
        echo "Download from: https://www.python.org/downloads/"
        return 1
    fi

    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
    else
        print_error "Node.js not found. Please install Node.js 18 or higher."
        echo "Download from: https://nodejs.org/"
        return 1
    fi

    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "npm found: $NPM_VERSION"
    else
        print_error "npm not found. Please install npm."
        return 1
    fi

    echo ""
    return 0
}

# Setup function (first-time installation)
setup() {
    print_header "Setting Up MedEase EHR Summarizer"

    if ! check_prerequisites; then
        exit 1
    fi

    # Setup backend
    print_header "Setting Up Backend"
    cd backend

    # Create virtual environment
    if [ ! -d "venv" ]; then
        echo "Creating Python virtual environment..."
        $PYTHON_CMD -m venv venv
        print_success "Virtual environment created"
    else
        print_warning "Virtual environment already exists"
    fi

    # Activate virtual environment
    source venv/bin/activate

    # Install Python dependencies
    echo "Installing Python dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
    print_success "Python dependencies installed"

    # Setup .env file
    if [ ! -f ".env" ]; then
        echo ""
        print_warning "Setting up environment variables..."
        cp .env.example .env
        echo ""
        echo -e "${YELLOW}Please enter your Gemini API key:${NC}"
        echo "Get your key from: https://aistudio.google.com/app/apikey"
        read -p "API Key: " API_KEY

        if [ ! -z "$API_KEY" ]; then
            echo "GEMINI_API_KEY=$API_KEY" > .env
            print_success ".env file created with your API key"
        else
            print_warning ".env file created, but you need to add your API key manually"
        fi
    else
        print_warning ".env file already exists"
    fi

    cd ..

    # Setup frontend
    print_header "Setting Up Frontend"
    cd frontend

    echo "Installing Node.js dependencies..."
    npm install
    print_success "Node.js dependencies installed"

    cd ..

    # Create outputs directory
    mkdir -p outputs/summaries
    print_success "Outputs directory created"

    print_header "Setup Complete!"
    echo ""
    echo -e "${GREEN}✓ Backend configured${NC}"
    echo -e "${GREEN}✓ Frontend configured${NC}"
    echo -e "${GREEN}✓ Ready to run!${NC}"
    echo ""
    echo "Run this script again and choose option 4 to start the application."
}

# Run backend only
run_backend() {
    print_header "Starting Backend Server"

    if [ ! -f "backend/.env" ]; then
        print_error ".env file not found. Please run setup first (option 1)."
        exit 1
    fi

    cd backend

    if [ ! -d "venv" ]; then
        print_error "Virtual environment not found. Please run setup first (option 1)."
        exit 1
    fi

    source venv/bin/activate

    echo "Starting FastAPI server on http://localhost:8000"
    $PYTHON_CMD main.py
}

# Run frontend only
run_frontend() {
    print_header "Starting Frontend Server"

    if [ ! -d "frontend/node_modules" ]; then
        print_error "Node modules not found. Please run setup first (option 1)."
        exit 1
    fi

    cd frontend

    echo "Starting Vite dev server on http://localhost:3000"
    npm run dev
}

# Run both backend and frontend
run_both() {
    print_header "Starting MedEase Application"

    if [ ! -f "backend/.env" ]; then
        print_error ".env file not found. Please run setup first (option 1)."
        exit 1
    fi

    if [ ! -d "frontend/node_modules" ]; then
        print_error "Node modules not found. Please run setup first (option 1)."
        exit 1
    fi

    # Create a PID file directory
    mkdir -p .pids

    # Start backend in background
    echo "Starting backend server..."
    cd backend
    source venv/bin/activate
    $PYTHON_CMD main.py > ../backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > ../.pids/backend.pid
    cd ..
    print_success "Backend started (PID: $BACKEND_PID)"

    # Wait a moment for backend to start
    sleep 2

    # Start frontend in background
    echo "Starting frontend server..."
    cd frontend
    npm run dev > ../frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../.pids/frontend.pid
    cd ..
    print_success "Frontend started (PID: $FRONTEND_PID)"

    echo ""
    print_success "Application is starting!"
    echo ""
    echo "Backend: http://localhost:8000"
    echo "Frontend: http://localhost:3000"
    echo ""
    echo "Logs:"
    echo "  Backend: tail -f backend.log"
    echo "  Frontend: tail -f frontend.log"
    echo ""
    echo "To stop servers:"
    echo "  kill $BACKEND_PID $FRONTEND_PID"
    echo ""
    echo "Press Ctrl+C to stop watching logs..."

    # Watch logs
    tail -f backend.log frontend.log
}

# Main menu
show_menu() {
    clear
    print_header "🏥 MedEase EHR Summarizer"
    echo ""
    echo "1. Setup (First Time Installation)"
    echo "2. Run Backend Only"
    echo "3. Run Frontend Only"
    echo "4. Run Both Backend and Frontend"
    echo "5. Exit"
    echo ""
    read -p "Select an option (1-5): " choice

    case $choice in
        1)
            setup
            ;;
        2)
            run_backend
            ;;
        3)
            run_frontend
            ;;
        4)
            run_both
            ;;
        5)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid option. Please select 1-5."
            sleep 2
            show_menu
            ;;
    esac
}

# Run the menu
show_menu
