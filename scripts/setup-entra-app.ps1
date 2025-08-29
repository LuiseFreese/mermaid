#!/usr/bin/env pwsh

<#
.SYNOPSIS
    🚀 MAIN ENTRY POINT: Complete setup for Mermaid → Dataverse on Azure

.DESCRIPTION
    This is the main setup script that handles everything:
    - ✅ Creates/reuses Entra App Registration + Service Principal
    - ✅ Deploys infrastructure (App Service, Key Vault, Managed Identity) via Bicep
    - ✅ Stores secrets securely in Key Vault
    - ✅ Deploys the application using az webapp up
    - ✅ Creates Dataverse Application User with proper permissions
    - ✅ Everything is idempotent - safe to run multiple times

.EXAMPLE
    # Interactive mode (recommended for first-time setup)
    .\scripts\setup-entra-app.ps1

.EXAMPLE
    # Unattended mode (for CI/CD)
    .\scripts\setup-entra-app.ps1 -Unattended -EnvironmentUrl "https://org12345.crm4.dynamics.com" -ResourceGroup "rg-mermaid" -Location "westeurope"

.NOTES
    Prerequisites:
    - Azure CLI installed and logged in (az login)
    - Power Platform Admin or Dataverse System Admin access
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)] [switch]$Unattended,
    [Parameter(Mandatory = $false)] [string]$EnvironmentUrl,
    [Parameter(Mandatory = $false)] [string]$ResourceGroup,
    [Parameter(Mandatory = $false)] [string]$Location,
    [Parameter(Mandatory = $false)] [string]$AppRegistrationName,
    [Parameter(Mandatory = $false)] [string]$AppServiceName,
    [Parameter(Mandatory = $false)] [string]$KeyVaultName,
    [Parameter(Mandatory = $false)] [string]$ManagedIdentityName,
    [Parameter(Mandatory = $false)] [string]$AppServicePlanName,
    [Parameter(Mandatory = $false)] [string]$SecurityRole,
    [Parameter(Mandatory = $false)] [switch]$SkipDataverseUser,
    [Parameter(Mandatory = $false)] [switch]$DryRun
)

