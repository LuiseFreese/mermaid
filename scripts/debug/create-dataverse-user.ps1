# Create Dataverse Application User for Candypink Environment
# This script creates the application user needed for secretless authentication

param(
    [Parameter(Mandatory = $true)] [string]$EnvironmentUrl,
    [Parameter(Mandatory = $true)] [string]$AppId,
    [Parameter(Mandatory = $true)] [string]$ServicePrincipalObjectId,
    [Parameter(Mandatory = $false)] [string]$SecurityRole = "System Administrator"
)

Write-Host "🔐 Creating Dataverse Application User for Secretless Authentication" -ForegroundColor Magenta
Write-Host "Environment: $EnvironmentUrl" -ForegroundColor Cyan
Write-Host "App ID: $AppId" -ForegroundColor Cyan
Write-Host "Service Principal: $ServicePrincipalObjectId" -ForegroundColor Cyan

try {
    # Get admin access token
    Write-Host "Getting admin access token..." -ForegroundColor Yellow
    $envBase = $EnvironmentUrl.TrimEnd('/')
    $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv
    
    if (-not $accessToken -or $accessToken.Length -lt 100) {
        throw "Could not obtain admin access token. Ensure you're logged in as a Dataverse admin."
    }
    
    Write-Host "✅ Access token obtained" -ForegroundColor Green
    
    # Set up headers
    $jsonHeaders = @{
        "Authorization"    = "Bearer $accessToken"
        "Content-Type"     = "application/json"
        "Accept"           = "application/json"
        "OData-MaxVersion" = "4.0"
        "OData-Version"    = "4.0"
    }
    
    # Get root Business Unit
    Write-Host "Resolving root Business Unit..." -ForegroundColor Yellow
    $buUrl = "$envBase/api/data/v9.2/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null"
    $bu = Invoke-RestMethod -Uri $buUrl -Headers $jsonHeaders -Method Get
    
    if (-not $bu.value -or $bu.value.Count -lt 1) {
        throw "Root Business Unit not found"
    }
    
    $rootBuId = $bu.value[0].businessunitid
    $rootBuName = $bu.value[0].name
    Write-Host "✅ Root BU: $rootBuName ($rootBuId)" -ForegroundColor Green
    
    # Check for existing Application User
    Write-Host "Checking for existing Application User..." -ForegroundColor Yellow
    $filter = "applicationid eq $AppId or azureactivedirectoryobjectid eq $ServicePrincipalObjectId"
    $userUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid,domainname&`$filter=$filter"
    $existing = Invoke-RestMethod -Uri $userUrl -Headers $jsonHeaders -Method Get
    
    $userId = $null
    if ($existing.value -and $existing.value.Count -gt 0) {
        $userId = $existing.value[0].systemuserid
        Write-Host "✅ Found existing Application User: $userId" -ForegroundColor Green
        
        # Update the azureactivedirectoryobjectid if needed
        if (-not $existing.value[0].azureactivedirectoryobjectid -or $existing.value[0].azureactivedirectoryobjectid -ne $ServicePrincipalObjectId) {
            Write-Host "Updating Service Principal Object ID..." -ForegroundColor Yellow
            $patchBody = @{ azureactivedirectoryobjectid = $ServicePrincipalObjectId } | ConvertTo-Json -Depth 3
            Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)" -Headers $jsonHeaders -Method Patch -Body $patchBody -ContentType "application/json"
            Write-Host "✅ Service Principal Object ID updated" -ForegroundColor Green
        }
    } else {
        # Create new Application User
        Write-Host "Creating new Application User..." -ForegroundColor Yellow
        $body = @{
            applicationid               = $AppId
            azureactivedirectoryobjectid= $ServicePrincipalObjectId
            "businessunitid@odata.bind" = "/businessunits($rootBuId)"
            firstname                   = "Mermaid"
            lastname                    = "Candypink Service"
            domainname                  = "app-$($AppId.ToLower())@mermaid.local"
        } | ConvertTo-Json -Depth 5
        
        $hdr = $jsonHeaders.Clone()
        $hdr["Prefer"] = "return=representation"
        $resp = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers" -Headers $hdr -Method Post -Body $body -ContentType "application/json"
        $userId = $resp.systemuserid
        
        if (-not $userId) {
            throw "Dataverse did not return a systemuserid for the created Application User"
        }
        
        Write-Host "✅ Application User created: $userId" -ForegroundColor Green
    }
    
    # Resolve and assign security role
    Write-Host "Resolving security role '$SecurityRole'..." -ForegroundColor Yellow
    $roleNameEsc = $SecurityRole.Replace("'", "''")
    $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name,_businessunitid_value&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
    $roleResp = Invoke-RestMethod -Uri $rolesUrl -Headers $jsonHeaders -Method Get
    
    if (-not $roleResp.value -or $roleResp.value.Count -lt 1) {
        throw "Security Role '$SecurityRole' not found in root Business Unit"
    }
    
    $roleId = $roleResp.value[0].roleid
    Write-Host "✅ Role found: $SecurityRole ($roleId)" -ForegroundColor Green
    
    # Check if user already has the role
    Write-Host "Checking existing role assignments..." -ForegroundColor Yellow
    $hasRole = $false
    try {
        $checkUserRoles = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association?`$select=roleid" -Headers $jsonHeaders -Method Get
        if ($checkUserRoles.value) {
            $hasRole = ($checkUserRoles.value | Where-Object { $_.roleid -eq $roleId }) -ne $null
        }
    } catch {
        Write-Warning "Could not check existing roles: $_"
    }
    
    if (-not $hasRole) {
        Write-Host "Assigning security role '$SecurityRole'..." -ForegroundColor Yellow
        $assignBody = @{ "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref" -Headers $jsonHeaders -Method Post -Body $assignBody -ContentType "application/json"
        Write-Host "✅ Security role assigned!" -ForegroundColor Green
    } else {
        Write-Host "✅ User already has the required role" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "🎉 Dataverse Application User setup completed successfully!" -ForegroundColor Green
    Write-Host "   User ID: $userId" -ForegroundColor Cyan
    Write-Host "   Role: $SecurityRole" -ForegroundColor Cyan
    Write-Host "   Business Unit: $rootBuName" -ForegroundColor Cyan
    
    return $true
    
} catch {
    Write-Host ""
    Write-Host "❌ Failed to create Dataverse Application User: $_" -ForegroundColor Red
    Write-Host "Please ensure:" -ForegroundColor Yellow
    Write-Host "  1. You're logged in as a Dataverse System Administrator" -ForegroundColor Yellow
    Write-Host "  2. The environment URL is correct" -ForegroundColor Yellow
    Write-Host "  3. The App Registration and Service Principal exist" -ForegroundColor Yellow
    return $false
}