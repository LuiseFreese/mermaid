#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create an Azure App Registration for local development with client secret

.DESCRIPTION
    This script creates a dedicated App Registration for local development that includes:
    - Client secret for authentication
    - Required API permissions for Dataverse
    - Application User in Dataverse (if DataverseUrl provided)
    - Outputs configuration for .env.local file

.PARAMETER AppDisplayName
    Display name for the App Registration (default: Mermaid-LocalDev-[username])

.PARAMETER DataverseUrl
    Dataverse environment URL to create Application User in

.PARAMETER ExpiryDays
    Client secret expiry in days (default: 90)

.PARAMETER CreateEnvFile
    Create .env.local file automatically with the generated values

.EXAMPLE
    # Create App Registration with client secret
    .\scripts\create-local-dev-app.ps1

.EXAMPLE
    # Create App Registration and set up Dataverse Application User
    .\scripts\create-local-dev-app.ps1 -DataverseUrl "https://your-org.crm.dynamics.com" -CreateEnvFile

.EXAMPLE
    # Custom name and longer expiry
    .\scripts\create-local-dev-app.ps1 -AppDisplayName "My-Local-Mermaid-Dev" -ExpiryDays 180
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$AppDisplayName = "Mermaid-LocalDev-$env:USERNAME",
    
    [Parameter(Mandatory = $false)]
    [string]$DataverseUrl = $null,
    
    [Parameter(Mandatory = $false)]
    [int]$ExpiryDays = 90,
    
    [Parameter(Mandatory = $false)]
    [switch]$CreateEnvFile
)

# Error handling
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "🔧 Creating App Registration for Local Development" -ForegroundColor Green
Write-Host "App Name: $AppDisplayName" -ForegroundColor Cyan

# Check if user is logged in to Azure
try {
    $currentUser = az account show --query "user.name" -o tsv
    if (-not $currentUser) {
        throw "Not logged in"
    }
    Write-Host "Logged in as: $currentUser" -ForegroundColor Gray
} catch {
    Write-Error "Please run 'az login' first to authenticate with Azure"
    exit 1
}

# Get tenant information
$tenantId = az account show --query "tenantId" -o tsv
$subscriptionId = az account show --query "id" -o tsv

Write-Host "Tenant: $tenantId" -ForegroundColor Gray
Write-Host "Subscription: $subscriptionId" -ForegroundColor Gray

# Check if App Registration already exists
Write-Host "Checking for existing App Registration..." -ForegroundColor Yellow
$existingApp = az ad app list --display-name $AppDisplayName --query "[0].{appId:appId,id:id}" -o json | ConvertFrom-Json

if ($existingApp -and $existingApp.appId) {
    Write-Host "⚠️ App Registration already exists: $($existingApp.appId)" -ForegroundColor Yellow
    $useExisting = Read-Host "Use existing App Registration? (y/N)"
    
    if ($useExisting -eq 'y' -or $useExisting -eq 'Y') {
        $appId = $existingApp.appId
        $objectId = $existingApp.id
        Write-Host "✅ Using existing App Registration" -ForegroundColor Green
        $createNew = $false
    } else {
        Write-Host "❌ Exiting to avoid conflicts" -ForegroundColor Red
        exit 1
    }
} else {
    $createNew = $true
}