# ---------- Output helpers ----------
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Info    { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error   { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Get-UserInput {
    param([string]$Prompt,[string]$DefaultValue="",[switch]$Required,[string[]]$ValidValues=@())
    do {
        $promptText = $Prompt
        if ($DefaultValue) { $promptText += " [$DefaultValue]" }
        $promptText += ": "
        $userInput = Read-Host $promptText
        if ([string]::IsNullOrWhiteSpace($userInput) -and $DefaultValue) { $userInput = $DefaultValue }
        if ($ValidValues.Count -gt 0 -and $userInput -notin $ValidValues) { Write-Warning "Please enter one of: $($ValidValues -join ', ')"; continue }
        if ($Required -and [string]::IsNullOrWhiteSpace($userInput)) { Write-Warning "This field is required."; continue }
        return $userInput
    } while ($true)
}

# ---------- Configuration ----------
function Get-Configuration {
    if ($Unattended) {
        Write-Info "Running in unattended mode..."
        if (-not $EnvironmentUrl) { throw "EnvironmentUrl is required for unattended mode" }
        if (-not $ResourceGroup)  { throw "ResourceGroup is required for unattended mode" }
        if (-not $Location)       { throw "Location is required for unattended mode" }
        if ($EnvironmentUrl -notmatch '^https://[^.]+\.crm[0-9]*\.dynamics\.com/?$') {
            throw "Invalid EnvironmentUrl format. Expected: https://orgXXXXX.crm4.dynamics.com (found: $EnvironmentUrl)"
        }
        $EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')

        return @{
            EnvironmentUrl     = $EnvironmentUrl
            ResourceGroup      = $ResourceGroup
            Location           = $Location
            AppRegistrationName= if ($AppRegistrationName) { $AppRegistrationName } else { "Mermaid-Dataverse-Converter" }
            AppServiceName     = if ($AppServiceName)      { $AppServiceName }      else { "app-mermaid-converter-$(Get-Random -Minimum 1000 -Maximum 9999)" }
            KeyVaultName       = if ($KeyVaultName)        { $KeyVaultName }        else { "kv-mermaid-secrets-$(Get-Random -Minimum 1000 -Maximum 9999)" }
            ManagedIdentityName= if ($ManagedIdentityName) { $ManagedIdentityName } else { "mi-mermaid-dataverse" }
            AppServicePlanName = if ($AppServicePlanName)  { $AppServicePlanName }  else { "plan-mermaid-dataverse" }
            SecurityRole       = if ($SecurityRole)        { $SecurityRole }        else { "System Administrator" }
        }
    }

    Write-Host ""
    Write-Host "Mermaid to Dataverse - Interactive Setup" -ForegroundColor Magenta
    Write-Host "===========================================" -ForegroundColor Magenta
    Write-Host ""
    Write-Info "This script will help you set up all required Azure resources."
    Write-Info "Existing resources will be reused. Only missing resources will be created."
    Write-Host ""

    Write-Info "Find your Dataverse Web API endpoint (e.g., https://orgXXXXX.crm4.dynamics.com)"
    $envUrl = Get-UserInput "Dataverse Environment URL" -Required
    $envUrl = $envUrl.TrimEnd('/')
    if ($envUrl -notmatch '^https://[^.]+\.crm[0-9]*\.dynamics\.com$') {
        Write-Warning "The URL format seems incorrect. Expected format: https://orgXXXXX.crm4.dynamics.com"
    }

    $resourceGroup = Get-UserInput "Resource Group Name" "rg-mermaid-dataverse" -Required

    $locations = @("eastus","westus2","westeurope","northeurope","uksouth","australiaeast")
    Write-Host "Available locations: $($locations -join ', ')" -ForegroundColor Yellow
    $location = Get-UserInput "Azure Region" "westeurope" -Required -ValidValues $locations
    $locationNormalized = $location.ToLower().Replace(" ", "")

    Write-Host ""
    Write-Info "Resource Naming:"
    $appRegName         = Get-UserInput "App Registration Name" "Mermaid-Dataverse-Converter" -Required
    $appServiceName     = Get-UserInput "App Service Name" "app-mermaid-converter-$(Get-Random -Minimum 1000 -Maximum 9999)" -Required
    $randomSuffix       = Get-Random -Minimum 1000 -Maximum 9999
    $keyVaultName       = Get-UserInput "Key Vault Name" "kv-mermaid-secrets-$randomSuffix" -Required
    $managedIdentity    = Get-UserInput "Managed Identity Name" "mi-mermaid-dataverse" -Required
    $planName           = Get-UserInput "App Service Plan Name" "plan-mermaid-dataverse" -Required

    Write-Host ""
    Write-Info "Dataverse Configuration:"
    $roles = @("System Administrator", "System Customizer")
    Write-Host "Available roles: $($roles -join ', ')" -ForegroundColor Yellow
    $securityRole       = Get-UserInput "Security Role for Application User" "System Administrator" -Required -ValidValues $roles

    return @{
        EnvironmentUrl     = $envUrl
        ResourceGroup      = $resourceGroup
        Location           = $locationNormalized
        AppRegistrationName= $appRegName
        AppServiceName     = $appServiceName
        KeyVaultName       = $keyVaultName
        ManagedIdentityName= $managedIdentity
        AppServicePlanName = $planName
        SecurityRole       = $securityRole
    }
}

# ---------- Prerequisites ----------
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Error "Azure CLI not found. Install with: winget install Microsoft.AzureCLI"
        return $false
    }
    $account = az account show 2>$null | ConvertFrom-Json
    if (-not $account) {
        Write-Error "Please login to Azure CLI: az login"
        return $false
    }
    Write-Success "Logged in as: $($account.user.name)"
    Write-Success "Subscription: $($account.name)"
    return $true
}

# ---------- Azure AD / App Registration helpers ----------
function Get-ServicePrincipalObjectId {
    param([Parameter(Mandatory)][string]$AppId)
    $spId = az ad sp list --filter "appId eq '$AppId'" --query "[0].id" -o tsv
    if (-not $spId) {
        Write-Info "Creating service principal for appId $AppId..."
        az ad sp create --id $AppId --output none
        $spId = az ad sp list --filter "appId eq '$AppId'" --query "[0].id" -o tsv
        if (-not $spId) { throw "Could not resolve service principal objectId for appId $AppId" }
    }
    return $spId
}

