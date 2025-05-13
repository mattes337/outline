#!/bin/bash
set -e

# This script checks the status of the Outline development environment

echo "Checking Outline development environment status..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi

echo "✅ Docker is running"

# Check if the Outline container is running
if ! docker ps | grep -q outline; then
  echo "❌ Outline container is not running. Please start the development environment with './dev.ps1 debug'"
  exit 1
fi

echo "✅ Outline container is running"

# Check if the Outline container is healthy
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' $(docker ps -q --filter name=outline))
if [ "$HEALTH" != "healthy" ] && [ "$HEALTH" != "starting" ]; then
  echo "❌ Outline container is not healthy. Status: $HEALTH"
  echo "Checking container logs for errors..."
  docker logs --tail 50 $(docker ps -q --filter name=outline)
  exit 1
fi

echo "✅ Outline container health status: $HEALTH"

# Check if the ports are exposed
if ! docker port $(docker ps -q --filter name=outline) | grep -q 3000; then
  echo "❌ Port 3000 is not exposed"
  exit 1
fi

if ! docker port $(docker ps -q --filter name=outline) | grep -q 3001; then
  echo "❌ Port 3001 is not exposed"
  exit 1
fi

echo "✅ Ports 3000 and 3001 are exposed"

# Check if the services are accessible
echo "Checking if the main application is accessible..."
if ! curl -s http://localhost:3000/api/healthz > /dev/null; then
  echo "❌ Main application is not accessible at http://localhost:3000"
  echo "Checking container logs for errors..."
  docker logs --tail 50 $(docker ps -q --filter name=outline)
  exit 1
fi

echo "✅ Main application is accessible at http://localhost:3000"

echo "Checking if the Vite dev server is accessible..."
if ! curl -s http://localhost:3001 > /dev/null; then
  echo "❌ Vite dev server is not accessible at http://localhost:3001"
  echo "This might be normal if the server is still starting up."
else
  echo "✅ Vite dev server is accessible at http://localhost:3001"
fi

# Check container logs for common errors
echo "Checking container logs for common errors..."
if docker logs $(docker ps -q --filter name=outline) 2>&1 | grep -i "error" | grep -v "ErrorPage" | grep -v "error-boundary" | grep -v "error handling" | grep -v "error.tsx"; then
  echo "⚠️ Found potential errors in the container logs"
else
  echo "✅ No obvious errors found in container logs"
fi

echo "All checks completed. The development environment appears to be running correctly."
echo "If you're still experiencing issues, try the following:"
echo "1. Restart the development environment with './dev.ps1 debug'"
echo "2. Check the logs with './dev.ps1 logs'"
echo "3. Rebuild the image with './dev.ps1 build'"
