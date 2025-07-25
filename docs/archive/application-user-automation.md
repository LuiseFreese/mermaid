# Application User Automation - ENHANCED! 🚀

## Major Update: Complete One-Command Setup!

We've discovered an even better approach using `pac admin create-service-principal` that does **EVERYTHING** in one command!

## Enhanced vs Legacy Methods

### 🚀 Enhanced Method (RECOMMENDED)
Uses: **`pac admin create-service-principal`**
- ✅ Creates Microsoft Entra ID App Registration
- ✅ Creates Service Principal  
- ✅ Generates client secret
- ✅ Creates Application User in Dataverse
- ✅ Assigns security role
- ✅ Returns all needed values
- ✅ **ALL IN ONE COMMAND!**

### ⚙️ Legacy Method
Uses: **`m365 entra app add` + `pac admin assign-user`**
- ✅ Creates Microsoft Entra ID App Registration (step 1)
- ✅ Generates client secret (step 1)
- ✅ Creates Application User in Dataverse (step 2)
- ✅ Assigns security role (step 2)
- ⚠️ Two-step process

## What's New

### Enhanced Setup Script

**`setup-app-registration-enhanced.ps1`** now supports both methods:

1. **Enhanced Method** (default when environment URL provided)
   - Uses `pac admin create-service-principal`
   - Single command does everything
   - Only requires Power Platform CLI

2. **Legacy Method** (with `-UseLegacyMethod` flag)
   - Uses the original two-step approach
   - Maintains backward compatibility

### Command Comparison

**Enhanced Method:**
```powershell
# ONE COMMAND DOES EVERYTHING!
pac admin create-service-principal --environment "https://yourorg.crm.dynamics.com" --name "My App" --role "System Administrator"
```

**Legacy Method:**
```powershell
# Step 1: Create app registration
m365 entra app add --name "My App" --withSecret

# Step 2: Create Application User
pac admin assign-user --environment "https://yourorg.crm.dynamics.com" --user <app-id> --role "System Administrator" --application-user
```

## Usage Examples

### Basic Setup (Manual Application User)
```powershell
# PowerShell
.\scripts\setup-app-registration.ps1

# Bash
./scripts/setup-app-registration.sh
```

### Full Automated Setup
```powershell
# PowerShell
.\scripts\setup-app-registration.ps1 -EnvironmentUrl "https://yourorg.crm.dynamics.com"

# Bash
./scripts/setup-app-registration.sh --environment-url "https://yourorg.crm.dynamics.com"
```

### Custom Security Role
```powershell
# PowerShell
.\scripts\setup-app-registration.ps1 -EnvironmentUrl "https://yourorg.crm.dynamics.com" -SecurityRole "System Customizer"

# Bash
./scripts/setup-app-registration.sh --environment-url "https://yourorg.crm.dynamics.com" --security-role "System Customizer"
```

## Prerequisites

### Required
- **CLI for Microsoft 365** (`m365`)
  ```bash
  npm install -g @pnp/cli-microsoft365
  ```

### Optional (for Application User automation)
- **Power Platform CLI** (`pac`)
  - Windows: `winget install Microsoft.PowerPlatformCLI`
  - .NET Tool: `dotnet tool install --global Microsoft.PowerApps.CLI`
  - Visit: https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction

## What the Automation Does

1. ✅ **Creates/finds Microsoft Entra ID App Registration**
2. ✅ **Generates client secret** (if new app)
3. ✅ **Retrieves tenant information**
4. ✅ **Creates Application User in Dataverse** (if environment URL provided)
5. ✅ **Assigns security role** (System Administrator by default)
6. ✅ **Generates .env.generated file** with all configuration
7. ✅ **Provides clear next steps**

## Power Platform CLI Commands Used

The automation uses this Power Platform CLI command:

```bash
pac admin assign-user --environment <environment-url> --user <app-id> --role <security-role> --application-user
```

This command:
- Creates the Application User if it doesn't exist
- Assigns the specified security role
- Is idempotent (safe to run multiple times)

## Benefits

### Before (Manual Process)
1. Run setup script to create app registration
2. Manually navigate to Power Platform Admin Center
3. Find your environment
4. Go to Settings > Users + permissions > Application users
5. Click "Add new app user"
6. Search for and select your app
7. Assign security role
8. Save

### After (Automated Process)
1. Run setup script with environment URL
2. ✅ Done!

## Error Handling

The scripts gracefully handle various scenarios:
- Power Platform CLI not installed → Falls back to manual instructions
- Authentication failures → Clear error messages and fallback
- Existing Application Users → Verification and role assignment
- Network issues → Informative error messages

## Security

- **Idempotent Operations** - Safe to run multiple times
- **Proper Error Handling** - Graceful degradation if automation fails
- **Clear Documentation** - Users understand what's happening
- **Manual Fallback** - Always provides manual instructions as backup

This automation significantly improves the developer experience while maintaining security and reliability!
