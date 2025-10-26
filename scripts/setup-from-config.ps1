#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Configuration-Based Multi-Environment Setup
.DESCRIPTION
    This script reads environment configuration from config/environments.json
    and sets up Azure infrastructure and Dataverse environments accordingly.
    No interactive prompts - everything is driven by configuration.
.PARAMETER ConfigFile
    Path to the environment configuration file (default: config/environments.json)
.PARAMETER EnvironmentSuffix
    Optional suffix for Azure resources. If not provided, will be auto-generated.
.PARAMETER DryRun
    Show what would be done without actually creating resources
.EXAMPLE
    .\setup-from-config.ps1
    .\setup-from-config.ps1 -EnvironmentSuffix "prod" -ConfigFile "config/prod-environments.json"
    .\setup-from-config.ps1 -DryRun
#>

param(
    [string]$ConfigFile = "config/environments.json",
    [string]$EnvironmentSuffix = "",
    [switch]$DryRun
)

# Enable strict mode and stop on errors
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Color functions for better output
function Write-Info($message) { Write-Host "ℹ️  $message" -ForegroundColor Cyan }
function Write-Success($message) { Write-Host "✅ $message" -ForegroundColor Green }
function Write-Warning($message) { Write-Host "⚠️  $message" -ForegroundColor Yellow }
function Write-Error($message) { Write-Host "❌ $message" -ForegroundColor Red }
function Write-Header($message) { Write-Host "`n🔸 $message" -ForegroundColor Magenta }

Write-Host @"
🚀 Configuration-Based Multi-Environment Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reading configuration from: $ConfigFile
Dry Run: $DryRun
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"@ -ForegroundColor Yellow

# Check prerequisites
Write-Header "Prerequisites Check"
try {
    az account show --output none 2>$null
    Write-Success "Azure CLI authenticated"
} catch {
    Write-Error "Please run 'az login' first"
    exit 1
}

# Read configuration file
Write-Header "Reading Configuration"
$configPath = Join-Path $PSScriptRoot ".." $ConfigFile

if (-not (Test-Path $configPath)) {
    Write-Error "Configuration file not found: $configPath"
    Write-Info "Please create the configuration file or use -ConfigFile parameter"
    exit 1
}

try {
    $config = Get-Content $configPath | ConvertFrom-Json
    Write-Success "Configuration loaded successfully"
    Write-Info "Version: $($config.version)"
    Write-Info "Environments: $($config.environments.Count)"
} catch {
    Write-Error "Failed to parse configuration file: $_"
    exit 1
}

# Validate configuration
Write-Header "Validating Configuration"
if (-not $config.environments -or $config.environments.Count -eq 0) {
    Write-Error "No environments defined in configuration"
    exit 1
}

$defaultEnv = $config.environments | Where-Object { $_.isDefault -eq $true } | Select-Object -First 1
if (-not $defaultEnv) {
    $defaultEnv = $config.environments[0]
    Write-Warning "No default environment specified, using first environment: $($defaultEnv.name)"
}

Write-Success "Configuration validation passed"

# Display environment summary
Write-Header "Environment Summary"
foreach ($env in $config.environments) {
    $defaultMarker = if ($env.isDefault) { " (DEFAULT)" } else { "" }
    Write-Host "  🌐 $($env.name)$defaultMarker" -ForegroundColor $(
        switch ($env.color) {
            "blue" { "Blue" }
            "green" { "Green" }
            "yellow" { "Yellow" }
            "red" { "Red" }
            "purple" { "Magenta" }
            default { "White" }
        }
    )
    Write-Host "     ID: $($env.id)"
    Write-Host "     URL: $($env.url)"
    Write-Host "     Power Platform ID: $($env.powerPlatformEnvironmentId)"
    if ($env.metadata -and $env.metadata.purpose) {
        Write-Host "     Purpose: $($env.metadata.purpose)"
    }
    Write-Host ""
}

# Generate environment suffix if not provided
if (-not $EnvironmentSuffix) {
    $EnvironmentSuffix = -join ((65..90) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    $EnvironmentSuffix = $EnvironmentSuffix.ToLower()
}

# Prepare Azure resource names
$deploymentSettings = $config.deploymentSettings
$resourceGroup = $deploymentSettings.resourceGroup -replace "{suffix}", $EnvironmentSuffix
$appName = $deploymentSettings.appName -replace "{suffix}", $EnvironmentSuffix
$appRegistration = $deploymentSettings.appRegistrationName -replace "{suffix}", $EnvironmentSuffix
$managedIdentity = $deploymentSettings.managedIdentityName -replace "{suffix}", $EnvironmentSuffix

Write-Header "Deployment Configuration"
Write-Info "Environment Suffix: $EnvironmentSuffix"
Write-Info "Resource Group: $resourceGroup"
Write-Info "App Service: $appName"
Write-Info "App Registration: $appRegistration"
Write-Info "Managed Identity: $managedIdentity"
Write-Info "Location: $($deploymentSettings.location)"
Write-Info "Primary Environment: $($defaultEnv.name)"

if ($DryRun) {
    Write-Warning "DRY RUN - No resources will be created"
    Write-Info ""
    Write-Info "Would execute the following:"
    Write-Info "1. Create Azure infrastructure using primary environment: $($defaultEnv.name)"
    Write-Info "2. Configure $($config.environments.Count) Dataverse environments"
    Write-Info "3. Save environment configuration to data/environments.json"
    exit 0
}

$confirm = Read-Host "Continue with deployment? (Y/n)"
if ($confirm -eq "n" -or $confirm -eq "N") {
    Write-Info "Setup cancelled by user"
    exit 0
}

# Setup Azure infrastructure using the default environment
Write-Header "Azure Infrastructure Setup"
$tenantId = (az account show --query tenantId -o tsv)
$subscriptionInfo = (az account show --query name -o tsv)
Write-Info "Tenant ID: $tenantId"
Write-Info "Subscription: $subscriptionInfo"
Write-Info "Using primary environment: $($defaultEnv.name)"

try {
    $setupArgs = @{
        Unattended = $true
        DataverseUrl = $defaultEnv.url
        PowerPlatformEnvironmentId = $defaultEnv.powerPlatformEnvironmentId
        ResourceGroup = $resourceGroup
        AppRegistrationName = $appRegistration
        EnvironmentSuffix = $EnvironmentSuffix
        SecurityRole = $deploymentSettings.defaultSecurityRole
    }
    
    Write-Info "Calling setup-secretless.ps1 for infrastructure..."
    Write-Info "Parameters: DataverseUrl=$($setupArgs.DataverseUrl), ResourceGroup=$($setupArgs.ResourceGroup), AppRegistrationName=$($setupArgs.AppRegistrationName)"
    & "$PSScriptRoot\setup-secretless.ps1" @setupArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Infrastructure setup failed"
    }
    Write-Success "Azure infrastructure created successfully"
} catch {
    Write-Error "Infrastructure setup failed: $_"
    exit 1
}

