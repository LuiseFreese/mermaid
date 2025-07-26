# Mermaid to Dataverse Converter

A tool that reads Mermaid ERD diagrams and creates corresponding tables, fields, and relationships in Microsoft Dataverse.

## Features

- **Solution Management**: Automatically creates or uses existing Dataverse solutions (idempotent)
- **Publisher Management**: List, select, and manage Dataverse publishers for solutions
- **Entity Creation**: Parse Mermaid ERD syntax and generate Dataverse entity schemas
- **Relationship Management**: Create relationships between entities with proper cardinality
- **Idempotent Operations**: Safe to run multiple times - skips existing entities and relationships
- **Authentication**: Handle authentication with Microsoft Entra ID
- **Type Support**: Support for various field types and constraints
- **Solution Integration**: All entities and components are created within a named solution for better organization

## Setup

### Prerequisites

Before you begin, make sure you have:

1. **Power Platform CLI** - [Official Documentation](https://learn.microsoft.com/power-platform/developer/cli/introduction)
   - **Important**: After installation, **restart VS Code** to ensure `pac` command is available
   - Test installation: Run `pac` in terminal

2. **Azure CLI** - Required for automated setup
   - Install from [Azure CLI docs](https://learn.microsoft.com/cli/azure/install-azure-cli)
   - Log in as admin: `az login`

3. **Node.js** - Required to run the tool
   - Install dependencies: `npm install`

4. **Dataverse Environment Access**
   - Your Dataverse environment URL (find it in [Power Platform Admin Center](https://admin.powerplatform.microsoft.com))
   - Admin permissions in your Dataverse environment

### Quick Setup (Automated)

**NEW**: We now have a fully automated setup script that handles the entire "chicken-and-egg" problem of Dataverse authentication!

The script automatically:
- Creates Azure app registration and service principal
- Generates client secrets and updates your .env file  
- Creates the Dataverse Application User with proper permissions
- Handles the bootstrap authentication problem seamlessly
- Tests the complete setup to ensure everything works

**Setup Steps:**

1. Create your `.env` file with basic info:
```bash
cp .env.example .env
```

2. Edit `.env` and add your environment details:
```bash
DATAVERSE_URL=https://yourorg.crm.dynamics.com
TENANT_ID=your-tenant-id-here
# CLIENT_ID and CLIENT_SECRET will be auto-generated
```

3. Run the automated setup:
```bash
node scripts/setup.cjs
```

That's it! The script handles everything else automatically.

**What the script does:**
- Detects if you have existing app registrations or creates new ones
- Creates Azure service principal with proper Dataverse permissions
- Solves the "chicken-and-egg" authentication problem using admin fallback
- Creates Dataverse Application User with System Administrator role
- Updates your .env file with generated credentials
- Tests the complete authentication flow

For more details about the authentication setup and troubleshooting, see [scripts/README.md](scripts/README.md).

### Alternative Setup (Manual)

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Dataverse and Microsoft Entra ID details
# See docs/entra-id-setup.md for detailed instructions
```

3. Run the tool:
```bash
# Interactive mode (recommended for first-time users)
node src/index.js create examples/ecommerce-erd.mmd

# Or preview first with dry run
node src/index.js create examples/ecommerce-erd.mmd --dry-run
```

## Supported Mermaid ERD Syntax

```mermaid
erDiagram
    Customer {
        string customer_id PK
        string first_name
        string last_name
        string email UK
        datetime created_date
    }
    
    Order {
        string order_id PK
        string customer_id FK
        decimal total_amount
        datetime order_date
    }
    
    Customer ||--o{ Order : places
```

## Environment Variables

- `DATAVERSE_URL` - Your Dataverse environment URL
- `CLIENT_ID` - Microsoft Entra ID App Registration Client ID
- `CLIENT_SECRET` - Microsoft Entra ID App Registration Client Secret
- `TENANT_ID` - Microsoft Entra ID Tenant ID

## Usage

### Quick Start (Interactive)

The easiest way to get started is with the interactive `create` command:

```bash
# Interactive mode - will prompt for solution name and publisher prefix  
node src/index.js create examples/ecommerce-erd.mmd

# Preview without creating (dry run)
node src/index.js create examples/ecommerce-erd.mmd --dry-run

# Quick shortcut for interactive mode
npm run create
# Then provide the file path when prompted
```

This will:
1. 📝 **Prompt for solution name** - Enter a descriptive name for your Dataverse solution
2. 🏷️ **Prompt for publisher prefix** - Enter 2-8 characters unique to your organization  
3. ✅ **Show configuration summary** - Review your settings before proceeding
4. 🚀 **Create the solution** - Build entities and relationships in Dataverse

### Solution Naming

The tool supports user-friendly solution names with spaces and special characters:

✅ **Good Solution Names:**
- "Customer Management System"
- "Inventory Tracker 2025"  
- "HR Portal - Employee Data"

The tool automatically handles the technical requirements:
- **Display Name**: Shown exactly as you enter it in Dataverse (e.g., "Customer Management System")
- **Technical Name**: Auto-generated API-safe name using PascalCase (e.g., "CustomerManagementSystem")

This gives you the best of both worlds - readable names for users and API-compliant names for the system.

### Available npm Scripts

For convenience, several npm scripts are available:

```bash
npm run create      # Interactive create (prompts for file path)
npm run publishers  # List available publishers
npm run cleanup     # Remove temporary/debug files
npm test           # Run tests
```

Note: For commands with arguments, use the direct `node src/index.js` syntax shown above.

### Advanced Commands

```bash
# Specify all options via command line (non-interactive)
node src/index.js convert my-erd.mmd MyProjectSolution contoso

# Dry run with specific parameters
node src/index.js convert my-erd.mmd MyProjectSolution contoso --dry-run

# List available publishers in your environment
node src/index.js publishers
# OR use the shortcut
npm run publishers
```

# Use a specific publisher prefix
npm start convert -- --input ./my-erd.mmd --solution MyProjectSolution --publisher-prefix "contoso"

# List publishers before creating solution
npm start convert -- --input ./my-erd.mmd --solution MyProjectSolution --list-publishers

# Prevent automatic publisher creation (use existing only)
npm start convert -- --input ./my-erd.mmd --solution MyProjectSolution --no-create-publisher

# Dry run (preview without creating)
npm start convert -- --input ./my-erd.mmd --dry-run

# Verbose output
npm start convert -- --input ./my-erd.mmd --solution MyProjectSolution --verbose

# Validate ERD syntax
npm start validate -- --input ./my-erd.mmd

# Check configuration
npm start config
```

### CLI Options

```bash
# Full command syntax
npm start convert -- [options]

Options:
  -i, --input <file>              Input Mermaid ERD file path
  -s, --solution <name>           Solution name to create entities in (required)
  -o, --output <file>             Output JSON schema file (optional)
  --dry-run                       Preview without creating entities  
  --verbose                       Show detailed output
  --publisher-prefix <prefix>     Custom publisher prefix (default: mmd)
  --list-publishers               List available publishers before creating solution
  --no-create-publisher           Do not create publisher if it doesn't exist
```

## Maintenance

### Cleanup Repository

To remove temporary files, debug scripts, and test outputs:

```bash
npm run cleanup
```

This script automatically removes:
- Debug and test scripts (`debug-*.js`, `check-*.js`, etc.)
- Schema output files (`*-schema.json`)
- Temporary .env files (`.env.generated`, `.env.updated`)
- Keeps only essential examples (`ecommerce-erd.mmd`, `hr-system-erd.mmd`)

## Developer Documentation

For developers who want to understand, maintain, or contribute to this project:

📖 **[Developer Documentation](docs/DEVELOPER.md)** - Comprehensive technical guide covering:
- Architecture overview and design decisions
- Component breakdown and data flow
- Authentication strategy and security considerations  
- Field type mapping and extension points
- Testing strategy and contributing guidelines
- Troubleshooting and performance optimization

## Contributing

We welcome contributions! Please see the [Developer Documentation](docs/DEVELOPER.md) for:
- Development setup and coding standards
- Pull request process and code review guidelines
- How to add new field types and features
- Testing requirements and best practices
