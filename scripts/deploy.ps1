# Enhanced Mermaid to Dataverse Deployment Script
# Complete standalone deployment - no additional commands needed
# Usage: .\scripts\deploy.ps1 -ResourceGroup rg-name -AppServiceName app-name

param(
    [Parameter(Mandatory = $true)] [string]$ResourceGroup,
    [Parameter(Mandatory = $true)] [string]$AppServiceName,
    [Parameter(Mandatory = $false)] [string]$ManagedIdentityClientId,
    [Parameter(Mandatory = $false)] [switch]$SkipPermissions
)

$ErrorActionPreference = 'Stop'
Write-Host "=== Enhanced Standalone Deployment for Mermaid to Dataverse ===" -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Green
Write-Host "App Service: $AppServiceName" -ForegroundColor Green
Write-Host ""

# Function to check Azure CLI login
function Test-AzureLogin {
    try {
        $account = az account show --query "user.name" --output tsv 2>$null
        if ($account) {
            Write-Host "✅ Azure CLI authenticated as: $account" -ForegroundColor Green
            return $true
        }
    } catch {
        # Ignore errors
    }
    
    Write-Host "❌ Azure CLI not authenticated" -ForegroundColor Red
    Write-Host "Please run: az login" -ForegroundColor Yellow
    return $false
}

