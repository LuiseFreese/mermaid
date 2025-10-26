#!/usr/bin/env pwsh

<#
.SYNOPSIS
    ➕ Add New Environment to Existing Mermaid Deployment

.DESCRIPTION
    This script adds a new Dataverse environment to an existing Mermaid deployment.
    It will:
    1. Ask for environment URL and Power Platform Environment ID
    2. Try to auto-detect the environment name from Dataverse
    3. Create Dataverse Application User
    4. Update the environment configuration

.EXAMPLE
    # Interactive mode
    .\scripts\add-environment.ps1

.EXAMPLE
    # Specify parameters
    .\scripts\add-environment.ps1 -DataverseUrl "https://neworg.crm.dynamics.com" -PowerPlatformEnvironmentId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -EnvironmentName "New Production"

.NOTES
    Prerequisites:
    - Existing Mermaid deployment with App Registration
    - Power Platform Admin or Dataverse System Admin access for the new environment
    - PAC CLI installed (for auto-detection)
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)] [string]$DataverseUrl,
    [Parameter(Mandatory = $false)] [string]$PowerPlatformEnvironmentId,
    [Parameter(Mandatory = $false)] [string]$EnvironmentName,
    [Parameter(Mandatory = $false)] [string]$EnvironmentColor,
    [Parameter(Mandatory = $false)] [string]$AppRegistrationName,
    [Parameter(Mandatory = $false)] [string]$SecurityRole = "System Customizer",
    [Parameter(Mandatory = $false)] [string]$EnvironmentConfigFile = "data/environments.json",
    [Parameter(Mandatory = $false)] [switch]$DryRun
)

