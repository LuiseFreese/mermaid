# Simplified app deployment for Mermaid to Dataverse
# This is now called by setup-entra-app.ps1 after infrastructure is deployed
# Usage: .\scripts\deploy.ps1 -ResourceGroup rg-name -AppServiceName app-name

param(
    [Parameter(Mandatory = $true)] [string]$ResourceGroup,
    [Parameter(Mandatory = $true)] [string]$AppServiceName
)

$ErrorActionPreference = 'Stop'
Write-Host "=== Deploying Application to App Service ===" -ForegroundColor Cyan

try {
   
    Write-Host "Deploying application using az webapp up..." -ForegroundColor Yellow
    az webapp up --resource-group $ResourceGroup --name $AppServiceName --runtime "NODE:20-lts" --sku B1 --only-show-errors
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Application deployed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 App URL: https://$AppServiceName.azurewebsites.net/" -ForegroundColor Cyan
        Write-Host "❤️ Health: https://$AppServiceName.azurewebsites.net/health" -ForegroundColor DarkCyan
    } else {
        throw "az webapp up failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    throw
}
