#!/bin/bash
set -e

# Change to the application directory
cd /opt/outline

# Install dependencies if node_modules is empty or package.json has changed
if [ ! -d "node_modules" ] || [ "$(find package.json -newer node_modules -print -quit)" ]; then
  echo "Installing or updating dependencies..."
  yarn install
fi

# Build the server
echo "Building server..."
yarn build:server

# Seed the database if needed
echo "Seeding database with admin user..."
node build/server/scripts/seed.js my@email.com

# Start the development server with hot reloading
echo "Starting development server with hot reloading..."
yarn dev:watch