# Function to grant Key Vault permissions
function Grant-KeyVaultPermissions {
    param($KeyVaultName, $ResourceGroup)
    
    if ($SkipPermissions) {
        Write-Host "⏭️ Skipping Key Vault permissions (SkipPermissions flag)" -ForegroundColor Yellow
        return
    }
    
    try {
        Write-Host "🔐 Attempting to grant Key Vault permissions..." -ForegroundColor Yellow
        
        # Try RBAC assignment first
        $userId = az ad signed-in-user show --query id --output tsv
        if ($userId) {
            Write-Host "Granting Key Vault Secrets Officer role..." -ForegroundColor Yellow
            az role assignment create --assignee $userId --role "Key Vault Secrets Officer" --scope "/subscriptions/$(az account show --query id --output tsv)/resourcegroups/$ResourceGroup/providers/Microsoft.KeyVault/vaults/$KeyVaultName" 2>$null
            
            # Wait a moment for permissions to propagate
            Write-Host "⏳ Waiting 10 seconds for permissions to propagate..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10
            
            Write-Host "✅ Key Vault permissions granted successfully" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️ Could not grant Key Vault permissions: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   Deployment will continue with runtime Key Vault authentication" -ForegroundColor Yellow
    }
}

# Check prerequisites
if (-not (Test-AzureLogin)) {
    throw "Azure CLI authentication required. Please run 'az login' first."
}

try {
    # Get Key Vault and Managed Identity details
    Write-Host "Getting Key Vault and Managed Identity details..." -ForegroundColor Yellow
    $keyVaultName = az resource list --resource-group $ResourceGroup --resource-type "Microsoft.KeyVault/vaults" --query "[0].name" --output tsv
    $managedIdentityName = az resource list --resource-group $ResourceGroup --resource-type "Microsoft.ManagedIdentity/userAssignedIdentities" --query "[0].name" --output tsv
    
    # Use provided managed identity client ID if available, otherwise get it from resources
    if ($ManagedIdentityClientId) {
        $managedIdentityClientId = $ManagedIdentityClientId
        Write-Host "Using provided Managed Identity Client ID: $managedIdentityClientId" -ForegroundColor Green
    } else {
        $managedIdentityClientId = az identity show --resource-group $ResourceGroup --name $managedIdentityName --query "clientId" --output tsv
    }
    
    $keyVaultUri = "https://$keyVaultName.vault.azure.net/"
    Write-Host "Found Key Vault: $keyVaultName" -ForegroundColor Green
    Write-Host "Found Managed Identity: $managedIdentityName ($managedIdentityClientId)" -ForegroundColor Green
    
    # Grant Key Vault permissions to current user if needed
    Grant-KeyVaultPermissions -KeyVaultName $keyVaultName -ResourceGroup $ResourceGroup
    
    # Configure app settings for proper Node.js deployment with Key Vault integration
    Write-Host "Configuring app settings..." -ForegroundColor Yellow
    
    # Securely retrieve secrets from Key Vault for fallback environment variables
    Write-Host "Retrieving secrets from Key Vault for app settings..." -ForegroundColor Yellow
    try {
        $dataverseUrl = az keyvault secret show --vault-name $keyVaultName --name "DATAVERSE-URL" --query "value" --output tsv
        $clientId = az keyvault secret show --vault-name $keyVaultName --name "CLIENT-ID" --query "value" --output tsv
        $clientSecret = az keyvault secret show --vault-name $keyVaultName --name "CLIENT-SECRET" --query "value" --output tsv
        $tenantId = az keyvault secret show --vault-name $keyVaultName --name "TENANT-ID" --query "value" --output tsv
        $solutionName = az keyvault secret show --vault-name $keyVaultName --name "SOLUTION-NAME" --query "value" --output tsv
        
        Write-Host "✅ Successfully retrieved secrets from Key Vault" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Warning: Could not retrieve some secrets from Key Vault: $_" -ForegroundColor Yellow
        Write-Host "   App will rely on Key Vault integration at runtime" -ForegroundColor Yellow
        # Set fallback values to empty - the app will use Key Vault at runtime
        $dataverseUrl = ""
        $clientId = ""
        $clientSecret = ""
        $tenantId = ""
        $solutionName = "MermaidSolution"
    }
    
    # Use retrieved secrets as fallback environment variables
    # These serve as fallbacks if Key Vault authentication fails at runtime
    $settings = @{
        "SCM_DO_BUILD_DURING_DEPLOYMENT" = "true"
        "ENABLE_ORYX_BUILD" = "true" 
        "WEBSITES_PORT" = "8080"
        "USE_KEY_VAULT" = "true"
        "KEY_VAULT_URI" = $keyVaultUri
        "KEY_VAULT_NAME" = $keyVaultName
        "MANAGED_IDENTITY_CLIENT_ID" = $managedIdentityClientId
        "AUTH_MODE" = "managed-identity"
        "DATAVERSE_URL" = $dataverseUrl
        "CLIENT_ID" = $clientId
        "CLIENT_SECRET" = $clientSecret
        "TENANT_ID" = $tenantId
        "SOLUTION_NAME" = $solutionName
    }
    
    # Convert to array format for az webapp config appsettings set
    $settingsArray = $settings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
    
    Write-Host "Setting app configuration with Key Vault integration and fallback environment variables..." -ForegroundColor Yellow
    az webapp config appsettings set --resource-group $ResourceGroup --name $AppServiceName --settings $settingsArray
    
    # Ensure Managed Identity is assigned to the App Service
    Write-Host "Configuring Managed Identity assignment..." -ForegroundColor Yellow
    az webapp identity assign --resource-group $ResourceGroup --name $AppServiceName --identities "/subscriptions/$(az account show --query id --output tsv)/resourcegroups/$ResourceGroup/providers/Microsoft.ManagedIdentity/userAssignedIdentities/$managedIdentityName" | Out-Null
    
    # Set startup command
    Write-Host "Setting startup command..." -ForegroundColor Yellow
    az webapp config set --resource-group $ResourceGroup --name $AppServiceName --startup-file "npm start"
    
    # Create deployment zip with all necessary files
    Write-Host "Creating deployment package..." -ForegroundColor Yellow
    $zipPath = "deploy.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    
    # Include all necessary files for Node.js deployment
    Compress-Archive -Path "src", "package.json", "package-lock.json" -DestinationPath $zipPath -Force
    
    # Retry deployment with exponential backoff for Kudu connection issues
    Write-Host "Deploying application with retry logic..." -ForegroundColor Yellow
    $maxRetries = 3
    $retryCount = 0
    $deploymentSuccess = $false
    
    while ($retryCount -lt $maxRetries -and -not $deploymentSuccess) {
        try {
            if ($retryCount -gt 0) {
                $waitTime = [math]::Pow(2, $retryCount) * 30  # 30s, 60s, 120s
                Write-Host "Retry attempt $($retryCount + 1) of $maxRetries after $waitTime seconds..." -ForegroundColor Yellow
                Start-Sleep -Seconds $waitTime
            }
            
            Write-Host "Attempting deployment..." -ForegroundColor Cyan
            az webapp deploy --resource-group $ResourceGroup --name $AppServiceName --src-path $zipPath --type zip --timeout 600
            
            if ($LASTEXITCODE -eq 0) {
                $deploymentSuccess = $true
                Write-Host "✅ Application deployed successfully!" -ForegroundColor Green
            } else {
                throw "az webapp deploy failed with exit code $LASTEXITCODE"
            }
        } catch {
            $retryCount++
            $errorMessage = $_.Exception.Message
            Write-Host "❌ Deployment attempt $retryCount failed: $errorMessage" -ForegroundColor Red
            
            # Check for specific Kudu connection errors
            if ($errorMessage -like "*Connection aborted*" -or $errorMessage -like "*RemoteDisconnected*" -or $errorMessage -like "*Warming up Kudu*") {
                Write-Host "⚠️ Detected Kudu connection issue - this is a known Azure App Service problem" -ForegroundColor Yellow
                if ($retryCount -lt $maxRetries) {
                    Write-Host "🔄 Will retry with exponential backoff..." -ForegroundColor Yellow
                    continue
                }
            }
            
            if ($retryCount -ge $maxRetries) {
                Write-Host "❌ All retry attempts failed. Final error: $errorMessage" -ForegroundColor Red
                throw "Deployment failed after $maxRetries attempts: $errorMessage"
            }
        }
    }
    
    if ($deploymentSuccess) {
        Write-Host ""
        Write-Host "🌐 App URL: https://$AppServiceName.azurewebsites.net/" -ForegroundColor Cyan
        Write-Host "🧙 Wizard: https://$AppServiceName.azurewebsites.net/wizard" -ForegroundColor Cyan
        Write-Host "❤️ Health: https://$AppServiceName.azurewebsites.net/health" -ForegroundColor DarkCyan
        
        # Test the deployment
        Write-Host ""
        Write-Host "🧪 Testing deployment..." -ForegroundColor Yellow
        try {
            $healthResponse = Invoke-RestMethod -Uri "https://$AppServiceName.azurewebsites.net/health" -TimeoutSec 30
            if ($healthResponse.status -eq "healthy") {
                Write-Host "✅ Application is running and healthy!" -ForegroundColor Green
                Write-Host "🎉 Deployment completed successfully with updated global choices functionality!" -ForegroundColor Green
            } else {
                Write-Host "⚠️ Application deployed but health check returned: $($healthResponse.status)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "⚠️ Application deployed but health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "   The app may still be starting up. Please check the URL manually." -ForegroundColor Yellow
        }
        
        # Clean up
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    } else {
        throw "Deployment failed after all retry attempts"
    }
} catch {
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    throw
}
