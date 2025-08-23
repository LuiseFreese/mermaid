#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Test script for verifying Dataverse connection and Key Vault access
    
.DESCRIPTION
    This script tests the complete authentication chain:
    - Managed Identity access to Key Vault
    - Key Vault secret retrieval
    - Dataverse authentication and basic API calls
    
.PARAMETER KeyVaultUri
    The Key Vault URI (e.g., https://your-vault.vault.azure.net/)
    
.PARAMETER UseLocalEnv
    Use local .env file instead of Key Vault (for development testing)
    
.EXAMPLE
    .\test-dataverse-connection.ps1 -KeyVaultUri "https://kv-mermaid-secrets-123.vault.azure.net/"
    
.EXAMPLE
    .\test-dataverse-connection.ps1 -UseLocalEnv
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$KeyVaultUri,
    
    [Parameter(Mandatory = $false)]
    [switch]$UseLocalEnv
)

# Color functions for output
function Write-Success { param($Message) Write-Host " $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }

function Test-KeyVaultAccess {
    param($KeyVaultUri)
    
    Write-Info "Testing Key Vault access..."
    
    try {
        $vaultName = (([Uri]$KeyVaultUri).Host -split '\.')[0]
        $testSecret = az keyvault secret show --vault-name $vaultName --name "CLIENT-ID" --query "value" -o tsv 2>$null
        
        if ($testSecret) {
            Write-Success "Key Vault access: SUCCESS"
            return $true
        } else {
            Write-Error "Key Vault access: FAILED - Could not retrieve CLIENT-ID secret"
            return $false
        }
    }
    catch {
        Write-Error "Key Vault access: FAILED - $_"
        return $false
    }
}

function Get-SecretsFromKeyVault {
    param($KeyVaultUri)
    
    try {
        $vaultName = (([Uri]$KeyVaultUri).Host -split '\.')[0]
        
        $dataverseUrl = az keyvault secret show --vault-name $vaultName --name "DATAVERSE-URL" --query "value" -o tsv
        $clientId = az keyvault secret show --vault-name $vaultName --name "CLIENT-ID" --query "value" -o tsv
        $clientSecret = az keyvault secret show --vault-name $vaultName --name "CLIENT-SECRET" --query "value" -o tsv
        $tenantId = az keyvault secret show --vault-name $vaultName --name "TENANT-ID" --query "value" -o tsv
        
        return @{
            DataverseUrl = $dataverseUrl
            ClientId = $clientId
            ClientSecret = $clientSecret
            TenantId = $tenantId
        }
    }
    catch {
        Write-Error "Failed to retrieve secrets from Key Vault: $_"
        throw
    }
}

function Get-SecretsFromEnv {
    # Load .env file if it exists
    if (Test-Path ".env") {
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^([^=]+)=(.*)$') {
                [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
            }
        }
    }
    
    return @{
        DataverseUrl = $env:DATAVERSE_URL
        ClientId = $env:CLIENT_ID
        ClientSecret = $env:CLIENT_SECRET
        TenantId = $env:TENANT_ID
    }
}

function Get-AccessToken {
    param($ClientId, $ClientSecret, $TenantId, $DataverseUrl)
    
    Write-Info "Getting access token..."
    
    try {
        $tokenUrl = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
        $resource = $DataverseUrl
        
        $body = @{
            client_id = $ClientId
            client_secret = $ClientSecret
            scope = "$resource/.default"
            grant_type = "client_credentials"
        }
        
        $response = Invoke-RestMethod -Uri $tokenUrl -Method Post -Body $body -ContentType "application/x-www-form-urlencoded"
        
        if ($response.access_token) {
            Write-Success "Access token obtained successfully"
            return $response.access_token
        } else {
            Write-Error "Failed to obtain access token"
            return $null
        }
    }
    catch {
        Write-Error "Token request failed: $_"
        return $null
    }
}

function Test-DataverseConnection {
    param($DataverseUrl, $AccessToken)
    
    Write-Info "Testing Dataverse connection..."
    
    try {
        $headers = @{
            'Authorization' = "Bearer $AccessToken"
            'OData-MaxVersion' = '4.0'
            'OData-Version' = '4.0'
            'Accept' = 'application/json'
        }
        
        $response = Invoke-RestMethod -Uri "$DataverseUrl/api/data/v9.2/WhoAmI" -Method Get -Headers $headers
        
        if ($response.UserId) {
            Write-Success "Dataverse connection: SUCCESS"
            Write-Info "User ID: $($response.UserId)"
            return $true
        } else {
            Write-Error "Dataverse connection: FAILED - No user ID returned"
            return $false
        }
    }
    catch {
        Write-Error "Dataverse connection: FAILED - $_"
        return $false
    }
}

