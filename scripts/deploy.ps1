#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy the Mermaid React application to Azure App Service with intelligent Dataverse configuration

.DESCRIPTION
    This script builds the frontend locally, packages only the necessary files,
    deploys to Azure App Service, and intelligently configures Dataverse integration:
    
    - FIRST DEPLOYMENT: Auto-detects tenant ID, prompts for Dataverse URL and Client ID
    - SUBSEQUENT DEPLOYMENTS: Reuses existing configuration from Key Vault
    - ALWAYS: Regenerates client secret for security
    
    The script automatically detects whether this is a first deployment by checking
    if Dataverse secrets exist in Key Vault.

.PARAMETER AppName
    The name of the Azure App Service

.PARAMETER ResourceGroup
    The name of the Azure Resource Group

.PARAMETER KeyVaultName
    The name of the Azure Key Vault

.PARAMETER DataverseUrl
    The Dataverse environment URL (optional - will auto-detect or prompt)

.PARAMETER TenantId
    The Azure AD Tenant ID (optional - will auto-detect from current Azure context)

.PARAMETER ClientId
    The Azure AD App Registration Client ID (optional - will prompt for first deployment)

.PARAMETER AppRegistrationName
    The Azure AD App Registration display name (alternative to ClientId - will auto-lookup)

.PARAMETER SkipDataverseSetup
    Skip the automated Dataverse configuration setup

.EXAMPLE
    # First deployment (will prompt for missing values)
    .\deploy.ps1 -AppName "app-mermaid-blue" -ResourceGroup "rg-mermaid-blue" -KeyVaultName "kv-mermaid-blue"
    
.EXAMPLE
    # First deployment with app registration name (recommended)
    .\deploy.ps1 -AppName "app-mermaid-orange" -ResourceGroup "rg-mermaid-orange" -KeyVaultName "kv-mermaid-orange" -DataverseUrl "https://yourorg.crm4.dynamics.com" -AppRegistrationName "Mermaid-Dataverse-Converter"
    
.EXAMPLE
    # First deployment with values from setup-entra-app.ps1
    .\deploy.ps1 -AppName "app-mermaid-blue" -ResourceGroup "rg-mermaid-blue" -KeyVaultName "kv-mermaid-blue" -DataverseUrl "https://yourorg.crm4.dynamics.com" -ClientId "12345678-1234-1234-1234-123456789012"
    
.EXAMPLE
    # Subsequent deployment (will reuse existing configuration)
    .\deploy.ps1 -AppName "app-mermaid-blue" -ResourceGroup "rg-mermaid-blue" -KeyVaultName "kv-mermaid-blue"
    
.EXAMPLE
    # Skip Dataverse setup entirely
    .\deploy.ps1 -AppName "app-mermaid-blue" -ResourceGroup "rg-mermaid-blue" -KeyVaultName "kv-mermaid-blue" -SkipDataverseSetup

.NOTES
    - Client secret is ALWAYS regenerated for security
    - Tenant ID is auto-detected from current Azure login context
    - First deployment requires Dataverse URL and Client ID (from setup-entra-app.ps1)
    - Subsequent deployments reuse existing Key Vault configuration
#>

param(
    [Parameter(Mandatory = $true)]
    [Alias("AppServiceName")]
    [string]$AppName,
    
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,
    
    [Parameter(Mandatory = $true)]
    [string]$KeyVaultName,
    
    [Parameter(Mandatory = $false)]
    [string]$DataverseUrl,
    
    [Parameter(Mandatory = $false)]
    [string]$TenantId,
    
    [Parameter(Mandatory = $false)]
    [string]$ClientId,
    
    [Parameter(Mandatory = $false)]
    [string]$AppRegistrationName,
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipDataverseSetup
)

# Error handling
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Helper Functions
function Test-AzureLogin {
    try {
        $account = az account show 2>$null | ConvertFrom-Json
        return $null -ne $account
    } catch {
        return $false
    }
}

