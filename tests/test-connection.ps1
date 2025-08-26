#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Test Dataverse connection and Azure configuration

.DESCRIPTION
    This script tests the connection to Dataverse and verifies Azure configuration
    Use this to diagnose issues after deployment.

.EXAMPLE
    .\test-connection.ps1 -AppServiceName "your-app-service" -ResourceGroup "your-rg"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AppServiceName,
    
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,
    
    [Parameter(Mandatory = $false)]
    [string]$KeyVaultName
)

function Write-Success { param($Message) Write-Host "[✓] $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "[ℹ] $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "[⚠] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "[✗] $Message" -ForegroundColor Red }

Write-Host "Dataverse Connection Diagnostics" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow
Write-Host ""

# 1. Check if App Service exists and is running
Write-Info "Checking App Service status..."
try {
    $appService = az webapp show --name $AppServiceName --resource-group $ResourceGroup --query "{name:name, state:state, defaultHostName:defaultHostName}" | ConvertFrom-Json
    if ($appService.state -eq "Running") {
        Write-Success "App Service '$($appService.name)' is running"
        Write-Info "URL: https://$($appService.defaultHostName)"
    } else {
        Write-Warning "App Service state: $($appService.state)"
    }
} catch {
    Write-Error "Could not find App Service '$AppServiceName' in resource group '$ResourceGroup'"
    exit 1
}

# 2. Check App Service configuration
Write-Info "Checking App Service environment variables..."
try {
    $appSettings = az webapp config appsettings list --name $AppServiceName --resource-group $ResourceGroup | ConvertFrom-Json
    
    $requiredSettings = @("KEY_VAULT_URI", "MANAGED_IDENTITY_CLIENT_ID", "AUTH_MODE")
    $foundSettings = @{}
    
    foreach ($setting in $appSettings) {
        if ($setting.name -in $requiredSettings) {
            $foundSettings[$setting.name] = $setting.value
        }
    }
    
    foreach ($required in $requiredSettings) {
        if ($foundSettings.ContainsKey($required)) {
            Write-Success "$required = $($foundSettings[$required])"
        } else {
            Write-Error "Missing required setting: $required"
        }
    }
    
    # Extract Key Vault name from URI if not provided
    if (-not $KeyVaultName -and $foundSettings.ContainsKey("KEY_VAULT_URI")) {
        $KeyVaultName = ($foundSettings["KEY_VAULT_URI"] -split "//")[1] -split "\." | Select-Object -First 1
        Write-Info "Detected Key Vault name: $KeyVaultName"
    }
    
} catch {
    Write-Error "Could not retrieve App Service configuration: $_"
}

# 3. Check Key Vault and secrets
if ($KeyVaultName) {
    Write-Info "Checking Key Vault secrets..."
    try {
        $secrets = az keyvault secret list --vault-name $KeyVaultName --query "[].{name:name}" | ConvertFrom-Json
        $requiredSecrets = @("DATAVERSE-URL", "CLIENT-ID", "CLIENT-SECRET", "TENANT-ID")
        
        foreach ($required in $requiredSecrets) {
            $found = $secrets | Where-Object { $_.name -eq $required }
            if ($found) {
                Write-Success "Secret found: $required"
            } else {
                Write-Error "Missing secret: $required"
            }
        }
    } catch {
        Write-Error "Could not access Key Vault '$KeyVaultName': $_"
        Write-Warning "Make sure you have 'Key Vault Secrets User' role on the Key Vault"
    }
}

# 4. Check Dataverse Application User (the ONLY thing that matters for permissions)
Write-Info "Checking Dataverse Application User..."
try {
    if ($KeyVaultName) {
        $dataverseUrl = az keyvault secret show --vault-name $KeyVaultName --name "DATAVERSE-URL" --query "value" -o tsv 2>$null
        $appId = az keyvault secret show --vault-name $KeyVaultName --name "CLIENT-ID" --query "value" -o tsv 2>$null
        
        if ($dataverseUrl -and $appId) {
            Write-Info "Testing Dataverse Application User setup..."
            Write-Info "App ID: $appId"
            
            # Get admin token to check Application User
            $adminToken = az account get-access-token --resource $dataverseUrl --query "accessToken" -o tsv 2>$null
            if ($adminToken) {
                $checkUrl = "$dataverseUrl/api/data/v9.2/systemusers?`$select=systemuserid,applicationid,fullname&`$filter=applicationid eq $appId"
                $headers = @{
                    "Authorization" = "Bearer $adminToken"
                    "Content-Type" = "application/json"
                    "Accept" = "application/json"
                }
                
                $userResponse = Invoke-RestMethod -Uri $checkUrl -Headers $headers -Method Get -ErrorAction SilentlyContinue
                if ($userResponse.value -and $userResponse.value.Length -gt 0) {
                    $appUser = $userResponse.value[0]
                    Write-Success "Application User exists: $($appUser.fullname) (ID: $($appUser.systemuserid))"
                    
                    # Check roles - this is what actually controls Dataverse permissions
                    $rolesUrl = "$dataverseUrl/api/data/v9.2/systemusers($($appUser.systemuserid))/systemuserroles_association?`$select=name"
                    $rolesResponse = Invoke-RestMethod -Uri $rolesUrl -Headers $headers -Method Get -ErrorAction SilentlyContinue
                    if ($rolesResponse.value -and $rolesResponse.value.Length -gt 0) {
                        $roleNames = $rolesResponse.value | ForEach-Object { $_.name }
                        Write-Success "Assigned security roles: $($roleNames -join ', ')"
                        
                        if ("System Administrator" -in $roleNames) {
                            Write-Success "Application User has System Administrator role - full Dataverse access"
                        } else {
                            Write-Warning "Application User does not have System Administrator role"
                        }
                    } else {
                        Write-Error "Application User has no security roles assigned - this will cause 403 errors"
                        Write-Warning "Run the setup script to assign security roles"
                    }
                } else {
                    Write-Error "Application User not found in Dataverse - this will cause 403 errors"
                    Write-Warning "Run the setup script to create the Application User"
                }
            } else {
                Write-Warning "Could not get admin token to check Application User"
            }
        }
    }
} catch {
    Write-Warning "Could not check Dataverse Application User: $_"
}

# 6. Test the actual application endpoint
Write-Info "Testing application health endpoint..."
try {
    $healthUrl = "https://$($appService.defaultHostName)/health"
    $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 30
    Write-Success "Application is responding"
    Write-Info "Health status: $($response | ConvertTo-Json -Depth 2)"
} catch {
    Write-Error "Application health check failed: $_"
    Write-Warning "The application might not be deployed or there could be startup issues"
}

# 7. Check recent application logs
Write-Info "Checking recent application logs..."
try {
    Write-Info "Getting latest application logs..."
    $logs = az webapp log tail --name $AppServiceName --resource-group $ResourceGroup --provider application | Out-String
    if ($logs) {
        Write-Info "Recent application logs:"
        Write-Host $logs.Substring(0, [Math]::Min(1000, $logs.Length)) -ForegroundColor Gray
        if ($logs.Length -gt 1000) {
            Write-Info "... (truncated, check full logs in Azure Portal)"
        }
    } else {
        Write-Warning "No recent application logs found"
    }
} catch {
    Write-Warning "Could not retrieve application logs: $_"
    Write-Info "Check logs manually in Azure Portal: https://portal.azure.com"
}

Write-Host ""
Write-Host "Diagnostics Complete" -ForegroundColor Yellow
Write-Host "====================" -ForegroundColor Yellow
Write-Info "If issues persist, check the App Service logs in Azure Portal for detailed error messages"
