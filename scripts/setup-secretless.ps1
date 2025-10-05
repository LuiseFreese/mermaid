#!/usr/bin/env pwsh

<#
.SYNOPSIS
    🚀 Complete Secretless Setup for Mermaid → Dataverse on Azure

.DESCRIPTION
    This script sets up a complete secretless deployment using:
    - App Registration with Federated Credentials (no client secrets)
    - User-Assigned Managed Identity
    - Azure Infrastructure via Bicep
    - Dataverse Application User with proper permissions
    - Azure AD App Registration for user authentication
    
    Configuration values are stored in App Service settings (not Key Vault secrets).
    Everything is idempotent - safe to run multiple times.

.EXAMPLE
    # Interactive mode (recommended for first-time setup)
    .\scripts\setup-secretless.ps1

.EXAMPLE
    # Unattended mode (for CI/CD)
    .\scripts\setup-secretless.ps1 -Unattended -DataverseUrl "https://org12345.crm4.dynamics.com" -PowerPlatformEnvironmentId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -ResourceGroup "rg-mermaid-dev" -Location "westeurope"

.NOTES
    Prerequisites:
    - Azure CLI installed and logged in (az login)
    - Power Platform Admin or Dataverse System Admin access
    - No secrets needed - fully managed identity based!
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)] [switch]$Unattended,
    [Parameter(Mandatory = $false)] [string]$DataverseUrl,
    [Parameter(Mandatory = $false)] [string]$PowerPlatformEnvironmentId,
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

# ---------- 7. Interactive Dataverse Configuration ----------
if (-not $DataverseUrl -and -not $Unattended) {
    Write-Info "Dataverse Configuration Setup"
    Write-Host ""
    Write-Host "Please provide your Dataverse environment URL."
    Write-Host "You can find this in the Power Platform Admin Center:"
    Write-Host "  1. Go to https://admin.powerplatform.microsoft.com/"
    Write-Host "  2. Select your environment"
    Write-Host "  3. Copy the Environment URL (e.g., https://yourorg.crm4.dynamics.com/)"
    Write-Host ""
    
    do {
        $DataverseUrl = Read-Host "Enter Dataverse URL"
        if (-not $DataverseUrl -or -not $DataverseUrl.StartsWith("https://")) {
            Write-Warning "Please enter a valid HTTPS URL"
        }
    } while (-not $DataverseUrl -or -not $DataverseUrl.StartsWith("https://"))
    
    # Ensure URL ends with /
    if (-not $DataverseUrl.EndsWith("/")) {
        $DataverseUrl = $DataverseUrl + "/"
    }
    
    Write-Host ""
    Write-Info "Power Platform Environment ID is needed to generate solution links."
    Write-Info "You can find this in the Power Platform Admin Center or in your environment URL."
    
    do {
        $PowerPlatformEnvironmentId = Read-Host "Enter Power Platform Environment ID"
        if (-not $PowerPlatformEnvironmentId -or $PowerPlatformEnvironmentId.Length -ne 36) {
            Write-Warning "Please enter a valid GUID (36 characters with dashes)"
        }
    } while (-not $PowerPlatformEnvironmentId -or $PowerPlatformEnvironmentId.Length -ne 36)
}

if ($DataverseUrl) {
    Write-Info "Setting Dataverse URL configuration..."
    az webapp config appsettings set --name $AppServiceName --resource-group $ResourceGroup --settings `
        "DATAVERSE_URL=$DataverseUrl" | Out-Null
    Write-Success "Dataverse URL configured: $DataverseUrl"
    
    # Update local .env file
    Update-EnvFile -Key "DATAVERSE_URL" -Value $DataverseUrl
}

if ($PowerPlatformEnvironmentId) {
    Write-Info "Setting Power Platform Environment ID configuration..."
    az webapp config appsettings set --name $AppServiceName --resource-group $ResourceGroup --settings `
        "POWER_PLATFORM_ENVIRONMENT_ID=$PowerPlatformEnvironmentId" | Out-Null
    Write-Success "Power Platform Environment ID configured: $PowerPlatformEnvironmentId"
    
    # Update local .env file
    Update-EnvFile -Key "POWER_PLATFORM_ENVIRONMENT_ID" -Value $PowerPlatformEnvironmentId
}

# ---------- 8. Setup Azure AD App Registration (for Authentication) ----------
Write-Info "🔐 Setting up Azure AD authentication..."

