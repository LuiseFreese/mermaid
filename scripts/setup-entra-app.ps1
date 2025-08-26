#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Interactive setup script for Mermaid to Dataverse application
    
.DESCRIPTION
    This script provides an interactive setup experience with idempotent operations:
    - Prompts for all configuration values
    - Checks for existing resources and reuses them
    - Creates only what doesn't exist
    - Can be run multiple times safely
    
    PREREQUISITES:
    1. Azure CLI installed and logged in (run 'az login' first)
    2. PowerShell execution policy set to allow scripts
    3. Your Dataverse environment URL ready (e.g., https://yourorg.crm.dynamics.com)
    4. Azure subscription with permission to create resources
    
.PREREQUISITES
    Before running this script:
    1. Install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
    2. Login to Azure: az login
    3. Obtain your Dataverse environment URL from Power Platform Admin Center
       - Go to https://admin.powerplatform.microsoft.com
       - Navigate to Environments > [Your Environment] > Settings > Developer resources
       - Copy the "Web API endpoint" URL (e.g., https://yourorg.crm.dynamics.com/)
    
.PARAMETER Unattended
    Run in unattended mode using provided parameters (no prompts)
    
.PARAMETER EnvironmentUrl
    Your Dataverse environment URL (for unattended mode)
    
.PARAMETER ResourceGroup
    Target resource group name (for unattended mode)
    
.PARAMETER Location
    Azure region (for unattended mode)
    
.PARAMETER AppRegistrationName
    App registration name (for unattended mode)
    
.PARAMETER AppServiceName
    App Service name (for unattended mode)
    
.PARAMETER KeyVaultName
    Key Vault name (for unattended mode)
    
.PARAMETER ManagedIdentityName
    Managed Identity name (for unattended mode)
    
.PARAMETER AppServicePlanName
    App Service plan name (for unattended mode)
    
.PARAMETER SecurityRole
    Dataverse security role (for unattended mode)
    
.PARAMETER DryRun
    Test mode - shows what would be done without making changes
    
.EXAMPLE
    .\setup-entra-app.ps1
    # Interactive mode - prompts for all values
    
.EXAMPLE
    .\setup-entra-app.ps1 -Unattended -EnvironmentUrl "https://yourorg.crm.dynamics.com" -ResourceGroup "rg-mermaid" -Location "West Europe"
    # Unattended mode with parameters
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$Unattended,
    
    [Parameter(Mandatory = $false)]
    [string]$EnvironmentUrl,
    
    [Parameter(Mandatory = $false)]
    [string]$ResourceGroup,
    
    [Parameter(Mandatory = $false)]
    [string]$Location,
    
    [Parameter(Mandatory = $false)]
    [string]$AppRegistrationName,
    
    [Parameter(Mandatory = $false)]
    [string]$AppServiceName,
    
    [Parameter(Mandatory = $false)]
    [string]$KeyVaultName,
    
    [Parameter(Mandatory = $false)]
    [string]$ManagedIdentityName,
    
    [Parameter(Mandatory = $false)]
    [string]$AppServicePlanName,
    
    [Parameter(Mandatory = $false)]
    [string]$SecurityRole,
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipDataverseUser,
    
    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

# Color functions for output
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Get-UserInput {
    param(
        [string]$Prompt,
        [string]$DefaultValue = "",
        [switch]$Required,
        [string[]]$ValidValues = @()
    )
    
    do {
        $promptText = $Prompt
        if ($DefaultValue) {
            $promptText += " [$DefaultValue]"
        }
        $promptText += ": "
        
        $userInput = Read-Host $promptText
        
        if ([string]::IsNullOrWhiteSpace($userInput) -and $DefaultValue) {
            $userInput = $DefaultValue
        }
        
        if ($ValidValues.Count -gt 0 -and $userInput -notin $ValidValues) {
            Write-Warning "Please enter one of: $($ValidValues -join ', ')"
            continue
        }
        
        if ($Required -and [string]::IsNullOrWhiteSpace($userInput)) {
            Write-Warning "This field is required."
            continue
        }
        
        return $userInput
    } while ($true)
}

function Get-Configuration {
    if ($Unattended) {
        Write-Info "Running in unattended mode..."
        
        # Validate required parameters for unattended mode
        if (-not $EnvironmentUrl) { throw "EnvironmentUrl is required for unattended mode" }
        if (-not $ResourceGroup) { throw "ResourceGroup is required for unattended mode" }
        if (-not $Location) { throw "Location is required for unattended mode" }
        
        # Validate Dataverse URL format
        if ($EnvironmentUrl -notmatch '^https://[^.]+\.crm[0-9]*\.dynamics\.com/?$') {
            throw "Invalid EnvironmentUrl format. Expected: https://orgXXXXX.crm4.dynamics.com (found: $EnvironmentUrl)"
        }
        
        # Normalize URL by removing trailing slash
        $EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
        
        return @{
            EnvironmentUrl = $EnvironmentUrl
            ResourceGroup = $ResourceGroup
            Location = $Location
            AppRegistrationName = if ($AppRegistrationName) { $AppRegistrationName } else { "Mermaid-Dataverse-Converter" }
            AppServiceName = if ($AppServiceName) { $AppServiceName } else { "app-mermaid-dv-$(Get-Random -Minimum 1000 -Maximum 9999)" }
            KeyVaultName = if ($KeyVaultName) { $KeyVaultName } else { "kv-mermaid-secrets-$(Get-Random -Minimum 1000 -Maximum 9999)" }
            ManagedIdentityName = if ($ManagedIdentityName) { $ManagedIdentityName } else { "mi-mermaid-dataverse" }
            AppServicePlanName = if ($AppServicePlanName) { $AppServicePlanName } else { "plan-mermaid-dataverse" }
            SecurityRole = if ($SecurityRole) { $SecurityRole } else { "System Administrator" }
        }
    }
    
    Write-Host ""
    Write-Host "Mermaid to Dataverse - Interactive Setup" -ForegroundColor Magenta
    Write-Host "===========================================" -ForegroundColor Magenta
    Write-Host ""
    Write-Info "This script will help you set up all required Azure resources."
    Write-Info "Existing resources will be reused. Only missing resources will be created."
    Write-Host ""
    
    # Get Dataverse environment
    Write-Info "Find your Dataverse Environment URL:"
    Write-Info "1. Go to https://make.powerapps.com"
    Write-Info "2. Navigate to your environment > Settings > Session details"
    Write-Info "3. Copy the 'WInstance url' (e.g., https://orgXXXXX.crm4.dynamics.com)"
    Write-Host ""
    $envUrl = Get-UserInput "Dataverse Environment URL (e.g., https://orgXXXXX.crm4.dynamics.com)" -Required
    # Normalize URL by removing trailing slash
    $envUrl = $envUrl.TrimEnd('/')
    
    # Validate the URL format
    if ($envUrl -notmatch '^https://[^.]+\.crm[0-9]*\.dynamics\.com$') {
        Write-Warning "The URL format seems incorrect. Expected format: https://orgXXXXX.crm4.dynamics.com"
        Write-Warning "Please verify this is your correct Dataverse Web API endpoint URL."
    }
    
    # Get Azure configuration
    $resourceGroup = Get-UserInput "Resource Group Name" "rg-mermaid-dataverse" -Required
    
    # Get available locations
    $locations = @("eastus", "westus2", "westeurope", "northeurope", "uksouth", "australiaeast")
    Write-Host "Available locations: $($locations -join ', ')" -ForegroundColor Yellow
    $location = Get-UserInput "Azure Region" "westeurope" -Required -ValidValues $locations
    
    # Normalize location to Azure's internal format
    $locationNormalized = switch ($location) {
        "West Europe" { "westeurope" }
        "East US" { "eastus" }
        "West US 2" { "westus2" }
        "North Europe" { "northeurope" }
        "UK South" { "uksouth" }
        "Australia East" { "australiaeast" }
        default { $location.ToLower().Replace(" ", "") }
    }
    
    Write-Host ""
    Write-Info "Resource Naming (will check for existing resources):"
    
    # Get resource names
    $appRegName = Get-UserInput "App Registration Name" "Mermaid-Dataverse-Converter" -Required
    $appServiceName = Get-UserInput "App Service Name" "app-mermaid-dv-we-$(Get-Random -Minimum 1000 -Maximum 9999)" -Required
    $randomSuffix = Get-Random -Minimum 1000 -Maximum 9999
    $keyVaultName = Get-UserInput "Key Vault Name" "kv-mermaid-secrets-$randomSuffix" -Required
    $managedIdentityName = Get-UserInput "Managed Identity Name" "mi-mermaid-dataverse" -Required
    $appServicePlanName = Get-UserInput "App Service Plan Name" "plan-mermaid-dataverse" -Required
    
    # Get Dataverse configuration
    Write-Host ""
    Write-Info "Dataverse Configuration:"
    $roles = @("System Administrator", "System Customizer")
    Write-Host "Available roles: $($roles -join ', ')" -ForegroundColor Yellow
    $securityRole = Get-UserInput "Security Role for Application User" "System Administrator" -Required -ValidValues $roles
    
    return @{
        EnvironmentUrl = $envUrl
        ResourceGroup = $resourceGroup
        Location = $locationNormalized
        AppRegistrationName = $appRegName
        AppServiceName = $appServiceName
        KeyVaultName = $keyVaultName
        ManagedIdentityName = $managedIdentityName
        AppServicePlanName = $appServicePlanName
        SecurityRole = $securityRole
    }
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check Azure CLI
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Error "Azure CLI not found. Please install: winget install Microsoft.AzureCLI"
        return $false
    }
    
    # Check if logged in
    $account = az account show 2>$null | ConvertFrom-Json
    if (-not $account) {
        Write-Error "Please login to Azure CLI: az login"
        return $false
    }
    
    Write-Success "Logged in as: $($account.user.name)"
    Write-Success "Subscription: $($account.name)"
    
    return $true
}

function Get-ServicePrincipalObjectId {
    param([Parameter(Mandatory)][string]$AppId)
    $spId = az ad sp list --filter "appId eq '$AppId'" --query "[0].id" -o tsv
    if (-not $spId) {
        Write-Info "Creating service principal for appId $AppId..."
        az ad sp create --id $AppId --output none
        # retry read
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
        return @{
            appId = "00000000-0000-0000-0000-000000000000"
            objectId = "00000000-0000-0000-0000-000000000000"
            existed = $false
        }
    }
    
    try {
        # Check if app already exists
        $existingApp = az ad app list --display-name $AppRegistrationName --query "[0]" | ConvertFrom-Json
        if ($existingApp) {
            Write-Success "Found existing App Registration: $($existingApp.appId)"
            return @{
                appId = $existingApp.appId
                objectId = $existingApp.id
                existed = $true
            }
        }
        
        # Create new app registration
        Write-Info "Creating new App Registration: $AppRegistrationName"
        $app = az ad app create --display-name $AppRegistrationName --sign-in-audience AzureADMyOrg | ConvertFrom-Json
        Write-Success "App Registration created: $($app.appId)"
        
        return @{
            appId = $app.appId
            objectId = $app.id
            existed = $false
        }
    }
    catch {
        Write-Error "Failed to get/create app registration: $_"
        throw
    }
}

function Get-OrCreateClientSecret {
    param(
        [Parameter(Mandatory)]
        [string]$AppId,
        [bool]$ForceNew = $false
    )
    
    if ($ForceNew) {
        Write-Info "Generating new client secret..."
    } else {
        Write-Info "Checking client secret for App Registration..."
    }
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would check/create client secret for app: $AppId"
        return "fake-secret-for-dry-run"
    }
    
    try {
        # Explicitly check if the app exists first
        $appExists = $null -ne (az ad app show --id $AppId --query "appId" -o tsv 2>$null)
        
        # Create a new secret if:
        # 1. ForceNew is true, OR
        # 2. We know for sure the app exists (and needs a new secret)
        if ($ForceNew -or $appExists) {
            # Reset-credential will generate a new client secret; we don't need to check existing ones
            $credential = az ad app credential reset --id $AppId --years 2 2>$null | ConvertFrom-Json
            if (-not $credential -or -not $credential.password) {
                throw "Failed to generate client secret - credential reset returned no password"
            }
            Write-Success "Client secret generated (expires: 2 years)"
            return $credential.password
        } else {
            Write-Warning "App registration not found or error checking status. Cannot generate secret."
            return $null
        }
    }
    catch {
        Write-Error "Failed to create client secret: $_"
        Write-Info "You may need to create a new client secret manually in the Azure Portal"
        throw
    }
}