function Get-OrCreateAppRegistration {
    param($AppRegistrationName)
    Write-Info "Checking for existing App Registration: $AppRegistrationName"

    if ($DryRun) {
        Write-Warning "[DRY RUN] Would check/create app registration: $AppRegistrationName"
        return @{ appId="00000000-0000-0000-0000-000000000000"; objectId="00000000-0000-0000-0000-000000000000"; existed=$false }
    }

    try {
        $existingApp = az ad app list --display-name $AppRegistrationName --query "[0]" | ConvertFrom-Json
        if ($existingApp) {
            Write-Success "Found existing App Registration: $($existingApp.appId)"
            return @{ appId=$existingApp.appId; objectId=$existingApp.id; existed=$true }
        }
        Write-Info "Creating new App Registration: $AppRegistrationName"
        $app = az ad app create --display-name $AppRegistrationName --sign-in-audience AzureADMyOrg | ConvertFrom-Json
        Write-Success "App Registration created: $($app.appId)"
        return @{ appId=$app.appId; objectId=$app.id; existed=$false }
    } catch { Write-Error "Failed to get/create app registration: $_"; throw }
}

function Get-OrCreateClientSecret {
    param([Parameter(Mandatory)][string]$AppId,[bool]$ForceNew = $false)
    if ($ForceNew) { Write-Info "Generating new client secret..." } else { Write-Info "Checking client secret for App Registration..." }
    if ($DryRun) { Write-Warning "[DRY RUN] Would check/create client secret for app: $AppId"; return "fake-secret-for-dry-run" }

    try {
        $appExists = $null -ne (az ad app show --id $AppId --query "appId" -o tsv 2>$null)
        if ($ForceNew -or $appExists) {
            $credential = az ad app credential reset --id $AppId --years 2 2>$null | ConvertFrom-Json
            if (-not $credential -or -not $credential.password) { throw "Failed to generate client secret" }
            Write-Success "Client secret generated (expires: 2 years)"
            return $credential.password
        } else {
            Write-Warning "App registration not found. Cannot generate secret."
            return $null
        }
    } catch { Write-Error "Failed to create client secret: $_"; throw }
}

# ---------- Resource Group ----------
function Get-OrCreateResourceGroup {
    param($ResourceGroupName,$Location)
    Write-Info "Checking for existing Resource Group: $ResourceGroupName"
    if ($DryRun) { Write-Warning "[DRY RUN] Would check/create resource group: $ResourceGroupName"; return }

    try {
        $existingRG = az group show --name $ResourceGroupName 2>$null | ConvertFrom-Json
        if ($existingRG) {
            Write-Success "Found existing Resource Group: $ResourceGroupName in $($existingRG.location)"
            $normalizedExisting = $existingRG.location.ToLower().Replace(" ", "")
            $normalizedRequested= $Location.ToLower().Replace(" ", "")
            if ($normalizedExisting -ne $normalizedRequested) {
                Write-Warning "Resource Group is in $($existingRG.location), but you specified $Location"
                if (-not $Unattended) {
                    $useExisting = Get-UserInput "Use existing location $($existingRG.location)? (y/n)" "y" -ValidValues @("y","n")
                    if ($useExisting -eq "n") { throw "Cannot change location of existing Resource Group. Use a different name." }
                }
            }
        } else {
            Write-Info "Creating new Resource Group: $ResourceGroupName in $Location"
            az group create --name $ResourceGroupName --location $Location --output none
            Write-Success "Resource Group created: $ResourceGroupName"
        }
    } catch { Write-Error "Failed to get/create resource group: $_"; throw }
}

