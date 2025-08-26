# Deployment Guide - Mermaid to Dataverse Converter

This guide explains how to deploy and use the Mermaid-to-Dataverse application. The application uses **fully automated setup** - no manual configuration required!

## Quick Start (Recommended)

**One command deploys everything:**

```powershell
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid
./scripts/setup-entra-app.ps1
```

The script will prompt you for configuration and handle all setup automatically.

## What You Get

After setup, you'll have a **complete working application** that:
- ✅ Converts Mermaid ERD files to Dataverse entities
- ✅ Provides a web interface for file uploads
- ✅ Shows real-time processing logs
- ✅ Supports dry-run mode for validation
- ✅ Uses enterprise-grade security (Managed Identity + Key Vault)

## Prerequisites

Before running the setup:

1. **Azure subscription** with permissions to create resources
2. **PowerShell 7+** (recommended) or Windows PowerShell 5.1
3. **Azure CLI** installed and logged in (`az login`)
4. **Access to Dataverse environment** where you want to create entities
5. **Appropriate permissions**:
   - **Azure**: Contributor or Owner on subscription
   - **Microsoft Entra ID**: Application Administrator (to create app registrations)
   - **Dataverse**: System Administrator (to create application users)

## Deployment Options

### Interactive Mode (Recommended for First-Time Users)
```powershell
# Interactive mode (prompts for configuration)
.\scripts\setup-entra-app.ps1
```

### Unattended Mode (For Automation)
```powershell
# Unattended mode (provide all parameters)
.\scripts\setup-entra-app.ps1 -Unattended `
  -EnvironmentUrl "https://orgXXXXX.crm4.dynamics.com" `
  -ResourceGroup "rg-mermaid-dataverse" `
  -Location "westeurope" `
  -AppRegistrationName "Mermaid-Dataverse-Converter" `
  -AppServiceName "app-mermaid-dv-we-1234" `
  -KeyVaultName "kv-mermaid-secrets-1234" `
  -SecurityRole "System Administrator"
```

### Dry Run Mode (Test Before Deploying)
```powershell
# Dry run mode (test without making changes)
.\scripts\setup-entra-app.ps1 -DryRun
```

## What Gets Deployed

The setup script automatically creates:

- **Azure Resource Group** - Container for all resources
- **App Service & App Service Plan** - Web application hosting (Linux, Node.js 18)
- **Key Vault** - Secure secret storage with RBAC
- **User-Assigned Managed Identity** - Secure authentication without passwords
- **Entra ID App Registration** - Service principal for Dataverse access
- **Dataverse Application User** - Configured with appropriate security roles

## Automated Setup Process

The setup script (`scripts/setup-entra-app.ps1`) performs these tasks automatically:

1. ✅ **Creates App Registration** with proper configuration (using latest Azure CLI syntax)
2. ✅ **Generates Client Secret** with 2-year expiration (securely, without console exposure)
3. ✅ **Deploys Infrastructure** using Bicep (Key Vault, Managed Identity, App Service)
4. ✅ **Configures RBAC permissions** for Key Vault access
5. ✅ **Stores all secrets** securely in Key Vault
6. ✅ **Deploys application code** to Azure App Service
7. ✅ **Creates Application User** in Dataverse via REST API
8. ✅ **Assigns Security Roles** (System Administrator by default)
9. ✅ **Tests the complete setup** end-to-end

### Interactive Setup Example

```powershell
Mermaid to Dataverse - Interactive Setup
=========================================

