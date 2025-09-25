#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Set up local development environment for Mermaid React application

.DESCRIPTION
    This script helps configure local development environment variables for testing
    without deploying to Azure. It sets up client secret authentication to connect
    to Dataverse directly from your local machine.
    
    Can use existing App Registration credentials or create a new one automatically.

.PARAMETER TenantId
    Azure AD Tenant ID

.PARAMETER ClientId
    App Registration Client ID (Application ID)

.PARAMETER ClientSecret
    App Registration Client Secret

.PARAMETER DataverseUrl
    Dataverse environment URL (e.g., https://your-org.crm.dynamics.com)

.PARAMETER EnvFile
    Path to .env file to create/update (default: .env.local)

.PARAMETER CreateAppRegistration
    Create a new App Registration with client secret for local development

.PARAMETER AppDisplayName
    Display name for new App Registration (only used with -CreateAppRegistration)

.EXAMPLE
    # Interactive setup with existing App Registration
    .\scripts\setup-local-dev.ps1
    
.EXAMPLE
    # Create new App Registration and set up environment
    .\scripts\setup-local-dev.ps1 -CreateAppRegistration -DataverseUrl "https://your-org.crm.dynamics.com"
    
.EXAMPLE
    # Automated setup with existing credentials
    .\scripts\setup-local-dev.ps1 -TenantId "xxx" -ClientId "xxx" -ClientSecret "xxx" -DataverseUrl "https://your-org.crm.dynamics.com"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$TenantId,
    
    [Parameter(Mandatory = $false)]
    [string]$ClientId,
    
    [Parameter(Mandatory = $false)]
    [string]$ClientSecret,
    
    [Parameter(Mandatory = $false)]
    [string]$DataverseUrl,
    
    [Parameter(Mandatory = $false)]
    [string]$EnvFile = ".env.local",
    
    [Parameter(Mandatory = $false)]
    [switch]$CreateAppRegistration,
    
    [Parameter(Mandatory = $false)]
    [string]$AppDisplayName = "Mermaid-LocalDev-$env:USERNAME"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "🛠️  Setting up local development environment" -ForegroundColor Green
Write-Host "This will configure client secret authentication for local testing" -ForegroundColor Cyan

# Option to create new App Registration
if ($CreateAppRegistration) {
    Write-Host "`n🔧 Creating new App Registration for local development..." -ForegroundColor Yellow
    
    if (-not $DataverseUrl) {
        $DataverseUrl = Read-Host "Enter your Dataverse URL (required for App Registration setup)"
        if (-not $DataverseUrl) {
            Write-Error "Dataverse URL is required when creating App Registration"
        }
    }
    
    # Call the create-local-dev-app.ps1 script
    $createAppScript = Join-Path $PSScriptRoot "create-local-dev-app.ps1"
    if (-not (Test-Path $createAppScript)) {
        Write-Error "create-local-dev-app.ps1 script not found. Please ensure it's in the same directory."
    }
    
    Write-Host "Calling create-local-dev-app.ps1..." -ForegroundColor Gray
    $createParams = @{
        AppDisplayName = $AppDisplayName
        DataverseUrl = $DataverseUrl
        CreateEnvFile = $true
    }
    
    & $createAppScript @createParams
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ App Registration created and .env.local configured!" -ForegroundColor Green
        Write-Host "`n🚀 Ready to start local development:" -ForegroundColor Cyan
        Write-Host "   npm run dev:local" -ForegroundColor White
        exit 0
    } else {
        Write-Error "Failed to create App Registration"
    }
}

# Interactive prompts if parameters not provided
if (-not $TenantId) {
    Write-Host "`n📝 Please provide your existing App Registration details:" -ForegroundColor Cyan
    Write-Host "   (Or use -CreateAppRegistration to create a new one)" -ForegroundColor Gray
    $TenantId = Read-Host "Enter your Azure AD Tenant ID"
}

if (-not $ClientId) {
    $ClientId = Read-Host "Enter your App Registration Client ID (Application ID)"
}

if (-not $ClientSecret) {
    $ClientSecret = Read-Host "Enter your App Registration Client Secret" -AsSecureString
    $ClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ClientSecret))
}

if (-not $DataverseUrl) {
    $DataverseUrl = Read-Host "Enter your Dataverse URL (e.g., https://your-org.crm.dynamics.com)"
}

