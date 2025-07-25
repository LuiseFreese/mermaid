# setup-app-registration.ps1
# Microsoft Entra ID App Registration Setup for Mermaid to Dataverse Converter
# Uses pac admin create-service-principal for complete automation

param(
    [string]$AppName = "Mermaid to Dataverse Converter",
    [string]$EnvironmentUrl = "",
    [string]$SecurityRole = "System Administrator"
)

# Colors for output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"
$White = "White"

function Write-Status {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Test-PacCLI {
    try {
        $null = pac --version 2>$null
        return $true
    } catch {
        return $false
    }
}

function Test-PacLogin {
    try {
        $authList = pac auth list 2>$null
        return $authList -and $authList -notcontains "No profiles found"
    } catch {
        return $false
    }
}

# Header
Write-Status "Mermaid to Dataverse Converter - Microsoft Entra ID Setup" $Green
Write-Status "====================================================================" $Green
Write-Status ""

# Show usage if help is requested
if ($args -contains "-h" -or $args -contains "--help") {
    Write-Status "Usage: .\setup-app-registration-enhanced.ps1 [OPTIONS]" $Yellow
    Write-Status ""
    Write-Status "Options:" $Yellow
    Write-Status "  -AppName <string>            App registration name (default: 'Mermaid to Dataverse Converter')" $White
    Write-Status "  -EnvironmentUrl <string>     Dataverse environment URL (REQUIRED)" $White
    Write-Status "  -SecurityRole <string>       Security role to assign (default: 'System Administrator')" $White
    Write-Status ""
    Write-Status "Description:" $Yellow
    Write-Status "  Creates Microsoft Entra ID app registration AND Dataverse Application User" $Green
    Write-Status "  in one command using Power Platform CLI." $Green
    Write-Status ""
    Write-Status "Prerequisites:" $Yellow
    Write-Status "  1. Power Platform CLI must be installed" $Cyan
    Write-Status "  2. Authentication to Power Platform required" $Cyan
    Write-Status "  3. Admin permissions in target environment" $Cyan
    Write-Status ""
    Write-Status "Examples:" $Yellow
    Write-Status "  .\setup-app-registration-enhanced.ps1 -EnvironmentUrl 'https://orgb85e2da2.crm4.dynamics.com'" $Cyan
    Write-Status ""
    Write-Status "How to find your Environment URL:" $Yellow
    Write-Status "   1. Go to https://admin.powerplatform.microsoft.com" $Cyan
    Write-Status "   2. Select your environment" $Cyan
    Write-Status "   3. Copy the 'Environment URL' (like https://orgb85e2da2.crm4.dynamics.com)" $Cyan
    exit 0
}

# Validate required parameters
if (-not $EnvironmentUrl) {
    Write-Status "ERROR: Environment URL is required" $Red
    Write-Status ""
    Write-Status "Please provide your Dataverse environment URL:" $Yellow
    Write-Status "  .\setup-app-registration-enhanced.ps1 -EnvironmentUrl 'https://yourorg.crm4.dynamics.com'" $Cyan
    Write-Status ""
    Write-Status "Find your environment URL at:" $Yellow
    Write-Status "  https://admin.powerplatform.microsoft.com" $Cyan
    exit 1
}

Write-Status "Using Power Platform CLI method: pac admin create-service-principal" $Green
Write-Status "   This will create app registration AND Application User in one command!" $Cyan
Write-Status ""

# Check prerequisites
Write-Status "Checking prerequisites..." $Yellow
if (-not (Test-PacCLI)) {
    Write-Status "ERROR: Power Platform CLI (pac) is required" $Red
    Write-Status ""
    Write-Status "Please install Power Platform CLI:" $Yellow
    Write-Status "  Visit: https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction" $Cyan
    exit 1
}
Write-Status "PASS: Power Platform CLI is installed" $Green

# Check Power Platform CLI login
if (-not (Test-PacLogin)) {
    Write-Status "Please login to Power Platform..." $Yellow
    try {
        pac auth create --environment $EnvironmentUrl
        Write-Status "PASS: Successfully logged in to Power Platform" $Green
    } catch {
        Write-Status "ERROR: Failed to login to Power Platform" $Red
        Write-Status "Please run: pac auth create --environment $EnvironmentUrl" $Yellow
        exit 1
    }
} else {
    Write-Status "PASS: Already logged in to Power Platform" $Green
}

Write-Status ""

try {
    # === POWER PLATFORM CLI METHOD: pac admin create-service-principal ===
    Write-Status "Creating complete setup with pac admin create-service-principal..." $Yellow
    Write-Status "   This will create app registration + Application User in one command" $Cyan
    Write-Status ""
    
    # Execute the command
    $createCommand = "pac admin create-service-principal --environment `"$EnvironmentUrl`" --name `"$AppName`" --role `"$SecurityRole`""
    Write-Status "Executing: $createCommand" $Cyan
    
    # Capture the output more robustly
    $output = & pac admin create-service-principal --environment $EnvironmentUrl --name $AppName --role $SecurityRole 2>&1
    $exitCode = $LASTEXITCODE
    
    Write-Status "Command completed with exit code: $exitCode" $White
    Write-Status "Output: $output" $Cyan
    
    if ($exitCode -eq 0) {
        # Try to parse the output for the table
        $lines = $output -split "`n"
        $dataLine = $lines | Where-Object { $_ -match "^[a-f0-9\-]{36}\s+[a-f0-9\-]{36}\s+" }
        
        if ($dataLine) {
            $parts = $dataLine -split "\s+"
            $TenantId = $parts[0]
            $AppId = $parts[1] 
            $ClientSecret = $parts[2]
            
            Write-Status "SUCCESS: Complete setup created!" $Green
            Write-Status "   App Registration: $AppId" $White
            Write-Status "   Application User: Created in $EnvironmentUrl" $White
            Write-Status "   Security Role: $SecurityRole" $White
            Write-Status ""
        } else {
            # Command succeeded but couldn't parse - provide manual lookup guidance
            Write-Status "SUCCESS: Command completed successfully" $Green
            Write-Status "Please check the Microsoft Entra ID portal for your app registration details:" $Yellow
            Write-Status "   1. Go to https://portal.azure.com" $Cyan
            Write-Status "   2. Navigate to Microsoft Entra ID > App registrations" $Cyan
            Write-Status "   3. Find your app: $AppName" $Cyan
            Write-Status ""
            
            # Try to get tenant ID manually
            try {
                $TenantId = pac auth list | Select-String -Pattern "Tenant:\s+([a-f0-9\-]{36})" | ForEach-Object { $_.Matches[0].Groups[1].Value }
                if (-not $TenantId) {
                    $TenantId = (pac org who --json | ConvertFrom-Json).tenantId
                }
            } catch {
                $TenantId = "<check_entra_portal>"
            }
            
            $AppId = "<check_entra_portal>"
            $ClientSecret = "<check_entra_portal>"
        }
    } else {
        Write-Status "ERROR: Command failed with exit code $exitCode" $Red
        Write-Status "Output: $output" $Red
        Write-Status ""
        Write-Status "Please check:" $Yellow
        Write-Status "1. You are authenticated to Power Platform (run 'pac auth create --environment $EnvironmentUrl')" $White
        Write-Status "2. You have admin permissions in the environment" $White
        Write-Status "3. The environment URL is correct" $White
        exit 1
    }

    Write-Status ""
    Write-Status "Setup Complete! Here are your configuration values:" $Green
    Write-Status "========================================================" $Green
    Write-Status "CLIENT_ID=$AppId" $Cyan
    if ($ClientSecret) {
        Write-Status "CLIENT_SECRET=$ClientSecret" $Cyan
    } else {
        Write-Status "CLIENT_SECRET=<check_entra_portal>" $Yellow
    }
    Write-Status "TENANT_ID=$TenantId" $Cyan
    Write-Status "DATAVERSE_URL=$EnvironmentUrl" $Cyan
    Write-Status ""

    # Check if .env.generated already exists
    $envFileExists = Test-Path ".env.generated"
    
    # Create .env file template
    $envContent = @"
# Mermaid to Dataverse Converter Configuration
# Generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# Method: Power Platform CLI (pac admin create-service-principal)

# Microsoft Dataverse Environment URL
DATAVERSE_URL=$EnvironmentUrl

# Microsoft Entra ID App Registration Details
CLIENT_ID=$AppId
$(if ($ClientSecret) { "CLIENT_SECRET=$ClientSecret" } else { "CLIENT_SECRET=<check_entra_portal>" })
TENANT_ID=$TenantId

# Optional: Custom solution name
SOLUTION_NAME=MermaidERDSolution
"@

    if ($envFileExists) {
        $envContent | Out-File -FilePath ".env.updated" -Encoding UTF8
        Write-Status "Configuration saved to .env.updated (existing .env.generated preserved)" $Green
        Write-Status "   Compare and merge the files as needed" $White
    } else {
        $envContent | Out-File -FilePath ".env.generated" -Encoding UTF8
        Write-Status "Configuration saved to .env.generated" $Green
    }
    Write-Status ""

    # Final instructions
    Write-Status "Next Steps:" $Yellow
    Write-Status "1. Rename .env.generated to .env" $White
    Write-Status "2. Keep the CLIENT_SECRET secure - never commit .env to version control" $White
    if (-not $ClientSecret) {
        Write-Status "3. Get your CLIENT_SECRET from the Microsoft Entra ID portal:" $White
        Write-Status "   - Go to https://portal.azure.com" $Cyan
        Write-Status "   - Navigate to Microsoft Entra ID > App registrations > $AppName" $Cyan
        Write-Status "   - Go to Certificates & secrets > New client secret" $Cyan
        Write-Status "4. Run 'npm start config' to verify your configuration" $White
    } else {
        Write-Status "3. Run 'npm start config' to verify your configuration" $White
        Write-Status "4. Start using the tool!" $White
    }
    Write-Status ""
    
    # Show app registration details for reference
    Write-Status "Setup Summary:" $Yellow
    Write-Status "   Method: Power Platform CLI (pac admin create-service-principal)" $White
    Write-Status "   App Name: $AppName" $White
    Write-Status "   App ID: $AppId" $White
    Write-Status "   Tenant: $TenantId" $White
    Write-Status "   Environment: $EnvironmentUrl" $White
    Write-Status "   Security Role: $SecurityRole" $White
    if ($ClientSecret) {
        Write-Status "   Secret expires: Check Power Platform Admin Center for details" $White
    }

} catch {
    Write-Status "ERROR: Error during setup: $($_.Exception.Message)" $Red
    Write-Status ""
    Write-Status "Please check:" $Yellow
    Write-Status "1. You have admin permissions in your Microsoft Entra ID tenant" $White
    Write-Status "2. Power Platform CLI is properly authenticated" $White
    Write-Status "3. You have admin permissions in the specified Dataverse environment" $White
    exit 1
}
