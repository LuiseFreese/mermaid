# Global Choice Set Creation Guide

This guide explains how to create global choice sets for Dataverse using our JSON configuration approach.

## Introduction to Global Choice Sets

In Dataverse, global choice sets (also called option sets) are reusable lists of options that can be referenced by multiple columns across different tables. This makes them ideal for standardized picklists like:

- Team assignments
- Experience levels
- Status values
- Categories
- Priorities
- Colors
- Sizes

## Creating Your Global Choices JSON File

### Basic Structure

Your JSON file should follow this structure:

```json
{
  "globalChoices": [
    {
      "name": "prefix_choicename",
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

- **name**: Use a prefix followed by a descriptive name (e.g., `mmd_teamchoice`)
  - This must be unique in your Dataverse environment
  - Only use lowercase letters, numbers, and underscores
  - Always include a prefix (e.g., `mmd_`, `cust_`, etc.)

- **displayName**: User-friendly name shown in the UI
  - Can include spaces and proper capitalization
  - Keep it concise but descriptive

### Option Values

- **value**: Integer value for each option
  - Best practice is to start at 100000000 for custom values
  - Increment by 1 for each option
  - Values must be unique within a choice set

- **label**: Display text shown to users
  - Keep it short and clear
  - Can include spaces and proper capitalization

## Example Global Choices

### Team Assignment Choice Set

```json
{
  "name": "mmd_teamchoice",
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

### Experience Level Choice Set

```json
{
  "name": "mmd_levelchoice",
  "displayName": "Level",
  "description": "Experience level",
  "options": [
    {
      "value": 100000000,
      "label": "Junior",
      "description": "Junior experience level"
    },
    {
      "value": 100000001,
      "label": "Mid",
      "description": "Mid experience level"
    },
    {
      "value": 100000002,
      "label": "Senior",
      "description": "Senior experience level"
    },
    {
      "value": 100000003,
      "label": "Lead",
      "description": "Lead experience level"
    }
  ]
}
```

## Best Practices

1. **Be Consistent**: Use a consistent naming convention for all your choice sets
2. **Plan Ahead**: Think about all the options you might need in the future
3. **Avoid Duplicates**: Check if a similar choice set already exists before creating a new one
4. **Keep it Simple**: Don't create overly complex choice sets with too many options
5. **Document Choices**: Include clear descriptions for both the choice set and each option
6. **Use Meaningful Values**: Start at 100000000 for custom values to avoid conflicts
7. **Keep Value Spacing**: Leave room between values (e.g., increment by 10 or 100) if you expect to add options later

## Referencing Global Choices in Your Solution

In your `solution-config.json`, reference global choices in columns like this:

```json
{
  "name": "mmd_team",
  "displayName": "Team",
  "description": "Team assignment",
  "type": "choice",
  "choiceSet": "mmd_teamchoice",
  "required": false
}
```

## Deploying Your Global Choices

Run the deployment script:

```
node create-dataverse-solution.js --solution-config solution-config.json --choices-config global-choices.json
```

This will create all your global choice sets in Dataverse and make them available for use in your tables.