# Validate inputs
if (-not $TenantId -or $TenantId.Length -lt 10) {
    Write-Error "Invalid Tenant ID"
}

if (-not $ClientId -or $ClientId.Length -lt 10) {
    Write-Error "Invalid Client ID"
}

if (-not $ClientSecret -or $ClientSecret.Length -lt 10) {
    Write-Error "Invalid Client Secret"
}

if (-not $DataverseUrl -or -not $DataverseUrl.StartsWith("https://")) {
    Write-Error "Invalid Dataverse URL - must start with https://"
}

# Clean up URL
$DataverseUrl = $DataverseUrl.TrimEnd('/')

Write-Host "Creating environment file: $EnvFile" -ForegroundColor Yellow

# Create .env file content
$envContent = @"
# Local Development Environment Variables
# Generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Node.js Environment
NODE_ENV=development

# Authentication Method (Client Secret for local development)
USE_CLIENT_SECRET=true
USE_MANAGED_IDENTITY=false
USE_FEDERATED_CREDENTIAL=false

# Azure AD Configuration
TENANT_ID=$TenantId
CLIENT_ID=$ClientId
CLIENT_SECRET=$ClientSecret

# Dataverse Configuration
DATAVERSE_URL=$DataverseUrl

# Server Configuration
PORT=8080
STATIC_FILES_PATH=../frontend/dist

# Logging
LOG_REQUEST_BODY=true
STREAM_CHUNK_SIZE=8192

# Development Features
ENABLE_CORS=true
INCLUDE_STACK=true
"@

# Write environment file
$envContent | Out-File -FilePath $EnvFile -Encoding UTF8 -Force

Write-Host "✅ Environment file created: $EnvFile" -ForegroundColor Green

# Show next steps
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Make sure your App Registration has the following permissions:" -ForegroundColor Yellow
Write-Host "   - Dynamics CRM (user_impersonation)" -ForegroundColor Gray
Write-Host "   - Microsoft Graph (User.Read - optional)" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Make sure your App Registration has a Dataverse Application User:" -ForegroundColor Yellow
Write-Host "   - Go to Power Platform Admin Center" -ForegroundColor Gray
Write-Host "   - Select your environment → Users → Application Users" -ForegroundColor Gray
Write-Host "   - Create application user with System Customizer role" -ForegroundColor Gray
Write-Host "   - Use Client ID: $ClientId" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Start the development servers:" -ForegroundColor Yellow
Write-Host "   # Backend server (with .env.local)" -ForegroundColor Gray
Write-Host "   npm run dev:backend" -ForegroundColor Gray
Write-Host ""
Write-Host "   # Frontend server (separate terminal)" -ForegroundColor Gray
Write-Host "   cd src/frontend && npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Test the connection:" -ForegroundColor Yellow
Write-Host "   curl http://localhost:8080/health" -ForegroundColor Gray
Write-Host "   curl http://localhost:8080/api/publishers" -ForegroundColor Gray
Write-Host ""

# Add npm script suggestion
Write-Host "💡 Tip: Add this script to your package.json:" -ForegroundColor Cyan
Write-Host '"dev:backend": "node -r dotenv/config src/backend/server.js dotenv_config_path=.env.local"' -ForegroundColor Gray

Write-Host ""
Write-Host "⚠️  Security Note:" -ForegroundColor Yellow
Write-Host "The $EnvFile file contains sensitive credentials." -ForegroundColor Yellow
Write-Host "Make sure it's included in your .gitignore file!" -ForegroundColor Yellow

# Check .gitignore
if (Test-Path ".gitignore") {
    $gitignoreContent = Get-Content ".gitignore" -Raw
    if (-not $gitignoreContent.Contains(".env.local")) {
        Write-Host ""
        Write-Host "Adding .env.local to .gitignore..." -ForegroundColor Yellow
        Add-Content ".gitignore" "`n# Local development environment`n.env.local"
        Write-Host "✅ Added .env.local to .gitignore" -ForegroundColor Green
    }
} else {
    Write-Warning ".gitignore file not found - make sure to not commit $EnvFile"
}

Write-Host ""
Write-Host "🎉 Local development environment setup complete!" -ForegroundColor Green