# Get the client ID from the created app registration
Write-Header "Retrieving App Registration Details"
Write-Info "Looking for app registration: $appRegistration"

# Wait a moment for the app registration to be fully created
Start-Sleep -Seconds 5

$clientId = az ad app list --display-name $appRegistration --query "[0].appId" -o tsv

if (-not $clientId -or $clientId -eq "null") {
    Write-Warning "Could not retrieve client ID automatically"
    Write-Info "Additional environments will need to be configured manually"
} else {
    Write-Success "App Registration client ID: $clientId"
}

# Configure additional environments
Write-Header "Configuring Additional Environments"
$additionalEnvs = $config.environments | Where-Object { -not $_.isDefault }

if ($additionalEnvs.Count -eq 0) {
    Write-Info "No additional environments to configure"
} elseif (-not $clientId -or $clientId -eq "null") {
    Write-Warning "Cannot configure additional environments without client ID"
    Write-Info "Manual configuration required in Power Platform Admin Center"
} else {
    Write-Info "Configuring $($additionalEnvs.Count) additional environment(s)..."
    
    # Get Service Principal Object ID once
    $servicePrincipalId = az ad sp list --display-name $appRegistration --query "[0].id" -o tsv
    
    if (-not $servicePrincipalId -or $servicePrincipalId -eq "null") {
        Write-Warning "Could not retrieve Service Principal Object ID"
        Write-Info "Manual configuration required for additional environments"
    } else {
        Write-Success "Service Principal Object ID: $servicePrincipalId"
        
        foreach ($env in $additionalEnvs) {
            Write-Info ""
            Write-Info "🔧 Configuring environment: $($env.name)"
            Write-Info "   URL: $($env.url)"
            
            try {
                & "$PSScriptRoot\setup-dataverse-user.ps1" `
                    -AppId $clientId `
                    -ServicePrincipalId $servicePrincipalId `
                    -DataverseUrl $env.url `
                    -SecurityRole $deploymentSettings.defaultSecurityRole
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Environment $($env.name) configured successfully"
                } else {
                    Write-Warning "setup-dataverse-user.ps1 returned error code: $LASTEXITCODE"
                }
            } catch {
                Write-Warning "Failed to auto-configure $($env.name): $_"
                Write-Info "You may need to manually add the application user in Power Platform Admin Center"
            }
        }
    }
}

# Save final environment configuration
Write-Header "Finalizing Configuration"

# Create a copy of the config for the application
$appConfig = @{
    version = $config.version
    environments = @()
    defaultEnvironmentId = $config.defaultEnvironmentId
}

foreach ($env in $config.environments) {
    $appConfig.environments += @{
        id = $env.id
        name = $env.name
        url = $env.url
        powerPlatformEnvironmentId = $env.powerPlatformEnvironmentId
        color = $env.color
        metadata = $env.metadata
    }
}

# Ensure data directory exists
$dataDir = Join-Path $PSScriptRoot ".." "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

# Save configuration
$outputPath = Join-Path $dataDir "environments.json"
$appConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $outputPath -Encoding UTF8
Write-Success "Environment configuration saved to: $outputPath"

# Final summary
Write-Header "Setup Complete!"
Write-Success "Configuration-based multi-environment setup completed successfully!"
Write-Info ""
Write-Info "Configured Environments (Total: $($config.environments.Count)):"
foreach ($env in $config.environments) {
    $defaultMarker = if ($env.isDefault) { " (DEFAULT)" } else { "" }
    Write-Host "  🌐 $($env.name)$defaultMarker ($($env.color))"
    Write-Host "     $($env.url)"
}
Write-Info ""
Write-Success "Environment configuration saved to data/environments.json"
Write-Success "Azure infrastructure deployed with suffix: $EnvironmentSuffix"
Write-Info ""
Write-Info "Next steps:"
Write-Info "1. Deploy your application: .\scripts\deploy-secretless.ps1 -EnvironmentSuffix '$EnvironmentSuffix'"
Write-Info "2. Access the application: https://$appName.azurewebsites.net"
Write-Info "3. Verify all environments are available in the UI"
Write-Info ""
Write-Info "To modify environments in the future, edit: $ConfigFile"