function Get-OrCreateResourceGroup {
    param($ResourceGroupName, $Location)
    
    Write-Info "Checking for existing Resource Group: $ResourceGroupName"
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would check/create resource group: $ResourceGroupName"
        return
    }
    
    try {
        $existingRG = az group show --name $ResourceGroupName 2>$null | ConvertFrom-Json
        if ($existingRG) {
            Write-Success "Found existing Resource Group: $ResourceGroupName in $($existingRG.location)"
            # Normalize location comparison (handle both "West Europe" and "westeurope")
            $normalizedExisting = $existingRG.location.ToLower().Replace(" ", "")
            $normalizedRequested = $Location.ToLower().Replace(" ", "")
            
            if ($normalizedExisting -ne $normalizedRequested) {
                Write-Warning "Resource Group is in $($existingRG.location), but you specified $Location"
                if (-not $Unattended) {
                    $useExisting = Get-UserInput "Use existing location $($existingRG.location)? (y/n)" "y" -ValidValues @("y", "n")
                    if ($useExisting -eq "n") {
                        throw "Cannot change location of existing Resource Group. Please use a different name."
                    }
                }
                # Update location to match existing RG
                $Location = $existingRG.location
            }
        } else {
            Write-Info "Creating new Resource Group: $ResourceGroupName in $Location"
            az group create --name $ResourceGroupName --location $Location --output none
            Write-Success "Resource Group created: $ResourceGroupName"
        }
    }
    catch {
        Write-Error "Failed to get/create resource group: $_"
        throw
    }
}

