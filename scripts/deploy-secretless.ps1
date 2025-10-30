#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy the Mermaid React application using secretless architecture

.DESCRIPTION
    This script deploys to Azure App Service using:
    - Managed Identity authentication (no client secrets)
    - Configuration from App Service application settings
    - No Key Vault dependencies
    
    Works with App Services set up via setup-secretless.ps1

.PARAMETER AppName
    The name of the Azure App Service

.PARAMETER ResourceGroup
    The name of the Azure Resource Group

.PARAMETER EnvironmentSuffix
    Environment suffix for resource naming (e.g., dev, staging, prod)

.PARAMETER DataverseUrl
    Dataverse environment URL (e.g., https://your-org.crm.dynamics.com)
    Note: Application users are normally created during setup-secretless.ps1
    This parameter is mainly for new Dataverse environments with existing infrastructure

.PARAMETER PowerPlatformEnvironmentId
    Power Platform Environment ID (GUID) for generating solution links
    Find this in Power Platform Admin Center or your environment URL

.PARAMETER SkipBuild
    Skip the frontend build step

.PARAMETER SkipDataverseUser  
    Skip Dataverse application user creation/verification (for pure code deployments)

.EXAMPLE
    # Deploy to detected environment
    .\scripts\deploy-secretless.ps1
    
.EXAMPLE
    # Deploy to specific environment with Dataverse URL and Power Platform Environment ID
    .\scripts\deploy-secretless.ps1 -EnvironmentSuffix "dev" -DataverseUrl "https://your-org.crm.dynamics.com" -PowerPlatformEnvironmentId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

.EXAMPLE
    # Deploy specific resources
    .\scripts\deploy-secretless.ps1 -AppName "app-mermaid-prod" -ResourceGroup "rg-mermaid-prod"

.EXAMPLE
    # Pure code deployment (skip Dataverse user operations)
    .\scripts\deploy-secretless.ps1 -SkipDataverseUser
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$AppName,
    
    [Parameter(Mandatory = $false)]
    [string]$ResourceGroup,
    
    [Parameter(Mandatory = $false)]
    [string]$EnvironmentSuffix = $null,
    
    [Parameter(Mandatory = $false)]
    [string]$DataverseUrl = $null,
    
    [Parameter(Mandatory = $false)]
    [string]$PowerPlatformEnvironmentId = $null,
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipDataverseUser,
    
    [Parameter(Mandatory = $false)]
    [string]$ConfigFile = $null
)

# Error handling
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ---------- .env file helper ----------
function Update-EnvFile {
    param(
        [string]$Key,
        [string]$Value,
        [string]$EnvFilePath = ".env"
    )
    
    if (-not (Test-Path $EnvFilePath)) {
        # Create new .env file
        Write-Host "Creating new .env file..." -ForegroundColor Cyan
        New-Item -Path $EnvFilePath -ItemType File -Force | Out-Null
    }
    
    $envContent = Get-Content $EnvFilePath -ErrorAction SilentlyContinue
    $keyExists = $false
    $newContent = @()
    
    foreach ($line in $envContent) {
        if ($line -match "^$Key=") {
            # Update existing key
            $newContent += "$Key=$Value"
            $keyExists = $true
        } else {
            $newContent += $line
        }
    }
    
    if (-not $keyExists) {
        # Add new key
        $newContent += "$Key=$Value"
    }
    
    $newContent | Set-Content $EnvFilePath
    Write-Host "Updated .env file: $Key" -ForegroundColor Cyan
}

# Load configuration file if specified
if ($ConfigFile -and (Test-Path $ConfigFile)) {
    Write-Host "Loading configuration from: $ConfigFile" -ForegroundColor Cyan
    . $ConfigFile
    
    # Override parameters with config file values if not already specified
    if (-not $PSBoundParameters.ContainsKey('EnvironmentSuffix') -and $EnvironmentSuffix) { 
        Write-Host "   └─ Environment Suffix: $EnvironmentSuffix" -ForegroundColor Gray 
    }
} elseif ($ConfigFile) {
    Write-Warning "Configuration file not found: $ConfigFile"
}

