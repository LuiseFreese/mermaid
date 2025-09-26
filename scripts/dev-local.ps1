#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the Mermaid application in local development mode

.DESCRIPTION
    This script sets up a local development environment. If .env.local exists,
    it will use real Dataverse authentication. Otherwise, it uses mock data.

.PARAMETER Port
    Port for the backend server (default: 8080)

.PARAMETER FrontendPort
    Port for the frontend dev server (default: 3003)

.PARAMETER NoOpen
    Don't automatically open browser

.EXAMPLE
    # Start local development environment
    .\scripts\dev-local.ps1
    
.EXAMPLE
    # Start with custom ports
    .\scripts\dev-local.ps1 -Port 3000 -FrontendPort 3001
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [int]$Port = 8080,
    
    [Parameter(Mandatory = $false)]
    [int]$FrontendPort = 3003,
    
    [Parameter(Mandatory = $false)]
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Mermaid Local Development Environment" -ForegroundColor Green
Write-Host "Backend: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Cyan

# Load environment variables from .env.local if it exists
$envLocalPath = ".env.local"
$useRealAuth = $false

if (Test-Path $envLocalPath) {
    Write-Host "Loading real authentication from .env.local..." -ForegroundColor Green
    
    # Parse .env.local file and set environment variables
    Get-Content $envLocalPath | ForEach-Object {
        if ($_ -match "^([^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove quotes if present
            if ($value -match "^[`"'](.*)['`"]$") {
                $value = $matches[1]
            }
            [System.Environment]::SetEnvironmentVariable($name, $value, [System.EnvironmentVariableTarget]::Process)
        }
    }
    
    $useRealAuth = $true
    $env:USE_MOCK_DATA = "false"
    $env:AUTH_MODE = "client-secret"
    
    Write-Host "✅ Using real Dataverse authentication" -ForegroundColor Green
    Write-Host "Client ID: $($env:CLIENT_ID)" -ForegroundColor Cyan
    Write-Host "Dataverse URL: $($env:DATAVERSE_URL)" -ForegroundColor Cyan
} else {
    Write-Host "No .env.local found - using mock data for development" -ForegroundColor Yellow
    
    $env:USE_MOCK_DATA = "true"
    $env:AUTH_MODE = "development"
    $env:DATAVERSE_URL = "https://mock-dataverse.local"
    
    Write-Host "✅ Using mock data mode" -ForegroundColor Green
}

# Common environment variables
$env:NODE_ENV = "development"
$env:PORT = $Port.ToString()

# Create minimal mock data directory structure only if using mock mode
if ($env:USE_MOCK_DATA -eq "true") {
    Write-Host "Setting up mock data directories..." -ForegroundColor Cyan
    if (-not (Test-Path "data/deployments")) {
        New-Item -ItemType Directory -Path "data/deployments" -Force | Out-Null
    }
    Write-Host "✅ Mock data directories ready (data will be created by backend)" -ForegroundColor Green
}

# Kill any existing processes on these ports
Write-Host "Cleaning up any existing processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Install frontend dependencies if needed
Push-Location src/frontend
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "🚀 Starting development servers..." -ForegroundColor Green

# Start backend server
Write-Host "Starting backend server at http://localhost:$Port" -ForegroundColor Cyan

# Start backend in background job
$backendJob = Start-Job -ScriptBlock {
    param($Port, $ProjectRoot)
    Set-Location $ProjectRoot
    
    # Load environment variables from .env.local if it exists
    $envLocalPath = ".env.local"
    if (Test-Path $envLocalPath) {
        Get-Content $envLocalPath | ForEach-Object {
            if ($_ -match "^([^=]+)=(.*)$") {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                if ($value -match "^[`"'](.*)['`"]$") {
                    $value = $matches[1]
                }
                [System.Environment]::SetEnvironmentVariable($name, $value, [System.EnvironmentVariableTarget]::Process)
            }
        }
        $env:USE_MOCK_DATA = "false"
        $env:AUTH_MODE = "client-secret"
    } else {
        $env:USE_MOCK_DATA = "true"
        $env:AUTH_MODE = "development"
        $env:DATAVERSE_URL = "https://mock-dataverse.local"
    }
    
    $env:NODE_ENV = "development"
    $env:PORT = $Port.ToString()
    
    Write-Host "Backend: Environment variables loaded"
    node src/backend/server.js
} -ArgumentList $Port, (Get-Location)

# Wait for backend to start
Start-Sleep -Seconds 3

# Test backend
$backendReady = $false
$attempts = 0
while (-not $backendReady -and $attempts -lt 10) {
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            Write-Host "✅ Backend server is ready" -ForegroundColor Green
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $backendReady) {
    Write-Error "❌ Backend server failed to start"
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    exit 1
}

# Start frontend dev server
Write-Host "Starting frontend dev server at http://localhost:$FrontendPort" -ForegroundColor Cyan
Push-Location src/frontend
try {
    $env:VITE_API_BASE_URL = "http://localhost:$Port"
    
    Write-Host ""
    Write-Host "🎉 Development environment running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Cyan
    Write-Host "Backend:  http://localhost:$Port" -ForegroundColor Cyan
    Write-Host "Health:   http://localhost:$Port/health" -ForegroundColor Cyan
    Write-Host ""
    if ($useRealAuth) {
        Write-Host "🔐 Using real Dataverse authentication" -ForegroundColor Green
    } else {
        Write-Host "🧪 Using mock data" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Test deployment history: http://localhost:$FrontendPort/deployment-history" -ForegroundColor White
    Write-Host ""
    Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Gray
    Write-Host ""
    
    if (-not $NoOpen) {
        Start-Sleep -Seconds 2
        Start-Process "http://localhost:$FrontendPort"
    }
    
    # Start frontend dev server (this will run in foreground)
    npm run dev -- --port=$FrontendPort --host=localhost
    
} finally {
    Pop-Location
    # Clean up backend job when frontend stops
    Write-Host "`nStopping backend server..." -ForegroundColor Yellow
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    Write-Host "✅ Development environment stopped" -ForegroundColor Green
}