function Invoke-InfrastructureDeployment {
    param($ResourceGroup, $Location, $Config)

    Write-Info "Deploying infrastructure using Bicep..."

    if ($DryRun) {
        Write-Warning "[DRY RUN] Would deploy infrastructure to resource group: $ResourceGroup"
        return @{
            keyVaultUri             = "https://kv-fake-dry-run.vault.azure.net/"
            keyVaultName            = $Config.KeyVaultName
            managedIdentityClientId = "00000000-0000-0000-0000-000000000000"
            appServiceName          = $Config.AppServiceName
            appServiceUrl           = "https://fake-dry-run.azurewebsites.net"
        }
    }

    try {
        $deploymentName = "mermaid-deployment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        $repoRoot = Split-Path -Parent $PSScriptRoot
        $bicepFile = Join-Path $repoRoot "deploy/infrastructure.bicep"
        if (-not (Test-Path $bicepFile)) { 
            Write-Error "Bicep template not found at: $bicepFile"
            Write-Info "Please ensure the Bicep template exists in the repository."
            throw "Bicep template not found" 
        }
        
        # pass params inline in the proper shape (no tmp parameters.json)
        # Check for soft-deleted Key Vault and purge it if it exists
        Write-Info "Checking for soft-deleted Key Vault: $($Config.KeyVaultName)"
        $deletedVault = az keyvault list-deleted --query "[?name=='$($Config.KeyVaultName)']" | ConvertFrom-Json
        
        if ($deletedVault -and $deletedVault.Length -gt 0) {
            Write-Warning "Found soft-deleted Key Vault with name: $($Config.KeyVaultName)"
            Write-Info "Purging soft-deleted Key Vault..."
            az keyvault purge --name $($Config.KeyVaultName) --no-wait
            Write-Info "Waiting for purge operation to complete..."
            Start-Sleep -Seconds 60  # Give Azure more time to complete the purge
            Write-Success "Soft-deleted Key Vault purge initiated"
        }
        
        $paramArgs = @(
          "--parameters", "appName=Mermaid",
          "--parameters", "location=$Location",
          "--parameters", "environment=prod", 
          "--parameters", "keyVaultName=$($Config.KeyVaultName)",
          "--parameters", "managedIdentityName=$($Config.ManagedIdentityName)",
          "--parameters", "appServiceName=$($Config.AppServiceName)",
          "--parameters", "appServicePlanName=$($Config.AppServicePlanName)"
        )

        Write-Info "Deploying infrastructure (this may take a few minutes)..."

        # 1) run create with no output to avoid JSON stream issues
        az deployment group create `
          --resource-group $ResourceGroup `
          --template-file $bicepFile `
          @paramArgs `
          --name $deploymentName `
          --only-show-errors `
          --output none

        # 2) fetch outputs separately
        $deployment = az deployment group show `
          --resource-group $ResourceGroup `
          --name $deploymentName `
          --query properties.outputs `
          --output json | ConvertFrom-Json

        Write-Success "Infrastructure deployment completed successfully"

        return @{
            keyVaultUri             = $deployment.keyVaultUri.value
            keyVaultName            = $deployment.keyVaultName.value
            managedIdentityClientId = $deployment.managedIdentityClientId.value
            appServiceName          = $deployment.appServiceName.value
            appServiceUrl           = $deployment.appServiceUrl.value
        }
        }
    catch {
        Write-Error "Failed to deploy infrastructure: $_"
        throw
    }
}

