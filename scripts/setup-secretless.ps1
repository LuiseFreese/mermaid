#!/usr/bin/env pwsh

<#
.SYNOPSIS
    🚀 Complete Secretless Setup for Mermaid → Dataverse on Azure

.DESCRIPTION
    This script sets up a complete secretless deployment using:
    - App Registration with FeWrite-Host "Setting App Service configuration..." -ForegroundColor Yellow
az webapp config appsettings set --name $            $body = @{
                applicationid               = $AppId
                azureactivedirectoryobjectid= $ServicePrincipalObjectId
                "businessunitid@odata.bind" = "/businessunits($rootBuId)"
                firstname                   = "App"
                lastname                    = "$EnvironmentSuffix Service"
                domainname                  = "app-$($AppId.ToLower())@mermaid.local"
            } | ConvertTo-Json -Depth 5ceName --resource-group $ResourceGroup --settings `
    "TENANT_ID=$tenantId" `
    "CLIENT_ID=$clientId" `
    "MANAGED_IDENTITY_CLIENT_ID=$managedIdentityClientId" `
    "USE_MANAGED_IDENTITY=true" `
    "USE_FEDERATED_CREDENTIAL=true" | Out-Null

Write-Host "Setting startup command for Node.js..." -ForegroundColor Yellow
az webapp config set --name $AppServiceName --resource-group $ResourceGroup --startup-file "node server.js" | Out-Null

Write-Success "App Service configuration completed"redentials (no client secrets)
    - Managed Identity (user-assigned)
    - Azure Infrastructure via Bicep
    - Dataverse Application User with proper permissions
    
    Configuration values are stored in App Service settings (not Key Vault secrets).
    Everything is idempotent - safe to run multiple times.

.EXAMPLE
    # Interactive mode (recommended for first-time setup)
    .\scripts\setup-secretless.ps1

.EXAMPLE
    # Unattended mode (for CI/CD)
    .\scripts\setup-secretless.ps1 -Unattended -DataverseUrl "https://org12345.crm4.dynamics.com" -ResourceGroup "rg-mermaid-dev" -Location "westeurope"

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
    $AppRegistrationName = "Mermaid-Dataverse-Converter-$EnvironmentSuffix" 
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
}

if ($DataverseUrl) {
    Write-Info "Setting Dataverse URL configuration..."
    az webapp config appsettings set --name $AppServiceName --resource-group $ResourceGroup --settings `
        "DATAVERSE_URL=$DataverseUrl" | Out-Null
    Write-Success "Dataverse URL configured: $DataverseUrl"
}

# ---------- 8. Create Dataverse Application User ----------
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

# ---------- 9. Summary ----------
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

if ($DataverseUrl) {
    Write-Host "  Dataverse URL: $DataverseUrl"
    if (-not $SkipDataverseUser) {
        Write-Host "  Dataverse Application User: Created and role assigned"
    }
}

Write-Host ""
Write-Host "Next Step:" -ForegroundColor Green
Write-Host "Deploy your application: .\scripts\deploy-secretless.ps1 -EnvironmentSuffix `"$EnvironmentSuffix`""

