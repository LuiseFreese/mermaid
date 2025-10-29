#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Add Application User to All Dataverse Environments
    
.DESCRIPTION
    This script adds the existing App Registration as an application user
    with System Customizer role to all environments in data/environments.json
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$AppRegistrationClientId = "db6367d8-397e-4488-b260-2e03469693b5",
    
    [Parameter(Mandatory=$false)]
    [string]$SecurityRole = "System Customizer"
)

function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info    { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error   { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }

Write-Info "Adding Application User to All Dataverse Environments"
Write-Info "App Registration Client ID: $AppRegistrationClientId"
Write-Host ""

# Read environments configuration
$configPath = "data/environments.json"
if (-not (Test-Path $configPath)) {
    Write-Error "Configuration file not found: $configPath"
    exit 1
}

$config = Get-Content $configPath | ConvertFrom-Json
Write-Success "Found $($config.environments.Count) environments"
Write-Host ""

foreach ($env in $config.environments) {
    Write-Info "Processing environment: $($env.name)"
    Write-Info "  URL: $($env.url)"
    
    # Get the Service Principal Object ID for this App Registration
    Write-Info "  Getting Service Principal ID..."
    $servicePrincipalId = az ad sp show --id $AppRegistrationClientId --query id -o tsv
    
    if (-not $servicePrincipalId) {
        Write-Warning "Could not find Service Principal for App ID: $AppRegistrationClientId"
        Write-Host ""
        continue
    }
    
    Write-Info "  Service Principal ID: $servicePrincipalId"
    
    # Call the setup-dataverse-user script for this environment
    try {
        $result = & "$PSScriptRoot\setup-dataverse-user.ps1" `
            -DataverseUrl $env.url `
            -AppId $AppRegistrationClientId `
            -ServicePrincipalId $servicePrincipalId `
            -SecurityRole $SecurityRole
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Application user configured in $($env.name)"
        } else {
            Write-Warning "Failed to configure application user in $($env.name)"
        }
    } catch {
        Write-Warning "Error configuring $($env.name): $($_.Exception.Message)"
    }
    
    Write-Host ""
}

Write-Success "Multi-environment application user setup completed!"
Write-Host ""
Write-Info "Next steps:"
Write-Info "1. Verify application users exist in all environments"
Write-Info "2. Test deployment by selecting different environments in the UI"