# Check if Azure AD App Registration already exists
$azureAdAppName = "mermaid-user-auth-$EnvironmentSuffix"
$existingAzureAdApp = az ad app list --display-name $azureAdAppName --query "[0]" -o json 2>$null | ConvertFrom-Json

if ($existingAzureAdApp) {
    Write-Success "Azure AD App Registration already exists: $azureAdAppName"
    $azureAdClientId = $existingAzureAdApp.appId
    $azureAdTenantId = (az account show --query "tenantId" -o tsv)
} else {
    Write-Info "Creating Azure AD App Registration for authentication: $azureAdAppName"
    
    # Get tenant ID
    $azureAdTenantId = az account show --query "tenantId" -o tsv
    
    # Get the App Service URL for redirect URI
    $appServiceUrl = az webapp show --name $AppServiceName --resource-group $ResourceGroup --query "defaultHostName" -o tsv
    $redirectUri = "https://$appServiceUrl"
    
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
    
    # Configure SPA platform settings using Microsoft Graph API
    Write-Info "   └─ Configuring SPA platform..."
    $spaConfigFile = [System.IO.Path]::GetTempFileName()
    try {
        # Create SPA configuration JSON
        @{ spa = @{ redirectUris = @($redirectUri) } } | ConvertTo-Json -Depth 3 | Out-File $spaConfigFile -Encoding utf8
        
        # Apply configuration using Graph API
        az rest --method PATCH `
            --uri "https://graph.microsoft.com/v1.0/applications/$azureAdAppObjectId" `
            --headers "Content-Type=application/json" `
            --body "@$spaConfigFile" `
            --output none
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Failed to configure SPA platform via Graph API"
        } else {
            Write-Success "SPA platform configured successfully"
        }
    } finally {
        Remove-Item $spaConfigFile -Force -ErrorAction SilentlyContinue
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

Write-Success "Authentication configured"
Write-Info "   └─ Azure AD Client ID: $azureAdClientId"
Write-Info "   └─ Azure AD Tenant ID: $azureAdTenantId"
Write-Info "   └─ Redirect URI: https://$appServiceUrl"
Write-Info "   └─ App Service setting AUTH_ENABLED: true"

# ---------- 9. Create Dataverse Application User ----------
if (-not $SkipDataverseUser -and $DataverseUrl) {
    Write-Info "👤 Creating Dataverse Application User..."
    
    try {
        # Get admin access token
        Write-Info "Getting admin access token..."
        $envBase = $DataverseUrl.TrimEnd('/')
        $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
        
        if (-not $accessToken -or $accessToken.Length -lt 100) {
            throw "Could not obtain admin access token. Ensure you're logged in as a Dataverse admin."
        }
        
        Write-Success "Access token obtained"
        
        # Set up headers
        $jsonHeaders = @{
            "Authorization"    = "Bearer $accessToken"
            "Content-Type"     = "application/json"
            "Accept"           = "application/json"
            "OData-MaxVersion" = "4.0"
            "OData-Version"    = "4.0"
        }
        
        # Get root Business Unit
        Write-Info "Resolving root Business Unit..."
        $buUrl = "$envBase/api/data/v9.2/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null"
        $bu = Invoke-RestMethod -Uri $buUrl -Headers $jsonHeaders -Method Get
        
        if (-not $bu.value -or $bu.value.Count -lt 1) {
            throw "Root Business Unit not found"
        }
        
        $rootBuId = $bu.value[0].businessunitid
        $rootBuName = $bu.value[0].name
        Write-Success "Root BU: $rootBuName ($rootBuId)"
        
        # Check for existing Application User
        Write-Info "Checking for existing Application User..."
        $filter = "applicationid eq $clientId or azureactivedirectoryobjectid eq $servicePrincipalObjectId"
        $userUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid,domainname&`$filter=$filter"
        $existing = Invoke-RestMethod -Uri $userUrl -Headers $jsonHeaders -Method Get
        
        $userId = $null
        if ($existing.value -and $existing.value.Count -gt 0) {
            $userId = $existing.value[0].systemuserid
            Write-Success "Found existing Application User: $userId"
            
            # Update the azureactivedirectoryobjectid if needed
            if (-not $existing.value[0].azureactivedirectoryobjectid -or $existing.value[0].azureactivedirectoryobjectid -ne $servicePrincipalObjectId) {
                Write-Info "Updating Service Principal Object ID..."
                $patchBody = @{ azureactivedirectoryobjectid = $servicePrincipalObjectId } | ConvertTo-Json -Depth 3
                Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)" -Headers $jsonHeaders -Method Patch -Body $patchBody -ContentType "application/json"
                Write-Success "Service Principal Object ID updated"
            }
        } else {
            # Create new Application User
            Write-Info "Creating new Application User..."
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
            
            Write-Success "Application User created: $userId"
        }
        
        # Resolve and assign security role
        Write-Info "Resolving security role '$SecurityRole'..."
        $roleNameEsc = $SecurityRole.Replace("'", "''")
        $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name,_businessunitid_value&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
        $roleResp = Invoke-RestMethod -Uri $rolesUrl -Headers $jsonHeaders -Method Get
        
        if (-not $roleResp.value -or $roleResp.value.Count -lt 1) {
            throw "Security Role '$SecurityRole' not found in root Business Unit"
        }
        
        $roleId = $roleResp.value[0].roleid
        Write-Success "Role found: $SecurityRole ($roleId)"
        
        # Check if user already has the role
        Write-Info "Checking existing role assignments..."
        $hasRole = $false
        try {
            $checkUserRoles = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association?`$select=roleid" -Headers $jsonHeaders -Method Get
            if ($checkUserRoles.value) {
                $hasRole = $null -ne ($checkUserRoles.value | Where-Object { $_.roleid -eq $roleId })
            }
        } catch {
            Write-Warning "Could not check existing roles: $_"
        }
        
        if (-not $hasRole) {
            Write-Info "Assigning security role '$SecurityRole'..."
            $assignBody = @{ "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)" } | ConvertTo-Json
            Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref" -Headers $jsonHeaders -Method Post -Body $assignBody -ContentType "application/json"
            Write-Success "Security role assigned!"
        } else {
            Write-Success "User already has the required role"
        }
        
        Write-Success "Dataverse Application User setup completed successfully!"
        Write-Info "   User ID: $userId"
        Write-Info "   Role: $SecurityRole"
        Write-Info "   Business Unit: $rootBuName"
        
    } catch {
        Write-Error "❌ Failed to create Dataverse Application User: $_"
        Write-Warning "Please ensure:"
        Write-Warning "  1. You're logged in as a Dataverse System Administrator"
        Write-Warning "  2. The environment URL is correct"
        Write-Warning "  3. The App Registration and Service Principal exist"
        Write-Warning ""
        Write-Warning "You can complete this step manually or run the separate script:"
        Write-Warning "  .\scripts\debug\create-dataverse-user.ps1 -EnvironmentUrl `"$DataverseUrl`" -AppId `"$clientId`" -ServicePrincipalObjectId `"$servicePrincipalObjectId`""
    }
}