function Test-DataversePermissions {
    param($DataverseUrl, $AccessToken)
    
    Write-Info "Testing Dataverse permissions..."
    
    try {
        $headers = @{
            'Authorization' = "Bearer $AccessToken"
            'OData-MaxVersion' = '4.0'
            'OData-Version' = '4.0'
            'Accept' = 'application/json'
        }
        
        # Test if we can read solutions (requires System Customizer role or higher)
        $response = Invoke-RestMethod -Uri "$DataverseUrl/api/data/v9.2/solutions?`$select=friendlyname&`$top=1" -Method Get -Headers $headers
        
        if ($response.value) {
            Write-Success "Dataverse permissions: SUCCESS - Can read solutions"
            return $true
        } else {
            Write-Warning "Dataverse permissions: LIMITED - Can authenticate but may not have sufficient permissions"
            return $true
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 403) {
            Write-Error "Dataverse permissions: INSUFFICIENT - Application User needs 'System Customizer' role or higher"
        } else {
            Write-Error "Dataverse permissions test: FAILED - $_"
        }
        return $false
    }
}

function Show-TestResults {
    param($AllTestsPassed)
    
    Write-Host ""
    if ($AllTestsPassed) {
        Write-Host "🎉 All Tests Passed!" -ForegroundColor Green
        Write-Host ""
        Write-Host " Configuration is ready for deployment" -ForegroundColor Green
        Write-Host " Dataverse connection is working" -ForegroundColor Green
        Write-Host " Application User has sufficient permissions" -ForegroundColor Green
    } else {
        Write-Host "❌ Some Tests Failed" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please review the errors above and:" -ForegroundColor Yellow
        Write-Host "1. Verify Key Vault permissions" -ForegroundColor Yellow
        Write-Host "2. Check Dataverse Application User setup" -ForegroundColor Yellow
        Write-Host "3. Ensure security roles are properly assigned" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Main execution
function Main {
    Write-Host "🧪 Dataverse Connection Test" -ForegroundColor Magenta
    Write-Host "============================" -ForegroundColor Magenta
    Write-Host ""
    
    $allTestsPassed = $true
    
    try {
        # Get configuration
        if ($UseLocalEnv) {
            Write-Info "Using local environment variables..."
            $config = Get-SecretsFromEnv
        } elseif ($KeyVaultUri) {
            Write-Info "Using Key Vault: $KeyVaultUri"
            if (-not (Test-KeyVaultAccess -KeyVaultUri $KeyVaultUri)) {
                $allTestsPassed = $false
            } else {
                $config = Get-SecretsFromKeyVault -KeyVaultUri $KeyVaultUri
            }
        } else {
            Write-Error "Please specify either -KeyVaultUri or -UseLocalEnv"
            exit 1
        }
        
        # Validate configuration
        if (-not $config.DataverseUrl -or -not $config.ClientId -or -not $config.ClientSecret -or -not $config.TenantId) {
            Write-Error "Missing required configuration values"
            $allTestsPassed = $false
        } else {
            Write-Success "Configuration loaded successfully"
            Write-Info "Dataverse URL: $($config.DataverseUrl)"
            Write-Info "Client ID: $($config.ClientId)"
            Write-Info "Tenant ID: $($config.TenantId)"
        }
        
        if ($allTestsPassed) {
            # Get access token
            $accessToken = Get-AccessToken -ClientId $config.ClientId -ClientSecret $config.ClientSecret -TenantId $config.TenantId -DataverseUrl $config.DataverseUrl
            
            if ($accessToken) {
                # Test Dataverse connection
                if (-not (Test-DataverseConnection -DataverseUrl $config.DataverseUrl -AccessToken $accessToken)) {
                    $allTestsPassed = $false
                }
                
                # Test permissions
                if (-not (Test-DataversePermissions -DataverseUrl $config.DataverseUrl -AccessToken $accessToken)) {
                    $allTestsPassed = $false
                }
            } else {
                $allTestsPassed = $false
            }
        }
        
        Show-TestResults -AllTestsPassed $allTestsPassed
        
        if (-not $allTestsPassed) {
            exit 1
        }
    }
    catch {
        Write-Error "Test execution failed: $_"
        exit 1
    }
}

# Run the main function
Main
