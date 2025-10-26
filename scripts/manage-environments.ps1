#!/usr/bin/env pwsh

<#
.SYNOPSIS
    🌐 Manage Mermaid Dataverse Environments

.DESCRIPTION
    This script helps manage your configured Dataverse environments:
    - List all configured environments
    - Test connectivity to environments  
    - Remove environments
    - Set default environment
    - Show environment details

.EXAMPLE
    # List all environments
    .\scripts\manage-environments.ps1 -List

.EXAMPLE
    # Test connectivity to all environments
    .\scripts\manage-environments.ps1 -TestAll

.EXAMPLE
    # Test specific environment
    .\scripts\manage-environments.ps1 -Test -EnvironmentId "customer-dev"

.EXAMPLE
    # Remove environment
    .\scripts\manage-environments.ps1 -Remove -EnvironmentId "old-env"

.EXAMPLE
    # Set default environment
    .\scripts\manage-environments.ps1 -SetDefault -EnvironmentId "production-main"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)] [switch]$List,
    [Parameter(Mandatory = $false)] [switch]$Test,
    [Parameter(Mandatory = $false)] [switch]$TestAll,
    [Parameter(Mandatory = $false)] [switch]$Remove,
    [Parameter(Mandatory = $false)] [switch]$SetDefault,
    [Parameter(Mandatory = $false)] [string]$EnvironmentId,
    [Parameter(Mandatory = $false)] [string]$EnvironmentConfigFile = "data/environments.json"
)

