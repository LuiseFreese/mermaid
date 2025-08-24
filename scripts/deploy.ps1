# Linux ZIP deploy for App Service with Oryx

Write-Host "Starting Linux deployment for mermaid-to-dataverse app..." -ForegroundColor Green

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$stage       = Join-Path $scriptDir 'deployment'
$zipPath     = Join-Path $scriptDir 'deployment.zip'
$rg          = "rg-mermaid-dataverse"
$app         = "app-mermaid-dataverse"

Write-Host "Cleaning up previous deployment files..." -ForegroundColor Cyan
Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore
New-Item -ItemType Directory -Path $stage | Out-Null

Write-Host "Copying package manifest..." -ForegroundColor Yellow
# Copy package manifest(s)
Copy-Item "$projectRoot\package.json" "$stage\package.json"
Write-Host "  ✓ Copied package.json" -ForegroundColor Green

if (Test-Path "$projectRoot\package-lock.json") {
  Copy-Item "$projectRoot\package-lock.json" "$stage\package-lock.json"
  Write-Host "  ✓ Copied package-lock.json" -ForegroundColor Green
} else {
  Write-Host "  ⚠ No package-lock.json found" -ForegroundColor Yellow
}

Write-Host "Copying source files..." -ForegroundColor Yellow
Copy-Item "$projectRoot\src" "$stage\src" -Recurse
# (Optional) drop local logs from the package
Remove-Item "$stage\src\logs" -Recurse -Force -ErrorAction Ignore
Write-Host "  ✓ Copied src/ directory" -ForegroundColor Green

# Show what we're deploying
Write-Host "Package contents:" -ForegroundColor Cyan
Get-ChildItem $stage -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($stage.Length + 1)
    $size = if ($_.PSIsContainer) { "folder" } else { "{0:N1}KB" -f ($_.Length / 1KB) }
    Write-Host "  - $relativePath $size" -ForegroundColor White
}

Write-Host "Creating deployment ZIP..." -ForegroundColor Cyan
# Create zip
Compress-Archive -Path "$stage\*" -DestinationPath $zipPath -Force

# ----- App config hardening for Linux + Oryx -----

Write-Host "Removing settings that force Run-From-Zip..." -ForegroundColor Cyan
# Remove WEBSITE_RUN_FROM_PACKAGE and WEBSITE_RUN_FROM_ZIP (forces "skip build")
az webapp config appsettings delete `
  --resource-group $rg `
  --name $app `
  --setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_RUN_FROM_ZIP `
  --output none

# Remove Windows-style Node version setting if it exists
az webapp config appsettings delete `
  --resource-group $rg `
  --name $app `
  --setting-names WEBSITE_NODE_DEFAULT_VERSION `
  --output none

Write-Host "Configuring app settings for Oryx..." -ForegroundColor Cyan
# Let Oryx build/install and give it time
az webapp config appsettings set `
  --resource-group $rg `
  --name $app `
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=1 SCM_COMMAND_IDLE_TIMEOUT=1800 `
  --output none

# Clear custom startup so Oryx will pick 'npm start'
Write-Host "Clearing custom startup (if any)..." -ForegroundColor Cyan
az webapp config set `
  --resource-group $rg `
  --name $app `
  --startup-file "" `
  --output none

# Ensure Linux Node 18 runtime
$fx = az webapp config show -g $rg -n $app --query linuxFxVersion -o tsv 2>$null
if (-not $fx -or -not $fx.StartsWith("NODE|18")) {
  Write-Host "Setting linuxFxVersion to NODE|18-lts..." -ForegroundColor Cyan
  az webapp config set -g $rg -n $app --linux-fx-version "NODE|18-lts" --output none
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Failed to configure app settings" -ForegroundColor Red
  exit 1
}

# ----- Deploy (OneDeploy API) -----

Write-Host "Deploying ZIP package with OneDeploy API..." -ForegroundColor Cyan
# Deploy with OneDeploy API (NOT config-zip) - this allows Oryx to build
az webapp deploy `
  --resource-group $rg `
  --name $app `
  --src-path $zipPath `
  --type zip `
  --async false

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Zip deploy failed" -ForegroundColor Red
  Write-Host "Checking deployment logs..." -ForegroundColor Yellow
  az webapp log deployment show -n $app -g $rg --logs
  exit 1
}

Write-Host "✅ Deployment successful!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Application URL: https://$app.azurewebsites.net/" -ForegroundColor Cyan
Write-Host "Oryx will now:" -ForegroundColor Yellow
Write-Host "  1. Detect Node.js from package.json" -ForegroundColor White
Write-Host "  2. Run npm install to install dependencies" -ForegroundColor White
Write-Host "  3. Start with: npm start -> node src/server.js" -ForegroundColor White

Write-Host ""
Write-Host "Checking deployment logs..." -ForegroundColor Cyan
az webapp log deployment show -g $rg -n $app --logs

Write-Host ""
Write-Host "Enabling application logging..." -ForegroundColor Cyan
az webapp log config -g $rg -n $app --application-logging filesystem --level information --output none

Write-Host ""
Write-Host "Tailing logs to watch build/startup..." -ForegroundColor Cyan

# Clean up local files
Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore

# Tail logs to watch the process
az webapp log tail -n $app -g $rg