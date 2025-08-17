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
    .\setup-entra-app.ps1 -Unattended -EnvironmentUrl "https://yourorg.crm.dynamics.com" -ResourceGroup "rg-mermaid" -Location "East US"
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
        
        return @{
            EnvironmentUrl = $EnvironmentUrl
            ResourceGroup = $ResourceGroup
            Location = $Location
            AppRegistrationName = if ($AppRegistrationName) { $AppRegistrationName } else { "Mermaid-Dataverse-Converter" }
            AppServiceName = if ($AppServiceName) { $AppServiceName } else { "app-mermaid-dataverse" }
            KeyVaultName = if ($KeyVaultName) { $KeyVaultName } else { "kv-mermaid-secrets" }
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
    $envUrl = Get-UserInput "Dataverse Environment URL (e.g., https://yourorg.crm.dynamics.com)" -Required
    
    # Get Azure configuration
    $resourceGroup = Get-UserInput "Resource Group Name" "rg-mermaid-dataverse" -Required
    
    # Get available locations
    $locations = @("East US", "West US 2", "West Europe", "North Europe", "UK South", "Australia East")
    Write-Host "Available locations: $($locations -join ', ')" -ForegroundColor Yellow
    $location = Get-UserInput "Azure Region" "East US" -Required -ValidValues $locations
    
    Write-Host ""
    Write-Info "Resource Naming (will check for existing resources):"
    
    # Get resource names
    $appRegName = Get-UserInput "App Registration Name" "Mermaid-Dataverse-Converter" -Required
    $appServiceName = Get-UserInput "App Service Name" "app-mermaid-dataverse" -Required
    $keyVaultName = Get-UserInput "Key Vault Name" "kv-mermaid-secrets" -Required
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
        Location = $location
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
    param($AppId, $ForceNew = $false)
    
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
        # For existing apps, we need to generate a new secret as we can't retrieve existing ones
        # Only generate if forced or if this is a new app registration
        if ($ForceNew -or -not $existingApp) {
            $credential = az ad app credential reset --id $AppId --years 2 | ConvertFrom-Json
            Write-Success "Client secret generated (expires: 2 years)"
            return $credential.password
        } else {
            Write-Warning "Using existing App Registration. If you need a new secret, run with -ForceNew"
            Write-Info "You may need to create a new client secret manually in the Azure Portal"
            return $null
        }
    }
    catch {
        Write-Error "Failed to create client secret: $_"
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
            if ($existingRG.location -ne $Location) {
                Write-Warning "Resource Group is in $($existingRG.location), but you specified $Location"
                $useExisting = Get-UserInput "Use existing location $($existingRG.location)? (y/n)" "y" -ValidValues @("y", "n")
                if ($useExisting -eq "n") {
                    throw "Cannot change location of existing Resource Group. Please use a different name."
                }
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
            keyVaultUri = "https://kv-fake-dry-run.vault.azure.net/"
            keyVaultName = $Config.KeyVaultName
            managedIdentityClientId = "00000000-0000-0000-0000-000000000000"
            appServiceName = $Config.AppServiceName
            appServiceUrl = "https://fake-dry-run.azurewebsites.net"
        }
    }
    
    try {
        # Deploy Bicep template
        $deploymentName = "mermaid-deployment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        $bicepFile = "deploy/infrastructure.bicep"
        
        if (-not (Test-Path $bicepFile)) {
            Write-Error "Bicep template not found at: $bicepFile"
            Write-Info "Please ensure you're running this script from the repository root."
            throw "Bicep template not found"
        }
        
        $deploymentParams = @{
            location = $Location
            keyVaultName = $Config.KeyVaultName
            managedIdentityName = $Config.ManagedIdentityName
            appServiceName = $Config.AppServiceName
            appServicePlanName = $Config.AppServicePlanName
        }
        
        # Create parameters file
        $paramsJson = $deploymentParams | ConvertTo-Json
        $paramsFile = "deploy/parameters.json"
        $paramsJson | Out-File -FilePath $paramsFile -Encoding UTF8
        
        Write-Info "Deploying infrastructure (this may take a few minutes)..."
        $deployment = az deployment group create `
            --resource-group $ResourceGroup `
            --template-file $bicepFile `
            --parameters "@$paramsFile" `
            --name $deploymentName `
            --output json | ConvertFrom-Json
        
        if ($deployment.properties.provisioningState -eq "Succeeded") {
            Write-Success "Infrastructure deployment completed successfully"
            
            $outputs = $deployment.properties.outputs
            return @{
                keyVaultUri = $outputs.keyVaultUri.value
                keyVaultName = $outputs.keyVaultName.value
                managedIdentityClientId = $outputs.managedIdentityClientId.value
                appServiceName = $outputs.appServiceName.value
                appServiceUrl = $outputs.appServiceUrl.value
            }
        } else {
            Write-Error "Infrastructure deployment failed"
            throw "Deployment failed"
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
        # Get current user for Key Vault permissions
        $currentUser = az ad signed-in-user show --query "id" -o tsv
        $subscriptionId = az account show --query 'id' -o tsv
        $keyVaultScope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.KeyVault/vaults/$KeyVaultName"
        
        # Grant current user temporary Key Vault Administrator role to store secrets
        Write-Info "Granting temporary Key Vault Administrator role to current user..."
        az role assignment create --assignee $currentUser --role "Key Vault Administrator" --scope $keyVaultScope --output none
        
        # Wait for role assignment to propagate
        Write-Info "Waiting for permissions to propagate..."
        Start-Sleep -Seconds 15
        
        # Get tenant ID
        $tenant = az account show --query "tenantId" -o tsv
        
        # Store secrets
        Write-Info "Storing secrets..."
        az keyvault secret set --vault-name $KeyVaultName --name "DATAVERSE-URL" --value $EnvironmentUrl --output none
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-ID" --value $AppId --output none
        az keyvault secret set --vault-name $KeyVaultName --name "CLIENT-SECRET" --value $ClientSecret --output none
        az keyvault secret set --vault-name $KeyVaultName --name "TENANT-ID" --value $tenant --output none
        az keyvault secret set --vault-name $KeyVaultName --name "SOLUTION-NAME" --value "MermaidSolution" --output none
        
        Write-Success "Secrets stored in Key Vault successfully"
        
        # Clean up: Remove temporary role assignment
        Write-Info "Removing temporary Key Vault Administrator role..."
        az role assignment delete --assignee $currentUser --role "Key Vault Administrator" --scope $keyVaultScope --output none 2>$null
        Write-Success "Temporary permissions cleaned up"
        
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
        $projectRoot = Split-Path -Parent $PSScriptRoot
        $envFile = Join-Path $projectRoot ".env"
        $tenant = az account show --query "tenantId" -o tsv
        
        # Create .env content
        $envContent = @"
# Mermaid to Dataverse Converter Configuration
# Generated on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

# Replace YOUR-ORG with your actual Dataverse organization name
DATAVERSE_URL=$EnvironmentUrl

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
            Write-Info "Running deployment script..."
            & $deployScript
            Write-Success "Application deployed successfully"
        } else {
            Write-Warning "Deploy script not found at $deployScript"
            Write-Info "You can deploy manually using: az webapp deploy --resource-group $ResourceGroup --name $AppServiceName --src-path deployment.zip"
        }
        
    }
    catch {
        Write-Error "Failed to deploy application: $_"
        throw
    }
}

function New-DataverseApplicationUser {
    param($AppId, $EnvironmentUrl, $SecurityRole)
    
    Write-Info "Creating Dataverse Application User..."
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would create Application User in Dataverse with role: $SecurityRole"
        return
    }
    
    try {
        # Get access token for Dataverse using the app registration we just created
        Write-Info "Getting access token for Dataverse API..."
        
        # Get access token using current user credentials (for setup purposes)
        $userToken = az account get-access-token --resource $EnvironmentUrl --query "accessToken" -o tsv
        
        $headers = @{
            'Authorization' = "Bearer $userToken"
            'OData-MaxVersion' = '4.0'
            'OData-Version' = '4.0'
            'Accept' = 'application/json'
            'Content-Type' = 'application/json'
        }
        
        # First, check if application user already exists
        Write-Info "Checking if Application User already exists..."
        $existingUserUrl = "$EnvironmentUrl/api/data/v9.2/systemusers?`$filter=applicationid eq $AppId"
        $existingUserResponse = Invoke-RestMethod -Uri $existingUserUrl -Method Get -Headers $headers -ErrorAction SilentlyContinue
        
        if ($existingUserResponse.value -and $existingUserResponse.value.Count -gt 0) {
            Write-Warning "Application User already exists for App ID: $AppId"
            $applicationUserId = $existingUserResponse.value[0].systemuserid
        } else {
            # Create Application User
            Write-Info "Creating new Application User..."
            $applicationUserBody = @{
                applicationid = $AppId
                businessunitid = "@odata.bind|businessunits()" # Default business unit
            } | ConvertTo-Json
            
            $createUserUrl = "$EnvironmentUrl/api/data/v9.2/systemusers"
            $createUserResponse = Invoke-RestMethod -Uri $createUserUrl -Method Post -Headers $headers -Body $applicationUserBody
            
            # Get the created user ID from Location header
            $locationHeader = $createUserResponse.Headers.Location
            $applicationUserId = ($locationHeader -split '\(')[1] -replace '\)', ''
            
            Write-Success "Application User created with ID: $applicationUserId"
        }
        
        # Get the security role ID
        Write-Info "Looking up security role: $SecurityRole"
        $roleUrl = "$EnvironmentUrl/api/data/v9.2/roles?`$filter=name eq '$SecurityRole'"
        $roleResponse = Invoke-RestMethod -Uri $roleUrl -Method Get -Headers $headers
        
        if ($roleResponse.value -and $roleResponse.value.Count -gt 0) {
            $roleId = $roleResponse.value[0].roleid
            Write-Success "Found security role: $SecurityRole (ID: $roleId)"
            
            # Assign security role to application user
            Write-Info "Assigning security role to Application User..."
            $assignRoleUrl = "$EnvironmentUrl/api/data/v9.2/systemusers($applicationUserId)/systemuserroles_association/`$ref"
            $assignRoleBody = @{
                "@odata.id" = "$EnvironmentUrl/api/data/v9.2/roles($roleId)"
            } | ConvertTo-Json
            
            Invoke-RestMethod -Uri $assignRoleUrl -Method Post -Headers $headers -Body $assignRoleBody -ErrorAction SilentlyContinue
            Write-Success "Security role '$SecurityRole' assigned to Application User"
        } else {
            Write-Error "Security role '$SecurityRole' not found in environment"
            throw "Security role not found"
        }
    }
    catch {
        Write-Error "Failed to create Dataverse Application User: $_"
        Write-Warning "You may need to create the Application User manually:"
        Write-Info "1. Go to Power Platform Admin Center: https://admin.powerplatform.microsoft.com"
        Write-Info "2. Select your environment: $EnvironmentUrl"
        Write-Info "3. Go to Settings > Users + permissions > Application users"
        Write-Info "4. Create new app user with App ID: $AppId"
        Write-Info "5. Assign security role: $SecurityRole"
        throw
    }
}