function Set-KeyVaultSecrets {
    param($KeyVaultName, $AppId, $ClientSecret, $EnvironmentUrl, $ResourceGroup)
    
    Write-Info "Storing secrets in Key Vault..."
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would store secrets: DATAVERSE-URL, CLIENT-ID, CLIENT-SECRET, TENANT-ID, SOLUTION-NAME"
        return
    }
    
    try {
        # Standardize environment URL by removing trailing slash
        $normalizedUrl = $EnvironmentUrl.TrimEnd('/')
        
        # Get current user for Key Vault permissions
        $currentUser = az ad signed-in-user show --query "id" -o tsv
        $subscriptionId = az account show --query 'id' -o tsv
        $keyVaultScope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.KeyVault/vaults/$KeyVaultName"
        
        # Grant current user temporary Key Vault Administrator role to store secrets
        Write-Info "Granting temporary Key Vault Administrator role to current user..."
        $assignmentId = az role assignment create --assignee $currentUser --role "Key Vault Administrator" --scope $keyVaultScope --query id -o tsv
        
        # Wait for role assignment to propagate
        Write-Info "Waiting for permissions to propagate..."
        Start-Sleep -Seconds 15
        
        # Get tenant ID
        $tenant = az account show --query "tenantId" -o tsv
        
        # Store secrets
        Write-Info "Storing secrets..."
        az keyvault secret set --vault-name $KeyVaultName --name "DATAVERSE-URL" --value $normalizedUrl --output none
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-ID" --value $AppId --output none
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-SECRET" --value $ClientSecret --output none
        az keyvault secret set --vault-name $KeyVaultName --name "TENANT-ID" --value $tenant --output none
        az keyvault secret set --vault-name $KeyVaultName --name "SOLUTION-NAME" --value "MermaidSolution" --output none
        
        Write-Success "Secrets stored in Key Vault successfully"
        
        # Return assignment ID instead of removing it
        return @{ AssignmentId = $assignmentId }
    }
    catch {
        Write-Error "Failed to store secrets in Key Vault: $_"
        Write-Warning "You may need to manually grant yourself 'Key Vault Administrator' role temporarily"
        throw
    }
}