# ---------- Infra deployment (Bicep) ----------
function Invoke-InfrastructureDeployment {
    param($ResourceGroup,$Location,$Config)
    Write-Info "Deploying infrastructure using Bicep..."

    if ($DryRun) {
        Write-Warning "[DRY RUN] Would deploy infrastructure to resource group: $ResourceGroup"
        return @{
            keyVaultUri             = "https://kv-fake-dry-run.vault.azure.net/"
            keyVaultName            = $Config.KeyVaultName
            managedIdentityClientId = "00000000-0000-0000-0000-000000000000"
            appServiceName          = $Config.AppServiceName
            appServiceUrl           = "https://fake-dry-run.azurewebsites.net"
            appServicePlanName      = $Config.AppServicePlanName
        }
    }

    try {
        $deploymentName = "mermaid-deployment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        $repoRoot = Split-Path -Parent $PSScriptRoot
        $bicepFile = Join-Path $repoRoot "deploy/infrastructure.bicep"
        if (-not (Test-Path $bicepFile)) { Write-Error "Bicep template not found at: $bicepFile"; throw "Bicep template not found" }

        # Purge soft-deleted KV with same name to avoid conflicts
        Write-Info "Checking for soft-deleted Key Vault: $($Config.KeyVaultName)"
        $deletedVault = az keyvault list-deleted --query "[?name=='$($Config.KeyVaultName)']" | ConvertFrom-Json
        if ($deletedVault -and $deletedVault.Length -gt 0) {
            Write-Warning "Found soft-deleted Key Vault: $($Config.KeyVaultName). Purging..."
            az keyvault purge --name $($Config.KeyVaultName) --no-wait
            Start-Sleep -Seconds 60
            Write-Success "Soft-deleted Key Vault purge initiated"
        }

        $paramArgs = @(
          "--parameters","appName=Mermaid",
          "--parameters","location=$Location",
          "--parameters","environment=prod",
          "--parameters","keyVaultName=$($Config.KeyVaultName)",
          "--parameters","managedIdentityName=$($Config.ManagedIdentityName)",
          "--parameters","appServiceName=$($Config.AppServiceName)",
          "--parameters","appServicePlanName=$($Config.AppServicePlanName)"
        )

        Write-Info "Deploying infrastructure (this may take a few minutes)..."
        az deployment group create --resource-group $ResourceGroup --template-file $bicepFile @paramArgs --name $deploymentName --only-show-errors --output none
        $deployment = az deployment group show --resource-group $ResourceGroup --name $deploymentName --query properties.outputs --output json | ConvertFrom-Json
        Write-Success "Infrastructure deployment completed successfully"

        return @{
            keyVaultUri             = $deployment.keyVaultUri.value
            keyVaultName            = $deployment.keyVaultName.value
            managedIdentityClientId = $deployment.managedIdentityClientId.value
            appServiceName          = $deployment.appServiceName.value
            appServiceUrl           = $deployment.appServiceUrl.value
            appServicePlanName      = $deployment.appServicePlanName.value
        }
    } catch { Write-Error "Failed to deploy infrastructure: $_"; throw }
}

# ---------- Key Vault secrets ----------
function Set-KeyVaultSecrets {
    param($KeyVaultName,$AppId,$ClientSecret,$EnvironmentUrl,$ResourceGroup)
    Write-Info "Storing secrets in Key Vault..."
    if ($DryRun) { Write-Warning "[DRY RUN] Would store secrets: DATAVERSE-URL, CLIENT-ID, CLIENT-SECRET, TENANT-ID, SOLUTION-NAME"; return }

    try {
        $normalizedUrl = $EnvironmentUrl.TrimEnd('/')
        $currentUser   = az ad signed-in-user show --query "id" -o tsv
        $subscriptionId= az account show --query 'id' -o tsv
        $keyVaultScope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.KeyVault/vaults/$KeyVaultName"

        Write-Info "Granting temporary Key Vault Administrator role to current user..."
        $assignmentId = az role assignment create --assignee $currentUser --role "Key Vault Administrator" --scope $keyVaultScope --query id -o tsv
        Write-Info "Waiting for permissions to propagate..."
        Start-Sleep -Seconds 15

        $tenant = az account show --query "tenantId" -o tsv

        az keyvault secret set --vault-name $KeyVaultName --name "DATAVERSE-URL" --value $normalizedUrl --output none
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-ID"     --value $AppId        --output none
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-SECRET" --value $ClientSecret --output none
        az keyvault secret set --vault-name $KeyVaultName --name "TENANT-ID"     --value $tenant       --output none
        az keyvault secret set --vault-name $KeyVaultName --name "SOLUTION-NAME" --value "MermaidSolution" --output none

        Write-Success "Secrets stored in Key Vault successfully"
        return @{ AssignmentId = $assignmentId }
    } catch { Write-Error "Failed to store secrets in Key Vault: $_"; throw }
}