# Configuration - Generate names based on suffix or use defaults
if (-not $EnvironmentSuffix) {
    # Try to detect from resource groups with working App Services
    $mermaidRGs = az group list --query "[?contains(name, ``'rg-mermaid-``')].name" -o tsv 2>$null
    $detectedSuffix = $null
    
    foreach ($rg in $mermaidRGs) {
        if ($rg -match 'rg-mermaid-(.+)$') {
            $testSuffix = $matches[1]
            $testAppName = "app-mermaid-$testSuffix"
            
            # Check if this App Service exists and is running
            $appExists = az webapp show --name $testAppName --resource-group $rg --query "state" -o tsv 2>$null
            if ($appExists -eq "Running") {
                $detectedSuffix = $testSuffix
                Write-Host "Detected environment suffix: $detectedSuffix (from running app: $testAppName)" -ForegroundColor Cyan
                break
            }
        }
    }
    
    if ($detectedSuffix) {
        $EnvironmentSuffix = $detectedSuffix
    } else {
        $EnvironmentSuffix = "purple"
        Write-Host "⚠️ No running environment detected, using default suffix: $EnvironmentSuffix" -ForegroundColor Yellow
        Write-Host "   Available resource groups: $($mermaidRGs -join ', ')" -ForegroundColor Gray
    }
}

# Set defaults based on environment suffix if not provided
if (-not $AppName) { $AppName = "app-mermaid-$EnvironmentSuffix" }
if (-not $ResourceGroup) { $ResourceGroup = "rg-mermaid-$EnvironmentSuffix" }

Write-Host "Starting secretless deployment of Mermaid React App" -ForegroundColor Green
Write-Host "App: $AppName | Resource Group: $ResourceGroup" -ForegroundColor Cyan

# Validate Azure resources exist
Write-Host "Validating Azure resources..." -ForegroundColor Cyan

# Check if resource group exists
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    Write-Error "Resource group '$ResourceGroup' not found. Please run setup-secretless.ps1 first."
    exit 1
}

# Check if App Service exists
$appExists = az webapp show --name $AppName --resource-group $ResourceGroup --query "name" -o tsv 2>$null
if (-not $appExists) {
    Write-Error "App Service '$AppName' not found in resource group '$ResourceGroup'. Please run setup-secretless.ps1 first."
    exit 1
}

# Check if managed identity is configured
$appIdentityJson = az webapp identity show --name $AppName --resource-group $ResourceGroup --query "userAssignedIdentities" -o json 2>$null
if (-not $appIdentityJson -or $appIdentityJson -eq "null" -or $appIdentityJson -eq "{}") {
    Write-Error "Managed identity not configured for App Service '$AppName'. Please run setup-secretless.ps1 first."
    exit 1
}
$appIdentity = $appIdentityJson | ConvertFrom-Json

Write-Host "Azure resources validated" -ForegroundColor Green