function Grant-KeyVaultPermissions {
    param(
        [Parameter(Mandatory = $true)] [string]$KeyVaultName,
        [Parameter(Mandatory = $true)] [string]$ResourceGroup
    )
    
    try {
        Write-Host "Checking Key Vault permissions..." -ForegroundColor Yellow
        
        # Get current user's object ID
        $userId = az ad signed-in-user show --query "id" --output tsv
        if (-not $userId) {
            Write-Host "⚠️ Could not get current user ID for Key Vault permissions" -ForegroundColor Yellow
            return
        }
        
        # Check if user already has permissions
        $existingRole = az role assignment list --assignee $userId --scope "/subscriptions/$(az account show --query id --output tsv)/resourcegroups/$ResourceGroup/providers/Microsoft.KeyVault/vaults/$KeyVaultName" --query "[?roleDefinitionName=='Key Vault Secrets Officer'].roleDefinitionName" --output tsv 2>$null
        
        if ($existingRole) {
            Write-Host "✅ User already has Key Vault Secrets Officer permissions" -ForegroundColor Green
        } else {
            Write-Host "Granting temporary Key Vault Secrets Officer permissions..." -ForegroundColor Yellow
            az role assignment create --assignee $userId --role "Key Vault Secrets Officer" --scope "/subscriptions/$(az account show --query id --output tsv)/resourcegroups/$ResourceGroup/providers/Microsoft.KeyVault/vaults/$KeyVaultName" 2>$null
            
            # Wait a moment for permissions to propagate
            Write-Host "Waiting 10 seconds for permissions to propagate..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10
            
            Write-Host "✅ Key Vault permissions granted successfully" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️ Could not grant Key Vault permissions: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   Deployment will continue with runtime Key Vault authentication" -ForegroundColor Yellow
    }
}

function Initialize-DataverseConfiguration {
    param(
        [Parameter(Mandatory = $true)] [string]$KeyVaultName,
        [Parameter(Mandatory = $false)] [string]$DataverseUrl,
        [Parameter(Mandatory = $false)] [string]$TenantId,
        [Parameter(Mandatory = $false)] [string]$ClientId,
        [Parameter(Mandatory = $false)] [string]$AppRegistrationName
    )
    
    Write-Host "🔧 Setting up Dataverse configuration..." -ForegroundColor Cyan
    
    # Check if this is a first deployment (no secrets exist) or subsequent deployment
    $existingDataverseUrl = az keyvault secret show --vault-name $KeyVaultName --name "DATAVERSE-URL" --query "value" --output tsv 2>$null
    $existingTenantId = az keyvault secret show --vault-name $KeyVaultName --name "TENANT-ID" --query "value" --output tsv 2>$null
    $existingClientId = az keyvault secret show --vault-name $KeyVaultName --name "CLIENT-ID" --query "value" --output tsv 2>$null
    
    $isFirstDeployment = -not ($existingDataverseUrl -and $existingTenantId -and $existingClientId)
    
    if ($isFirstDeployment) {
        Write-Host "📋 First deployment detected - setting up Dataverse configuration" -ForegroundColor Yellow
        
        # Auto-detect tenant ID from current Azure context if not provided
        if (-not $TenantId) {
            $TenantId = az account show --query "tenantId" --output tsv
            Write-Host "Auto-detected Tenant ID: $($TenantId.Substring(0,8))..." -ForegroundColor Green
        }
        
        # Prompt for missing values
        if (-not $DataverseUrl) {
            $DataverseUrl = Read-Host "Enter Dataverse URL (e.g., https://yourorg.crm4.dynamics.com)"
        }
        
        # Handle Client ID - either from parameter, app registration name, or prompt
        if (-not $ClientId) {
            if ($AppRegistrationName) {
                Write-Host "Looking up Client ID for app registration: $AppRegistrationName" -ForegroundColor Yellow
                try {
                    $ClientId = az ad app list --display-name $AppRegistrationName --query "[0].appId" --output tsv
                    if ($ClientId) {
                        Write-Host "✅ Found Client ID: $($ClientId.Substring(0,8))..." -ForegroundColor Green
                    } else {
                        throw "App registration '$AppRegistrationName' not found"
                    }
                } catch {
                    Write-Host "❌ Failed to find app registration '$AppRegistrationName': $($_.Exception.Message)" -ForegroundColor Red
                    $ClientId = Read-Host "Enter Azure AD App Registration Client ID manually"
                }
            } else {
                $ClientId = Read-Host "Enter Azure AD App Registration Client ID (or use -AppRegistrationName parameter)"
            }
        }
        
        # Validate required values
        if (-not $DataverseUrl -or -not $TenantId -or -not $ClientId) {
            throw "All Dataverse configuration values are required for first deployment"
        }
        
        Write-Host "✅ Using provided configuration for first deployment" -ForegroundColor Green
        
    } else {
        Write-Host "🔄 Subsequent deployment detected - using existing configuration from Key Vault" -ForegroundColor Yellow
        
        # Use existing values, but allow overrides
        if ($DataverseUrl) {
            Write-Host "Using provided Dataverse URL (override)" -ForegroundColor Yellow
        } else {
            $DataverseUrl = $existingDataverseUrl
            Write-Host "Using existing Dataverse URL: $DataverseUrl" -ForegroundColor Green
        }
        
        if ($TenantId) {
            Write-Host "Using provided Tenant ID (override)" -ForegroundColor Yellow
        } else {
            $TenantId = $existingTenantId
            Write-Host "Using existing Tenant ID: $($TenantId.Substring(0,8))..." -ForegroundColor Green
        }
        
        if ($ClientId) {
            Write-Host "Using provided Client ID (override)" -ForegroundColor Yellow
        } elseif ($AppRegistrationName) {
            Write-Host "Looking up Client ID for app registration: $AppRegistrationName" -ForegroundColor Yellow
            try {
                $ClientId = az ad app list --display-name $AppRegistrationName --query "[0].appId" --output tsv
                if ($ClientId) {
                    Write-Host "✅ Found Client ID: $($ClientId.Substring(0,8))..." -ForegroundColor Green
                } else {
                    $ClientId = $existingClientId
                    Write-Host "App registration not found, using existing Client ID: $($ClientId.Substring(0,8))..." -ForegroundColor Yellow
                }
            } catch {
                $ClientId = $existingClientId
                Write-Host "Failed to lookup app registration, using existing Client ID: $($ClientId.Substring(0,8))..." -ForegroundColor Yellow
            }
        } else {
            $ClientId = $existingClientId
            Write-Host "Using existing Client ID: $($ClientId.Substring(0,8))..." -ForegroundColor Green
        }
    }
    
    Write-Host "Generating new client secret (security best practice)..." -ForegroundColor Yellow
    
    # Always generate a new client secret for security
    try {
        $clientSecret = az ad app credential reset --id $ClientId --append --query "password" --output tsv
        if (-not $clientSecret) {
            throw "Failed to generate client secret"
        }
        Write-Host "✅ New client secret generated successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to generate client secret: $($_.Exception.Message)" -ForegroundColor Red
        throw "Client secret generation failed. Please ensure the App Registration exists and you have permissions to modify it."
    }
    
    # Store all secrets in Key Vault
    Write-Host "Storing configuration in Key Vault..." -ForegroundColor Yellow
    
    try {
        az keyvault secret set --vault-name $KeyVaultName --name "DATAVERSE-URL" --value $DataverseUrl | Out-Null
        az keyvault secret set --vault-name $KeyVaultName --name "TENANT-ID" --value $TenantId | Out-Null
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-ID" --value $ClientId | Out-Null
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-SECRET" --value $clientSecret | Out-Null
        
        Write-Host "✅ Dataverse configuration stored in Key Vault successfully" -ForegroundColor Green
        
        # Test the authentication
        Write-Host "Testing Dataverse authentication..." -ForegroundColor Yellow
        $testBody = @{
            client_id = $ClientId
            client_secret = $clientSecret
            scope = "$DataverseUrl/.default"
            grant_type = "client_credentials"
        }
        
        $authResponse = Invoke-WebRequest -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" -Method POST -Body $testBody -ContentType "application/x-www-form-urlencoded" -ErrorAction Stop
        
        if ($authResponse.StatusCode -eq 200) {
            Write-Host "✅ Dataverse authentication test successful" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Authentication test returned status: $($authResponse.StatusCode)" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "❌ Authentication test failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Configuration was stored in Key Vault but may need to be verified manually." -ForegroundColor Yellow
    }
    
    return @{
        DataverseUrl = $DataverseUrl
        TenantId = $TenantId
        ClientId = $ClientId
        IsFirstDeployment = $isFirstDeployment
    }
}

function Invoke-DeploymentWithRetry {
    param(
        [Parameter(Mandatory = $true)] [string]$AppName,
        [Parameter(Mandatory = $true)] [string]$ResourceGroup,
        [Parameter(Mandatory = $true)] [string]$ZipPath,
        [int]$MaxRetries = 3,
        [int]$BaseDelay = 60
    )
    
    Write-Host "Deploying application with retry logic..." -ForegroundColor Green
    
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            Write-Host "Attempting deployment..." -ForegroundColor Cyan
            az webapp deploy --resource-group $ResourceGroup --name $AppName --src-path $ZipPath --type zip --async false --timeout 1800
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Deployment successful!" -ForegroundColor Green
                return $true
            } else {
                throw "az webapp deploy failed with exit code $LASTEXITCODE"
            }
        } catch {
            if ($attempt -eq $MaxRetries) {
                Write-Host "❌ Deployment attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Red
                throw "All deployment attempts failed"
            } else {
                $delay = $BaseDelay * $attempt
                Write-Host "❌ Deployment attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "Retry attempt $($attempt + 1) of $MaxRetries after $delay seconds..." -ForegroundColor Yellow
                Start-Sleep -Seconds $delay
            }
        }
    }
    
    return $false
}

