#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Fix missing service principal issue for Dataverse authentication

.DESCRIPTION
    This script creates the missing service principal (Enterprise Application) 
    for the app registration to enable Dataverse API access.

.PARAMETER ApplicationId
    The Azure Application ID (default: 5b93b6b5-e9b7-47ee-b0c6-bc81be4f8e24)

.PARAMETER Environment
    The Dataverse environment URL (required)

.EXAMPLE
    .\fix-service-principal.ps1 -Environment "https://orgb85e2da2.crm4.dynamics.com"
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$ApplicationId = "5b93b6b5-e9b7-47ee-b0c6-bc81be4f8e24",
    
    [Parameter(Mandatory = $true)]
    [string]$Environment
)

Write-Host "=== Service Principal Fix Script ===" -ForegroundColor Cyan
Write-Host "Application ID: $ApplicationId" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Green
Write-Host ""

# Step 1: Check if user is authenticated to Power Platform
Write-Host "Step 1: Checking Power Platform authentication..." -ForegroundColor Yellow
try {
    $authResult = pac auth list 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Not authenticated to Power Platform. Starting interactive login..." -ForegroundColor Yellow
        pac auth create --environment $Environment
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to authenticate to Power Platform"
        }
    }
    Write-Host "✅ Power Platform authentication verified" -ForegroundColor Green
} catch {
    Write-Host "❌ Power Platform authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please run: pac auth create --environment $Environment" -ForegroundColor Yellow
    exit 1
}

# Step 2: Create service principal
Write-Host ""
Write-Host "Step 2: Creating service principal..." -ForegroundColor Yellow
try {
    $result = pac admin create-service-principal --environment $Environment --application-id $ApplicationId --role "System Administrator" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Service principal created successfully" -ForegroundColor Green
    } else {
        Write-Host "Service principal creation output: $result" -ForegroundColor Yellow
        if ($result -like "*already exists*" -or $result -like "*duplicate*") {
            Write-Host "✅ Service principal already exists" -ForegroundColor Green
        } else {
            throw "Service principal creation failed"
        }
    }
} catch {
    Write-Host "❌ Service principal creation failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Manual fix required - see AUTH-TROUBLESHOOTING.md" -ForegroundColor Yellow
    exit 1
}

# Step 3: Verify service principal
Write-Host ""
Write-Host "Step 3: Verifying service principal..." -ForegroundColor Yellow
try {
    $principals = pac admin list-service-principals --environment $Environment 2>&1
    if ($principals -like "*$ApplicationId*") {
        Write-Host "✅ Service principal verified in environment" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Service principal not found in environment list" -ForegroundColor Yellow
        Write-Host "This may be normal if the command doesn't show all principals" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️ Could not verify service principal: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 4: Test authentication
Write-Host ""
Write-Host "Step 4: Testing authentication..." -ForegroundColor Yellow
Write-Host "Testing with: node src/index.js publishers" -ForegroundColor Gray

try {
    $testResult = node src/index.js publishers 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Authentication test successful!" -ForegroundColor Green
    } else {
        Write-Host "❌ Authentication still failing:" -ForegroundColor Red
        Write-Host $testResult -ForegroundColor Gray
        Write-Host ""
        Write-Host "Additional troubleshooting required - see AUTH-TROUBLESHOOTING.md" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Fix Complete ===" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test publisher listing: node src/index.js publishers" -ForegroundColor Gray
Write-Host "2. Test solution creation: node src/index.js provision example.mermaid --dry-run --solution MyTestSolution" -ForegroundColor Gray
Write-Host "3. If still failing, see AUTH-TROUBLESHOOTING.md for manual steps" -ForegroundColor Gray
