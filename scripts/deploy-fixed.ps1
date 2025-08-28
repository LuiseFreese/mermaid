# Linux ZIP deploy for Node on Azure App Service (Oryx + az webapp deploy, Node 20)
# Usage: .\scripts\deploy.ps1 -ResourceGroup rg-mermaid-dataverse -AppServiceName app-mermaid-xyz [-KeyVaultName kv-...]

param(
    [Parameter(Mandatory = $true)] [string]$ResourceGroup,
    [Parameter(Mandatory = $true)] [string]$AppServiceName,
    [string]$KeyVaultName
)

$ErrorActionPreference = 'Stop'
Write-Host "=== Deploying to Linux App Service (Node) ===" -ForegroundColor Cyan

# ---- locate repo root & stage ------------------------------------------------
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if ($scriptDir -like "*\scripts") { Split-Path -Parent $scriptDir } else { $scriptDir }

$stage   = Join-Path $env:TEMP "mermaid-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$zipPath = Join-Path $scriptDir "mermaid-deployment.zip"
$hcFile  = Join-Path $env:TEMP "healthcheck-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"

Write-Host "Staging: $stage" -ForegroundColor Gray
Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore
New-Item -ItemType Directory -Path $stage | Out-Null

# ---- build package -----------------------------------------------------------
Write-Host "Copy package.json / package-lock.json..." -ForegroundColor Yellow
Copy-Item (Join-Path $projectRoot "package.json") (Join-Path $stage "package.json")

$pkgLock = Join-Path $projectRoot "package-lock.json"
if (Test-Path $pkgLock) {
    Copy-Item $pkgLock (Join-Path $stage "package-lock.json")
    Write-Host "  ✓ Copied package-lock.json" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No package-lock.json found" -ForegroundColor Yellow
}

Write-Host "Copy src/ ..." -ForegroundColor Yellow
Copy-Item (Join-Path $projectRoot "src") (Join-Path $stage "src") -Recurse
Remove-Item (Join-Path $stage "src\logs") -Recurse -Force -ErrorAction Ignore

Write-Host "Directory listing:" -ForegroundColor Gray
Get-ChildItem $stage -Recurse | ForEach-Object {
    $rel = $_.FullName.Replace($stage, "")
    $size = if ($_.PSIsContainer) { "folder" } else { "{0:N1}KB" -f ($_.Length / 1KB) }
    Write-Host "  $rel ($size)" -ForegroundColor DarkGray
}

Write-Host "Create ZIP..." -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force

# ---- discover Key Vault name (optional) -------------------------------------
if (-not $KeyVaultName) {
    $envFile = Join-Path $projectRoot ".env"
    if (Test-Path $envFile) {
        $kvLine = Select-String -Path $envFile -Pattern '^\s*KEY_VAULT_NAME\s*=\s*(.+)\s*$' -ErrorAction Ignore | Select-Object -First 1
        if ($kvLine) { $KeyVaultName = ($kvLine.Matches[0].Groups[1].Value).Trim() }
    }
}
if ($KeyVaultName) {
    Write-Host "Using Key Vault: $KeyVaultName (set as app setting)" -ForegroundColor Gray
}

# ---- app configuration for Oryx/Node on Linux -------------------------------
Write-Host "Harden app config for Linux/Node..." -ForegroundColor Yellow

# Grab site ARM id once (used for robust property updates)
$siteId = az webapp show --resource-group $ResourceGroup --name $AppServiceName --query id -o tsv

# Compile app settings array
$settings = @(
  "SCM_DO_BUILD_DURING_DEPLOYMENT=true",
  "WEBSITE_NODE_DEFAULT_VERSION=20.x",
  "PORT=8080"
)
if ($KeyVaultName) {
  $settings += "KEY_VAULT_NAME=$KeyVaultName"
  $settings += "USE_KEY_VAULT=true"
}

# Apply settings via az rest (robust for Linux containers)
$settingsJson = ($settings | ForEach-Object { 
    $name, $value = $_ -split '=', 2
    [PSCustomObject]@{ name = $name; value = $value }
}) | ConvertTo-Json -Compress
$bodyJson = @{ properties = @{ siteConfig = @{ appSettings = ($settingsJson | ConvertFrom-Json) } } } | ConvertTo-Json -Depth 5 -Compress

Write-Host "Applying app settings..." -ForegroundColor Yellow
az rest --method PUT --uri "https://management.azure.com$siteId/config/appsettings?api-version=2022-03-01" --body $bodyJson --only-show-errors --output none

# ---- deploy ZIP via az webapp deploy -------------------------------------
Write-Host "Deploy ZIP to App Service..." -ForegroundColor Yellow
az webapp deploy --resource-group $ResourceGroup --name $AppServiceName --src-path $zipPath --type zip --only-show-errors

# ---- post-deploy health check ----------------------------------------
Write-Host "Testing deployment health..." -ForegroundColor Yellow
$healthUrl = "https://$AppServiceName.azurewebsites.net/health"
$maxRetries = 12
$retryDelay = 10

for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
    try {
        Write-Host "  Attempt $attempt/$maxRetries..." -ForegroundColor Gray
        $response = Invoke-RestMethod -Uri $healthUrl -Method GET -TimeoutSec 30
        
        # Save health check response for debugging
        $response | ConvertTo-Json -Depth 10 | Out-File $hcFile -Encoding UTF8
        
        if ($response.status -eq "healthy") {
            Write-Host "✅ Deployment successful! App is healthy." -ForegroundColor Green
            break
        } else {
            Write-Host "⚠️ App responding but not healthy: $($response.status)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($attempt -eq $maxRetries) {
            Write-Host "❌ Deployment verification failed after $maxRetries attempts" -ForegroundColor Red
            Write-Host "Check app logs: az webapp log tail --resource-group $ResourceGroup --name $AppServiceName" -ForegroundColor Yellow
            exit 1
        }
    }
    
    if ($attempt -lt $maxRetries) {
        Write-Host "  Waiting $retryDelay seconds before retry..." -ForegroundColor Gray
        Start-Sleep $retryDelay
    }
}

# ---- configure logging ---------------------------------------------
az webapp log config --resource-group $ResourceGroup --name $AppServiceName `
  --application-logging filesystem --level information --only-show-errors --output none

Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore
Remove-Item $hcFile -Force -ErrorAction Ignore

Write-Host ""
Write-Host "🌐 https://$AppServiceName.azurewebsites.net/" -ForegroundColor Cyan
Write-Host "   Health: https://$AppServiceName.azurewebsites.net/health" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "Tailing logs (Ctrl+C to stop)..." -ForegroundColor Gray
az webapp log tail --resource-group $ResourceGroup --name $AppServiceName
