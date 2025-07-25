# Power Platform CLI Installation Guide

## Overview

Power Platform CLI (`pac`) is required for the automated setup of the Mermaid to Dataverse Converter. This guide provides step-by-step instructions for installing and configuring Power Platform CLI.

## Why Power Platform CLI?

Our setup method uses `pac admin create-service-principal` which creates both the Microsoft Entra ID app registration AND the Dataverse Application User in a single command, making setup much simpler and more reliable.

## Installation Methods

### Method 1: VS Code Extension (Recommended)

This is the most reliable installation method for VS Code users:

1. **Open VS Code**
2. **Go to Extensions** (Ctrl+Shift+X)
3. **Search for** "Power Platform Tools"
4. **Install** the extension by Microsoft
5. **Restart VS Code** completely
6. **Test installation** by opening a terminal and running: `pac --version`

### Method 2: Windows MSI Installer

For full feature set on Windows:

1. **Download** the MSI installer from [Microsoft Learn](https://learn.microsoft.com/power-platform/developer/cli/introduction)
2. **Run the installer** with administrator privileges
3. **Restart VS Code** after installation
4. **Test installation**: `pac --version`

### Method 3: Package Manager

Using various package managers:

**Chocolatey:**
```powershell
choco install powerplatform-cli
```

**Winget:**
```powershell
winget install Microsoft.PowerPlatformCLI
```

## Post-Installation Steps

### 1. Restart VS Code
**Critical**: After installing Power Platform CLI, you MUST restart VS Code completely for the `pac` command to be available in the terminal.

### 2. Verify Installation
Open a terminal in VS Code and run:
```powershell
pac --version
```

You should see output like:
```
Microsoft PowerPlatform CLI
Version: 1.30.3+g0f0e0b9
```

### 3. Authenticate to Power Platform

Before using the automated setup, you need to authenticate to Power Platform:

```powershell
# Authenticate to your Power Platform environment
pac auth create --environment "https://orgb85e2da2.crm4.dynamics.com"

# Or authenticate with device code (for some environments)
pac auth create --environment "https://orgb85e2da2.crm4.dynamics.com" --deviceCode
```

### 4. Get Your Dataverse Environment URL

Before running the automated setup, you need your Dataverse environment URL:

1. **Go to** [Power Platform Admin Center](https://admin.powerplatform.microsoft.com)
2. **Select** your environment from the list
3. **Copy** the "Environment URL" (looks like `https://orgb85e2da2.crm4.dynamics.com`)
4. **Use this URL** in the setup command

### 5. Test Automated Setup
Once verified, you can use the automated setup with YOUR environment URL:
```powershell
.\scripts\setup-app-registration.ps1 -EnvironmentUrl "https://yourorg.crm4.dynamics.com"

# Example:
# .\scripts\setup-app-registration.ps1 -EnvironmentUrl "https://orgb85e2da2.crm4.dynamics.com"
```

## Troubleshooting

### Command Not Found
If you get "pac is not recognized" error:

1. **Restart VS Code** completely (close all windows)
2. **Check PATH**: Ensure Power Platform CLI is in your system PATH
3. **Reinstall**: Try the VS Code extension method

### VS Code Extension Issues
If the VS Code extension doesn't work:

1. **Uninstall** the extension
2. **Restart VS Code**
3. **Reinstall** the extension
4. **Restart VS Code** again

### Permission Issues
If you encounter permission errors:

1. **Run VS Code as Administrator** (Windows)
2. **Check firewall** settings
3. **Verify** you have admin rights in your Microsoft tenant

## Next Steps

Once Power Platform CLI is installed and working:

1. **Authentication**: The script will guide you through authentication
2. **Environment Setup**: Provide your Dataverse environment URL
3. **Automated Creation**: Everything will be created automatically!

## Benefits of Our Automated Method

With Power Platform CLI installed, you get:

- ✅ **One-command setup** - Creates everything at once
- ✅ **Fewer steps** - No manual Application User creation
- ✅ **More reliable** - Fewer opportunities for errors
- ✅ **Future-proof** - Uses the latest Microsoft tooling

## Support

If you encounter issues:

1. Check the [official documentation](https://learn.microsoft.com/power-platform/developer/cli/introduction)
2. Report issues in the project repository
