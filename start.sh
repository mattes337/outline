#!/bin/bash
set -e

# Enable debug logging
export DEBUG=vite:*,nodemon:*,http,express:*,socket.io:*

# Change to the application directory
cd /opt/outline

echo "Current working directory: $(pwd)"
echo "Listing files in current directory:"
ls -la

# Install dependencies if node_modules is empty or package.json has changed
if [ ! -d "node_modules" ] || [ "$(find package.json -newer node_modules -print -quit)" ]; then
  echo "Installing or updating dependencies..."
  yarn install
fi

# Check if node_modules is properly mounted
echo "Checking node_modules mount:"
ls -la node_modules | head -n 5

# Build the server
echo "Building server..."
yarn build:server

# Seed the database if needed
echo "Seeding database with admin user..."
node build/server/scripts/seed.js my@email.com

# Check network configuration
echo "Network configuration:"
ip addr show
echo "Docker container hostname: $(hostname)"

# Check if ports are properly exposed
echo "Checking if ports are properly exposed:"
netstat -tulpn | grep -E '3000|3001|9229' || echo "Ports not yet bound"

# Start the development server with hot reloading
echo "Starting development server with hot reloading..."
echo "NODE_ENV: $NODE_ENV"
echo "URL: $URL"
echo "DEBUG: $DEBUG"

# Set additional environment variables for better hot reloading
export VITE_ENABLE_HMR=true
export CHOKIDAR_USEPOLLING=true
export WATCHPACK_POLLING=true
export CHOKIDAR_INTERVAL=1000
export FAST_REFRESH=true

# Use nodemon directly with more verbose logging
echo "Starting development server with yarn dev:watch..."
yarn dev:watch