# Set up Dataverse Application User if DataverseUrl is provided and not skipped
# This is mainly for cases where:
# 1. You're deploying to a new Dataverse environment with existing infrastructure
# 2. The application user doesn't exist yet (setup-secretless.ps1 handles this normally)
if ($DataverseUrl -and -not $SkipDataverseUser) {
    Write-Host "Checking Dataverse Application User..." -ForegroundColor Cyan
    
    # Get the App Registration client ID and service principal object ID
    $appRegName = "mermaid-dataverse-$EnvironmentSuffix"
    Write-Host "Looking up App Registration: $appRegName" -ForegroundColor Yellow
    
    $appRegInfo = az ad app list --display-name $appRegName --query "[0].{appId:appId}" -o json | ConvertFrom-Json
    if (-not $appRegInfo -or -not $appRegInfo.appId) {
        Write-Error "App Registration '$appRegName' not found. Please run setup-secretless.ps1 first."
        exit 1
    }
    
    $spObjectId = az ad sp list --display-name $appRegName --query "[0].id" -o tsv
    if (-not $spObjectId) {
        Write-Error "Service Principal for '$appRegName' not found. Please run setup-secretless.ps1 first."
        exit 1
    }
    
    Write-Host "Creating Dataverse Application User..." -ForegroundColor Yellow
    Write-Host "  App ID: $($appRegInfo.appId)" -ForegroundColor Gray
    Write-Host "  Service Principal: $spObjectId" -ForegroundColor Gray
    Write-Host "  Environment: $DataverseUrl" -ForegroundColor Gray
    
    try {
        # Inline Dataverse user creation (adapted from create-dataverse-user.ps1)
        $envBase = $DataverseUrl.TrimEnd('/')
        $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
        
        if (-not $accessToken -or $accessToken.Length -lt 100) {
            throw "Could not obtain admin access token. Ensure you're logged in as a Dataverse admin."
        }
        
        $jsonHeaders = @{
            "Authorization"    = "Bearer $accessToken"
            "Content-Type"     = "application/json"
            "Accept"           = "application/json"
            "OData-MaxVersion" = "4.0"
            "OData-Version"    = "4.0"
        }
        
        # Get root Business Unit
        $buUrl = "$envBase/api/data/v9.2/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null"
        $bu = Invoke-RestMethod -Uri $buUrl -Headers $jsonHeaders -Method Get
        
        if (-not $bu.value -or $bu.value.Count -lt 1) {
            throw "Root Business Unit not found"
        }
        
        $rootBuId = $bu.value[0].businessunitid
        
        # Check for existing Application User  
        $filter = "applicationid eq $($appRegInfo.appId) or azureactivedirectoryobjectid eq $spObjectId"
        $userUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid&`$filter=$filter"
        $existing = Invoke-RestMethod -Uri $userUrl -Headers $jsonHeaders -Method Get
        
        if ($existing.value -and $existing.value.Count -gt 0) {
            $userId = $existing.value[0].systemuserid
            Write-Host "✅ Application User already exists: $userId" -ForegroundColor Green
            Write-Host "   (Application users are normally created during setup-secretless.ps1)" -ForegroundColor Gray
        } else {
            Write-Host "Creating new Application User..." -ForegroundColor Yellow
            # Create new Application User
            $body = @{
                applicationid               = $appRegInfo.appId
                azureactivedirectoryobjectid= $spObjectId
                "businessunitid@odata.bind" = "/businessunits($rootBuId)"
                firstname                   = "App"
                lastname                    = "$EnvironmentSuffix Service"
                domainname                  = "app-$($appRegInfo.appId.ToLower())@mermaid.local"
            } | ConvertTo-Json -Depth 5
            
            $hdr = $jsonHeaders.Clone()
            $hdr["Prefer"] = "return=representation"
            $resp = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers" -Headers $hdr -Method Post -Body $body -ContentType "application/json"
            $userId = $resp.systemuserid
            
            Write-Host "✅ Application User created: $userId" -ForegroundColor Green
        }
        
        # Assign System Customizer role
        $roleNameEsc = "System Customizer".Replace("'", "''")
        $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name`&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
        $roleResp = Invoke-RestMethod -Uri $rolesUrl -Headers $jsonHeaders -Method Get
        
        if ($roleResp.value -and $roleResp.value.Count -gt 0) {
            $roleId = $roleResp.value[0].roleid
            
            # Check if user already has the role
            $hasRole = $false
            try {
                $checkUserRoles = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association?`$select=roleid" -Headers $jsonHeaders -Method Get
                if ($checkUserRoles.value) {
                    $hasRole = ($checkUserRoles.value | Where-Object { $_.roleid -eq $roleId }) -ne $null
                }
            } catch {
                # Continue if can't check existing roles
            }
            
            if (-not $hasRole) {
                $assignBody = @{ "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)" } | ConvertTo-Json
                Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref" -Headers $jsonHeaders -Method Post -Body $assignBody -ContentType "application/json"
                Write-Host "✅ System Customizer role assigned" -ForegroundColor Green
            } else {
                Write-Host "✅ User already has System Customizer role" -ForegroundColor Green
            }
        }
        
        Write-Host "Dataverse Application User verification completed" -ForegroundColor Green
        
    } catch {
        Write-Warning "Failed to setup Dataverse Application User: $_"
        Write-Host "💡 For first-time environments, run setup-secretless.ps1 which handles Dataverse user creation" -ForegroundColor Cyan
        Write-Host "💡 Or create the Application User manually in the Power Platform admin center:" -ForegroundColor Cyan
        Write-Host "   App ID: $($appRegInfo.appId)" -ForegroundColor Yellow
        Write-Host "   Service Principal: $spObjectId" -ForegroundColor Yellow
    }
} elseif ($SkipDataverseUser) {
    Write-Host "ℹ️  Dataverse Application User setup explicitly skipped" -ForegroundColor Cyan
} else {
    Write-Host "ℹ️  Multi-environment deployment - Dataverse application users managed during setup phase" -ForegroundColor Cyan
}

# ========================================================================
# Get Azure AD Configuration (from App Service settings)
# ========================================================================
Write-Host "Retrieving Azure AD authentication configuration..." -ForegroundColor Cyan

# Get authentication settings from App Service
$appSettings = az webapp config appsettings list --name $AppName --resource-group $ResourceGroup -o json | ConvertFrom-Json
$azureAdClientId = ($appSettings | Where-Object { $_.name -eq "AZURE_AD_CLIENT_ID" }).value
$azureAdTenantId = ($appSettings | Where-Object { $_.name -eq "AZURE_AD_TENANT_ID" }).value

if ($azureAdClientId -and $azureAdTenantId) {
    Write-Host "✅ Authentication configuration found" -ForegroundColor Green
    Write-Host "   └─ Client ID: $azureAdClientId" -ForegroundColor Gray
    Write-Host "   └─ Tenant ID: $azureAdTenantId" -ForegroundColor Gray
    
    # Configure redirect URI for Easy Auth
    Write-Host "Configuring App Registration redirect URI..." -ForegroundColor Cyan
    $appUrl = "https://$AppName.azurewebsites.net"
    $redirectUri = "$appUrl/.auth/login/aad/callback"
    
    try {
        # Get current redirect URIs to avoid overwriting
        $currentUris = az ad app show --id $azureAdClientId --query "web.redirectUris" -o json | ConvertFrom-Json
        
        # Add our redirect URI if not already present
        if ($currentUris -notcontains $redirectUri) {
            $allUris = @($currentUris) + @($redirectUri)
            az ad app update --id $azureAdClientId --web-redirect-uris $allUris | Out-Null
            Write-Host "✅ Added redirect URI: $redirectUri" -ForegroundColor Green
        } else {
            Write-Host "✅ Redirect URI already configured" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️  Failed to configure redirect URI: $_" -ForegroundColor Yellow
        Write-Host "   You may need to add manually in Azure AD: $redirectUri" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Authentication not configured in App Service settings" -ForegroundColor Yellow
    Write-Host "   Run setup-secretless.ps1 to configure Azure AD authentication" -ForegroundColor Yellow
    Write-Host "   Continuing deployment without authentication..." -ForegroundColor Yellow
}

# Build frontend
if (-not $SkipBuild) {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location src/frontend
    try {
        npm install --silent
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }

    Write-Host "Building frontend with Vite (injecting auth config)..." -ForegroundColor Yellow
    Push-Location src/frontend
    try {
        # Set environment variables for Vite build (only if auth is configured)
        if ($azureAdClientId -and $azureAdTenantId) {
            $appServiceUrl = az webapp show --name $AppName --resource-group $ResourceGroup --query "defaultHostName" -o tsv
            $env:VITE_AZURE_AD_CLIENT_ID = $azureAdClientId
            $env:VITE_AZURE_AD_TENANT_ID = $azureAdTenantId
            $env:VITE_AZURE_AD_REDIRECT_URI = "https://$appServiceUrl"
            
            Write-Host "   └─ Injecting VITE_AZURE_AD_CLIENT_ID=$azureAdClientId" -ForegroundColor Gray
            Write-Host "   └─ Injecting VITE_AZURE_AD_TENANT_ID=$azureAdTenantId" -ForegroundColor Gray
            Write-Host "   └─ Injecting VITE_AZURE_AD_REDIRECT_URI=https://$appServiceUrl" -ForegroundColor Gray
        } else {
            Write-Host "   └─ Building without authentication configuration" -ForegroundColor Yellow
        }
        
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
        
        # Clean up environment variables
        Remove-Item Env:\VITE_AZURE_AD_CLIENT_ID -ErrorAction SilentlyContinue
        Remove-Item Env:\VITE_AZURE_AD_TENANT_ID -ErrorAction SilentlyContinue
        Remove-Item Env:\VITE_AZURE_AD_REDIRECT_URI -ErrorAction SilentlyContinue
    } finally {
        Pop-Location
    }

    Write-Host "Frontend build completed successfully" -ForegroundColor Green
} else {
    Write-Host "Skipping frontend build" -ForegroundColor Yellow
}

# Create deployment package
Write-Host "Creating deployment package..." -ForegroundColor Cyan

# Clean deployment directory
if (Test-Path "deploy-temp") { Remove-Item "deploy-temp" -Recurse -Force }
New-Item -ItemType Directory -Path "deploy-temp" | Out-Null

Write-Host "Copying backend..." -ForegroundColor Yellow
Copy-Item -Path "src/backend" -Destination "deploy-temp/" -Recurse

Write-Host "Copying shared..." -ForegroundColor Yellow  
if (Test-Path "src/shared") {
    Copy-Item -Path "src/shared" -Destination "deploy-temp/" -Recurse
}

Write-Host "Copying data directory (multi-environment config)..." -ForegroundColor Yellow
if (Test-Path "data") {
    Copy-Item -Path "data" -Destination "deploy-temp/" -Recurse
    Write-Host "   └─ Included environments.json for multi-environment support" -ForegroundColor Gray
} else {
    Write-Warning "data directory not found - multi-environment support may not work"
}

Write-Host "Copying frontend build..." -ForegroundColor Yellow
if (Test-Path "src/frontend/dist") {
    # Copy to public directory for production deployment (matches wizard controller expectations)
    New-Item -ItemType Directory -Path "deploy-temp/public" -Force | Out-Null
    Copy-Item -Path "src/frontend/dist/*" -Destination "deploy-temp/public/" -Recurse
} else {
    Write-Error "Frontend build not found at src/frontend/dist"
    exit 1
}

Write-Host "Copying package files..." -ForegroundColor Yellow

# Read the original package.json and modify it for deployment
$originalPackageJson = Get-Content "package.json" | ConvertFrom-Json

# Create a deployment-specific package.json optimized for Azure App Service Node.js detection
$deploymentPackageJson = @{
    name = $originalPackageJson.name
    version = $originalPackageJson.version
    description = $originalPackageJson.description
    main = "server.js"
    scripts = @{
        start = "node server.js"
        # Add additional scripts that help Azure detect this as a Node.js app
        "azure-start" = "node server.js"
    }
    dependencies = $originalPackageJson.dependencies
    engines = @{
        node = ">=20.0.0"
        npm = ">=8.0.0"
    }
    # Add keywords to help Azure App Service identify this as a Node.js web app
    keywords = @("nodejs", "express", "web-app")
}

# Write the modified package.json
$deploymentPackageJson | ConvertTo-Json -Depth 3 | Out-File -FilePath "deploy-temp\package.json" -Encoding UTF8 -Force

# Copy package-lock.json if it exists
if (Test-Path "package-lock.json") {
    Copy-Item -Path "package-lock.json" -Destination "deploy-temp\package-lock.json" -Force
}

# DON'T install node_modules locally - let Azure Oryx build do it
# This ensures Oryx uses OUR source files, not cached versions
Write-Host "⚠️  Skipping local npm install - letting Azure Oryx build from source" -ForegroundColor Yellow

Write-Host "Creating secretless backend server..." -ForegroundColor Yellow

# Copy the backend server (already configured for managed identity)
Copy-Item "src/backend/server.js" "deploy-temp/backend/server.js" -Force

Write-Host "Creating deployment entry point..." -ForegroundColor Yellow
@"
/**
 * Azure App Service Entry Point for Secretless Deployment
 * Uses managed identity authentication without Key Vault
 */
const path = require('path');
const fs = require('fs');

// Set the correct working directory
process.chdir(__dirname);

// Debug: Log directory structure
console.log('🔍 Server Entry Point Debug Info:');
console.log('   Working Directory:', process.cwd());
console.log('   __dirname:', __dirname);
console.log('   Checking for data/environments.json...');
try {
  if (fs.existsSync(path.join(process.cwd(), 'data', 'environments.json'))) {
    console.log('   ✅ data/environments.json FOUND');
  } else {
    console.log('   ❌ data/environments.json NOT FOUND');
    console.log('   📁 Directory contents:');
    fs.readdirSync(process.cwd()).forEach(item => {
      console.log('      - ' + item);
    });
  }
} catch (e) {
  console.log('   ❌ Error checking file:', e.message);
}

// Set environment variables for secretless mode
process.env.AUTH_MODE = 'managed_identity';
process.env.USE_MANAGED_IDENTITY = 'true';
process.env.USE_FEDERATED_CREDENTIAL = 'true';

console.log('Starting Mermaid App in secretless mode...');

// Start the backend server
require('./backend/server.js');
"@ | Out-File -FilePath "deploy-temp\server.js" -Encoding UTF8 -Force

# Package for deployment
Write-Host "Creating deployment zip..." -ForegroundColor Yellow
Push-Location "deploy-temp"
try {
    $zipPath = "../deploy.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    
    # Use PowerShell compression for cross-platform compatibility
    Compress-Archive -Path "*" -DestinationPath $zipPath -Force
    
    $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
    Write-Host "Deployment package created: deploy.zip ($zipSize MB)" -ForegroundColor Green
} finally {
    Pop-Location
    Remove-Item "deploy-temp" -Recurse -Force
}

# Force Node.js runtime configuration (critical for proper container selection)
Write-Host "Configuring App Service for Node.js runtime..." -ForegroundColor Cyan

# Set the runtime stack with the EXACT format from working environment
az webapp config set --name $AppName --resource-group $ResourceGroup --linux-fx-version "NODE|20-LTS" 2>&1 | Out-Null

# Set the startup command
az webapp config set --name $AppName --resource-group $ResourceGroup --startup-file "node server.js" 2>&1 | Out-Null

Write-Host "✅ Node.js 20 runtime configured successfully" -ForegroundColor Green

# Configure runtime settings  
$runtimeSettings = @(
    "WEBSITES_PORT=8080",
    "WEBSITE_NODE_DEFAULT_VERSION=20",
    "NODE_ENV=production",
    "SCM_DO_BUILD_DURING_DEPLOYMENT=true",  # Enable Oryx build
    "ENABLE_ORYX_BUILD=true"  # Explicitly enable Oryx
)

# Note: Multi-environment deployment uses environments.json included in deployment package
# No need to set individual DATAVERSE_URL or POWER_PLATFORM_ENVIRONMENT_ID in App Service settings

az webapp config appsettings set --name $AppName --resource-group $ResourceGroup --settings $runtimeSettings | Out-Null

Write-Host "✅ Runtime configuration completed (multi-environment support via environments.json)" -ForegroundColor Green

# Deploy to App Service
Write-Host "Deploying application with retry logic..." -ForegroundColor Cyan

$maxRetries = 3
$retryCount = 0
$deploymentSuccess = $false

# Longer timeout strategy to handle Kudu connection issues
$timeouts = @(300, 300, 300)  # 5 min, 5 min, 5 min

while (-not $deploymentSuccess -and $retryCount -lt $maxRetries) {
    $retryCount++
    $currentTimeout = $timeouts[$retryCount - 1]
    $timeoutMinutes = [math]::Round($currentTimeout / 60, 1)
    
    Write-Host "Attempting deployment (attempt $retryCount of $maxRetries, timeout: $timeoutMinutes min)..." -ForegroundColor Yellow
    
    try {
        # Remove --type zip to allow Oryx build to run
        az webapp deploy --resource-group $ResourceGroup --name $AppName --src-path "deploy.zip" --async false --timeout $currentTimeout
        
        if ($LASTEXITCODE -eq 0) {
            $deploymentSuccess = $true
            Write-Host "Deployment successful on attempt $retryCount!" -ForegroundColor Green
        } else {
            throw "az webapp deploy failed with exit code $LASTEXITCODE"
        }
    } catch {
        Write-Warning "Deployment attempt $retryCount failed: $_"
        
        if ($retryCount -lt $maxRetries) {
            Write-Host "Retrying in 10 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10
        } else {
            Write-Error "Deployment failed after $maxRetries attempts"
            exit 1
        }
    }
}

# Clean up deployment package
Remove-Item "deploy.zip" -Force -ErrorAction SilentlyContinue

# Configure application logging
Write-Host "Configuring application logging..." -ForegroundColor Cyan
try {
    az webapp log config --name $AppName --resource-group $ResourceGroup --application-logging filesystem --level information --query "applicationLogs.fileSystem.level" --output tsv | Out-Null
    Write-Host "✅ Application logging enabled at Information level" -ForegroundColor Green
} catch {
    Write-Warning "Failed to configure logging (non-critical): $_"
}

# Get App Service URL
$appUrl = "https://$AppName.azurewebsites.net"

Write-Host "🎉 Secretless deployment completed successfully!" -ForegroundColor Green
Write-Host "App URL: $appUrl" -ForegroundColor Cyan

# ============================================================================
# Post-Deployment Validation
# ============================================================================

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Running Post-Deployment Validation..." -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan

# Give the app a moment to fully start
Write-Host "Waiting for app to fully initialize (30 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Run smoke tests
Write-Host ""
Write-Host "Running smoke tests..." -ForegroundColor Cyan
$smokeTestScript = Join-Path $PSScriptRoot "smoke-test.ps1"

if (Test-Path $smokeTestScript) {
    try {
        # Run in fresh PowerShell session to avoid script caching issues
        $result = pwsh -NoProfile -Command "& '$smokeTestScript' -AppUrl '$appUrl' -TimeoutSeconds 30; exit `$LASTEXITCODE"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ All smoke tests passed" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Some smoke tests failed (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
            Write-Host "   Review the test results above for details" -ForegroundColor Gray
            Write-Host "   The application may still be functional" -ForegroundColor Gray
        }
    } catch {
        Write-Warning "Smoke test execution failed: $_"
        Write-Host "   This is non-critical - deployment completed but validation had issues" -ForegroundColor Gray
    }
} else {
    Write-Warning "Smoke test script not found: $smokeTestScript"
}

# Run infrastructure tests (if Pester is available)
Write-Host ""
Write-Host "Running infrastructure validation tests..." -ForegroundColor Cyan

if (Get-Command Invoke-Pester -ErrorAction SilentlyContinue) {
    $infraTestScript = Join-Path (Split-Path $PSScriptRoot) "tests\infrastructure\validate-deployment.tests.ps1"
    
    if (Test-Path $infraTestScript) {
        try {
            # Set environment variables for Pester tests
            $env:APP_NAME = $AppName
            $env:RESOURCE_GROUP = $ResourceGroup
            $env:LOCATION = "westeurope"
            
            # Run Pester tests
            $pesterConfig = @{
                Path = $infraTestScript
                Output = "Detailed"
                PassThru = $true
            }
            
            $testResults = Invoke-Pester -Configuration $pesterConfig
            
            if ($testResults.FailedCount -eq 0) {
                Write-Host "✅ All infrastructure tests passed ($($testResults.PassedCount) tests)" -ForegroundColor Green
            } else {
                Write-Host "⚠️ $($testResults.FailedCount) infrastructure tests failed" -ForegroundColor Yellow
                Write-Host "   Passed: $($testResults.PassedCount) | Failed: $($testResults.FailedCount)" -ForegroundColor Gray
            }
        } catch {
            Write-Warning "Infrastructure test execution failed: $_"
            Write-Host "   This is non-critical - deployment completed but validation had issues" -ForegroundColor Gray
        } finally {
            # Clean up environment variables
            Remove-Item Env:\APP_NAME -ErrorAction SilentlyContinue
            Remove-Item Env:\RESOURCE_GROUP -ErrorAction SilentlyContinue
            Remove-Item Env:\LOCATION -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "ℹ️ Infrastructure test script not found (skipping)" -ForegroundColor Gray
    }
} else {
    Write-Host "ℹ️ Pester not installed (skipping infrastructure tests)" -ForegroundColor Gray
    Write-Host "   Install: Install-Module -Name Pester -Force -SkipPublisherCheck" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Deployment and Validation Complete" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Cyan