# ---------- .env ----------
function Update-EnvFile {
    param($AppId,$ClientSecret,$EnvironmentUrl,$KeyVaultName)
    Write-Info "Updating .env file with configuration..."
    if ($DryRun) { Write-Warning "[DRY RUN] Would update .env file with new credentials"; return }

    try {
        $scriptPath = $PSScriptRoot
        $projectRoot = if ($scriptPath -like "*\scripts") { Split-Path -Parent $scriptPath } else { $scriptPath }
        $envFile = Join-Path $projectRoot ".env"
        $tenant  = az account show --query "tenantId" -o tsv
        $normalizedUrl = $EnvironmentUrl.TrimEnd('/')

        $envContent = @"
# Mermaid to Dataverse Converter Configuration
# Generated on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

DATAVERSE_URL=$normalizedUrl

CLIENT_ID=$AppId
CLIENT_SECRET=$ClientSecret
TENANT_ID=$tenant

SOLUTION_NAME=MermaidSolution

USE_KEY_VAULT=true
KEY_VAULT_NAME=$KeyVaultName
"@
        $envContent | Out-File -FilePath $envFile -Encoding UTF8 -Force
        Write-Success "Configuration saved to .env file"

        $envExampleContent = $envContent -replace '=.*','=YOUR_VALUE_HERE'
        $envExampleFile = Join-Path $projectRoot ".env.example"
        $envExampleContent | Out-File -FilePath $envExampleFile -Encoding UTF8 -Force
        Write-Info "Example configuration saved to .env.example"
    } catch { Write-Error "Failed to update .env file: $_"; throw }
}

# ---------- Deploy code ----------
function Deploy-Application {
    param($AppServiceName,$ResourceGroup,$AppServicePlanName)
    Write-Info "Deploying application to Azure App Service..."
    if ($DryRun) { Write-Warning "[DRY RUN] Would deploy application to App Service: $AppServiceName"; return }

    try {
        $projectRoot = Split-Path -Parent $PSScriptRoot
        Set-Location $projectRoot
        
        Write-Info "Deploying application using az webapp up..."
        az webapp up --resource-group $ResourceGroup --name $AppServiceName --plan $AppServicePlanName --runtime "NODE:20-lts" --sku B1 --only-show-errors
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Application deployed successfully"
            Write-Info "🌐 App URL: https://$AppServiceName.azurewebsites.net/"
            Write-Info "❤️ Health: https://$AppServiceName.azurewebsites.net/health"
        } else {
            throw "az webapp up failed with exit code $LASTEXITCODE"
        }
    } catch { 
        Write-Error "Failed to deploy application: $_"
        throw 
    }
}

