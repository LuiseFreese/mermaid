#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Create Dataverse Application User for Local Development

.DESCRIPTION
    This script creates a Dataverse Application User for the app registration
    used in local development. It reads the CLIENT_ID from .env.local and
    creates the corresponding Application User with System Customizer role.

.EXAMPLE
    .\scripts\setup-local-dataverse-user.ps1

.NOTES
    Prerequisites:
    - Azure CLI installed and logged in (az login)
    - .env.local file with CLIENT_ID and DATAVERSE_URL
    - Dataverse System Administrator permissions
    - The app registration must already exist in Azure AD
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$SecurityRole = "System Customizer",
    
    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

# Output helpers
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info    { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error   { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }

$ErrorActionPreference = "Stop"

Write-Info "Setting up Dataverse Application User for Local Development"

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Error ".env.local file not found. Please run the local development setup first."
    exit 1
}

# Parse .env.local file
Write-Info "Reading configuration from .env.local..."
$envVars = @{}
Get-Content ".env.local" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        # Remove quotes if present
        if ($value -match "^[`"'](.*)['`"]$") {
            $value = $matches[1]
        }
        $envVars[$name] = $value
    }
}

# Extract required values
$clientId = $envVars["CLIENT_ID"]
$dataverseUrl = $envVars["DATAVERSE_URL"]
$tenantId = $envVars["TENANT_ID"]

if (-not $clientId) {
    Write-Error "CLIENT_ID not found in .env.local"
    exit 1
}

if (-not $dataverseUrl) {
    Write-Error "DATAVERSE_URL not found in .env.local"
    exit 1
}

# Ensure URL ends with /
if (-not $dataverseUrl.EndsWith("/")) {
    $dataverseUrl = $dataverseUrl + "/"
}

Write-Info "Configuration loaded:"
Write-Info "  Client ID: $clientId"
Write-Info "  Dataverse URL: $dataverseUrl" 
Write-Info "  Security Role: $SecurityRole"

if ($DryRun) {
    Write-Warning "DRY RUN MODE - No changes will be made"
    exit 0
}

try {
    # Get Service Principal Object ID
    Write-Info "Looking up Service Principal..."
    $servicePrincipal = az ad sp list --filter "appId eq '$clientId'" | ConvertFrom-Json
    
    if (-not $servicePrincipal -or $servicePrincipal.Length -eq 0) {
        Write-Error "Service Principal not found for Client ID: $clientId"
        Write-Info "Please ensure the app registration exists and has a service principal."
        exit 1
    }
    
    $servicePrincipalObjectId = $servicePrincipal[0].id
    $appDisplayName = $servicePrincipal[0].displayName
    Write-Success "Found Service Principal: $appDisplayName"
    Write-Info "  Object ID: $servicePrincipalObjectId"

    # Get admin access token for Dataverse
    Write-Info "Getting access token for Dataverse..."
    $envBase = $dataverseUrl.TrimEnd('/')
    $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
    
    if (-not $accessToken -or $accessToken.Length -lt 100) {
        Write-Error "Could not obtain access token for Dataverse."
        Write-Info "Please ensure:"
        Write-Info "  1. You're logged in with 'az login'"
        Write-Info "  2. You have Dataverse System Administrator permissions"
        Write-Info "  3. The Dataverse URL is correct"
        exit 1
    }
    
    Write-Success "Access token obtained"

    # Set up headers for Dataverse API calls
    $jsonHeaders = @{
        "Authorization"    = "Bearer $accessToken"
        "Content-Type"     = "application/json"
        "Accept"           = "application/json"
        "OData-MaxVersion" = "4.0"
        "OData-Version"    = "4.0"
    }

    # Get root Business Unit
    Write-Info "Finding root Business Unit..."
    $buUrl = "$envBase/api/data/v9.2/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null"
    $bu = Invoke-RestMethod -Uri $buUrl -Headers $jsonHeaders -Method Get
    
    if (-not $bu.value -or $bu.value.Count -lt 1) {
        Write-Error "Root Business Unit not found"
        exit 1
    }
    
    $rootBuId = $bu.value[0].businessunitid
    $rootBuName = $bu.value[0].name
    Write-Success "Root Business Unit: $rootBuName"
    Write-Info "  ID: $rootBuId"

    # Check for existing Application User
    Write-Info "Checking for existing Application User..."
    $filter = "applicationid eq $clientId or azureactivedirectoryobjectid eq $servicePrincipalObjectId"
    $userUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid,domainname,firstname,lastname&`$filter=$filter"
    $existing = Invoke-RestMethod -Uri $userUrl -Headers $jsonHeaders -Method Get

    $userId = $null
    if ($existing.value -and $existing.value.Count -gt 0) {
        $existingUser = $existing.value[0]
        $userId = $existingUser.systemuserid
        Write-Success "Found existing Application User: $($existingUser.firstname) $($existingUser.lastname)"
        Write-Info "  User ID: $userId"
        Write-Info "  Domain: $($existingUser.domainname)"
        
        # Update the azureactivedirectoryobjectid if needed
        if (-not $existingUser.azureactivedirectoryobjectid -or $existingUser.azureactivedirectoryobjectid -ne $servicePrincipalObjectId) {
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
            lastname                    = "Local Dev"
            domainname                  = "app-$($clientId.ToLower())@mermaid.local"
        } | ConvertTo-Json -Depth 5
        
        $hdr = $jsonHeaders.Clone()
        $hdr["Prefer"] = "return=representation"
        
        Write-Info "Creating user with domain: app-$($clientId.ToLower())@mermaid.local"
        $resp = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers" -Headers $hdr -Method Post -Body $body -ContentType "application/json"
        $userId = $resp.systemuserid
        
        if (-not $userId) {
            Write-Error "Dataverse did not return a systemuserid for the created Application User"
            exit 1
        }
        
        Write-Success "Application User created: $userId"
        Write-Info "  Name: $($resp.firstname) $($resp.lastname)"
        Write-Info "  Domain: $($resp.domainname)"
    }

    # Resolve security role
    Write-Info "Looking up security role: '$SecurityRole'..."
    $roleNameEsc = $SecurityRole.Replace("'", "''")
    $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name,_businessunitid_value&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
    $roleResp = Invoke-RestMethod -Uri $rolesUrl -Headers $jsonHeaders -Method Get
    
    if (-not $roleResp.value -or $roleResp.value.Count -lt 1) {
        Write-Error "Security Role '$SecurityRole' not found in root Business Unit"
        Write-Info "Available roles can be found in Power Platform Admin Center > Security > Security roles"
        exit 1
    }
    
    $roleId = $roleResp.value[0].roleid
    Write-Success "Security role found: $SecurityRole"
    Write-Info "  Role ID: $roleId"

    # Check if user already has the role
    Write-Info "Checking existing role assignments..."
    $hasRole = $false
    try {
        $checkUserRoles = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association?`$select=roleid" -Headers $jsonHeaders -Method Get
        if ($checkUserRoles.value) {
            $hasRole = $null -ne ($checkUserRoles.value | Where-Object { $_.roleid -eq $roleId })
        }
    } catch {
        Write-Warning "Could not check existing roles: $($_.Exception.Message)"
    }

    if (-not $hasRole) {
        Write-Info "Assigning security role '$SecurityRole'..."
        $assignBody = @{ "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref" -Headers $jsonHeaders -Method Post -Body $assignBody -ContentType "application/json"
        Write-Success "Security role '$SecurityRole' assigned!"
    } else {
        Write-Success "User already has the '$SecurityRole' role"
    }

    Write-Success "🎉 Dataverse Application User setup completed!"
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  Application User ID: $userId" -ForegroundColor White
    Write-Host "  Client ID: $clientId" -ForegroundColor White
    Write-Host "  Service Principal: $servicePrincipalObjectId" -ForegroundColor White
    Write-Host "  Security Role: $SecurityRole" -ForegroundColor White
    Write-Host "  Business Unit: $rootBuName" -ForegroundColor White
    Write-Host "  Dataverse URL: $dataverseUrl" -ForegroundColor White
    Write-Host ""
    Write-Host "✅ Your local development environment should now be able to authenticate to Dataverse!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next step: Test the deployment endpoint:" -ForegroundColor Yellow
    Write-Host "  Invoke-RestMethod -Uri 'http://localhost:8080/api/deployment/deploy' -Method POST ..." -ForegroundColor Gray

} catch {
    Write-Error "Failed to create Dataverse Application User: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "  1. Ensure you're logged in as a Dataverse System Administrator" -ForegroundColor Gray
    Write-Host "  2. Check that the Dataverse URL is correct and accessible" -ForegroundColor Gray
    Write-Host "  3. Verify the app registration exists in Azure AD" -ForegroundColor Gray
    Write-Host "  4. Try running 'az login' again if authentication fails" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Manual alternative:" -ForegroundColor Yellow
    Write-Host "  1. Go to Power Platform Admin Center" -ForegroundColor Gray
    Write-Host "  2. Select your environment > Settings > Users + permissions > Application users" -ForegroundColor Gray
    Write-Host "  3. Create new app user with Client ID: $clientId" -ForegroundColor Gray
    Write-Host "  4. Assign System Customizer role" -ForegroundColor Gray
    
    exit 1
}