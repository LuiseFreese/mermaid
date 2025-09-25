#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the Mermaid application in local development mode with mock data

.DESCRIPTION
    This script sets up a local development environment that bypasses managed identity
    authentication and uses mock data for testing. This allows for fast development
    and debugging without needing to deploy to Azure.

.PARAMETER Port
    Port for the backend server (default: 8080)

.PARAMETER FrontendPort
    Port for the frontend dev server (default: 3003)

.PARAMETER SkipBuild
    Skip frontend build step

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
    [switch]$SkipBuild,
    
    [Parameter(Mandatory = $false)]
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Mermaid Local Development Environment" -ForegroundColor Green
Write-Host "Backend: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Cyan

# Set up environment variables for local development
$env:NODE_ENV = "development"
$env:PORT = $Port.ToString()
$env:USE_MOCK_DATA = "true"
$env:DATAVERSE_URL = "https://mock-dataverse.local"
$env:AUTH_MODE = "development"

Write-Host "Environment configured for local development" -ForegroundColor Green

# Create mock deployment data if it doesn't exist
Write-Host "Setting up mock deployment data..." -ForegroundColor Cyan
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}
if (-not (Test-Path "data/deployments")) {
    New-Item -ItemType Directory -Path "data/deployments" | Out-Null
}

# Create sample deployment data for testing
$sampleDeployments = @(
    @{
        deploymentId = "deploy_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + "_sample1"
        timestamp = (Get-Date).AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        environmentSuffix = "default"
        status = "success"
        summary = @{
            totalEntities = 3
            entitiesAdded = @("Customer", "Order", "Product")
            entitiesModified = @()
            entitiesRemoved = @()
            totalAttributes = 12
            cdmEntities = 0
            customEntities = 3
        }
        deploymentLogs = @()
        duration = 45000
        solutionInfo = @{
            solutionName = "E-Commerce Solution"
            publisherName = "Development Publisher"
        }
        metadata = @{
            deploymentMethod = "web-ui"
            previousDeploymentId = $null
        }
        completedAt = (Get-Date).AddHours(-2).AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    },
    @{
        deploymentId = "deploy_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + "_sample2"
        timestamp = (Get-Date).AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        environmentSuffix = "default"
        status = "success"
        summary = @{
            totalEntities = 2
            entitiesAdded = @("Invoice", "Payment")
            entitiesModified = @()
            entitiesRemoved = @()
            totalAttributes = 8
            cdmEntities = 0
            customEntities = 2
        }
        deploymentLogs = @()
        duration = 32000
        solutionInfo = @{
            solutionName = "Billing System"
            publisherName = "Development Publisher"
        }
        metadata = @{
            deploymentMethod = "web-ui"
            previousDeploymentId = $null
        }
        completedAt = (Get-Date).AddDays(-1).AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    },
    @{
        deploymentId = "deploy_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + "_sample3"
        timestamp = (Get-Date).AddDays(-3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        environmentSuffix = "default"
        status = "failed"
        summary = @{
            totalEntities = 0
            entitiesAdded = @()
            entitiesModified = @()
            entitiesRemoved = @()
            totalAttributes = 0
            cdmEntities = 0
            customEntities = 0
        }
        deploymentLogs = @(
            @{
                level = "error"
                message = "Validation failed: Entity name contains invalid characters"
                timestamp = (Get-Date).AddDays(-3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            }
        )
        duration = 5000
        solutionInfo = @{
            solutionName = "Invalid Solution"
            publisherName = "Development Publisher"
        }
        metadata = @{
            deploymentMethod = "web-ui"
            previousDeploymentId = $null
        }
        completedAt = $null
    }
)

# Create individual deployment files and index
$indexData = @{
    deployments = @()
}

foreach ($deployment in $sampleDeployments) {
    $deploymentFile = "data/deployments/$($deployment.deploymentId).json"
    $deployment | ConvertTo-Json -Depth 10 | Out-File -FilePath $deploymentFile -Encoding UTF8 -Force
    
    # Add to index
    $indexData.deployments += @{
        deploymentId = $deployment.deploymentId
        timestamp = $deployment.timestamp
        status = $deployment.status
        summary = $deployment.summary
    }
}

# Write index file
$indexData | ConvertTo-Json -Depth 10 | Out-File -FilePath "data/deployments/default_index.json" -Encoding UTF8 -Force

Write-Host "✅ Mock deployment data created" -ForegroundColor Green

# Build frontend if needed
if (-not $SkipBuild) {
    Write-Host "Installing and building frontend..." -ForegroundColor Cyan
    Push-Location src/frontend
    try {
        Write-Host "Installing dependencies..." -ForegroundColor Yellow
        npm install --silent
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        
        Write-Host "Building frontend..." -ForegroundColor Yellow
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
        
        Write-Host "✅ Frontend built successfully" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "⏭️ Skipping frontend build" -ForegroundColor Yellow
}

# Start backend server in background
Write-Host "Starting backend server..." -ForegroundColor Cyan
$backendJob = Start-Job -ScriptBlock {
    param($Port, $ProjectRoot)
    
    Set-Location $ProjectRoot
    $env:NODE_ENV = "development"
    $env:PORT = $Port.ToString()
    $env:USE_MOCK_DATA = "true"
    $env:DATAVERSE_URL = "https://mock-dataverse.local"
    $env:AUTH_MODE = "development"
    
    node src/backend/server.js
} -ArgumentList $Port, (Get-Location).Path

# Wait for backend to start
Write-Host "Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Test if backend is responding
$backendReady = $false
$attempts = 0
$maxAttempts = 10

while (-not $backendReady -and $attempts -lt $maxAttempts) {
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
    Write-Error "Backend server failed to start properly"
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    exit 1
}

# Start frontend dev server
Write-Host "Starting frontend dev server..." -ForegroundColor Cyan
Push-Location src/frontend
$frontendJob = Start-Job -ScriptBlock {
    param($FrontendPort, $ProjectRoot)
    
    Set-Location "$ProjectRoot/src/frontend"
    $env:VITE_API_BASE_URL = "http://localhost:8080"
    
    npm run dev -- --port $FrontendPort --host localhost
} -ArgumentList $FrontendPort, (Get-Location | Select-Object -ExpandProperty Path | Split-Path -Parent | Split-Path -Parent)

Pop-Location

# Wait for frontend to start
Write-Host "Waiting for frontend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "🎉 Local development environment is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  Backend:  http://localhost:$Port" -ForegroundColor White
Write-Host "  API:      http://localhost:$Port/api" -ForegroundColor White
Write-Host "  Health:   http://localhost:$Port/health" -ForegroundColor White
Write-Host ""
Write-Host "Test deployment history:" -ForegroundColor Cyan
Write-Host "  http://localhost:$FrontendPort/deployment-history" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Yellow

if (-not $NoOpen) {
    Start-Process "http://localhost:$FrontendPort/deployment-history"
}

# Wait for user to stop
try {
    Write-Host "Servers are running. Press any key to stop..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} catch {
    # Handle Ctrl+C
}

# Clean up
Write-Host "`nStopping servers..." -ForegroundColor Yellow
Stop-Job $backendJob -ErrorAction SilentlyContinue
Stop-Job $frontendJob -ErrorAction SilentlyContinue
Remove-Job $backendJob -ErrorAction SilentlyContinue
Remove-Job $frontendJob -ErrorAction SilentlyContinue

Write-Host "✅ Development environment stopped" -ForegroundColor Green