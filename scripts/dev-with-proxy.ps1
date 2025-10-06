#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start development environment with Dev Proxy integration
.DESCRIPTION
    Automatically starts backend, frontend, and Dev Proxy with the specified mode
.PARAMETER Mode
    Dev Proxy mode: normal (default), errors, mocks, rate-limit, or none
.PARAMETER NoProxy
    Skip Dev Proxy and run normal dev mode
.EXAMPLE
    .\scripts\dev-with-proxy.ps1
    Starts dev environment with default Dev Proxy configuration
.EXAMPLE
    .\scripts\dev-with-proxy.ps1 -Mode errors
    Starts dev environment with error simulation
.EXAMPLE
    .\scripts\dev-with-proxy.ps1 -Mode mocks
    Starts dev environment with mocked Dataverse responses
.EXAMPLE
    .\scripts\dev-with-proxy.ps1 -NoProxy
    Starts dev environment without Dev Proxy (normal npm run dev)
#>

param(
    [Parameter()]
    [ValidateSet('normal', 'errors', 'mocks', 'rate-limit', 'none')]
    [string]$Mode = 'normal',
    
    [Parameter()]
    [switch]$NoProxy
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { param($msg) Write-Host "ℹ️  $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Warning { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }

Write-Host "`n🚀 Mermaid to Dataverse - Development Environment`n" -ForegroundColor Magenta

# Check if Dev Proxy is installed
$devProxyInstalled = $false
try {
    $null = Get-Command devproxy -ErrorAction Stop
    $devProxyInstalled = $true
    Write-Success "Dev Proxy is installed"
} catch {
    Write-Warning "Dev Proxy is not installed"
    Write-Info "Install with: winget install Microsoft.DevProxy"
    Write-Info "Or download from: https://aka.ms/devproxy"
}

# If -NoProxy or proxy not installed, run normal dev
if ($NoProxy -or -not $devProxyInstalled -or $Mode -eq 'none') {
    Write-Info "Starting development environment without Dev Proxy..."
    npm run dev
    exit
}

# Start with Dev Proxy
Write-Info "Starting development environment with Dev Proxy ($Mode mode)..."

switch ($Mode) {
    'errors' {
        Write-Info "🎲 Error simulation enabled - Random API failures will occur"
        npm run dev:proxy:errors
    }
    'mocks' {
        Write-Info "🎭 Mock mode enabled - Using fake Dataverse responses"
        npm run dev:proxy:mocks
    }
    'rate-limit' {
        Write-Info "🚦 Rate limiting enabled - Simulating API throttling"
        npm run dev:proxy:rate-limit
    }
    default {
        Write-Info "📡 Default mode - Minimal Dev Proxy logging"
        npm run dev:proxy
    }
}
