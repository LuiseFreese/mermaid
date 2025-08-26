# Linux ZIP deploy for Node on Azure App Service (Oryx + OneDeploy)
# Usage: .\scripts\deploy.ps1 -ResourceGroup rg-mermaid-dataverse -AppServiceName app-mermaid-dataverse [-KeyVaultName kv-...]
param(
    [Parameter(Mandatory = $true)] [string]$ResourceGroup,
    [Parameter(Mandatory = $true)] [string]$AppServiceName,
    [string]$KeyVaultName  # optional; if omitted we'll try to read from .env
)

$ErrorActionPreference = 'Stop'
Write-Host "=== Deploying to Linux App Service (Node) ===" -ForegroundColor Cyan

# ---- locate repo root & stage ------------------------------------------------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if ($scriptDir -like "*\scripts") { Split-Path -Parent $scriptDir } else { $scriptDir }

$stage = Join-Path $env:TEMP "mermaid-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$zipPath = Join-Path $scriptDir "mermaid-deployment.zip"
$hcFile = Join-Path $env:TEMP "healthcheck-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"

Write-Host "Staging: $stage" -ForegroundColor Gray
Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore
New-Item -ItemType Directory -Path $stage | Out-Null

# ---- build package -----------------------------------------------------------
Write-Host "Copy package.json / package-lock.json..." -ForegroundColor Yellow
Copy-Item (Join-Path $projectRoot "package.json") (Join-Path $stage "package.json")
if (Test-Path (Join-Path $projectRoot "package-lock.json")) {
    Copy-Item (Join-Path $projectRoot "package-lock.json") (Join-Path $stage "package-lock.json")
    Write-Host "  ✓ Copied package-lock.json" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No package-lock.json found" -ForegroundColor Yellow
}

Write-Host "Copy src/ ..." -ForegroundColor Yellow
Copy-Item (Join-Path $projectRoot "src") (Join-Path $stage "src") -Recurse
Remove-Item (Join-Path $stage "src\logs") -Recurse -Force -ErrorAction Ignore
Write-Host "  ✓ Copied src/ directory" -ForegroundColor Green

Write-Host "Package contents:" -ForegroundColor DarkCyan
Get-ChildItem $stage -Recurse | ForEach-Object {
    $rel = $_.FullName.Substring($stage.Length + 1)
    $size = if ($_.PSIsContainer) { "folder" } else { "{0:N1}KB" -f ($_.Length / 1KB) }
    Write-Host "  - $rel $size"
}

Write-Host "Create ZIP..." -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force

# ---- discover Key Vault name (your server reads KEY_VAULT_NAME) -------------
if (-not $KeyVaultName) {
    $envFile = Join-Path $projectRoot ".env"
    if (Test-Path $envFile) {
        $kvLine = Select-String -Path $envFile -Pattern '^\s*KEY_VAULT_NAME\s*=\s*(.+)\s*$' -ErrorAction Ignore | Select-Object -First 1
        if ($kvLine) { $KeyVaultName = ($kvLine.Matches[0].Groups[1].Value).Trim() }
    }
}
if ($KeyVaultName) {
    Write-Host "Using Key Vault: $KeyVaultName (will set as app setting)" -ForegroundColor Gray
}

# ---- app configuration for Oryx/Node on Linux -------------------------------
Write-Host "Harden app config for Linux/Node..." -ForegroundColor Yellow

# 0) Ensure runtime to Node 18 LTS
$fx = az webapp config show --resource-group $ResourceGroup --name $AppServiceName --query linuxFxVersion -o tsv 2>$null
if (-not $fx -or ($fx -notlike "NODE|18*")) {
    Write-Host "Setting linuxFxVersion to NODE|18-lts..." -ForegroundColor Cyan
    az webapp config set --resource-group $ResourceGroup --name $AppServiceName --linux-fx-version "NODE|18-lts" --output none
}

# 1) Remove Run-From-Package flags (otherwise Oryx build is skipped)
az webapp config appsettings delete --resource-group $ResourceGroup --name $AppServiceName `
    --setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_RUN_FROM_ZIP --output none

# 2) Remove legacy Windows Node default version (harmless if absent)
az webapp config appsettings delete --resource-group $ResourceGroup --name $AppServiceName `
    --setting-names WEBSITE_NODE_DEFAULT_VERSION --output none

# 3) Oryx build + generous idle timeout + prod mode
$settings = @("SCM_DO_BUILD_DURING_DEPLOYMENT=1","SCM_COMMAND_IDLE_TIMEOUT=1800","NODE_ENV=production")
if ($KeyVaultName) { $settings += "KEY_VAULT_NAME=$KeyVaultName"; $settings += "USE_KEY_VAULT=true" }
az webapp config appsettings set --resource-group $ResourceGroup --name $AppServiceName --settings $settings --output none

# 4) Health check as proper JSON (no quoting issues)
'{"healthCheckPath":"/health"}' | Out-File -FilePath $hcFile -Encoding ascii -Force
az webapp config set --resource-group $ResourceGroup --name $AppServiceName --generic-configurations "@$hcFile" --output none
# AlwaysOn (only effective on Basic+)
az webapp config set --resource-group $ResourceGroup --name $AppServiceName --always-on true --output none

# 5) Clear any custom startup command reliably
$siteId = az webapp show --resource-group $ResourceGroup --name $AppServiceName --query id -o tsv
$currentCmd = az webapp config show --resource-group $ResourceGroup --name $AppServiceName --query siteConfig.appCommandLine -o tsv
if ($currentCmd) {
    Write-Host "Clearing existing startup command..." -ForegroundColor Cyan
    az resource update --ids $siteId --set siteConfig.appCommandLine="" --output none
}

# ---- deploy (retry OneDeploy, then fall back to config-zip) ------------------
function Invoke-OneDeploy {
    param([string]$zip)
    az webapp deploy --resource-group $ResourceGroup --name $AppServiceName --src-path $zip --type zip --async false --output none
}

function Invoke-ConfigZip {
    param([string]$zip)
    az webapp deployment source config-zip --resource-group $ResourceGroup --name $AppServiceName --src $zip --output none
}

Write-Host "Deploy ZIP (OneDeploy, with retries)..." -ForegroundColor Yellow
$max = 3; $ok = $false
for ($i=1; $i -le $max -and -not $ok; $i++) {
    try {
        Write-Host "Attempt $i of $max..." -ForegroundColor Gray
        Invoke-OneDeploy -zip $zipPath
        $ok = $true
    } catch {
        $msg = $_.Exception.Message
        Write-Host "OneDeploy failed: $msg" -ForegroundColor DarkYellow
        if ($i -lt $max) { Start-Sleep -Seconds (15 * $i) }
    }
}

if (-not $ok) {
    Write-Host "Falling back to config-zip..." -ForegroundColor Yellow
    Invoke-ConfigZip -zip $zipPath
}

Write-Host "✅ Deployment request accepted" -ForegroundColor Green

# ---- enable logs & quick post-deploy sanity ---------------------------------
az webapp log config --resource-group $ResourceGroup --name $AppServiceName --application-logging filesystem --level information --output none

# Clean local temp files
Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore
Remove-Item $hcFile -Force -ErrorAction Ignore

Write-Host ""
Write-Host "🌐 https://$AppServiceName.azurewebsites.net/" -ForegroundColor Cyan
Write-Host "   Health: https://$AppServiceName.azurewebsites.net/health" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "Tailing logs (Ctrl+C to stop)..." -ForegroundColor Gray
az webapp log tail --resource-group $ResourceGroup --name $AppServiceName
