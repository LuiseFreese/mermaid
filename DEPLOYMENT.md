# Deploying to Azure

This guide explains how to deploy the Mermaid to Dataverse Converter application to Azure.

## Prerequisites

- PowerShell 7+ installed
- Azure CLI installed
- Azure subscription
- Dataverse environment

## One-Time Setup (First Deployment Only)

If you haven't deployed the application before, run the setup script to create all necessary Azure resources:

```powershell
# Run the setup script in interactive mode
.\scripts\setup-entra-app.ps1

# Or run with specific parameters
.\scripts\setup-entra-app.ps1 -Unattended `
    -EnvironmentUrl "https://yourorg.crm.dynamics.com" `
    -ResourceGroup "rg-mermaid-dataverse" `
    -Location "East US" `
    -AppRegistrationName "Mermaid-Dataverse-Converter" `
    -AppServiceName "app-mermaid-dataverse" `
    -KeyVaultName "kv-mermaid-secrets" `
    -SecurityRole "System Administrator"
```

This script will:
1. Create an App Registration in Microsoft Entra ID
2. Create a Resource Group (if it doesn't exist)
3. Create an Azure Key Vault
4. Create a Managed Identity
5. Create an App Service Plan
6. Create an Azure App Service
7. Store Dataverse credentials in Key Vault
8. Configure the App Service to use Managed Identity
9. Create a Dataverse Application User

## Deploying Code Updates

After the initial setup, you can deploy code changes using the deploy script:

```powershell
# Edit the resource group and app service name in the script if needed
# Default values in the script:
#   --resource-group mermaid-dataverse-rg
#   --name mermaid-to-dataverse

# Run the deployment script
.\scripts\deploy.ps1
```

This script will:
1. Create a deployment package with your application code
2. Deploy the package to your Azure App Service
3. Clean up temporary files

## Troubleshooting

If you encounter any issues:

1. Check the App Service logs in the Azure Portal
2. Ensure your Managed Identity has access to Key Vault
3. Verify the Dataverse Application User has the correct security role
4. Test the connection to Dataverse with the test script:

```powershell
.\tests\test-dataverse-connection.ps1 -KeyVaultUri "https://your-keyvault.vault.azure.net/"
```

## Accessing the Application

After deployment, you can access the application at:
`https://your-app-service-name.azurewebsites.net/wizard`
