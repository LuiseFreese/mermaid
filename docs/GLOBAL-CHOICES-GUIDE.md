# Global Choice Set Creation Guide

This guide explains how to create global choice sets for Dataverse using our JSON configuration approach.

## Introduction to Global Choice Sets

In Dataverse, global choice sets (also called option sets) are reusable lists of options that can be referenced by multiple columns across different tables.

## Creating Your Global Choices JSON File

### Basic Structure

Your JSON file should follow this structure:

```json
{
  "globalChoices": [
    {
      "name": "choicename",
      "displayName": "User-friendly name",
      "description": "Description of this choice set",
      "options": [
        {
          "value": 100000000,
          "label": "Option One",
          "description": "Description of this option"
        },
        // More options...
      ]
    },
    // More choice sets...
  ]
}
```

### Naming Conventions

- **name**: This must be unique in your Dataverse environment
  - Only use lowercase letters, numbers, and underscores

- **displayName**: User-friendly name shown in the UI
  - Can include spaces
  - Keep it concise but descriptive

### Option Values

- **value**: Integer value for each option
  - Increment by 1 for each option
  - Values must be unique within a choice set

- **label**: Display text shown to users
  - Keep it short and clear
  - Can include spaces

## Example Global Choices

### Team Assignment Choice Set

```json
{
  "name": "teamchoice",
  "displayName": "Team",
  "description": "Team assignment",
  "options": [
    {
      "value": 100000000,
      "label": "Development",
      "description": "Development team option"
    },
    {
      "value": 100000001,
      "label": "Testing",
      "description": "Testing team option"
    },
    {
      "value": 100000002,
      "label": "Design",
      "description": "Design team option"
    },
    {
      "value": 100000003,
      "label": "Product",
      "description": "Product team option"
    }
  ]
}
```
## Creating Global Choice Sets in Dataverse

This tool allows you to create global choice sets in Dataverse that can later be referenced by choice columns you create manually.

### Deploy Global Choices

First, deploy your global choices using the CLI:

```bash
node src/index.js create path/to/your-erd.mmd --global-choices path/to/your-choices.json
```

Or run without the parameter to be prompted interactively:

```bash
node src/index.js create path/to/your-erd.mmd
```

When prompted:
```
💡 Global Choice Sets are defined in JSON files.
   You can include them in your deployment to create global choice sets in Dataverse.
   Example file: global-choices.json

🔄 Would you like to include global choice sets in this deployment? (y/N): y
📄 Enter path to global choices file: path/to/your-choices.json
```

### Create Choice Columns in Dataverse

After deployment, the global choice sets will be available in your Dataverse environment and be associated with your solution. You can then manually create choice columns that reference these global choices.


### Command Reference

#### Basic Usage
```bash
node src/index.js create <mermaid-file> --global-choices <choices-json-file>
```

#### Non-interactive Mode
```bash
node src/index.js create <mermaid-file> --global-choices <choices-json-file> --non-interactive --publisher-prefix <prefix>
```

#### Example with All Options
```bash
node src/index.js create examples/crm-solution.mmd --global-choices examples/crm-choices.json --publisher-prefix mmd --non-interactive
```

This process creates the global choice sets in Dataverse, making them available for reference when you manually create choice columns in your tables.
