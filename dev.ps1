# PowerShell script to manage Outline development environment

param (
    [string]$command = "help"
)

function Show-Help {
    Write-Host "Outline Development Environment Helper"
    Write-Host "-------------------------------------"
    Write-Host "Usage: .\dev.ps1 [command]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  start       - Start the development environment in detached mode"
    Write-Host "  dev         - Start the development environment with hot reloading (interactive)"
    Write-Host "  debug       - Start the development environment with extra debugging for hot reload"
    Write-Host "  stop        - Stop the development environment"
    Write-Host "  restart     - Restart the development environment"
    Write-Host "  logs        - Show logs from all services"
    Write-Host "  status      - Check the status of the development environment"
    Write-Host "  build       - Rebuild the Outline development image"
    Write-Host "  shell       - Open a shell in the Outline container"
    Write-Host "  migrate     - Run database migrations"
    Write-Host "  reset-db    - Reset the database (WARNING: Deletes all data)"
    Write-Host "  clean       - Stop and remove all containers and volumes"
    Write-Host "  help        - Show this help message"
}

function Start-Environment {
    Write-Host "Starting Outline development environment..."
    docker-compose -f docker-compose.dev.yml up -d
    Write-Host "Environment started. Access the application at http://localhost:3000"
    Write-Host "Hot reloading is enabled - your changes will be reflected automatically"
}

function Stop-Environment {
    Write-Host "Stopping Outline development environment..."
    docker-compose -f docker-compose.dev.yml down
}

function Show-Logs {
    docker-compose -f docker-compose.dev.yml logs -f
}

function Build-Image {
    Write-Host "Building Outline development image..."
    docker-compose -f docker-compose.dev.yml build outline --no-cache
}

function Open-Shell {
    docker-compose -f docker-compose.dev.yml exec outline /bin/bash
}

function Run-Migrations {
    Write-Host "Running database migrations..."
    docker-compose -f docker-compose.dev.yml exec outline yarn db:migrate
}

function Reset-Database {
    Write-Host "WARNING: This will delete all data in the database."
    $confirmation = Read-Host "Are you sure you want to continue? (y/n)"
    if ($confirmation -eq 'y') {
        Write-Host "Resetting database..."
        docker-compose -f docker-compose.dev.yml exec outline yarn db:reset
    }
}

function Clean-Environment {
    Write-Host "WARNING: This will stop and remove all containers and volumes."
    $confirmation = Read-Host "Are you sure you want to continue? (y/n)"
    if ($confirmation -eq 'y') {
        Write-Host "Cleaning up environment..."
        docker-compose -f docker-compose.dev.yml down -v
    }
}

function Dev-Environment {
    Write-Host "Starting Outline development environment with hot reloading..." -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the environment" -ForegroundColor Yellow

    # Stop any running containers first
    docker-compose -f docker-compose.dev.yml down

    # Build and start in interactive mode (not detached)
    docker-compose -f docker-compose.dev.yml up --build
}

function Debug-Environment {
    Write-Host "Starting Outline development environment with hot reloading in debug mode..." -ForegroundColor Green
    Write-Host "This mode includes extra logging to diagnose hot reload issues" -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop the environment" -ForegroundColor Yellow

    # Stop any running containers first
    docker-compose -f docker-compose.dev.yml down

    # Rebuild the image to ensure latest changes
    docker-compose -f docker-compose.dev.yml build outline

    # Start with extra debugging environment variables
    #$env:DEBUG="vite:*,nodemon:*,http,express:*,socket.io:*"
    $env:VITE_ENABLE_HMR="true"
    $env:CHOKIDAR_USEPOLLING="true"
    $env:WATCHPACK_POLLING="true"
    $env:CHOKIDAR_INTERVAL="1000"
    $env:FAST_REFRESH="true"
    $env:VITE_HMR_HOST="0.0.0.0"
    $env:VITE_HMR_PORT="3001"
    $env:VITE_HMR_PROTOCOL="ws"

    # Build and start in interactive mode with verbose output
    docker-compose -f docker-compose.dev.yml up --build
}

function Check-Status {
    Write-Host "Checking Outline development environment status..." -ForegroundColor Green

    # Make the check-dev-status.sh script executable
    docker-compose -f docker-compose.dev.yml exec outline chmod +x /opt/outline/check-dev-status.sh

    # Run the status check script
    docker-compose -f docker-compose.dev.yml exec outline /opt/outline/check-dev-status.sh
}

# Execute the requested command
switch ($command) {
    "start" { Start-Environment }
    "dev" { Dev-Environment }
    "debug" { Debug-Environment }
    "stop" { Stop-Environment }
    "restart" {
        Stop-Environment
        Build-Image
        Start-Environment
    }
    "logs" { Show-Logs }
    "status" { Check-Status }
    "build" { Build-Image }
    "shell" { Open-Shell }
    "migrate" { Run-Migrations }
    "reset-db" { Reset-Database }
    "clean" { Clean-Environment }
    default { Show-Help }
}