function Update-EnvFile {
    param($AppId, $ClientSecret, $EnvironmentUrl, $KeyVaultName)
    
    Write-Info "Updating .env file with configuration..."
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would update .env file with new credentials"
        return
    }
    
    try {
        # Determine project root correctly regardless of where script is run from
        $scriptPath = $PSScriptRoot
        if ($scriptPath -like "*\scripts") {
            $projectRoot = Split-Path -Parent $scriptPath
        } else {
            $projectRoot = $scriptPath
        }
        $envFile = Join-Path $projectRoot ".env"
        $tenant = az account show --query "tenantId" -o tsv
        
        # Normalize the URL by removing trailing slash
        $normalizedUrl = $EnvironmentUrl.TrimEnd('/')
        
        # Create .env content
        $envContent = @"
# Mermaid to Dataverse Converter Configuration
# Generated on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

# Replace YOUR-ORG with your actual Dataverse organization name
DATAVERSE_URL=$normalizedUrl

# Microsoft Entra ID App Registration Details
CLIENT_ID=$AppId
CLIENT_SECRET=$ClientSecret
TENANT_ID=$tenant

# Optional: Custom solution name
SOLUTION_NAME=MermaidSolution

# Azure Key Vault Configuration
USE_KEY_VAULT=true
KEY_VAULT_NAME=$KeyVaultName
"@
        
        # Write to .env file
        $envContent | Out-File -FilePath $envFile -Encoding UTF8 -Force
        Write-Success "Configuration saved to .env file"
        
        # Also create .env.example for reference
        $envExampleContent = $envContent -replace '=.*', '=YOUR_VALUE_HERE'
        $envExampleFile = Join-Path $projectRoot ".env.example"
        $envExampleContent | Out-File -FilePath $envExampleFile -Encoding UTF8 -Force
        Write-Info "Example configuration saved to .env.example"
        
    }
    catch {
        Write-Error "Failed to update .env file: $_"
        throw
    }
}

function Deploy-Application {
    param($AppServiceName, $ResourceGroup)
    
    Write-Info "Deploying application to Azure App Service..."
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would deploy application to App Service: $AppServiceName"
        return
    }
    
    try {
        $projectRoot = Split-Path -Parent $PSScriptRoot
        $deployScript = Join-Path $projectRoot "scripts\deploy.ps1"
        
        if (Test-Path $deployScript) {
            Write-Info "Running deployment script for Linux App Service..."
            & $deployScript -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
            Write-Success "Application deployed successfully"
        } else {
            Write-Warning "Deploy script not found at $deployScript"
            Write-Info "You can deploy manually using: az webapp deploy --resource-group $ResourceGroup --name $AppServiceName --src-path deployment.zip --type zip"
        }
        
    }
    catch {
        Write-Error "Failed to deploy application: $_"
        Write-Warning "You can manually deploy using the deploy.ps1 script in the scripts folder"
        throw
    }
}

