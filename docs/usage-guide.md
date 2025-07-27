# Usage Guide

This guide explains how to use the Mermaid to Dataverse converter effectively.

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

5. **Create entities in Dataverse** (creates solution and entities):
   ```bash
   npm start convert -- -i your-erd-file.mmd --solution MyProjectSolution
   ```

## Supported Mermaid ERD Syntax

### Basic Entity Definition

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

|--------------|----------------|-------------|
| `string` | `Edm.String` | Text field (max 100 chars by default) |
| `int`, `integer` | `Edm.Int32` | 32-bit integer |
| `decimal` | `Edm.Decimal` | Decimal number with precision |
| `text`, `varchar`, `nvarchar` | `Edm.String` | Text field |

### Field Constraints

| Constraint | Description | Example |
|------------|-------------|---------|
| `PK` | Primary Key | `string id PK` |
| `FK` | Foreign Key | `string customer_id FK` |
| `UK` | Unique Key | `string email UK` |
| `NOT NULL` | Required field | `string name NOT NULL` |

### Relationship Types

| Mermaid Notation | Cardinality | Description |
|------------------|-------------|-------------|
| `}o--\|\|` | Many-to-One | Many records relate to one other |
| `}o--o{` | Many-to-Many | Many records relate to many others |

### Relationship Examples

```mermaid
erDiagram
    Product ||--o{ OrderItem : includes
    Student }o--o{ Course : enrolls_in
```

## Command Line Options
### Convert Command

```bash
npm start convert [options]
```
**Options:**
- `-i, --input <file>` - Input Mermaid ERD file (required)
- `-o, --output <file>` - Output JSON schema file (optional)
- `--dry-run` - Preview conversion without creating entities
- `--verbose` - Show detailed output

**Examples:**
```bash
# Basic conversion with solution
npm start convert -- -i my-erd.mmd --solution MyProjectSolution
# Dry run with verbose output (no solution needed for preview)

# Save schema to file (no solution needed for schema export)
npm start convert -- -i my-erd.mmd -o schema.json

# Custom publisher prefix with solution
npm start convert -- -i my-erd.mmd --solution MyProjectSolution --publisher-prefix "myorg"
```

### Validate Command

```bash
npm start validate [options]
```

**Options:**
- `-i, --input <file>` - Input Mermaid ERD file (required)

**Example:**
npm start validate -- -i my-erd.mmd
```

## Solution Management

The tool automatically creates and manages Dataverse solutions for you. Solutions provide organization and deployment benefits:

### Solution Features

- **Automatic Creation**: Solutions are created if they don't exist
- **Idempotent Operations**: Safe to run multiple times - existing solutions are reused
- **Entity Organization**: All entities and relationships are created within the solution
- **Publisher Management**: Automatically creates or reuses publishers with your prefix

### Solution Naming
- Use descriptive names: `MyProjectSolution`, `CustomerManagement`, `InventorySystem`
- Solution names must be unique within your Dataverse environment
- Names should be alphanumeric with no spaces (underscores allowed)

### Examples
```bash
# Create a solution for a customer management system
npm start convert -- -i customer-erd.mmd --solution CustomerManagement

# Create a solution for inventory tracking
npm start convert -- -i inventory-erd.mmd --solution InventorySystem --publisher-prefix "inv"

# Running again with the same solution name is safe (idempotent)
```

### Config Command

```bash
npm start config
```

Shows current configuration status and required environment variables.

## Best Practices

### 1. ERD Design

- **Use descriptive names**: `customer_id` instead of `id`
- **Follow naming conventions**: Use snake_case for consistency
- **Specify constraints**: Mark primary keys, foreign keys, and unique fields
- **Document relationships**: Use meaningful relationship names

### 2. Field Naming

- **Foreign keys**: Reference the related table (e.g., `customer_id` in Order table)
- **Boolean fields**: Start with `is_` or `has_` (e.g., `is_active`)
- **Date fields**: End with `_date` or `_time` (e.g., `created_date`)
2. **Use dry runs**: Preview changes before applying to Dataverse
4. **Version control**: Keep your Mermaid files in source control
5. **Document changes**: Use meaningful commit messages for ERD updates
- **Backup before changes**: Create solution backups
- **Monitor creation**: Use verbose mode to track progress
- **Validate results**: Check created entities in Dataverse maker portal

## Limitations

### Current Limitations

1. **No update support**: The tool only creates new entities (no updates to existing)
2. **Basic field types**: Limited to common Dataverse field types
3. **No calculated fields**: Doesn't support calculated or rollup fields
4. **No business rules**: Doesn't create business rules or workflows
5. **No forms/views**: Only creates entities and fields, not UI components

### Workarounds

1. **Manual updates**: Use Dataverse maker portal for entity updates
2. **Custom fields**: Add specialized fields manually after creation
3. **Business logic**: Implement business rules separately
4. **User interface**: Design forms and views in Power Apps

## Troubleshooting

### Common Issues

**Issue**: "Entity already exists"
- **Solution**: The tool skips existing entities. Delete manually or use different names.

**Issue**: "Invalid field type"
- **Solution**: Check that your Mermaid data types are supported (see table above).

**Issue**: "Relationship creation failed"
- **Solution**: Ensure both entities exist before creating relationships.

**Issue**: "Authentication failed"
- **Solution**: Check your Azure AD app registration and environment variables.

### Getting Help

1. **Check configuration**: Run `npm start config`
2. **Validate ERD**: Run validate command first
3. **Use verbose mode**: Add `--verbose` for detailed error messages
4. **Test with examples**: Try the provided example files first

## Examples

See the `examples/` directory for complete ERD examples:

- `event-erd.mmd` - Event management with venues, events, and attendees

## Advanced Usage

### Custom Publisher Prefix

```bash
npm start convert -- -i my-erd.mmd --solution ContosoSolution --publisher-prefix "contoso"
```

This creates entities like `contoso_customer` instead of `mmd_customer`.

### Schema Export

```bash
npm start convert -- -i my-erd.mmd -o dataverse-schema.json --dry-run
```

Exports the generated Dataverse schema to a JSON file for review or documentation.

### Environment Variables

Create different `.env` files for different environments:

- `.env.dev` - Development environment
- `.env.test` - Test environment  
- `.env.prod` - Production environment

Load specific environment:
```bash
cp .env.dev .env
npm start convert -- -i my-erd.mmd --solution MyProjectSolution
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
node src/index.js create examples/event-erd.mmd

