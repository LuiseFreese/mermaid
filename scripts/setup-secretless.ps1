#!/usr/bin/env pwsh

<#
.SYNOPSIS
    🚀 Complete Secretless Multi-Environment Setup for Mermaid → Dataverse on Azure

.DESCRIPTION
    This script sets up a complete secretless multi-environment deployment using:
    - App Registration with Federated Credentials (no client secrets in Azure)
    - User-Assigned Managed Identity for Azure → Dataverse authentication
    - Azure Infrastructure (App Service, etc.) via Bicep
    - Dataverse Application Users in ALL configured environments with proper permissions
    - Azure AD App Registration for user authentication
    
    Multi-Environment Support:
    - Automatically reads data/environments.json and creates application users in ALL environments
    - No need to specify individual Dataverse URLs - all environments configured from one file
    - Supports dev/test/prod/any environment configuration you define
    
    Configuration values are stored in App Service settings (not Key Vault secrets).
    Everything is idempotent - safe to run multiple times.

.EXAMPLE
    # First time setup - Configure environments first!
    # 1. Edit data/environments.json with your Dataverse environments (dev/test/prod/etc.)
    # 2. Run setup script:
    .\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod"

.EXAMPLE
    # Unattended mode (for CI/CD)
    .\scripts\setup-secretless.ps1 -Unattended -EnvironmentSuffix "prod" -ResourceGroup "rg-mermaid-prod" -Location "westeurope"

.NOTES
    Prerequisites:
    - Azure CLI installed and logged in (az login)
    - Power Platform Admin or Dataverse System Admin access in ALL environments
    - data/environments.json configured with all Dataverse environments (REQUIRED!)
    - No secrets needed in Azure - fully managed identity based!
    
    What this script does:
    1. Creates App Registration with Federated Credentials
    2. Creates Managed Identity and Azure resources
    3. Reads data/environments.json
    4. Creates Application Users in ALL configured environments automatically
    5. Assigns System Customizer role to each Application User
    6. Configures Azure AD authentication for user login
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)] [switch]$Unattended,
    [Parameter(Mandatory = $false)] [string]$ResourceGroup,
    [Parameter(Mandatory = $false)] [string]$Location = "West Europe",
    [Parameter(Mandatory = $false)] [string]$AppRegistrationName,
    [Parameter(Mandatory = $false)] [string]$EnvironmentSuffix,
    [Parameter(Mandatory = $false)] [string]$SecurityRole = "System Customizer",
    [Parameter(Mandatory = $false)] [switch]$SkipDataverseUser,
    [Parameter(Mandatory = $false)] [switch]$DryRun
)