# Main deployment logic
try {
    Write-Host "🚀 Starting deployment of Mermaid React App" -ForegroundColor Magenta
    Write-Host "App: $AppName | Resource Group: $ResourceGroup | Key Vault: $KeyVaultName" -ForegroundColor Cyan
    
    # Check prerequisites
    if (-not (Test-AzureLogin)) {
        throw "Azure CLI authentication required. Please run 'az login' first."
    }
    
    # Validate that resource group exists
    Write-Host "Validating Azure resources..." -ForegroundColor Yellow
    $rg = az group show --name $ResourceGroup 2>$null | ConvertFrom-Json
    if (-not $rg) {
        throw "Resource group '$ResourceGroup' not found"
    }
    
    # Validate that app service exists
    $app = az webapp show --name $AppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
    if (-not $app) {
        throw "App Service '$AppName' not found in resource group '$ResourceGroup'"
    }
    
    Write-Host "✅ Azure resources validated" -ForegroundColor Green
    
    # Grant Key Vault permissions
    Grant-KeyVaultPermissions -KeyVaultName $KeyVaultName -ResourceGroup $ResourceGroup
    
    # Setup Dataverse configuration
    if (-not $SkipDataverseSetup) {
        $dataverseConfig = Initialize-DataverseConfiguration -KeyVaultName $KeyVaultName -DataverseUrl $DataverseUrl -TenantId $TenantId -ClientId $ClientId -AppRegistrationName $AppRegistrationName
        Write-Host "✅ Dataverse configuration completed" -ForegroundColor Green
        
        # Also set environment variables as fallback
        Write-Host "Setting App Service environment variables as fallback..." -ForegroundColor Yellow
        try {
            $secrets = @{
                "DATAVERSE_URL" = az keyvault secret show --vault-name $KeyVaultName --name "DATAVERSE-URL" --query "value" --output tsv
                "TENANT_ID" = az keyvault secret show --vault-name $KeyVaultName --name "TENANT-ID" --query "value" --output tsv
                "CLIENT_ID" = az keyvault secret show --vault-name $KeyVaultName --name "CLIENT-ID" --query "value" --output tsv
                "CLIENT_SECRET" = az keyvault secret show --vault-name $KeyVaultName --name "CLIENT-SECRET" --query "value" --output tsv
            }
            
            $settingsArray = @()
            foreach ($key in $secrets.Keys) {
                $settingsArray += "$key='$($secrets[$key])'"
            }
            $settingsString = $settingsArray -join " "
            
            # Use PowerShell splatting for better Azure CLI parameter handling
            $azCommand = "az webapp config appsettings set --name '$AppName' --resource-group '$ResourceGroup' --settings $settingsString"
            Invoke-Expression $azCommand | Out-Null
            Write-Host "✅ App Service environment variables updated" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ Could not set App Service environment variables: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️ Skipping Dataverse setup as requested" -ForegroundColor Yellow
    }
    
    # Build frontend locally
    Write-Host "Building frontend..." -ForegroundColor Green
    $frontendDir = "src\frontend"
    
    if (-not (Test-Path $frontendDir)) {
        throw "Frontend directory not found: $frontendDir. Please run this script from the project root."
    }
    
    Push-Location $frontendDir
    try {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
        & npm install
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend npm install failed"
        }
        
        Write-Host "Building frontend with Vite..." -ForegroundColor Yellow
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend build failed"
        }
        
        if (-not (Test-Path "dist")) {
            throw "Frontend build failed - dist folder not created"
        }
        
        Write-Host "✅ Frontend build completed successfully" -ForegroundColor Green
    } finally {
        Pop-Location
    }
    
    # Create deployment package
    Write-Host "Creating deployment package..." -ForegroundColor Yellow
    $zipPath = "deploy.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    
    # Create temporary directory for deployment files
    $deployDir = "deploy-temp"
    if (Test-Path $deployDir) { Remove-Item $deployDir -Recurse -Force }
    New-Item -ItemType Directory -Path $deployDir | Out-Null
    
    try {
        # Copy only backend JavaScript files (exclude node_modules)
        Write-Host "Copying backend code..." -ForegroundColor Cyan
        $backendSource = "src\backend"
        $backendDest = "$deployDir\backend"
        
        if (-not (Test-Path $backendSource)) {
            throw "Backend directory not found: $backendSource"
        }
        
        # Create backend directory and copy files, excluding node_modules
        New-Item -ItemType Directory -Path $backendDest -Force | Out-Null
        Get-ChildItem -Path $backendSource -Recurse | Where-Object { 
            $_.FullName -notmatch "node_modules" -and 
            $_.FullName -notmatch "package-lock\.json" -and 
            $_.FullName -notmatch "package\.json"
        } | ForEach-Object {
            $relativePath = $_.FullName.Substring((Resolve-Path $backendSource).Path.Length + 1)
            $destPath = Join-Path $backendDest $relativePath
            $destDir = Split-Path $destPath -Parent
            if (-not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            if ($_.PSIsContainer -eq $false) {
                Copy-Item $_.FullName -Destination $destPath -Force
            }
        }
        
        # Copy built frontend assets
        Write-Host "Copying built frontend assets..." -ForegroundColor Cyan
        $frontendDistSource = "src\frontend\dist"
        if (-not (Test-Path $frontendDistSource)) {
            throw "Frontend dist directory not found: $frontendDistSource"
        }
        
        New-Item -ItemType Directory -Path "$deployDir\dist" -Force | Out-Null
        New-Item -ItemType Directory -Path "$deployDir\dist\frontend" -Force | Out-Null
        Copy-Item -Path "$frontendDistSource\*" -Destination "$deployDir\dist\frontend" -Recurse -Force
        
        # Copy root package files for backend dependency installation
        Write-Host "Copying package files..." -ForegroundColor Cyan
        
        # Read the original package.json and modify it for deployment
        $originalPackageJson = Get-Content "package.json" | ConvertFrom-Json
        
        # Create a deployment-specific package.json without frontend build scripts
        $deploymentPackageJson = @{
            name = $originalPackageJson.name
            version = $originalPackageJson.version
            description = $originalPackageJson.description
            main = "server.js"
            scripts = @{
                start = "node server.js"
            }
            dependencies = $originalPackageJson.dependencies
            engines = $originalPackageJson.engines
        }
        
        # Write the modified package.json
        $deploymentPackageJson | ConvertTo-Json -Depth 3 | Out-File -FilePath "$deployDir\package.json" -Encoding UTF8 -Force
        
        # Copy package-lock.json if it exists
        if (Test-Path "package-lock.json") {
            Copy-Item -Path "package-lock.json" -Destination "$deployDir\package-lock.json" -Force
        }
        
        # Create deployment server entry point
        Write-Host "Creating deployment server configuration..." -ForegroundColor Cyan
        $serverJsPath = "$deployDir\server.js"
        @"
/**
 * Azure App Service Entry Point
 * Configures the backend server to serve from the correct static files location
 */
const path = require('path');

// Set the correct working directory
process.chdir(__dirname);

// Override the static files path for deployment
process.env.STATIC_FILES_PATH = path.join(__dirname, 'dist', 'frontend');

// Start the backend server
require('./backend/server.js');
"@ | Out-File -FilePath $serverJsPath -Encoding UTF8 -Force
        
        # Create the zip file
        Write-Host "Creating deployment zip..." -ForegroundColor Cyan
        Compress-Archive -Path "$deployDir\*" -DestinationPath $zipPath -Force
        
        $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
        Write-Host "Deployment package created: deploy.zip ($zipSize MB)" -ForegroundColor Green
        
        # Deploy to Azure
        $deploymentResult = Invoke-DeploymentWithRetry -AppName $AppName -ResourceGroup $ResourceGroup -ZipPath $zipPath
        
        if ($deploymentResult) {
            Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
            Write-Host "App URL: https://$AppName.azurewebsites.net" -ForegroundColor Cyan
        } else {
            throw "Deployment failed after all retry attempts"
        }
        
    } finally {
        # Cleanup
        if (Test-Path $deployDir) {
            Remove-Item $deployDir -Recurse -Force
        }
        if (Test-Path $zipPath) {
            Remove-Item $zipPath -Force
        }
    }
    
} catch {
    Write-Host "💥 Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please check the error details above and try again." -ForegroundColor Yellow
    exit 1
}