Find your Dataverse Environment URL:
1. Go to https://admin.powerplatform.microsoft.com
2. Navigate to Environments > [Your Environment] > Settings > Developer resources
3. Copy the 'Web API endpoint' URL (e.g., https://orgXXXXX.crm4.dynamics.com)

Dataverse Environment URL: https://orgb85e2da2.crm4.dynamics.com
Resource Group Name: rg-mermaid-dv-we-test
Azure Region: westeurope
App Registration Name: Mermaid-Dataverse-Converter
App Service Name: app-mermaid-dv-we-5678
Key Vault Name: kv-mermaid-secrets-5678

✅ App Registration created successfully
✅ Infrastructure deployed successfully  
✅ Application code deployed successfully
✅ Secrets stored in Key Vault
✅ Dataverse Application User created
✅ Security roles assigned

🎉 Setup Complete! Application ready at: 
   https://app-mermaid-dv-we-5678.azurewebsites.net/
```

## Infrastructure as Code

All Azure resources are defined in `scripts/infrastructure.bicep`:

```bicep
// Key components deployed:
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01'
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31'  
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01'
resource appService 'Microsoft.Web/sites@2023-01-01'
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01'
```

The Bicep template ensures:
- **Idempotent deployments** - Can be run multiple times safely
- **Secure configuration** - RBAC-enabled Key Vault with least privilege access
- **Production-ready settings** - HTTPS-only, TLS 1.2+, Node.js 18.17.0 LTS
- **Managed identity integration** - No passwords or connection strings in code

## Deploying Code Updates

After the initial setup, you can deploy code changes using the deploy script:

```powershell
# Deploy code updates to existing infrastructure
.\scripts\deploy.ps1 -AppServiceName "app-mermaid-dv-we-5678" -ResourceGroup "rg-mermaid-dv-we-test"
```

This script will:
1. Create a deployment package with your application code
2. Deploy the package to your Azure App Service using Oryx build
3. Configure app settings for Node.js
4. Clean up temporary files

### Zero-Downtime Updates

The setup script is **idempotent** - it can be run multiple times safely:

```powershell
# Re-run setup to update existing deployment
./scripts/setup-entra-app.ps1

# The script will:
# - Detect existing resources and reuse them
# - Update application code if needed
# - Only create missing components
# - Preserve existing configuration
```

## Using Your Deployed Application

After the automated setup completes, you can start using the application:

### 1. Access Your Application
Visit the URL provided by the setup script:
```
https://your-app-name.azurewebsites.net
```

**Interface Options:**
- **Root Interface** (`/`) - Direct file upload with real-time processing logs
- **Wizard Interface** (`/wizard`) - Step-by-step guided setup process

### 2. Upload Mermaid Files
- Use the web interface to upload `.mmd` files
- Start with **dry-run mode** to validate your files
- Review the real-time processing logs
- Switch to **live mode** to create actual Dataverse entities

### 3. Monitor and Manage
- Check the status dashboard for system health
- Use diagnostic endpoints to troubleshoot issues
- View created entities in your Dataverse environment

## Troubleshooting

### Common Setup Issues

**1. Setup Script Fails**
```
❌ Error: App Registration creation failed
```
**Solutions**:
- Ensure you have Application Administrator rights in Microsoft Entra ID
- Check Azure CLI login: `az account show`
- Verify subscription permissions: `az account list-locations`

**2. Permission Errors**
```
❌ Insufficient privileges to complete the operation
```
**Solutions**:
- Verify you have Contributor/Owner role on the Azure subscription
- Check you have System Administrator role in Dataverse environment
- Ensure you can create App Registrations in Microsoft Entra ID

**3. Dataverse Connection Issues**
```
❌ Application User creation failed
```
**Solutions**:
- Verify Dataverse URL is correct and accessible
- Check you have admin rights in the target environment
- Ensure environment is not in Administration Mode

**4. Invalid Dataverse URL Format**
```
❌ Invalid EnvironmentUrl format. Expected: https://orgXXXXX.crm4.dynamics.com
```
**Solutions**:
- Get the correct URL from Power Platform Admin Center
- Navigate to Environments > [Your Environment] > Settings > Developer resources
- Copy the "Web API endpoint" URL exactly

### Getting Help

1. **Run in dry-run mode first**: `./scripts/setup-entra-app.ps1 -DryRun` to see what would be created
2. **Check App Service logs** in the Azure Portal or using: `az webapp log tail --name your-app --resource-group your-rg`
3. **Test Key Vault access**: Ensure your Managed Identity has access to Key Vault
4. **Verify the Dataverse Application User** has the correct security role
5. **Use the web interface diagnostics** to test individual components

## Next Steps

After successful deployment:

1. **Read the Usage Guide**: See [USAGE-GUIDE.md](USAGE-GUIDE.md) for how to use the application
2. **Try Examples**: Test with sample files in the `examples/` folder
3. **Understand Mermaid Syntax**: Review [MERMAID-GUIDE.md](MERMAID-GUIDE.md) for supported ERD syntax
4. **Learn About Relationships**: See [RELATIONSHIP_TYPES.md](RELATIONSHIP_TYPES.md) for relationship modeling

For technical details about the application architecture, see [DEVELOPER.md](DEVELOPER.md).