# ---------- Output helpers ----------
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info    { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error   { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }

# ---------- .env file helper ----------
function Update-EnvFile {
    param(
        [string]$Key,
        [string]$Value,
        [string]$EnvFilePath = ".env"
    )
    
    if (-not (Test-Path $EnvFilePath)) {
        # Create new .env file
        Write-Info "Creating new .env file..."
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
    Write-Info "Updated .env file: $Key"
}

# Error handling
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Info "Starting Secretless Mermaid-to-Dataverse Setup"

# ---------- 1. Setup Parameters ----------
Write-Info "Setting up deployment parameters..."

# Generate environment suffix if not provided
if (-not $EnvironmentSuffix) {
    $EnvironmentSuffix = -join ((65..90) + (97..122) | Get-Random -Count 6 | ForEach-Object {[char]$_})
    $EnvironmentSuffix = $EnvironmentSuffix.ToLower()
    Write-Info "Generated environment suffix: $EnvironmentSuffix"
}

# Generate resource names
$AppServiceName = "app-mermaid-$EnvironmentSuffix"
$ManagedIdentityName = "mi-mermaid-$EnvironmentSuffix"
$AppServicePlanName = "plan-mermaid-$EnvironmentSuffix"
$StorageAccountName = "stmermaid$EnvironmentSuffix"  # Must be globally unique, lowercase, no hyphens

if (-not $ResourceGroup) { 
    $ResourceGroup = "rg-mermaid-$EnvironmentSuffix" 
}

if (-not $AppRegistrationName) { 
    $AppRegistrationName = "mermaid-dataverse-$EnvironmentSuffix" 
}

Write-Info "Resource Configuration:"
Write-Info "  Resource Group: $ResourceGroup"
Write-Info "  App Service: $AppServiceName"
Write-Info "  App Registration: $AppRegistrationName"
Write-Info "  Managed Identity: $ManagedIdentityName"
Write-Info "  Storage Account: $StorageAccountName"

if ($DryRun) {
    Write-Warning "DRY RUN MODE - No changes will be made"
    exit 0
}

# ---------- 2. Get Tenant and Subscription Info ----------
Write-Info "Getting Azure tenant information..."

$tenantInfo = az account show | ConvertFrom-Json
$tenantId = $tenantInfo.tenantId
$subscriptionId = $tenantInfo.id

Write-Info "Tenant ID: $tenantId"
Write-Info "Subscription: $($tenantInfo.name)"

# ---------- 3. Create/Update App Registration ----------
Write-Info "Setting up App Registration..."

$existingApp = az ad app list --display-name $AppRegistrationName | ConvertFrom-Json
if ($existingApp -and $existingApp.Length -gt 0) {
    $appReg = $existingApp[0]
    Write-Success "Found existing App Registration: $($appReg.displayName)"
} else {
    Write-Info "Creating new App Registration: $AppRegistrationName"
    $appReg = az ad app create --display-name $AppRegistrationName | ConvertFrom-Json
    Write-Success "Created App Registration: $($appReg.displayName)"
}

$clientId = $appReg.appId
Write-Info "Client ID: $clientId"

# ---------- 3.1 Create/Update Service Principal ----------
Write-Info "Setting up Service Principal..."

$existingSp = az ad sp list --filter "appId eq '$clientId'" | ConvertFrom-Json
if ($existingSp -and $existingSp.Length -gt 0) {
    $servicePrincipal = $existingSp[0]
    Write-Success "Found existing Service Principal: $($servicePrincipal.displayName)"
} else {
    Write-Info "Creating Service Principal for App Registration..."
    $servicePrincipal = az ad sp create --id $clientId | ConvertFrom-Json
    Write-Success "Created Service Principal: $($servicePrincipal.displayName)"
}

$servicePrincipalObjectId = $servicePrincipal.id
Write-Info "Service Principal Object ID: $servicePrincipalObjectId"

# ---------- 3.2 Create Client Secret for Local Development ----------
Write-Info "Creating client secret for local development..."

# Check if a secret already exists
$existingSecrets = az ad app credential list --id $clientId | ConvertFrom-Json
$localDevSecret = $existingSecrets | Where-Object { $_.displayName -eq "Local Development Secret" }

if ($localDevSecret) {
    Write-Warning "A 'Local Development Secret' already exists. Skipping secret creation."
    $clientSecret = $null
} else {
    # Create new client secret (valid for 1 year)
    $secretInfo = az ad app credential reset --id $clientId --append --display-name "Local Development Secret" --years 1 | ConvertFrom-Json
    $clientSecret = $secretInfo.password
    
    # Handle both endDateTime and endDate properties (Azure CLI version differences)
    $expiryDate = if ($secretInfo.PSObject.Properties['endDateTime']) { 
        $secretInfo.endDateTime 
    } elseif ($secretInfo.PSObject.Properties['endDate']) { 
        $secretInfo.endDate 
    } else { 
        "1 year" 
    }
    Write-Success "Created client secret for local development (expires: $expiryDate)"
    
    # Save to .env file
    Update-EnvFile -Key "CLIENT_ID" -Value $clientId
    Update-EnvFile -Key "CLIENT_SECRET" -Value $clientSecret
    Update-EnvFile -Key "TENANT_ID" -Value $tenantId
    Write-Success "Saved authentication credentials to .env file"
}

# ---------- 4. Deploy Azure Infrastructure ----------
Write-Info "Deploying Azure infrastructure with Bicep..."

# Create resource group if it doesn't exist
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    Write-Info "Creating resource group: $ResourceGroup"
    az group create --name $ResourceGroup --location $Location | Out-Null
    Write-Success "Created resource group: $ResourceGroup"
}

# Deploy infrastructure using Bicep
$bicepFile = "deploy/infrastructure-secretless.bicep"
if (Test-Path $bicepFile) {
    Write-Info "Deploying secretless infrastructure from $bicepFile..."
    
    $deploymentResult = az deployment group create `
        --resource-group $ResourceGroup `
        --template-file $bicepFile `
        --parameters `
            appServiceName=$AppServiceName `
            appServicePlanName=$AppServicePlanName `
            managedIdentityName=$ManagedIdentityName `
            storageAccountName=$StorageAccountName `
            environment=$EnvironmentSuffix `
            location=$Location | ConvertFrom-Json
    
    Write-Success "Infrastructure deployment completed"
    
    # Get managed identity details
    $managedIdentity = az identity show --name $ManagedIdentityName --resource-group $ResourceGroup | ConvertFrom-Json
    $managedIdentityClientId = $managedIdentity.clientId
    $managedIdentityPrincipalId = $managedIdentity.principalId
    
    Write-Info "Managed Identity Client ID: $managedIdentityClientId"
} else {
    Write-Error "Bicep template not found: $bicepFile"
    exit 1
}

# ---------- 5. Configure Federated Credential ----------
Write-Info "Setting up Federated Credential..."

$federatedCredentialName = "managed-identity-$EnvironmentSuffix"
$issuer = "https://login.microsoftonline.com/$tenantId/v2.0"
$subject = $managedIdentityPrincipalId

# Check if federated credential already exists (by name OR by issuer/subject combination)
$existingCreds = az ad app federated-credential list --id $clientId | ConvertFrom-Json
$existingCred = $existingCreds | Where-Object { 
    $_.name -eq $federatedCredentialName -or 
    ($_.issuer -eq $issuer -and $_.subject -eq $subject) 
}

if ($existingCred) {
    Write-Success "Federated credential already exists: $($existingCred.name)"
    Write-Info "   └─ Issuer: $($existingCred.issuer)"
    Write-Info "   └─ Subject: $($existingCred.subject)"
} else {
    Write-Info "Creating federated credential: $federatedCredentialName"
    
    $credentialParams = @{
        name = $federatedCredentialName
        issuer = $issuer
        subject = $subject
        description = "Federated credential for $AppServiceName"
        audiences = @("api://AzureADTokenExchange")
    }
    
    $credentialJson = $credentialParams | ConvertTo-Json -Depth 3
    $credentialFile = [System.IO.Path]::GetTempFileName()
    $credentialJson | Out-File -FilePath $credentialFile -Encoding utf8
    
    try {
        az ad app federated-credential create --id $clientId --parameters $credentialFile | Out-Null
        Write-Success "Created federated credential: $federatedCredentialName"
    } finally {
        Remove-Item $credentialFile -Force -ErrorAction SilentlyContinue
    }
}

# ---------- 6. Configure App Service Settings ----------
Write-Info "Configuring App Service settings..."

# Assign managed identity to App Service
Write-Info "Assigning managed identity to App Service..."
az webapp identity assign --name $AppServiceName --resource-group $ResourceGroup --identities $managedIdentity.id | Out-Null
Write-Success "Managed identity assigned to App Service"

# Set application settings (configuration, not secrets)
Write-Info "Setting App Service configuration..."
az webapp config appsettings set --name $AppServiceName --resource-group $ResourceGroup --settings `
    "TENANT_ID=$tenantId" `
    "CLIENT_ID=$clientId" `
    "MANAGED_IDENTITY_CLIENT_ID=$managedIdentityClientId" `
    "USE_MANAGED_IDENTITY=true" `
    "USE_FEDERATED_CREDENTIAL=true" | Out-Null

Write-Success "App Service configuration completed"

# ---------- 7. Validate Multi-Environment Configuration ----------
$envConfigPath = Join-Path $PSScriptRoot ".." "data" "environments.json"

if (-not (Test-Path $envConfigPath)) {
    Write-Error "❌ Multi-environment configuration file not found!"
    Write-Host ""
    Write-Host "Expected file: $envConfigPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please create data/environments.json with your Dataverse environments." -ForegroundColor Yellow
    Write-Host "See data/environments.example.json for the required format." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Example structure:" -ForegroundColor Cyan
    Write-Host @"
{
  "version": "1.0.0",
  "defaultEnvironmentId": "your-env-id",
  "environments": [
    {
      "id": "env-guid",
      "name": "dev",
      "url": "https://yourorg.crm4.dynamics.com",
      "powerPlatformEnvironmentId": "env-guid",
      "color": "blue"
    }
  ]
}
"@ -ForegroundColor Gray
    exit 1
}

Write-Info "📋 Loading multi-environment configuration from data/environments.json"
try {
    $envConfig = Get-Content $envConfigPath | ConvertFrom-Json
    $environments = $envConfig.environments
    
    if ($environments.Count -eq 0) {
        Write-Error "❌ No environments found in data/environments.json"
        Write-Host "Please add at least one environment to the configuration file." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Success "Found $($environments.Count) configured environment(s):"
    foreach ($env in $environments) {
        Write-Info "   • $($env.name) - $($env.url)"
    }
} catch {
    Write-Error "❌ Could not parse environments.json: $_"
    Write-Host "Please check that the file is valid JSON." -ForegroundColor Yellow
    exit 1
}

# ---------- 8. Setup Azure AD App Registration (for Authentication) ----------
Write-Info "🔐 Setting up Azure AD authentication..."

# Check if Azure AD App Registration already exists
$azureAdAppName = "mermaid-user-auth-$EnvironmentSuffix"
$existingAzureAdApp = az ad app list --display-name $azureAdAppName --query "[0]" -o json 2>$null | ConvertFrom-Json

if ($existingAzureAdApp) {
    Write-Success "Azure AD App Registration already exists: $azureAdAppName"
    $azureAdClientId = $existingAzureAdApp.appId
    $azureAdAppObjectId = $existingAzureAdApp.id
    $azureAdTenantId = (az account show --query "tenantId" -o tsv)
    
    # Update existing app to include web redirect URI for Easy Auth (NO localhost to prevent redirect issues)
    Write-Info "   └─ Updating redirect URIs for production Easy Auth..."
    $appServiceUrl = az webapp show --name $AppServiceName --resource-group $ResourceGroup --query "defaultHostName" -o tsv
    $webRedirectUri = "https://$appServiceUrl/.auth/login/aad/callback"  # Easy Auth callback
    $spaProductionUri = "https://$appServiceUrl"  # Direct app access
    
    $configFile = [System.IO.Path]::GetTempFileName()
    try {
        # Create configuration JSON with web (for Easy Auth) and SPA redirect URIs (NO localhost)
        @{ 
            web = @{ redirectUris = @($webRedirectUri) }
            spa = @{ redirectUris = @($spaProductionUri) } 
        } | ConvertTo-Json -Depth 3 | Out-File $configFile -Encoding utf8
        
        # Apply configuration using Graph API
        az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications/$azureAdAppObjectId" `
            --headers "Content-Type=application/json" `
            --body "@$configFile" `
            --output none
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Failed to update redirect URIs"
        } else {
            Write-Success "Redirect URIs updated (production only - no localhost)"
        }
    } finally {
        Remove-Item $configFile -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Info "Creating Azure AD App Registration for authentication: $azureAdAppName"
    
    # Get tenant ID
    $azureAdTenantId = az account show --query "tenantId" -o tsv
    
    # Get the App Service URL for redirect URI
    $appServiceUrl = az webapp show --name $AppServiceName --resource-group $ResourceGroup --query "defaultHostName" -o tsv
    $webRedirectUri = "https://$appServiceUrl/.auth/login/aad/callback"  # Easy Auth callback
    $spaProductionUri = "https://$appServiceUrl"  # Direct app access
    
    # Create App Registration for Single Page Application
    Write-Info "   └─ Creating App Registration..."
    $azureAdAppJson = az ad app create `
        --display-name $azureAdAppName `
        --sign-in-audience "AzureADMyOrg" `
        --enable-id-token-issuance true `
        --query "{appId: appId, id: id}" `
        -o json
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create Azure AD App Registration for authentication"
        throw "Azure AD App Registration creation failed"
    }
    
    $azureAdAppInfo = $azureAdAppJson | ConvertFrom-Json
    $azureAdClientId = $azureAdAppInfo.appId
    $azureAdAppObjectId = $azureAdAppInfo.id
    
    Write-Info "   └─ App ID: $azureAdClientId"
    
    # Configure both Web (for Easy Auth) and SPA platform settings using Microsoft Graph API
    Write-Info "   └─ Configuring redirect URIs for production Easy Auth..."
    $configFile = [System.IO.Path]::GetTempFileName()
    try {
        # Create configuration JSON with web redirect URI for Easy Auth callback and SPA for production access
        # NOTE: Localhost NOT included - local dev should use AUTH_ENABLED=false instead
        @{ 
            web = @{ redirectUris = @($webRedirectUri) }
            spa = @{ redirectUris = @($spaProductionUri) } 
        } | ConvertTo-Json -Depth 3 | Out-File $configFile -Encoding utf8
        
        # Apply configuration using Graph API
        az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications/$azureAdAppObjectId" `
            --headers "Content-Type=application/json" `
            --body "@$configFile" `
            --output none
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Failed to configure redirect URIs via Graph API"
        } else {
            Write-Success "Production redirect URIs configured for Easy Auth"
        }
    } finally {
        Remove-Item $configFile -Force -ErrorAction SilentlyContinue
    }
    
    # Add Microsoft Graph User.Read permission
    Write-Info "   └─ Adding API permissions..."
    $graphAppId = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
    $userReadPermissionId = "e1fe6dd8-ba31-4d61-89e7-88639da4683d"  # User.Read
    
    az ad app permission add `
        --id $azureAdAppObjectId `
        --api $graphAppId `
        --api-permissions "$userReadPermissionId=Scope" `
        2>$null
    
    # Grant admin consent (optional, but recommended)
    Write-Info "   └─ Granting admin consent..."
    az ad app permission admin-consent --id $azureAdAppObjectId 2>$null
    
    Write-Success "Azure AD App Registration created successfully"
}

# Configure App Service settings for authentication
Write-Info "Configuring App Service authentication settings..."

az webapp config appsettings set `
    --name $AppServiceName `
    --resource-group $ResourceGroup `
    --settings `
        "AZURE_AD_CLIENT_ID=$azureAdClientId" `
        "AZURE_AD_TENANT_ID=$azureAdTenantId" `
        "AUTH_ENABLED=true" `
    --output none

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to configure App Service authentication settings"
    throw "App Service configuration failed"
}

# Enable Azure App Service Easy Auth with Azure AD
Write-Info "Enabling Easy Auth with Azure AD..."
$issuerUrl = "https://sts.windows.net/$azureAdTenantId/"
$appServiceUrl = az webapp show --name $AppServiceName --resource-group $ResourceGroup --query "defaultHostName" -o tsv

az webapp auth update `
    --name $AppServiceName `
    --resource-group $ResourceGroup `
    --enabled true `
    --action LoginWithAzureActiveDirectory `
    --aad-client-id $azureAdClientId `
    --aad-token-issuer-url $issuerUrl `
    --aad-allowed-token-audiences "https://$appServiceUrl/.auth/login/aad/callback" `
    --output none

if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to enable Easy Auth - you may need to configure it manually in the portal"
} else {
    Write-Success "Easy Auth enabled successfully"
}

Write-Success "Authentication configured"
Write-Info "   └─ Frontend App (Easy Auth): $azureAdAppName"
Write-Info "   └─ Azure AD Client ID: $azureAdClientId"
Write-Info "   └─ Azure AD Tenant ID: $azureAdTenantId"
Write-Info "   └─ Easy Auth: Enabled (LoginWithAzureActiveDirectory)"
Write-Info "   └─ Web Redirect URI (Easy Auth): https://$appServiceUrl/.auth/login/aad/callback"
Write-Info "   └─ SPA Redirect URIs (Dev): https://$appServiceUrl, http://localhost:3003"
Write-Info "   └─ App Service setting AUTH_ENABLED: true"

# ---------- 9. Create Dataverse Application User(s) ----------
# Load multi-environment configuration (already validated in step 7)
$envConfigPath = Join-Path $PSScriptRoot ".." "data" "environments.json"
$envConfig = Get-Content $envConfigPath | ConvertFrom-Json
$environments = $envConfig.environments

# Create application users in all environments
if (-not $SkipDataverseUser) {
    Write-Info "👤 Creating Dataverse Application User(s) in $($environments.Count) environment(s)..."
    Write-Host ""
    
    $successCount = 0
    $failCount = 0
    
    foreach ($env in $environments) {
        $envName = $env.name
        $envUrl = $env.url
        
        Write-Info "🌐 Processing environment: $envName"
        Write-Info "   URL: $envUrl"
        
        try {
            # Get admin access token
            $envBase = $envUrl.TrimEnd('/')
            $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
            
            if (-not $accessToken -or $accessToken.Length -lt 100) {
                throw "Could not obtain admin access token for $envName"
            }
            
            Write-Success "   Access token obtained"
            
            # Set up headers
            $jsonHeaders = @{
                "Authorization"    = "Bearer $accessToken"
                "Content-Type"     = "application/json"
                "Accept"           = "application/json"
                "OData-MaxVersion" = "4.0"
                "OData-Version"    = "4.0"
            }
            
            # Get root Business Unit
            Write-Info "   Resolving root Business Unit..."
            $buUrl = "$envBase/api/data/v9.2/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null"
            $bu = Invoke-RestMethod -Uri $buUrl -Headers $jsonHeaders -Method Get
            
            if (-not $bu.value -or $bu.value.Count -lt 1) {
                throw "Root Business Unit not found"
            }
            
            $rootBuId = $bu.value[0].businessunitid
            $rootBuName = $bu.value[0].name
            Write-Success "   Root BU: $rootBuName ($rootBuId)"
            
            # Check for existing Application User
            Write-Info "   Checking for existing Application User..."
            $filter = "applicationid eq $clientId or azureactivedirectoryobjectid eq $servicePrincipalObjectId"
            $userUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid,domainname&`$filter=$filter"
            $existing = Invoke-RestMethod -Uri $userUrl -Headers $jsonHeaders -Method Get
            
            $userId = $null
            if ($existing.value -and $existing.value.Count -gt 0) {
                $userId = $existing.value[0].systemuserid
                Write-Success "   Found existing Application User: $userId"
                
                # Update the azureactivedirectoryobjectid if needed
                if (-not $existing.value[0].azureactivedirectoryobjectid -or $existing.value[0].azureactivedirectoryobjectid -ne $servicePrincipalObjectId) {
                    Write-Info "   Updating Service Principal Object ID..."
                    $patchBody = @{ azureactivedirectoryobjectid = $servicePrincipalObjectId } | ConvertTo-Json -Depth 3
                    Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)" -Headers $jsonHeaders -Method Patch -Body $patchBody -ContentType "application/json"
                    Write-Success "   Service Principal Object ID updated"
                }
            } else {
                # Create new Application User
                Write-Info "   Creating new Application User..."
                $body = @{
                    applicationid               = $clientId
                    azureactivedirectoryobjectid= $servicePrincipalObjectId
                    "businessunitid@odata.bind" = "/businessunits($rootBuId)"
                    firstname                   = "Mermaid"
                    lastname                    = "$EnvironmentSuffix Service"
                    domainname                  = "app-$($clientId.ToLower())@mermaid.local"
            } | ConvertTo-Json -Depth 5
            
            $hdr = $jsonHeaders.Clone()
            $hdr["Prefer"] = "return=representation"
            $resp = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers" -Headers $hdr -Method Post -Body $body -ContentType "application/json"
            $userId = $resp.systemuserid
            
            if (-not $userId) {
                throw "Dataverse did not return a systemuserid for the created Application User"
            }
            
                    Write-Success "   Application User created: $userId"
            }
            
            # Resolve and assign security role
            Write-Info "   Resolving security role '$SecurityRole'..."
            $roleNameEsc = $SecurityRole.Replace("'", "''")
            $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name,_businessunitid_value&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
            $roleResp = Invoke-RestMethod -Uri $rolesUrl -Headers $jsonHeaders -Method Get
            
            if (-not $roleResp.value -or $roleResp.value.Count -lt 1) {
                throw "Security Role '$SecurityRole' not found in root Business Unit"
            }
            
            $roleId = $roleResp.value[0].roleid
            Write-Success "   Role found: $SecurityRole ($roleId)"
            
            # Check if user already has the role
            Write-Info "   Checking existing role assignments..."
            $hasRole = $false
            try {
                $checkUserRoles = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association?`$select=roleid" -Headers $jsonHeaders -Method Get
            if ($checkUserRoles.value) {
                $hasRole = $null -ne ($checkUserRoles.value | Where-Object { $_.roleid -eq $roleId })
                }
            } catch {
                Write-Warning "   Could not check existing roles: $_"
            }
            
            if (-not $hasRole) {
                Write-Info "   Assigning security role '$SecurityRole'..."
                $assignBody = @{ "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)" } | ConvertTo-Json
                Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref" -Headers $jsonHeaders -Method Post -Body $assignBody -ContentType "application/json"
                Write-Success "   Security role assigned!"
            } else {
                Write-Success "   User already has the required role"
            }
            
            Write-Success "✅ Application User setup completed for $envName"
            Write-Info "   User ID: $userId"
            Write-Info "   Role: $SecurityRole"
            Write-Info "   Business Unit: $rootBuName"
            $successCount++
            
        } catch {
            Write-Warning "❌ Failed to create Application User in ${envName}: $_"
            Write-Warning "   You can add it manually later using:"
            Write-Warning "   .\scripts\setup-dataverse-user.ps1 -DataverseUrl `"$envUrl`" -AppId `"$clientId`" -ServicePrincipalId `"$servicePrincipalObjectId`""
            $failCount++
        }
        
        Write-Host ""
    }
    
    # Summary
    Write-Host ""
    Write-Success "📊 Application User Setup Summary:"
    Write-Info "   Successful: $successCount environment(s)"
    if ($failCount -gt 0) {
        Write-Warning "   Failed: $failCount environment(s) - review errors above"
    }
}

# ---------- 10. Configure Application Logging ----------
Write-Info "Configuring application logging"
try {
    az webapp log config --name $AppServiceName --resource-group $ResourceGroup --application-logging filesystem --level information --query "applicationLogs.fileSystem.level" --output tsv | Out-Null
    Write-Success "Application logging enabled at Information level"
} catch {
    Write-Warning "Failed to configure logging (non-critical): $_"
}

# ---------- 11. Summary ----------
Write-Success "🎉 Secretless setup completed successfully!"
Write-Host ""
Write-Host "Setup Summary:" -ForegroundColor Cyan
Write-Host "  App Registration: $AppRegistrationName ($clientId)"
Write-Host "  Service Principal: Created automatically ($servicePrincipalObjectId)"
if ($clientSecret) {
    Write-Host "  Client Secret: Created for local development (saved to .env)"
}
Write-Host "  Azure Resources: Deployed to $ResourceGroup"
Write-Host "  App Service: $AppServiceName (Node.js 20)"
Write-Host "  Managed Identity: $ManagedIdentityName ($managedIdentityClientId)"
Write-Host "  Federated Credential: Configured for managed identity"
Write-Host "  Configuration: Stored in App Service settings (no secrets!)"
Write-Host "  Application Logging: Enabled at Information level"
Write-Host "  Authentication: Azure AD App Registration configured ($azureAdAppName)"
Write-Host "    └─ Client ID: $azureAdClientId"
Write-Host "    └─ AUTH_ENABLED: true"

Write-Host ""
Write-Host "Next Step:" -ForegroundColor Green
Write-Host "Deploy your application: .\scripts\deploy-secretless.ps1 -EnvironmentSuffix `"$EnvironmentSuffix`""
Write-Host ""
Write-Host "Authentication Info:" -ForegroundColor Cyan
Write-Host "  Users will need to sign in with Microsoft credentials"
Write-Host "  Web Redirect URI (Easy Auth): https://$appServiceUrl/.auth/login/aad/callback"
Write-Host "  SPA Redirect URIs (Dev): https://$appServiceUrl, http://localhost:3003"
Write-Host "  Local dev can use AUTH_ENABLED=false for testing"
Write-Host ""
if ($clientSecret) {
    Write-Host "Local Development:" -ForegroundColor Cyan
    Write-Host "  Client credentials saved to .env file"
    Write-Host "  CLIENT_ID: $clientId"
    Write-Host "  TENANT_ID: $tenantId"
    Write-Host "  You can now test deployments locally with all configured environments"
}

