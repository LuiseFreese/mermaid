# Deploying Dataverse Solutions from Mermaid Diagrams

This guide explains how to use the provided scripts to provision Microsoft Dataverse solutions, tables, columns, relationships, and global choices directly from a Mermaid entity-relationship diagram.

## Prerequisites

- Node.js installed (v14 or later)
- `.env` file with Dataverse API credentials
- Mermaid diagram file (`.mmd` extension) containing an ER diagram

## Configuration

Ensure your `.env` file has the following values:

```properties
DATAVERSE_URL=https://your-org.crm.dynamics.com
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
TENANT_ID=your-tenant-id
```

## Deployment Options

### Option 1: Interactive Deployment (Recommended)

The easiest way to deploy is using the interactive batch file:

```
.\deploy-interactive.bat
```

This script will:
1. Prompt for a publisher prefix (default: "mint")
2. Show available Mermaid files and let you choose one
3. Deploy the solution to Dataverse

### Option 2: Deployment with Specific Publisher

To quickly deploy with a specific publisher prefix:

```
.\deploy-with-publisher.bat myprefix
```

This will use the default Mermaid file (`examples/employee-projects.mmd`) with your specified publisher.

### Option 3: Direct Command Line Deployment

For more control, use the CLI script with specific arguments:

```
node bin/deploy-mermaid-cli.js --publisher=myprefix --file=./examples/employee-projects.mmd
```

#### Parameters

- `--publisher`: Publisher prefix to use for the solution and components (default: 'mint')
- `--file`: Path to the Mermaid diagram file (default: `./examples/employee-projects.mmd`)
- `--solution`: Custom solution name (optional, will be generated from the file name if not provided)
- `--verbose`: Enable verbose logging (true/false)

### Option 4: Legacy Script

The original deployment script is also available:

```bash
node deploy-from-mermaid.js --mermaid <path-to-mermaid-file> --publisher <publisher-prefix>
```

## What Happens During Deployment

The deployment process:
1. Parses the Mermaid diagram
2. Converts it to a Dataverse schema
3. Creates a solution with the specified publisher prefix
4. Creates all tables, columns, relationships, and global choice sets
5. Associates all components with the solution

## Global Choices

For columns marked as `choice` type in the Mermaid diagram, the script will automatically create global choice sets with the following naming convention:

```
[publisherPrefix]_[entityName]_[fieldName]choice
```

For example, a `department` field in the `EMPLOYEE` entity with publisher prefix `mint` would create a global choice set named `mint_employee_departmentchoice`.

The script will intelligently generate choice options based on field names:
- Status fields: Active, Pending, Completed, Cancelled
- Priority fields: Low, Medium, High, Critical
- Department fields: IT, HR, Finance, Marketing, Sales, Operations
- Position fields: Manager, Developer, Analyst, Designer, Intern
- Other fields: Option 1, Option 2, Option 3

## Notes

- If a component already exists, the script will skip its creation
- All components will automatically be added to the solution
- The script will apply the publisher prefix to all components
- Publishers will be created automatically if they don't exist