# Preview without creating (dry run)
node src/index.js create examples/event-erd.mmd --dry-run

# Quick shortcut for interactive mode
npm run create
# Then provide the file path when prompted
```

This will:
1. **Prompt for solution name** - Enter a descriptive name for your Dataverse solution
2. **Prompt for publisher prefix** - Enter 2-8 characters unique to your organization  
3. **Show configuration summary** - Review your settings before proceeding
4. **Create the solution** - Build entities and relationships in Dataverse

### Solution Naming

The tool supports user-friendly solution names with spaces and special characters like `Customer Management System` and handles the technical requirements:

- **Display Name**: Shown exactly as you enter it in Dataverse (e.g., "Customer Management System")
- **Technical Name**: Auto-generated API-safe name using PascalCase (e.g., "CustomerManagementSystem")

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
- Keeps only essential example (`event-erd.mmd`)

## Important: Relationship Types

⚠️ **Default Behavior**: All relationships are created as **referential (lookup)** relationships by default.

Mermaid ERD syntax doesn't distinguish between parental and referential relationships, so this tool defaults to the safer option that prevents cascade delete conflicts. This means:

- ✅ **All ERDs will create successfully** without "multiple parental relationships" errors
- ✅ **Data references are maintained** but without automatic cascade delete
- ⚠️ **Manual enhancement needed** if you want parental relationships with cascade delete

**📖 Read the full explanation**: [Relationship Types Documentation](docs/RELATIONSHIP_TYPES.md)

This covers:
- Why we default to referential relationships
- How to manually configure parental relationships in Dataverse
- Best practices for relationship design
- Migration guide for existing users

## Relationship Validation

The tool includes built-in validation to detect potential ERD structure issues:

### Automatic Detection
- **Self-References**: Identifies entities that reference themselves
- **Missing Primary Keys**: Ensures all entities have proper primary key definitions
- **Orphaned Entities**: Detects entities without any relationships (informational)
- **ERD Syntax Issues**: Validates proper Mermaid ERD format

### Validation Options
```bash
# Run with validation (default)
node src/index.js create examples/event-erd.mmd

# Skip validation (not recommended)
node src/index.js create examples/event-erd.mmd --no-validation

# Safe mode - explicitly ensures all relationships as lookups
node src/index.js create examples/event-erd.mmd --safe-mode

# Non-interactive mode for automation
node src/index.js create examples/event-erd.mmd --non-interactive
```

### Validation Output Example
```
🔍 Validating ERD structure...
✅ All entities have primary keys
✅ No self-references detected
ℹ️  All relationships will be created as referential (lookup) by default
✅ Validation completed successfully
```

**Note**: Since all relationships are created as referential by default, there are no cascade delete conflicts to detect. The validation focuses on ERD structure and syntax issues.

## Example ERD Files

The `examples/` directory contains ready-to-use Mermaid ERD files:

- **`event-erd.mmd`** - Event management with venues, events, and attendees
- **`event-erd.mmd`** - Event management with venues, events, and attendees
- **`choice-field-test.mmd`** - Demonstrates choice fields and global choice sets
- **`ultimate-datatype-test.mmd`** - Comprehensive field type examples

### Quick Test
```bash
# Try the e-commerce example
node src/index.js create examples/event-erd.mmd --dry-run

# Test relationship validation with complex example
node src/index.js create examples/event-erd.mmd --verbose
```