function New-DataverseApplicationUserWithPowerShell {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [string]$EnvironmentUrl,
        
        [Parameter(Mandatory = $true)]
        [string]$AppId,
        
        [Parameter(Mandatory = $true)]
        [string]$SecurityRole
    )
    
    Write-Info "Creating Dataverse Application User using pure PowerShell method..."
    
    # Normalize URL by removing trailing slash
    $envBase = $EnvironmentUrl.TrimEnd('/')
    
    try {
        # Step 1: Get admin access token using Azure CLI
        Write-Info "Getting admin access token via Azure CLI..."
        $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
        
        if (-not $accessToken -or $accessToken.Length -lt 100) {
            Write-Warning "Failed to get valid access token. Please ensure you're logged into Azure CLI."
            return $false
        }
        
        Write-Info "Successfully obtained admin access token"
        
        # Step 2: Check if Application User already exists
        Write-Info "Checking for existing Application User..."
        $checkUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid&`$filter=applicationid eq $AppId"
        $checkUrl = [uri]::EscapeUriString($checkUrl)
        
        $headers = @{
            "Authorization" = "Bearer $accessToken"
            "Content-Type" = "application/json"
            "Accept" = "application/json"
            "OData-MaxVersion" = "4.0"
            "OData-Version" = "4.0"
        }
        
        $existingUserResponse = Invoke-RestMethod -Uri $checkUrl -Headers $headers -Method Get
        
        if ($existingUserResponse.value.Count -gt 0) {
            Write-Success "Application User already exists. Skipping creation."
            return $true
        }
        
        Write-Info "No existing Application User found. Proceeding with creation."
        
        # Step 3: Get root Business Unit
        Write-Info "Getting root Business Unit..."
        $buUrl = "$envBase/api/data/v9.2/businessunits?`$filter=parentbusinessunitid eq null&`$select=businessunitid,name"
        $buUrl = [uri]::EscapeUriString($buUrl)
        
        $buResponse = Invoke-RestMethod -Uri $buUrl -Headers $headers -Method Get
        
        if ($buResponse.value.Count -eq 0) {
            Write-Warning "No root Business Unit found"
            return $false
        }
        
        $businessUnitId = $buResponse.value[0].businessunitid
        $businessUnitName = $buResponse.value[0].name
        Write-Info "Found root Business Unit: $businessUnitName"
        
        # Step 4: Get Security Role
        Write-Info "Getting $SecurityRole role..."
        $roleUrl = "$envBase/api/data/v9.2/roles?`$filter=name eq '$SecurityRole'&`$select=roleid,name"
        $roleUrl = [uri]::EscapeUriString($roleUrl)
        
        $roleResponse = Invoke-RestMethod -Uri $roleUrl -Headers $headers -Method Get
        
        if ($roleResponse.value.Count -eq 0) {
            Write-Warning "Security Role '$SecurityRole' not found"
            return $false
        }
        
        $roleId = $roleResponse.value[0].roleid
        Write-Info "Found Security Role: $SecurityRole"
        
        # Step 5: Create Application User
        Write-Info "Creating Application User..."
        $createUrl = "$envBase/api/data/v9.2/systemusers"
        
        $userBody = @{
            applicationid = $AppId
            "businessunitid@odata.bind" = "/businessunits($businessUnitId)"
            firstname = "Mermaid"
            lastname = "Service Principal"
            domainname = "$AppId@mermaid.app"
        } | ConvertTo-Json
        
        $createHeaders = $headers.Clone()
        $createHeaders["Prefer"] = "return=representation"
        
        $createResponse = Invoke-RestMethod -Uri $createUrl -Headers $createHeaders -Method Post -Body $userBody -ContentType "application/json"
        
        # The response should contain the ID directly in PowerShell
        $userId = $createResponse.systemuserid
        
        if (-not $userId) {
            Write-Warning "Failed to extract user ID from creation response"
            return $false
        }
        
        Write-Success "Application User created successfully"
        
        # Step 6: Assign Security Role
        Write-Info "Assigning $SecurityRole role..."
        $assignUrl = "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref"
        
        $assignBody = @{
            "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)"
        } | ConvertTo-Json
        
        try {
            Write-Verbose "Calling Dataverse API to assign role: $assignUrl"
            Write-Verbose "Request body: $assignBody"
            
            Invoke-RestMethod -Uri $assignUrl -Headers $headers -Method Post -Body $assignBody -ContentType "application/json"
            Write-Success "Successfully created and configured Application User with $SecurityRole role"
            return $true
        }
        catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            $errorMessage = $_.ErrorDetails.Message
            
            Write-Warning "Failed to assign security role: $errorMessage"
            Write-Verbose "HTTP Status Code: $statusCode"
            Write-Verbose "Exception details: $_"
            
            # Return true anyway since the user was created, just not assigned the role
            Write-Warning "Application User was created but role assignment failed. You may need to assign the role manually."
            return $true
        }
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMessage = $_.ErrorDetails.Message
        
        if ($statusCode -eq 401) {
            Write-Warning "Authentication failed. Please ensure you're logged into Azure CLI with 'az login' and have admin permissions."
        }
        elseif ($statusCode -eq 403) {
            Write-Warning "Access denied. Your account doesn't have sufficient permissions to perform this operation."
        }
        else {
            Write-Warning "Failed to create Application User: $errorMessage"
            Write-Verbose "Exception details: $_"
        }
        
        return $false
    }
}
function Test-Setup {
    param(
        [Parameter(Mandatory)]
        [string]$KeyVaultUri, 
        [Parameter(Mandatory)]
        [string]$AppId
    )
    
    Write-Info "Testing setup..."
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would test Key Vault access and Dataverse connection"
        return $true
    }
    
    # Maximum number of retries for RBAC propagation
    $maxRetries = 3
    $retryCount = 0
    $retryDelaySeconds = 30
    
    do {
        try {
            if ($retryCount -gt 0) {
                Write-Info "Retry attempt $retryCount of $maxRetries (waiting for RBAC propagation)..."
                Start-Sleep -Seconds $retryDelaySeconds
                # Increase delay for each subsequent retry
                $retryDelaySeconds = $retryDelaySeconds * 2
            }
            
            # Extract Key Vault name safely using proper URI parsing
            $kvName = ([System.Uri]$KeyVaultUri).Host.Split('.')[0]
            if (-not $kvName) {
                throw "Could not extract Key Vault name from URI: $KeyVaultUri"
            }
            
            # Test Key Vault access
            $testSecret = az keyvault secret show --vault-name $kvName --name "CLIENT-ID" --query "value" -o tsv
            if ($testSecret -eq $AppId) {
                Write-Success "Key Vault access test: PASSED"
                # If we got here, break out of the retry loop
                break
            } else {
                Write-Error "Key Vault access test: FAILED"
                if ($retryCount -lt $maxRetries) {
                    Write-Warning "Key Vault access failed, waiting for RBAC propagation..."
                    $retryCount++
                    continue
                }
                return $false
            }
        }
        catch {
            $errorMessage = $_
            $retryCount++
            
            # Check if error is related to RBAC permissions
            if ($errorMessage.ToString() -match "Caller is not authorized|Forbidden|Permission denied") {
                if ($retryCount -lt $maxRetries) {
                    Write-Warning "Key Vault permissions not propagated yet, waiting..."
                    continue
                }
            }
            
            Write-Error "Setup test failed: $errorMessage"
            return $false
        }
    } while ($retryCount -lt $maxRetries)
    
    Write-Success "Setup test completed successfully"
    return $true
}

function Show-DeploymentInfo {
    param($KeyVaultUri, $AppId, $AppServiceUrl, $ManagedIdentityClientId)
    
    Write-Host ""
    
    if ($DryRun) {
        Write-Host "DRY RUN COMPLETED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host "===============================" -ForegroundColor Green
        Write-Host ""
        Write-Host "The dry run has validated your configuration and confirmed all operations would succeed." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "TO PROCEED WITH ACTUAL DEPLOYMENT:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Run the same command WITHOUT the -DryRun flag:" -ForegroundColor White
        Write-Host ""
        
        # Show the exact command to run based on how this was called
        if ($Unattended) {
            Write-Host "   .\setup-entra-app.ps1 -Unattended -EnvironmentUrl '$EnvironmentUrl' -ResourceGroup '$ResourceGroup' -Location '$Location'" -ForegroundColor Green
            if ($AppRegistrationName) { Write-Host "                         -AppRegistrationName '$AppRegistrationName'" -ForegroundColor Green }
            if ($AppServiceName) { Write-Host "                         -AppServiceName '$AppServiceName'" -ForegroundColor Green }
            if ($KeyVaultName) { Write-Host "                         -KeyVaultName '$KeyVaultName'" -ForegroundColor Green }
            if ($ManagedIdentityName) { Write-Host "                         -ManagedIdentityName '$ManagedIdentityName'" -ForegroundColor Green }
            if ($AppServicePlanName) { Write-Host "                         -AppServicePlanName '$AppServicePlanName'" -ForegroundColor Green }
            if ($SecurityRole) { Write-Host "                         -SecurityRole '$SecurityRole'" -ForegroundColor Green }
        } else {
            Write-Host "   .\setup-entra-app.ps1" -ForegroundColor Green
            Write-Host ""
            Write-Host "Or for unattended mode with the same configuration:" -ForegroundColor Cyan
            Write-Host "   .\setup-entra-app.ps1 -Unattended \\" -ForegroundColor Green
            Write-Host "     -EnvironmentUrl 'YOUR_DATAVERSE_URL' \\" -ForegroundColor Green
            Write-Host "     -ResourceGroup 'YOUR_RESOURCE_GROUP' \\" -ForegroundColor Green
            Write-Host "     -Location 'YOUR_LOCATION'" -ForegroundColor Green
        }
        
        Write-Host ""
        Write-Host "WHAT WILL HAPPEN DURING ACTUAL DEPLOYMENT:" -ForegroundColor Yellow
        Write-Host "- Create Azure Resource Group (if it doesn't exist)" -ForegroundColor White
        Write-Host "- Create App Registration in Entra ID" -ForegroundColor White
        Write-Host "- Generate client secret for authentication" -ForegroundColor White
        Write-Host "- Deploy Azure infrastructure (App Service, Key Vault, Managed Identity)" -ForegroundColor White
        Write-Host "- Store secrets securely in Key Vault" -ForegroundColor White
        Write-Host "- Create Application User in Dataverse" -ForegroundColor White
        Write-Host "- Assign appropriate security roles" -ForegroundColor White
        Write-Host ""
        Write-Host "ESTIMATED TIME: 5-10 minutes" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "CONFIGURATION SAVED!" -ForegroundColor Green
        Write-Host "For future reference, your configuration was:" -ForegroundColor Cyan
        Write-Host "  Environment URL: $EnvironmentUrl" -ForegroundColor White
        Write-Host "  Resource Group: $ResourceGroup" -ForegroundColor White  
        Write-Host "  Location: $Location" -ForegroundColor White
        if ($AppRegistrationName) { Write-Host "  App Registration: $AppRegistrationName" -ForegroundColor White }
        if ($AppServiceName) { Write-Host "  App Service: $AppServiceName" -ForegroundColor White }
        if ($KeyVaultName) { Write-Host "  Key Vault: $KeyVaultName" -ForegroundColor White }
        Write-Host ""
        Write-Host "Documentation: See docs/ENTRA-ID-SETUP.md for detailed information" -ForegroundColor Yellow
    } else {
        Write-Host "Setup Complete! Ready for deployment." -ForegroundColor Green
        Write-Host ""
        Write-Host "Infrastructure Deployed:" -ForegroundColor Cyan
        Write-Host "   App Service URL: $AppServiceUrl" -ForegroundColor White
        Write-Host "   Key Vault URI: $KeyVaultUri" -ForegroundColor White
        Write-Host "   Managed Identity Client ID: $ManagedIdentityClientId" -ForegroundColor White
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "1. Deploy your application code to: $AppServiceUrl" -ForegroundColor White
        Write-Host "2. The managed identity and Key Vault are already configured" -ForegroundColor White
        Write-Host "3. Application User has been created in Dataverse" -ForegroundColor White
        Write-Host "4. Test the application at: $AppServiceUrl" -ForegroundColor White
        Write-Host ""
        Write-Host "Documentation: See docs/ENTRA-ID-SETUP.md for detailed instructions" -ForegroundColor Yellow
    }
}

# Main execution
function Start-Setup {
    Write-Host "Mermaid to Dataverse - Interactive Setup" -ForegroundColor Magenta
    Write-Host "===========================================" -ForegroundColor Magenta
    Write-Host ""
    
    if (-not (Test-Prerequisites)) {
        exit 1
    }
    
    try {
        # Get configuration (interactive or unattended)
        $config = Get-Configuration
        
        Write-Host ""
        Write-Info "Configuration Summary:"
        $config.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor White }
        Write-Host ""
        
        if (-not $Unattended) {
            $proceed = Get-UserInput "Proceed with this configuration? (y/n)" "y" -ValidValues @("y", "n")
            if ($proceed -eq "n") {
                Write-Info "Setup cancelled by user."
                exit 0
            }
        }
        
        # Create/check Resource Group
        Get-OrCreateResourceGroup -ResourceGroupName $config.ResourceGroup -Location $config.Location
        
        # Create/check App Registration
        $app = Get-OrCreateAppRegistration -AppRegistrationName $config.AppRegistrationName
        
        # Get/create Client Secret
        $clientSecret = Get-OrCreateClientSecret -AppId $app.appId -ForceNew (-not $app.existed)
        
        if (-not $clientSecret) {
            Write-Error "Client secret is required but was not generated. Please create one manually."
            exit 1
        }
        
        # Get the Service Principal ObjectId for the app
        $spObjectId = Get-ServicePrincipalObjectId -AppId $app.appId
        
        # Deploy Infrastructure
        $infrastructure = Invoke-InfrastructureDeployment -ResourceGroup $config.ResourceGroup -Location $config.Location -Config $config
        
        # Store secrets in Key Vault
        $kvGrant = Set-KeyVaultSecrets -KeyVaultName $infrastructure.keyVaultName -AppId $app.appId -ClientSecret $clientSecret -EnvironmentUrl $config.EnvironmentUrl -ResourceGroup $config.ResourceGroup
        
        # Update .env file with new configuration
        Update-EnvFile -AppId $app.appId -ClientSecret $clientSecret -EnvironmentUrl $config.EnvironmentUrl -KeyVaultName $infrastructure.keyVaultName
        
        # Deploy application to Azure App Service
        Deploy-Application -AppServiceName $config.AppServiceName -ResourceGroup $config.ResourceGroup
        
        # Create Dataverse Application User (unless skipped)
        if (-not $SkipDataverseUser) {
            try {
                $success = New-DataverseApplicationUserWithPowerShell -EnvironmentUrl $config.EnvironmentUrl -AppId $app.appId -SecurityRole $config.SecurityRole
                
                if ($success) {
                    Write-Success "Dataverse Application User created successfully"
                } else {
                    Write-Warning "Failed to create Dataverse Application User"
                    Write-Info "You can create it manually in Power Platform Admin Center:"
                    Write-Info "1. Admin Center > Environments > $($config.EnvironmentUrl)"
                    Write-Info "2. Settings > Users + permissions > Application users"
                    Write-Info "3. New app user; App ID: $($app.appId); Role: $($config.SecurityRole)"
                    
                    if (-not $Unattended) {
                        $continue = Get-UserInput "Continue with setup despite Dataverse user creation failure? (y/n)" "y" -ValidValues @("y", "n")
                        if ($continue -eq "n") {
                            Write-Error "Setup aborted by user."
                            exit 1
                        }
                    }
                }
            }
            catch {
                Write-Warning "Failed to create Dataverse Application User: $_"
                Write-Info "You can create it manually in Power Platform Admin Center:"
                Write-Info "1. Admin Center > Environments > $($config.EnvironmentUrl)"
                Write-Info "2. Settings > Users + permissions > Application users"
                Write-Info "3. New app user; App ID: $($app.appId); Role: $($config.SecurityRole)"
                
                if (-not $Unattended) {
                    $continue = Get-UserInput "Continue with setup despite Dataverse user creation failure? (y/n)" "y" -ValidValues @("y", "n")
                    if ($continue -eq "n") {
                        Write-Error "Setup aborted by user."
                        exit 1
                    }
                }
            }
        }
        else {
            Write-Warning "Skipping Dataverse Application User creation as requested."
            Write-Info "You will need to create the Application User manually:"
            Write-Info "1. Admin Center > Environments > $($config.EnvironmentUrl)"
            Write-Info "2. Settings > Users + permissions > Application users" 
            Write-Info "3. New app user; App ID: $($app.appId); Role: $($config.SecurityRole)"
        }
        
        # Test the setup
        if (Test-Setup -KeyVaultUri $infrastructure.keyVaultUri -AppId $app.appId) {
            # Clean up the role assignment after all operations and tests complete
            if ($kvGrant.AssignmentId) {
                Write-Info "Removing temporary Key Vault Administrator role..."
                az role assignment delete --ids $kvGrant.AssignmentId --output none
                Write-Success "Temporary permissions cleaned up"
            }
            
            Show-DeploymentInfo -KeyVaultUri $infrastructure.keyVaultUri -AppId $app.appId -AppServiceUrl $infrastructure.appServiceUrl -ManagedIdentityClientId $infrastructure.managedIdentityClientId
        } else {
            Write-Error "Setup completed but tests failed. Please review the configuration."
            # Clean up the role assignment even on failure
            if ($kvGrant.AssignmentId) {
                Write-Info "Removing temporary Key Vault Administrator role..."
                az role assignment delete --ids $kvGrant.AssignmentId --output none
            }
            exit 1
        }
    }
    catch {
        Write-Error "Setup failed: $_"
        Write-Info "You may need to clean up partially created resources."
        exit 1
    }
}

# Run the main function
Start-Setup
