# Mermaid to Dataverse Deployment Guide

This guide explains how to use the Mermaid to Dataverse converter and deployment scripts to provision Microsoft Dataverse solutions, tables, columns, relationships, and global choices directly from a Mermaid entity-relationship diagram.

## Prerequisites

* Node.js installed (v14 or later)
* `.env` file with Dataverse API credentials
* Mermaid diagram file (`.mmd` extension) containing an ER diagram

### Environment Variables

Ensure your `.env` file has the following values:

```properties
DATAVERSE_URL=https://your-org.crm.dynamics.com
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
TENANT_ID=your-tenant-id
```

You can create different `.env` files for different environments:

* `.env.dev` - Development environment
* `.env.test` - Test environment
* `.env.prod` - Production environment

Load a specific environment:

```bash
cp .env.dev .env
npm start convert -- -i my-erd.mmd --solution MyProjectSolution
```

## Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure authentication** (see [Entra ID Setup Guide](entra-id-setup.md))

3. **Validate your ERD**:

   ```bash
   npm start validate -- -i your-erd-file.mmd
   ```

4. **Preview conversion**:

   ```bash
   npm start convert -- -i your-erd-file.mmd --dry-run
   ```

5. **Create entities in Dataverse**:

   ```bash
   npm start convert -- -i your-erd-file.mmd --solution MyProjectSolution
   ```

## Deployment Options

### Option 1: Interactive Deployment (Recommended)

The easiest way to deploy is using the interactive batch file:

```bash
.\deploy-interactive.bat
```

This script will:

1. Prompt for a publisher prefix (default: "mint")
2. Show available Mermaid files and let you choose one
3. Deploy the solution to Dataverse

### Option 2: Deployment with Specific Publisher

To quickly deploy with a specific publisher prefix:

```bash
.\deploy-with-publisher.bat myprefix
```

This will use the default Mermaid file (`examples/employee-projects.mmd`) with your specified publisher.

### Option 3: Direct Command Line Deployment

For more control, use the CLI script with specific arguments:

```bash
node bin/deploy-mermaid-cli.js --publisher=myprefix --file=./examples/employee-projects.mmd
```

**Parameters:**

* `--publisher`: Publisher prefix to use for the solution and components (default: 'mint')
* `--file`: Path to the Mermaid diagram file (default: `./examples/employee-projects.mmd`)
* `--solution`: Custom solution name (optional)
* `--verbose`: Enable verbose logging

### Option 4: Legacy Script

The original deployment script is also available:

```bash
node deploy-from-mermaid.js --mermaid <path-to-mermaid-file> --publisher <publisher-prefix>
```

### Option 5: Interactive Create Command

```bash
# Interactive mode
node src/index.js create examples/event-erd.mmd

# Preview without creating
node src/index.js create examples/event-erd.mmd --dry-run

# Shortcut for interactive mode
npm run create
```

This will:

1. Prompt for solution name
2. Prompt for publisher prefix
3. Ask if you want to include global choice sets and their location
4. Show configuration summary
5. Create the solution in Dataverse

## What Happens During Deployment

1. Parses the Mermaid diagram
2. Converts it to a Dataverse schema
3. Creates a solution with the specified publisher prefix
4. Creates tables, columns, relationships, and global choice sets
5. Adds all components to the solution

## Global Choice Sets

### Current Format

Global choice sets are now defined in separate JSON files. Mermaid syntax for choice fields is no longer supported.

Example format:

```json
{
  "globalChoices": [
    {
      "Name": "PriorityChoices",
      "DisplayName": "Priority Choices",
      "Description": "Common priority values for tasks",
      "options": [
        { "value": 1, "label": "Low" },
        { "value": 2, "label": "Medium" },
        { "value": 3, "label": "High" },
        { "value": 4, "label": "Critical" }
      ]
    }
  ]
}
```

### Publisher Prefix Handling

The tool automatically applies your publisher prefix (e.g., `contoso`) to choice set names. Do **not** include the prefix in your JSON.

Example: `PriorityChoices` becomes `contoso_PriorityChoices`.

### Default Auto-Generated Choices (legacy support)

