# Deployment script for mermaid-to-dataverse app
# ------------------------------------------

Write-Host "Starting deployment process for mermaid-to-dataverse app..." -ForegroundColor Green

# Get the script directory and project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# 1. Skip npm install - Azure will handle dependencies
Write-Host "Skipping local npm install (Azure will handle dependencies)..." -ForegroundColor Cyan

# 2. Create deployment package
Write-Host "Creating deployment package..." -ForegroundColor Cyan
$deploymentFolder = "$projectRoot\deployment"
$deploymentZip = "$projectRoot\deployment.zip"

# Clean up any previous deployment files
if (Test-Path $deploymentFolder) {
    Remove-Item -Path $deploymentFolder -Recurse -Force
}
if (Test-Path $deploymentZip) {
    Remove-Item -Path $deploymentZip -Force
}

# Get the script directory and project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# Create deployment folder and copy files
New-Item -ItemType Directory -Path $deploymentFolder -Force | Out-Null

# Copy production server (full Mermaid + Azure SDK integration)
Copy-Item "$projectRoot\src\server.js" -Destination "$deploymentFolder\server.js"

# Copy CommonJS modules
Copy-Item "$projectRoot\src\azure-keyvault.js" -Destination "$deploymentFolder\azure-keyvault.js"
Copy-Item "$projectRoot\src\mermaid-parser.js" -Destination "$deploymentFolder\mermaid-parser.js"
Copy-Item "$projectRoot\src\dataverse-client.js" -Destination "$deploymentFolder\dataverse-client.js"

# Copy UI files
Copy-Item "$projectRoot\src\wizard-ui.html" -Destination "$deploymentFolder\wizard-ui.html"

# Copy package.json (with Azure SDK dependencies)
Copy-Item "$projectRoot\package.json" -Destination "$deploymentFolder\package.json"

# Create a web.config file for Azure App Service
$webConfigContent = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <rule name="Node.js" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
          </conditions>
          <action type="Rewrite" url="server.js" />
        </rule>
      </rules>
    </rewrite>
    <iisnode watchedFiles="web.config;*.js" />
  </system.webServer>
</configuration>
"@

Set-Content -Path "$deploymentFolder\web.config" -Value $webConfigContent

# Create the ZIP file
Write-Host "Creating deployment ZIP..." -ForegroundColor Cyan
Compress-Archive -Path "$deploymentFolder\*" -DestinationPath $deploymentZip

# 3. Deploy to Azure App Service
Write-Host "Deploying to Azure App Service..." -ForegroundColor Cyan
az webapp deploy `
  --resource-group mermaid-dataverse-rg `
  --name mermaid-to-dataverse `
  --src-path $deploymentZip `
  --type zip

# 4. Clean up
Write-Host "Cleaning up..." -ForegroundColor Cyan
Remove-Item -Path $deploymentFolder -Recurse -Force
Remove-Item -Path $deploymentZip -Force

Write-Host "Deployment completed successfully!" -ForegroundColor Green
