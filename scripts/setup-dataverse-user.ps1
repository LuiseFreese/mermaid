param(
    [Parameter(Mandatory = $true)]
    [string]$AppId,
    
    [Parameter(Mandatory = $true)]
    [string]$ServicePrincipalId,
    
    [Parameter(Mandatory = $true)]
    [string]$DataverseUrl
)

Write-Host '🔧 Creating Dataverse Application User...' -ForegroundColor Green
Write-Host 'App ID: ' $AppId -ForegroundColor Cyan
Write-Host 'Service Principal: ' $ServicePrincipalId -ForegroundColor Cyan
Write-Host 'Dataverse: ' $DataverseUrl -ForegroundColor Cyan

try {
    $envBase = $DataverseUrl.TrimEnd('/')
    $accessToken = az account get-access-token --resource $envBase --query accessToken -o tsv

    if (-not $accessToken -or $accessToken.Length -lt 100) {
        throw 'Could not obtain admin access token'
    }

    Write-Host '✅ Access token obtained' -ForegroundColor Green

    $jsonHeaders = @{
        'Authorization'    = "Bearer $accessToken"
        'Content-Type'     = 'application/json'
        'Accept'           = 'application/json'
        'OData-MaxVersion' = '4.0'
        'OData-Version'    = '4.0'
    }

    # Get root Business Unit
    Write-Host 'Resolving root Business Unit...' -ForegroundColor Yellow
    $buUrl = "$envBase/api/data/v9.2/businessunits?`$select=businessunitid,name&`$filter=parentbusinessunitid eq null"
    $bu = Invoke-RestMethod -Uri $buUrl -Headers $jsonHeaders -Method Get

    if (-not $bu.value -or $bu.value.Count -lt 1) {
        throw 'Root Business Unit not found'
    }

    $rootBuId = $bu.value[0].businessunitid
    $rootBuName = $bu.value[0].name
    Write-Host "✅ Root BU: $rootBuName ($rootBuId)" -ForegroundColor Green

    # Check for existing Application User
    Write-Host 'Checking for existing Application User...' -ForegroundColor Yellow
    $filter = "applicationid eq $AppId or azureactivedirectoryobjectid eq $ServicePrincipalId"    
    $userUrl = "$envBase/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,azureactivedirectoryobjectid,domainname&`$filter=$filter"
    $existing = Invoke-RestMethod -Uri $userUrl -Headers $jsonHeaders -Method Get

    $userId = $null
    if ($existing.value -and $existing.value.Count -gt 0) {
        $userId = $existing.value[0].systemuserid
        Write-Host "✅ Found existing Application User: $userId" -ForegroundColor Green

        # Update the azureactivedirectoryobjectid if needed
        if (-not $existing.value[0].azureactivedirectoryobjectid -or $existing.value[0].azureactivedirectoryobjectid -ne $ServicePrincipalId) {
            Write-Host 'Updating Service Principal Object ID...' -ForegroundColor Yellow
            $patchBody = @{ azureactivedirectoryobjectid = $ServicePrincipalId } | ConvertTo-Json -Depth 3
            Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)" -Headers $jsonHeaders -Method Patch -Body $patchBody -ContentType 'application/json'
            Write-Host '✅ Service Principal Object ID updated' -ForegroundColor Green
        }
    } else {
        # Create new Application User
        Write-Host 'Creating new Application User...' -ForegroundColor Yellow
        $body = @{
            applicationid               = $AppId
            azureactivedirectoryobjectid= $ServicePrincipalId
            "businessunitid@odata.bind" = "/businessunits($rootBuId)"
            firstname                   = 'Local'
            lastname                    = 'Developer'
            domainname                  = "localdev-$($AppId.ToLower())@mermaid.local"
        } | ConvertTo-Json -Depth 5

        $hdr = $jsonHeaders.Clone()
        $hdr['Prefer'] = 'return=representation'
        $resp = Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers" -Headers $hdr -Method Post -Body $body -ContentType 'application/json'
        $userId = $resp.systemuserid

        Write-Host "✅ Application User created: $userId" -ForegroundColor Green
    }

    # Assign System Customizer role
    Write-Host 'Resolving System Customizer role...' -ForegroundColor Yellow
    $roleNameEsc = 'System Customizer'.Replace("'", "''")
    $rolesUrl = "$envBase/api/data/v9.2/roles?`$select=roleid,name&`$filter=name eq '$roleNameEsc' and _businessunitid_value eq $rootBuId"
    $roleResp = Invoke-RestMethod -Uri $rolesUrl -Headers $jsonHeaders -Method Get

    if ($roleResp.value -and $roleResp.value.Count -gt 0) {
        $roleId = $roleResp.value[0].roleid
        Write-Host "✅ Role found: System Customizer ($roleId)" -ForegroundColor Green

        # Check if user already has the role
        Write-Host 'Checking existing role assignments...' -ForegroundColor Yellow
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
            Write-Host 'Assigning System Customizer role...' -ForegroundColor Yellow
            $assignBody = @{ "@odata.id" = "$envBase/api/data/v9.2/roles($roleId)" } | ConvertTo-Json
            Invoke-RestMethod -Uri "$envBase/api/data/v9.2/systemusers($userId)/systemuserroles_association/`$ref" -Headers $jsonHeaders -Method Post -Body $assignBody -ContentType 'application/json'      
            Write-Host '✅ System Customizer role assigned!' -ForegroundColor Green
        } else {
            Write-Host '✅ User already has System Customizer role' -ForegroundColor Green
        }
    } else {
        Write-Warning 'System Customizer role not found'
    }

    Write-Host '🎉 Dataverse Application User setup completed!' -ForegroundColor Green
    Write-Host "   User ID: $userId" -ForegroundColor Cyan
    Write-Host "   App ID: $AppId" -ForegroundColor Cyan
    Write-Host "   Service Principal: $ServicePrincipalId" -ForegroundColor Cyan

} catch {
    Write-Error "Failed to create Dataverse Application User: $_"
    exit 1
}