# ---------- Output helpers ----------
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info    { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error   { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step    { param($Message) Write-Host "`n🔸 $Message" -ForegroundColor Magenta }

# ---------- Configuration Management ----------
function Load-EnvironmentConfiguration {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        Write-Error "Environment configuration file not found: $FilePath"
        Write-Info "Run setup script first to configure environments"
        exit 1
    }
    
    try {
        $content = Get-Content $FilePath -Raw | ConvertFrom-Json
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
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $FilePath -Encoding UTF8
        Write-Success "Configuration saved"
    }
    catch {
        Write-Error "Failed to save configuration: $($_.Exception.Message)"
        exit 1
    }
}

function Show-Environment {
    param([object]$Environment, [bool]$IsDefault = $false)
    
    $defaultMarker = if ($IsDefault) { " (DEFAULT)" } else { "" }
    $colorDisplay = switch ($Environment.color) {
        "red" { "🔴" }
        "green" { "🟢" }
        "blue" { "🔵" }
        "yellow" { "🟡" }
        "purple" { "🟣" }
        default { "⚪" }
    }
    
    Write-Host "  $colorDisplay $($Environment.name)$defaultMarker" -ForegroundColor White
    Write-Host "     ID: $($Environment.id)" -ForegroundColor Gray
    Write-Host "     URL: $($Environment.url)" -ForegroundColor Gray
    if ($Environment.description) {
        Write-Host "     Description: $($Environment.description)" -ForegroundColor Gray
    }
    if ($Environment.lastConnected) {
        Write-Host "     Last Connected: $($Environment.lastConnected)" -ForegroundColor Gray
    }
    if ($Environment.metadata -and $Environment.metadata.organizationName) {
        Write-Host "     Organization: $($Environment.metadata.organizationName)" -ForegroundColor Gray
    }
    Write-Host ""
}

# ---------- Main Script ----------

if (-not $List -and -not $Test -and -not $TestAll -and -not $Remove -and -not $SetDefault) {
    Write-Host "🌐 Mermaid Environment Manager" -ForegroundColor Cyan
    Write-Host ""
    Write-Info "Available commands:"
    Write-Host "  -List                    List all environments"
    Write-Host "  -TestAll                 Test connectivity to all environments"  
    Write-Host "  -Test -EnvironmentId ID  Test specific environment"
    Write-Host "  -Remove -EnvironmentId ID        Remove environment"
    Write-Host "  -SetDefault -EnvironmentId ID    Set default environment"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\scripts\manage-environments.ps1 -List"
    Write-Host "  .\scripts\manage-environments.ps1 -TestAll"
    Write-Host "  .\scripts\manage-environments.ps1 -Test -EnvironmentId 'customer-dev'"
    exit 0
}

# Load configuration
$config = Load-EnvironmentConfiguration -FilePath $EnvironmentConfigFile

if ($List) {
    Write-Step "Configured Environments"
    
    if ($config.environments.Count -eq 0) {
        Write-Warning "No environments configured"
        exit 0
    }
    
    foreach ($env in $config.environments) {
        $isDefault = $env.id -eq $config.defaultEnvironmentId
        Show-Environment -Environment $env -IsDefault $isDefault
    }
    
    Write-Info "Total: $($config.environments.Count) environment(s)"
    exit 0
}

if ($TestAll) {
    Write-Step "Testing All Environments"
    
    $results = @()
    
    foreach ($env in $config.environments) {
        Write-Info "Testing $($env.name)..."
        
        try {
            # Simple URL check (you could enhance this with actual API calls)
            $response = Invoke-WebRequest -Uri $env.url -Method HEAD -TimeoutSec 10 -ErrorAction Stop
            $status = "✅ Reachable"
            $success = $true
        }
        catch {
            $status = "❌ Failed: $($_.Exception.Message)"
            $success = $false
        }
        
        $results += @{
            Environment = $env.name
            Status = $status
            Success = $success
        }
        
        Write-Host "  $status"
    }
    
    Write-Host ""
    Write-Step "Test Summary"
    $successCount = ($results | Where-Object { $_.Success }).Count
    $totalCount = $results.Count
    
    Write-Host "  Successful: $successCount / $totalCount" -ForegroundColor $(if ($successCount -eq $totalCount) { "Green" } else { "Yellow" })
    
    if ($successCount -lt $totalCount) {
        Write-Warning "Some environments failed connectivity tests"
        Write-Info "Check environment URLs and network connectivity"
    }
    
    exit 0
}

if ($Test) {
    if (-not $EnvironmentId) {
        Write-Error "EnvironmentId parameter required for -Test"
        exit 1
    }
    
    $environment = $config.environments | Where-Object { $_.id -eq $EnvironmentId }
    if (-not $environment) {
        Write-Error "Environment '$EnvironmentId' not found"
        exit 1
    }
    
    Write-Step "Testing Environment: $($environment.name)"
    Write-Info "URL: $($environment.url)"
    
    try {
        $response = Invoke-WebRequest -Uri $environment.url -Method HEAD -TimeoutSec 10 -ErrorAction Stop
        Write-Success "Environment is reachable"
        Write-Info "Status Code: $($response.StatusCode)"
    }
    catch {
        Write-Error "Failed to reach environment: $($_.Exception.Message)"
        exit 1
    }
    
    exit 0
}

if ($Remove) {
    if (-not $EnvironmentId) {
        Write-Error "EnvironmentId parameter required for -Remove"
        exit 1
    }
    
    $environment = $config.environments | Where-Object { $_.id -eq $EnvironmentId }
    if (-not $environment) {
        Write-Error "Environment '$EnvironmentId' not found"
        exit 1
    }
    
    Write-Warning "Removing environment: $($environment.name)"
    Write-Host "  URL: $($environment.url)" -ForegroundColor Gray
    
    $confirm = Read-Host "Are you sure? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Info "Operation cancelled"
        exit 0
    }
    
    # Remove environment
    $config.environments = $config.environments | Where-Object { $_.id -ne $EnvironmentId }
    
    # Update default if necessary
    if ($config.defaultEnvironmentId -eq $EnvironmentId) {
        if ($config.environments.Count -gt 0) {
            $config.defaultEnvironmentId = $config.environments[0].id
            Write-Info "Default environment changed to: $($config.environments[0].name)"
        } else {
            $config.defaultEnvironmentId = $null
            Write-Info "No default environment (no environments left)"
        }
    }
    
    Save-EnvironmentConfiguration -Config $config -FilePath $EnvironmentConfigFile
    Write-Success "Environment removed successfully"
    exit 0
}

if ($SetDefault) {
    if (-not $EnvironmentId) {
        Write-Error "EnvironmentId parameter required for -SetDefault"
        exit 1
    }
    
    $environment = $config.environments | Where-Object { $_.id -eq $EnvironmentId }
    if (-not $environment) {
        Write-Error "Environment '$EnvironmentId' not found"
        exit 1
    }
    
    $config.defaultEnvironmentId = $EnvironmentId
    Save-EnvironmentConfiguration -Config $config -FilePath $EnvironmentConfigFile
    
    Write-Success "Default environment set to: $($environment.name)"
    exit 0
}