# Create new App Registration if needed
if ($createNew) {
    Write-Host "Creating App Registration..." -ForegroundColor Cyan
    
    # Create the app registration
    $appResult = az ad app create --display-name $AppDisplayName --query "{appId:appId,id:id}" -o json | ConvertFrom-Json
    $appId = $appResult.appId
    $objectId = $appResult.id
    
    Write-Host "✅ App Registration created: $appId" -ForegroundColor Green
    
    # Wait for propagation
    Write-Host "Waiting for App Registration to propagate..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

# Add required API permissions
Write-Host "Configuring API permissions..." -ForegroundColor Cyan

# Microsoft Graph permissions (for user info)
Write-Host "  └─ Adding Microsoft Graph permissions..." -ForegroundColor Yellow
az ad app permission add --id $appId --api 00000003-0000-0000-c000-000000000000 --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope | Out-Null

# Dataverse permissions
Write-Host "  └─ Adding Dataverse permissions..." -ForegroundColor Yellow
az ad app permission add --id $appId --api 00000007-0000-0000-c000-000000000000 --api-permissions 78ce3f0f-a1ce-49c2-8cde-64b5c0896db4=Scope | Out-Null

# Grant admin consent
Write-Host "Granting admin consent for permissions..." -ForegroundColor Cyan
try {
    az ad app permission admin-consent --id $appId | Out-Null
    Write-Host "✅ Admin consent granted" -ForegroundColor Green
} catch {
    Write-Warning "Could not grant admin consent automatically. You may need to grant consent manually in Azure Portal."
}

# Create client secret
Write-Host "Creating client secret (expires in $ExpiryDays days)..." -ForegroundColor Cyan
$secretName = "LocalDev-Secret-$(Get-Date -Format 'yyyy-MM-dd')"
$endDate = (Get-Date).AddDays($ExpiryDays).ToString("yyyy-MM-ddTHH:mm:ssZ")

$secretResult = az ad app credential reset --id $appId --display-name $secretName --end-date $endDate --query "{password:password}" -o json | ConvertFrom-Json
$clientSecret = $secretResult.password

Write-Host "✅ Client secret created" -ForegroundColor Green
Write-Host "⚠️  Secret expires on: $((Get-Date).AddDays($ExpiryDays).ToString('yyyy-MM-dd'))" -ForegroundColor Yellow

# Create Service Principal (needed for Dataverse Application User)
Write-Host "Creating Service Principal..." -ForegroundColor Cyan
$spResult = az ad sp create --id $appId --query "{id:id,appId:appId}" -o json | ConvertFrom-Json
$servicePrincipalId = $spResult.id

Write-Host "✅ Service Principal created: $servicePrincipalId" -ForegroundColor Green

# Create Dataverse Application User if DataverseUrl provided
if ($DataverseUrl) {
    Write-Host "Creating Dataverse Application User..." -ForegroundColor Cyan
    
    try {
        $envBase = $DataverseUrl.TrimEnd('/')
        $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
        
        if (-not $accessToken -or $accessToken.Length -lt 100) {
            throw "Could not obtain admin access token"
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
        $filter = "applicationid eq $appId or azureactivedirectoryobjectid eq $servicePrincipalId"
        $userUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid&`$filter=$filter"
        $existing = Invoke-RestMethod -Uri $userUrl -Headers $jsonHeaders -Method Get
        
        if ($existing.value -and $existing.value.Count -gt 0) {
            $userId = $existing.value[0].systemuserid
            Write-Host "✅ Application User already exists: $userId" -ForegroundColor Green
        } else {
            # Create new Application User
            $body = @{
                applicationid               = $appId
                azureactivedirectoryobjectid= $servicePrincipalId
                "businessunitid@odata.bind" = "/businessunits($rootBuId)"
                firstname                   = "Local"
                lastname                    = "Developer"
                domainname                  = "localdev-$($appId.ToLower())@mermaid.local"
            } | ConvertTo-Json -Depth 5
            
            $hdr = $jsonHeaders.Clone()
            $hdr["Prefer"] = "return=representation"
            $resp = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers" -Headers $hdr -Method Post -Body $body -ContentType "application/json"
            $userId = $resp.systemuserid
            
            Write-Host "✅ Application User created: $userId" -ForegroundColor Green
        }
        
        # Assign System Customizer role
        $roleNameEsc = "System Customizer".Replace("'", "''")
        $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
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
        
    } catch {
        Write-Warning "Failed to create Dataverse Application User: $_"
        Write-Host "💡 You can create this manually in Power Platform Admin Center:" -ForegroundColor Cyan
        Write-Host "   App ID: $appId" -ForegroundColor Yellow
        Write-Host "   Service Principal: $servicePrincipalId" -ForegroundColor Yellow
    }
}

# Create .env.local file if requested
if ($CreateEnvFile) {
    Write-Host "Creating .env.local file..." -ForegroundColor Cyan
    
    $envContent = @"
# Local Development Configuration - Created $(Get-Date)
# DO NOT COMMIT THIS FILE

# Authentication Method
USE_CLIENT_SECRET=true
USE_MANAGED_IDENTITY=false

# Azure AD Configuration
TENANT_ID=$tenantId
CLIENT_ID=$appId
CLIENT_SECRET=$clientSecret

# Dataverse Configuration
$(if ($DataverseUrl) { "DATAVERSE_URL=$DataverseUrl" } else { "# DATAVERSE_URL=https://your-org.crm.dynamics.com" })

# Development Settings
NODE_ENV=development
PORT=8080
LOG_REQUEST_BODY=true

# Optional: Logging levels
LOG_LEVEL=debug
"@

    $envPath = ".env.local"
    $envContent | Out-File -FilePath $envPath -Encoding UTF8 -Force
    
    # Ensure .env.local is in .gitignore
    if (Test-Path ".gitignore") {
        $gitignoreContent = Get-Content ".gitignore" -Raw
        if ($gitignoreContent -notmatch "\.env\.local") {
            Add-Content ".gitignore" -Value "`n# Local development environment`n.env.local" -Encoding UTF8
            Write-Host "  └─ Added .env.local to .gitignore" -ForegroundColor Gray
        }
    }
    
    Write-Host "✅ .env.local file created" -ForegroundColor Green
}

# Output summary
Write-Host "`n🎉 Local Development App Registration Setup Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

Write-Host "`n📋 Configuration Details:" -ForegroundColor Cyan
Write-Host "App Registration: $AppDisplayName" -ForegroundColor White
Write-Host "Tenant ID: $tenantId" -ForegroundColor White
Write-Host "Client ID: $appId" -ForegroundColor White
Write-Host "Client Secret: $clientSecret" -ForegroundColor Yellow
Write-Host "Service Principal: $servicePrincipalId" -ForegroundColor White
Write-Host "Secret Expires: $((Get-Date).AddDays($ExpiryDays).ToString('yyyy-MM-dd'))" -ForegroundColor Yellow

if ($DataverseUrl) {
    Write-Host "Dataverse URL: $DataverseUrl" -ForegroundColor White
    Write-Host "Application User: ✅ Created/Verified" -ForegroundColor Green
}

Write-Host "`n🚀 Next Steps:" -ForegroundColor Cyan
if (-not $CreateEnvFile) {
    Write-Host "1. Create .env.local file with the configuration above" -ForegroundColor White
}
Write-Host "2. Run: npm run dev:local" -ForegroundColor White
Write-Host "3. Test: http://localhost:8080/health" -ForegroundColor White

Write-Host "`n⚠️  Security Reminders:" -ForegroundColor Yellow
Write-Host "• Never commit the client secret to source control" -ForegroundColor White
Write-Host "• Client secret expires in $ExpiryDays days - set a calendar reminder" -ForegroundColor White
Write-Host "• Use this App Registration only for local development" -ForegroundColor White

if (-not $CreateEnvFile) {
    Write-Host "`n📝 Copy this to your .env.local file:" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "USE_CLIENT_SECRET=true" -ForegroundColor Gray
    Write-Host "USE_MANAGED_IDENTITY=false" -ForegroundColor Gray
    Write-Host "TENANT_ID=$tenantId" -ForegroundColor Gray
    Write-Host "CLIENT_ID=$appId" -ForegroundColor Gray
    Write-Host "CLIENT_SECRET=$clientSecret" -ForegroundColor Gray
    if ($DataverseUrl) {
        Write-Host "DATAVERSE_URL=$DataverseUrl" -ForegroundColor Gray
    }
    Write-Host "NODE_ENV=development" -ForegroundColor Gray
    Write-Host "PORT=8080" -ForegroundColor Gray
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
}