For legacy Mermaid diagrams with `choice` fields, auto-generated sets follow the pattern:

```
[publisherPrefix]_[entityName]_[fieldName]choice
```

With preset values like:

* Status: Active, Pending, Completed, Cancelled
* Priority: Low, Medium, High, Critical
* Departments: IT, HR, Finance, etc.
* Positions: Manager, Developer, etc.
* Other: Option 1–3

## Supported Mermaid Syntax

### Entity Example

```mermaid
erDiagram
    Customer {
        string customer_id PK
        string first_name
        string last_name
        string email UK
        datetime created_date
        boolean is_active
    }
```

### Supported Data Types

| Data Type                     | Dataverse Type | Description                |
| ----------------------------- | -------------- | -------------------------- |
| `string`                      | `Edm.String`   | Text field (max 100 chars) |
| `int` / `integer`             | `Edm.Int32`    | 32-bit integer             |
| `decimal`                     | `Edm.Decimal`  | Decimal with precision     |
| `text`, `varchar`, `nvarchar` | `Edm.String`   | Text field                 |

### Field Constraints

| Constraint | Description | Example                 |
| ---------- | ----------- | ----------------------- |
| `PK`       | Primary Key | `string id PK`          |
| `FK`       | Foreign Key | `string customer_id FK` |
| `UK`       | Unique Key  | `string email UK`       |
| `NOT NULL` | Required    | `string name NOT NULL`  |

### Relationships

| Mermaid Notation | Cardinality  | Description  |             |             |
| ---------------- | ------------ | ------------ | ----------- | ----------- |
| \`}o--           |              | \`           | Many-to-One | Many to one |
| `}o--o{`         | Many-to-Many | Many to many |             |             |

### Examples

```mermaid
erDiagram
    Product ||--o{ OrderItem : includes
    Student }o--o{ Course : enrolls_in
```

## CLI Commands

### Convert

```bash
npm start convert -- -i file.mmd --solution Name [--publisher-prefix prefix] [--global-choices file.json]
```

### Validate

```bash
npm start validate -- -i file.mmd
```

### Config

```bash
npm start config
```

### Full Convert Options

```bash
npm start convert -- [options]

Options:
  -i, --input <file>
  -s, --solution <name>
  -o, --output <file>
  --dry-run
  --verbose
  --publisher-prefix <prefix>
  --global-choices <file>
  --list-publishers
  --no-create-publisher
```

## Best Practices

* Use dry run to preview
* Use `snake_case` for columns
* Use `is_`/`has_` for booleans
* Use `_date`/`_time` suffixes
* Keep diagrams in source control
* Backup before creating
* Use `--verbose` to monitor

## Maintenance

### Cleanup

```bash
npm run cleanup
```

Removes temp files, `.env.generated`, debug scripts, etc.

## Relationship Behavior

By default, relationships are **referential (lookup)**. This prevents cascade delete conflicts.

* ✅ Safe by default
* ⚠️ Manual editing required for cascade delete
* 📖 [Read more](docs/RELATIONSHIP_TYPES.md)

## Validation Features

* Detects self-references
* Ensures primary keys exist
* Warns on orphaned entities
* Validates syntax

### Validation Example

```
🔍 Validating ERD structure...
✅ All entities have primary keys
✅ No self-references detected
ℹ️ All relationships will be created as referential (lookup) by default
✅ Validation completed successfully
```

## Limitations

* ❌ No update support (create only)
* ❌ No calculated/rollup fields
* ❌ No business rules
* ❌ No forms/views

### Workarounds

* Add forms manually in Power Apps
* Use maker portal for calculated fields

## Example Files

The `examples/` folder contains:

* `event-erd.mmd` – Event management sample

## Getting Help

1. Run `npm start config`
2. Validate your ERD
3. Use `--verbose`
4. Try a working example first

## Available npm Scripts

```bash
npm run create      # Interactive
npm run publishers  # List publishers
npm run cleanup     # Clean temp
npm test            # Run tests
```

## Notes

* Existing components are skipped
* All components added to solution
* Publisher prefix applied automatically
* Publishers created if missing
* Casing is preserved from Mermaid ERD