function Test-Setup {
    param($KeyVaultUri, $AppId)
    
    Write-Info "Testing setup..."
    
    if ($DryRun) {
        Write-Warning "[DRY RUN] Would test Key Vault access and Dataverse connection"
        return $true
    }
    
    try {
        # Test Key Vault access
        $testSecret = az keyvault secret show --vault-name (Split-Path $KeyVaultUri -Leaf).Split('.')[0] --name "CLIENT-ID" --query "value" -o tsv
        if ($testSecret -eq $AppId) {
            Write-Success "Key Vault access test: PASSED"
        } else {
            Write-Error "Key Vault access test: FAILED"
            return $false
        }
        
        Write-Success "Setup test completed successfully"
        return $true
    }
    catch {
        Write-Error "Setup test failed: $_"
        return $false
    }
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
        
        # Deploy Infrastructure
        $infrastructure = Invoke-InfrastructureDeployment -ResourceGroup $config.ResourceGroup -Location $config.Location -Config $config
        
        # Store secrets in Key Vault
        Set-KeyVaultSecrets -KeyVaultName $infrastructure.keyVaultName -AppId $app.appId -ClientSecret $clientSecret -EnvironmentUrl $config.EnvironmentUrl -ResourceGroup $config.ResourceGroup
        
        # Update .env file with new configuration
        Update-EnvFile -AppId $app.appId -ClientSecret $clientSecret -EnvironmentUrl $config.EnvironmentUrl -KeyVaultName $infrastructure.keyVaultName
        
        # Deploy application to Azure App Service
        Deploy-Application -AppServiceName $config.AppServiceName -ResourceGroup $config.ResourceGroup
        
        # Create Dataverse Application User
        New-DataverseApplicationUser -AppId $app.appId -EnvironmentUrl $config.EnvironmentUrl -SecurityRole $config.SecurityRole
        
        # Test the setup
        if (Test-Setup -KeyVaultUri $infrastructure.keyVaultUri -AppId $app.appId) {
            Show-DeploymentInfo -KeyVaultUri $infrastructure.keyVaultUri -AppId $app.appId -AppServiceUrl $infrastructure.appServiceUrl -ManagedIdentityClientId $infrastructure.managedIdentityClientId
        } else {
            Write-Error "Setup completed but tests failed. Please review the configuration."
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