# ---------- NEW: Ensure Dataverse Application User (idempotent) ----------
function Ensure-DataverseApplicationUser {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)] [string]$EnvironmentUrl,
        [Parameter(Mandatory = $true)] [string]$AppId,                       # Entra App Registration (clientId)
        [Parameter(Mandatory = $true)] [string]$ServicePrincipalObjectId,    # AAD Service Principal objectId
        [Parameter(Mandatory = $true)] [string]$SecurityRole                 # e.g. "System Administrator"
    )

    if ($DryRun) {
        Write-Warning "[DRY RUN] Would ensure Dataverse Application User & assign role '$SecurityRole' in $EnvironmentUrl"
        return $true
    }

    Write-Info "Ensuring Dataverse Application User exists (role '$SecurityRole')..."
    $envBase = $EnvironmentUrl.TrimEnd('/')

    Write-Info "Getting admin access token for $envBase ..."
    $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
    if (-not $accessToken -or $accessToken.Length -lt 100) {
        throw "Could not obtain admin access token for '$envBase'. Ensure your signed-in account is Dataverse admin."
    }

    $jsonHeaders = @{
        "Authorization"    = "Bearer $accessToken"
        "Content-Type"     = "application/json"
        "Accept"           = "application/json"
        "OData-MaxVersion" = "4.0"
        "OData-Version"    = "4.0"
    }
    function Invoke-DvGet($url) {
        Invoke-RestMethod -Uri ([uri]::EscapeUriString($url)) -Headers $jsonHeaders -Method Get
    }

    # Root BU
    Write-Info "Resolving root Business Unit..."
    $bu = Invoke-DvGet "$envBase/api/data/v9.2/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null"
    if (-not $bu.value -or $bu.value.Count -lt 1) { throw "Root BU not found in $envBase." }
    $rootBuId   = $bu.value[0].businessunitid
    $rootBuName = $bu.value[0].name
    Write-Info "Root BU: $rootBuName ($rootBuId)"

    # Existing user?
    Write-Info "Checking for existing Application User..."
    $filter = "applicationid eq $AppId or azureactivedirectoryobjectid eq $ServicePrincipalObjectId"
    $existing = Invoke-DvGet "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid,domainname&`$filter=$filter"

    $userId = $null
    if ($existing.value -and $existing.value.Count -gt 0) {
        $userId = $existing.value[0].systemuserid
        Write-Success "Found existing Application User (systemuserid: $userId)"
        if (-not $existing.value[0].azureactivedirectoryobjectid -or $existing.value[0].azureactivedirectoryobjectid -ne $ServicePrincipalObjectId) {
            Write-Info "Patching user with azureactivedirectoryobjectid..."
            $patchBody = @{ azureactivedirectoryobjectid = $ServicePrincipalObjectId } | ConvertTo-Json -Depth 3
            Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)" -Headers $jsonHeaders -Method Patch -Body $patchBody -ContentType "application/json"
            Write-Success "User patched with Service Principal ObjectId."
        }
    } else {
        # Create new user in root BU
        Write-Info "Creating new Application User in root BU..."
        $body = @{
            applicationid               = $AppId
            azureactivedirectoryobjectid= $ServicePrincipalObjectId
            "businessunitid@odata.bind" = "/businessunits($rootBuId)"
            firstname                   = "Mermaid"
            lastname                    = "Service Principal"
            domainname                  = "app-$($AppId.ToLower())@mermaid.local"
        } | ConvertTo-Json -Depth 5

        $hdr = $jsonHeaders.Clone(); $hdr["Prefer"] = "return=representation"
        $resp = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers" -Headers $hdr -Method Post -Body $body -ContentType "application/json"
        $userId = $resp.systemuserid
        if (-not $userId) { throw "Dataverse did not return a systemuserid for the created Application User." }
        Write-Success "Application User created (systemuserid: $userId)"
    }

    # Resolve role in root BU & assign
    $roleNameEsc = $SecurityRole.Replace("'", "''")
    Write-Info "Resolving role '$SecurityRole' in root BU..."
    $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name,_businessunitid_value&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
    $roleResp = Invoke-DvGet $rolesUrl
    if (-not $roleResp.value -or $roleResp.value.Count -lt 1) { throw "Security Role '$SecurityRole' not found in root BU '$rootBuName'." }
    $roleId = $roleResp.value[0].roleid
    Write-Info "Role found: $SecurityRole ($roleId) in BU $rootBuName"

    # If user already has the role?
    $hasRole = $false
    try {
        $checkUserRoles = Invoke-DvGet "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association?`$select=roleid"
        if ($checkUserRoles.value) { $hasRole = ($checkUserRoles.value | Where-Object { $_.roleid -eq $roleId }) -ne $null }
    } catch { }

    if (-not $hasRole) {
        Write-Info "Assigning role '$SecurityRole'..."
        $assignBody = @{ "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref" -Headers $jsonHeaders -Method Post -Body $assignBody -ContentType "application/json"
        Write-Success "Role assigned."
    } else {
        Write-Info "User already has role '$SecurityRole'."
    }

    return $true
}

# ---------- Test ----------
function Test-Setup {
    param([Parameter(Mandatory)][string]$KeyVaultUri,[Parameter(Mandatory)][string]$AppId)
    Write-Info "Testing setup..."
    if ($DryRun) { Write-Warning "[DRY RUN] Would test Key Vault access"; return $true }

    $maxRetries=3; $retryCount=0; $retryDelaySeconds=30
    do {
        try {
            if ($retryCount -gt 0) { Write-Info "Retry attempt $retryCount of $maxRetries..."; Start-Sleep -Seconds $retryDelaySeconds; $retryDelaySeconds *= 2 }
            $kvName = ([System.Uri]$KeyVaultUri).Host.Split('.')[0]
            if (-not $kvName) { throw "Could not extract Key Vault name from URI: $KeyVaultUri" }
            $testSecret = az keyvault secret show --vault-name $kvName --name "CLIENT-ID" --query "value" -o tsv
            if ($testSecret -eq $AppId) { Write-Success "Key Vault access test: PASSED"; break }
            else {
                Write-Error "Key Vault access test: FAILED"
                if ($retryCount -lt $maxRetries) { Write-Warning "Key Vault access failed, waiting..."; $retryCount++; continue }
                return $false
            }
        } catch { $retryCount++; Write-Error "Setup test failed: $_"; if ($retryCount -ge $maxRetries) { return $false } }
    } while ($retryCount -lt $maxRetries)

    Write-Success "Setup test completed successfully"
    return $true
}