# ---------- Output helpers ----------
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info    { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error   { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step    { param($Message) Write-Host "`n🔸 $Message" -ForegroundColor Magenta }

# ---------- Environment Detection ----------
function Get-DataverseEnvironmentInfo {
    param(
        [string]$EnvironmentUrl,
        [string]$PowerPlatformEnvironmentId
    )
    
    try {
        Write-Info "Detecting environment information..."
        
        # Try Power Platform CLI first
        if ($PowerPlatformEnvironmentId) {
            $envInfo = pac admin list --json | ConvertFrom-Json | Where-Object { $_.EnvironmentId -eq $PowerPlatformEnvironmentId }
            if ($envInfo) {
                return @{
                    Name = $envInfo.DisplayName
                    OrganizationName = $envInfo.DomainName
                    Region = $envInfo.Location
                    Success = $true
                }
            }
        }
        
        # Fallback: Extract from URL
        if ($EnvironmentUrl -match "https://([^.]+)\.crm") {
            $orgName = $matches[1]
            return @{
                Name = $orgName
                OrganizationName = $orgName
                Region = "Unknown"
                Success = $false  # Partial info only
            }
        }
        
        return @{ Success = $false }
    }
    catch {
        Write-Warning "Auto-detection failed: $($_.Exception.Message)"
        return @{ Success = $false }
    }
}

# ---------- Configuration Management ----------
function Load-EnvironmentConfiguration {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        Write-Warning "Environment configuration file not found: $FilePath"
        Write-Info "Creating new configuration..."
        return @{
            version = "1.0.0"
            defaultEnvironmentId = $null
            environments = @()
        }
    }
    
    try {
        $content = Get-Content $FilePath -Raw | ConvertFrom-Json
        Write-Success "Loaded existing environment configuration"
        return $content
    }
    catch {
        Write-Error "Failed to parse environment configuration: $($_.Exception.Message)"
        exit 1
    }
}

function Save-EnvironmentConfiguration {
    param(
        [object]$Config,
        [string]$FilePath
    )
    
    try {
        # Ensure directory exists
        $dir = Split-Path -Path $FilePath -Parent
        if (![string]::IsNullOrEmpty($dir) -and -not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $FilePath -Encoding UTF8
        Write-Success "Environment configuration saved to: $FilePath"
    }
    catch {
        Write-Error "Failed to save configuration: $($_.Exception.Message)"
        exit 1
    }
}

# ---------- Main Script ----------
Write-Step "Add New Environment to Mermaid Deployment"

# Check prerequisites
Write-Info "Checking prerequisites..."

try {
    az version | Out-Null
    Write-Success "Azure CLI is available"
} catch {
    Write-Error "Azure CLI is required but not found"
    exit 1
}

try {
    pac --version | Out-Null
    Write-Success "Power Platform CLI is available"
} catch {
    Write-Warning "Power Platform CLI not found - auto-detection will be limited"
}

# Load existing configuration
$config = Load-EnvironmentConfiguration -FilePath $EnvironmentConfigFile

# Get environment details interactively if not provided
if (-not $DataverseUrl) {
    do {
        $DataverseUrl = Read-Host "Enter Dataverse Environment URL (e.g., https://org12345.crm4.dynamics.com)"
        if (-not $DataverseUrl -or -not $DataverseUrl.StartsWith("https://")) {
            Write-Warning "Please enter a valid HTTPS URL"
        }
    } while (-not $DataverseUrl -or -not $DataverseUrl.StartsWith("https://"))
}

$DataverseUrl = $DataverseUrl.TrimEnd('/')

if (-not $PowerPlatformEnvironmentId) {
    do {
        $PowerPlatformEnvironmentId = Read-Host "Enter Power Platform Environment ID (GUID)"
        if (-not $PowerPlatformEnvironmentId -or $PowerPlatformEnvironmentId.Length -ne 36) {
            Write-Warning "Please enter a valid GUID (36 characters)"
        }
    } while (-not $PowerPlatformEnvironmentId -or $PowerPlatformEnvironmentId.Length -ne 36)
}

# Check if environment already exists
$existingEnv = $config.environments | Where-Object { $_.url -eq $DataverseUrl }
if ($existingEnv) {
    Write-Warning "Environment with URL $DataverseUrl already exists: $($existingEnv.name)"
    $overwrite = Read-Host "Overwrite existing configuration? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Info "Operation cancelled"
        exit 0
    }
    
    # Remove existing environment
    $config.environments = $config.environments | Where-Object { $_.url -ne $DataverseUrl }
}

# Auto-detect environment information
$envInfo = Get-DataverseEnvironmentInfo -EnvironmentUrl $DataverseUrl -PowerPlatformEnvironmentId $PowerPlatformEnvironmentId

# Get environment name
if (-not $EnvironmentName) {
    if ($envInfo.Success -and $envInfo.Name) {
        Write-Success "Auto-detected environment name: $($envInfo.Name)"
        $useDetected = Read-Host "Use this name? (Y/n)"
        if ($useDetected -eq "n" -or $useDetected -eq "N") {
            $EnvironmentName = Read-Host "Enter custom environment name"
        } else {
            $EnvironmentName = $envInfo.Name
        }
    } else {
        $EnvironmentName = Read-Host "Enter environment name (e.g., 'Customer Development', 'Production (EMEA)')"
    }
}

# Get environment color
if (-not $EnvironmentColor) {
    Write-Info "Choose environment color for UI identification:"
    Write-Host "  1. Blue (Development)" -ForegroundColor Blue
    Write-Host "  2. Green (UAT/Staging)" -ForegroundColor Green
    Write-Host "  3. Yellow (Testing)" -ForegroundColor Yellow
    Write-Host "  4. Red (Production)" -ForegroundColor Red
    Write-Host "  5. Purple (Integration)" -ForegroundColor Magenta
    Write-Host "  6. Gray (Other)" -ForegroundColor Gray
    
    do {
        $colorChoice = Read-Host "Select color (1-6)"
    } while ($colorChoice -notmatch "^[1-6]$")
    
    $colors = @("blue", "green", "yellow", "red", "purple", "gray")
    $EnvironmentColor = $colors[$colorChoice - 1]
}

# Generate environment ID
$environmentId = -join ((65..90) + (97..122) | Get-Random -Count 8 | ForEach-Object {[char]$_}).ToLower()

# Create environment object
$newEnvironment = @{
    id = $environmentId
    name = $EnvironmentName
    url = $DataverseUrl
    description = "Added via add-environment script"
    color = $EnvironmentColor
    lastConnected = $null
    metadata = @{
        organizationName = if ($envInfo.OrganizationName) { $envInfo.OrganizationName } else { "" }
        organizationDisplayName = $EnvironmentName
        region = if ($envInfo.Region) { $envInfo.Region } else { "Unknown" }
    }
}

# Show summary
Write-Step "Environment Summary"
Write-Host "  Name: $EnvironmentName" -ForegroundColor White
Write-Host "  URL: $DataverseUrl" -ForegroundColor Gray
Write-Host "  Power Platform ID: $PowerPlatformEnvironmentId" -ForegroundColor Gray
Write-Host "  Color: $EnvironmentColor" -ForegroundColor Gray
if ($envInfo.Success) {
    Write-Host "  Organization: $($envInfo.OrganizationName)" -ForegroundColor Gray
    Write-Host "  Region: $($envInfo.Region)" -ForegroundColor Gray
}

if ($DryRun) {
    Write-Warning "DRY RUN - No changes will be made"
    Write-Info "Environment would be added to configuration"
    exit 0
}

$confirm = Read-Host "`nAdd this environment? (Y/n)"
if ($confirm -eq "n" -or $confirm -eq "N") {
    Write-Warning "Operation cancelled"
    exit 0
}

# Find App Registration for Dataverse user creation
if (-not $AppRegistrationName) {
    # Try to find existing app registration
    $apps = az ad app list --query "[?contains(displayName, 'mermaid')]" | ConvertFrom-Json
    
    if ($apps.Count -eq 1) {
        $AppRegistrationName = $apps[0].displayName
        Write-Success "Found App Registration: $AppRegistrationName"
    } elseif ($apps.Count -gt 1) {
        Write-Info "Multiple mermaid app registrations found:"
        for ($i = 0; $i -lt $apps.Count; $i++) {
            Write-Host "  $($i + 1). $($apps[$i].displayName)"
        }
        
        do {
            $choice = Read-Host "Select app registration (1-$($apps.Count))"
        } while ($choice -notmatch "^\d+$" -or [int]$choice -lt 1 -or [int]$choice -gt $apps.Count)
        
        $AppRegistrationName = $apps[[int]$choice - 1].displayName
    } else {
        $AppRegistrationName = Read-Host "Enter App Registration name for Dataverse user creation"
    }
}

# Get App Registration details
$appReg = az ad app list --display-name $AppRegistrationName | ConvertFrom-Json | Select-Object -First 1
if (-not $appReg) {
    Write-Error "App Registration '$AppRegistrationName' not found"
    exit 1
}

$clientId = $appReg.appId
Write-Success "Using App Registration: $AppRegistrationName ($clientId)"

# Create Dataverse Application User
Write-Step "Creating Dataverse Application User"
Write-Info "Creating application user for $EnvironmentName..."

if (Test-Path "$PSScriptRoot\debug\create-dataverse-user.ps1") {
    & "$PSScriptRoot\debug\create-dataverse-user.ps1" -EnvironmentUrl $DataverseUrl -AppId $clientId -SecurityRole $SecurityRole
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Dataverse Application User created successfully"
    } else {
        Write-Warning "Failed to create Dataverse Application User"
        Write-Info "You may need to create the application user manually:"
        Write-Info "  1. Go to $DataverseUrl"
        Write-Info "  2. Go to Settings > Security > Users"
        Write-Info "  3. Create Application User with App ID: $clientId"
        Write-Info "  4. Assign '$SecurityRole' security role"
    }
} else {
    Write-Warning "create-dataverse-user.ps1 script not found"
    Write-Info "Please create the application user manually:"
    Write-Info "  1. Go to $DataverseUrl"
    Write-Info "  2. Go to Settings > Security > Users"
    Write-Info "  3. Create Application User with App ID: $clientId"
    Write-Info "  4. Assign '$SecurityRole' security role"
}

# Add environment to configuration
Write-Step "Updating Configuration"

$config.environments += $newEnvironment

# Set as default if it's the first environment
if ($config.environments.Count -eq 1) {
    $config.defaultEnvironmentId = $environmentId
    Write-Info "Set as default environment"
}

# Save configuration
Save-EnvironmentConfiguration -Config $config -FilePath $EnvironmentConfigFile

Write-Step "Environment Added Successfully!"
Write-Success "Environment '$EnvironmentName' has been added to your deployment"
Write-Info ""
Write-Info "Total environments: $($config.environments.Count)"
Write-Info "Configuration file: $EnvironmentConfigFile"
Write-Info ""
Write-Info "Next steps:"
Write-Info "1. Restart your application to load the new environment"
Write-Info "2. Test connectivity to the new environment"
Write-Info "3. Verify the environment appears in the UI environment selector"