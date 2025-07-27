# Microsoft Entra ID App Registration Setup Guide

To use this tool with Microsoft Dataverse, you need to set up a Microsoft Entra ID application registration and configure the necessary permissions.

Choose one of the following methods:
- **[Option A: Automated Setup (RECOMMENDED)](#option-a-automated-setup-recommended)** - One command does everything!
- **[Option B: Azure Portal (GUI)](#option-b-azure-portal-gui)** - Click through the web interface

---

## Option A: Automated Setup (RECOMMENDED)

### The Magic Command

This method uses **`pac admin create-service-principal`** which creates EVERYTHING in one command:
- Microsoft Entra ID App Registration
- Service Principal
- Client Secret
- Application User in Dataverse
- Security Role Assignment

### Prerequisites

**Install Power Platform CLI:**
```bash
# Windows (using winget)
winget install Microsoft.PowerPlatformCLI

# Or via .NET Tool
dotnet tool install --global Microsoft.PowerApps.CLI
```

Visit [Power Platform CLI documentation](https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction) for more installation options.

### Usage

**Windows (PowerShell):**
```powershell
# Automated setup - ONE COMMAND DOES EVERYTHING!
.\scripts\setup-app-registration.ps1 -EnvironmentUrl "https://yourorg.crm.dynamics.com"

# Custom security role
.\scripts\setup-app-registration.ps1 -EnvironmentUrl "https://yourorg.crm.dynamics.com" -SecurityRole "System Customizer"
```

### What It Does

The automated script executes:
```bash
pac admin create-service-principal --environment "https://yourorg.crm.dynamics.com" --name "Mermaid to Dataverse Converter" --role "System Administrator"
```

This single command:
1. Creates the Microsoft Entra ID app registration
2. Generates a client secret (with proper expiration)
3. Creates the service principal
4. Creates the Application User in your Dataverse environment
5. Assigns the specified security role
6. Returns all the values you need (Tenant ID, App ID, Client Secret, Expiration)

**Result:** A complete, ready-to-use configuration in seconds!

---

## Option B: Azure Portal (GUI)

### Step 1: Create Microsoft Entra ID App Registration

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** > **App registrations**
3. Click **"New registration"**
4. Fill in the details:
   - **Name**: `Mermaid to Dataverse Converter`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: Leave blank for now
5. Click **Register**

### Step 2: Skip API Permissions ⚠️

**Important**: Unlike other Azure services, Dataverse service principals do **NOT** need API permissions in the Microsoft Entra ID app registration.

- **Do NOT add any API permissions** (like `user_impersonation`)
- Authorization is handled entirely through **Dataverse security roles**
- The `user_impersonation` scope is only for delegated (user) access, not service principals

This is a common misconception - Dataverse uses its own security role system for authorization.

> **Read More**: For a detailed explanation of why service principals don't need the `user_impersonation` scope, see this excellent blog post: [Why your Power Platform service principal doesn't need a Dynamics user_impersonation scope](https://www.m365princess.com/blogs/2022-07-25-why-your-service-principal-doesnt-need-a-dynamics-user_impersonation-scope/).

### Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **"New client secret"**
3. Add a description: `Mermaid Converter Secret`
4. Set expiration as needed (recommended: 12 months)
5. Click **Add**
6. **Important**: Copy the secret value immediately - you won't be able to see it again

### Step 4: Get Required Information

Collect the following information from your app registration:

#### From Overview page:
- **Application (client) ID**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Directory (tenant) ID**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

#### From Certificates & secrets:
- **Client secret**: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### From your Dataverse environment:
- **Dataverse URL**: `https://your-org.crm.dynamics.com`

---

## Step 6: Configure Environment Variables

Create a `.env` file in your project root with the following content:

```env
DATAVERSE_URL=https://your-org.crm.dynamics.com
CLIENT_ID=your-application-client-id
CLIENT_SECRET=your-client-secret-value
TENANT_ID=your-tenant-id
SOLUTION_NAME=MermaidERDSolution
```

## Step 7: Configure Dataverse Application User

**This is the crucial step where authorization is actually configured!**

After creating your Microsoft Entra ID app registration, you need to create an Application User in Dataverse and assign appropriate security roles:

1. Go to [Power Platform Admin Center](https://admin.powerplatform.microsoft.com)
2. Select your environment
3. Go to **Settings** > **Users + permissions** > **Application users**
4. Click **"+ New app user"**
5. Click **"+ Add an app"** and select your registered application
6. Select appropriate Business Unit
7. **Assign Security Roles** - this is where the actual permissions are granted:
   - **System Administrator** (full access - recommended for development)
   - **System Customizer** (can create/modify entities - minimum required)
   - Or create a custom role with specific privileges


## Step 8: Test Configuration

Run the configuration check:

```bash
npm start config
```

All values should show ✅ status.


## Security Considerations

1. **Never commit your `.env` file** to version control
2. **Use Key Vault** in production environments
3. **Rotate client secrets regularly**
4. **Follow principle of least privilege** for permissions
5. **Monitor application usage** through Microsoft Entra ID logs

## Troubleshooting

### Common Issues:

1. **Authentication Failed**
   - Verify client ID, secret, and tenant ID are correct
   - Check that admin consent was granted
   - Ensure the app has appropriate permissions

2. **Insufficient Privileges**
   - Verify the user/app has system administrator or system customizer role in Dataverse
   - Check that the application permissions are correctly configured

3. **Environment URL Invalid**
   - Ensure the Dataverse URL is correct and accessible
   - Check that the environment exists and is active

### Testing Connection:

```bash
# Test with dry run first
npm start convert -- -i examples/event-erd.mmd --dry-run

# If dry run works, try actual conversion with a simple example
npm start convert -- -i examples/simple-test.mmd --verbose
```

## Additional Resources

- [Power Platform CLI Documentation](https://learn.microsoft.com/power-platform/developer/cli/introduction) - Official Power Platform CLI documentation
- [Why your Power Platform service principal doesn't need a Dynamics user_impersonation scope](https://www.m365princess.com/blogs/2022-07-25-why-your-service-principal-doesnt-need-a-dynamics-user_impersonation-scope/) - Essential read about Dataverse authentication vs. authorization
- [Microsoft Entra ID App Registration Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Dataverse Security Roles](https://docs.microsoft.com/en-us/power-platform/admin/security-roles-privileges)

## Required Dataverse Roles

The user or application must have one of the following security roles:

- **System Administrator** (recommended for setup)
- **System Customizer** (minimum required)
- Custom role with the following privileges:
  - Create, Read, Write, Delete on Entity Metadata
  - Create, Read, Write, Delete on Attribute Metadata
  - Create, Read, Write, Delete on Relationship Metadata
  - Publish All
