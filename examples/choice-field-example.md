# Choice Field Creation in Mermaid to Dataverse Converter

This guide shows you how to create choice/option set fields in your Dataverse tables using the Mermaid to Dataverse Converter tool.

## Example Mermaid ERD with Choice Fields

Create a file named `product-example.mmd` with the following content:

```mermaid
erDiagram
  PRODUCT {
    string product_id PK "Primary key"
    string name "Product name"
    decimal price "Product price"
    choice(Small,Medium,Large) size "Product size"
    choice(Red,Blue,Green,Yellow) color "Product color"
  }
```

## How Choice Fields Work

The tool supports creating choice/picklist fields in Dataverse with the following syntax:

```
choice(Option1,Option2,Option3) fieldname
```

Where:
- `choice()` is the field type
- The comma-separated values inside parentheses are the options
- `fieldname` is the name of your field

## Implementation Details

When you create a table with choice fields:

1. The tool automatically creates a global choice set for each choice field
2. The choice set naming follows the pattern: `${publisherPrefix}_${fieldName}_choices`
3. The global choice set is created first, before the entity/field creation
4. Each choice option is assigned a numeric value starting from 1
5. If the global choice set creation fails, the tool attempts to create an inline choice field

## Running the Example

To test choice field creation:

```bash
node src/index.js create examples/product-choice-test.mmd
```

Use the `--dry-run` flag to preview what will be created without making API calls:

```bash
node src/index.js create examples/product-choice-test.mmd --dry-run
```

## Troubleshooting

If you encounter issues with choice field creation:

1. Check that your Dataverse environment allows creation of global option sets
2. Verify you have sufficient permissions in your security role
3. Try using a shorter, simpler name for your choice field
4. Ensure your publisher prefix is valid and your app registration has necessary permissions