# ---------- Final info ----------
function Show-DeploymentInfo {
    param($KeyVaultUri,$AppId,$AppServiceUrl,$ManagedIdentityClientId)
    Write-Host ""
    if ($DryRun) {
        Write-Host "DRY RUN COMPLETED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host "Run again without -DryRun to deploy." -ForegroundColor Cyan
    } else {
        Write-Host "Setup Complete! Ready for use." -ForegroundColor Green
     }
}

# ---------- Main ----------
function Start-Setup {
    Write-Host "Mermaid to Dataverse - Interactive Setup" -ForegroundColor Magenta
    Write-Host "===========================================" -ForegroundColor Magenta
    Write-Host ""

    if (-not (Test-Prerequisites)) { exit 1 }

    try {
        $config = Get-Configuration
        Write-Host ""
        Write-Info "Configuration Summary:"
        $config.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor White }
        Write-Host ""
        if (-not $Unattended) {
            $proceed = Get-UserInput "Proceed with this configuration? (y/n)" "y" -ValidValues @("y","n")
            if ($proceed -eq "n") { Write-Info "Setup cancelled by user."; exit 0 }
        }

        Get-OrCreateResourceGroup -ResourceGroupName $config.ResourceGroup -Location $config.Location
        $app = Get-OrCreateAppRegistration -AppRegistrationName $config.AppRegistrationName
        $clientSecret = Get-OrCreateClientSecret -AppId $app.appId -ForceNew (-not $app.existed)
        if (-not $clientSecret) { Write-Error "Client secret is required but was not generated."; exit 1 }

        $spObjectId = Get-ServicePrincipalObjectId -AppId $app.appId
        $infrastructure = Invoke-InfrastructureDeployment -ResourceGroup $config.ResourceGroup -Location $config.Location -Config $config

        $kvGrant = Set-KeyVaultSecrets -KeyVaultName $infrastructure.keyVaultName -AppId $app.appId -ClientSecret $clientSecret -EnvironmentUrl $config.EnvironmentUrl -ResourceGroup $config.ResourceGroup
        Update-EnvFile -AppId $app.appId -ClientSecret $clientSecret -EnvironmentUrl $config.EnvironmentUrl -KeyVaultName $infrastructure.keyVaultName

        # Ensure Dataverse App User (idempotent) unless skipped
        if (-not $SkipDataverseUser) {
            try {
                $ok = Ensure-DataverseApplicationUser -EnvironmentUrl $config.EnvironmentUrl -AppId $app.appId -ServicePrincipalObjectId $spObjectId -SecurityRole $config.SecurityRole
                if ($ok) { Write-Success "Dataverse Application User is present and configured." }
                else     { Write-Warning "Could not ensure Dataverse Application User (returned false)." }
            } catch {
                Write-Warning "Failed to ensure Dataverse Application User: $_"
                if (-not $Unattended) {
                    $continue = Get-UserInput "Continue despite app user creation failure? (y/n)" "y" -ValidValues @("y","n")
                    if ($continue -eq "n") { throw "Aborted by user." }
                }
            }
        } else {
            Write-Warning "Skipping Dataverse Application User creation as requested (-SkipDataverseUser)."
        }

        Deploy-Application -AppServiceName $config.AppServiceName -ResourceGroup $config.ResourceGroup -AppServicePlanName $infrastructure.appServicePlanName

        if (Test-Setup -KeyVaultUri $infrastructure.keyVaultUri -AppId $app.appId) {
            if ($kvGrant.AssignmentId) {
                Write-Info "Removing temporary Key Vault Administrator role..."
                az role assignment delete --ids $kvGrant.AssignmentId --output none --only-show-errors
                Write-Success "Temporary permissions cleaned up"
            }
            Show-DeploymentInfo -KeyVaultUri $infrastructure.keyVaultUri -AppId $app.appId -AppServiceUrl $infrastructure.appServiceUrl -ManagedIdentityClientId $infrastructure.managedIdentityClientId
        } else {
            Write-Error "Setup completed but tests failed. Please review the configuration."
            if ($kvGrant.AssignmentId) {
                Write-Info "Removing temporary Key Vault Administrator role..."
                az role assignment delete --ids $kvGrant.AssignmentId --output none --only-show-errors
            }
            exit 1
        }
    } catch {
        Write-Error "Setup failed: $_"
        Write-Info "You may need to clean up partially created resources."
        exit 1
    }
}

Start-Setup