# ---------- 10. Configure Application Logging ----------
Write-Step "Configuring application logging"
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
Write-Host "  Azure Resources: Deployed to $ResourceGroup"
Write-Host "  App Service: $AppServiceName (Node.js 20)"
Write-Host "  Managed Identity: $ManagedIdentityName ($managedIdentityClientId)"
Write-Host "  Federated Credential: Configured for managed identity"
Write-Host "  Configuration: Stored in App Service settings (no secrets!)"
Write-Host "  Application Logging: Enabled at Information level"
Write-Host "  Authentication: Azure AD App Registration configured ($azureAdAppName)"
Write-Host "    └─ Client ID: $azureAdClientId"
Write-Host "    └─ AUTH_ENABLED: true"

if ($DataverseUrl) {
    Write-Host "  Dataverse URL: $DataverseUrl"
    if (-not $SkipDataverseUser) {
        Write-Host "  Dataverse Application User: Created and role assigned"
    }
}

Write-Host ""
Write-Host "Next Step:" -ForegroundColor Green
Write-Host "Deploy your application: .\scripts\deploy-secretless.ps1 -EnvironmentSuffix `"$EnvironmentSuffix`""
Write-Host ""
Write-Host "Authentication Info:" -ForegroundColor Cyan
Write-Host "  Users will need to sign in with Microsoft credentials"
Write-Host "  Redirect URI configured: https://$appServiceUrl"
Write-Host "  Local dev can use AUTH_ENABLED=false for testing"

