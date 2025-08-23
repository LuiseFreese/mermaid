# Global Choices Guide

This guide explains how to create and manage Dataverse global choice sets (option sets) using the Mermaid to Dataverse Converter.

## Overview

Global choice sets in Dataverse are reusable lists of options that can be used across multiple entities. They provide consistency and centralized management of predefined values like status codes, categories, priorities, and other standardized options.

The application supports two main approaches for working with global choices:
1. **Select existing choices** - Add built-in or custom global choices that already exist in Dataverse to your solution
2. **Create new choices** - Upload JSON files to create new custom global choice sets

## Features

### ✅ Supported Operations
- **Select existing global choices** - Browse and select from built-in and custom choice sets already in Dataverse
- **Add choices to solution** - Include selected choices in your Dataverse solution automatically
- **Create new global choice sets** from JSON definitions
- **Existence checking** to avoid duplicates 
- **Solution integration** - all choices (existing and new) are added to your specified solution
- **Bulk processing** - upload JSON files with multiple choice sets
- **Real-time feedback** - see creation progress in the web UI
- **Dry run mode** - preview what would be created without making changes
- **Built-in choice detection** - automatically identifies and categorizes Microsoft's built-in choices

### 📋 JSON File Format

Global choices are defined in JSON files with the following structure:

```json
{
  "globalChoices": [
    {
      "name": "choice_internal_name",
      "displayName": "Human Readable Name",
      "description": "Optional description of the choice set",
      "options": [
        { "value": 100000000, "label": "Option 1" },
        { "value": 100000001, "label": "Option 2" },
        { "value": 100000002, "label": "Option 3" }
      ]
    }
  ]
}
```

**⚠️ Important**: The `name` field should NOT include your publisher prefix. The publisher prefix will be automatically applied during creation based on the publisher selected in the deployment wizard. This ensures consistent naming conventions and prevents conflicts.

**Example:**
```json
{
  "globalChoices": [
    {
      "name": "deployment_stage",
      "displayName": "Deployment Stage",
      "description": "Stages in the deployment lifecycle",
      "options": [
        { "value": 100000000, "label": "Development" },
        { "value": 100000001, "label": "Testing" },
        { "value": 100000002, "label": "Production" }
      ]
    }
  ]
}
```

When this is deployed with a publisher prefix "south", it will be created in Dataverse as "south_deployment_stage".

### 🔧 Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ Yes | Internal name for the choice set (e.g., `choice_name`) - The publisher prefix will be automatically added during creation |
| `displayName` | ✅ Yes | Human-readable name shown in Dataverse UI |
| `description` | ❌ No | Optional description explaining the purpose |
| `options` | ✅ Yes | Array of choice options with values and labels |
| `options[].value` | ✅ Yes | Numeric value (typically start at 100000000) |
| `options[].label` | ✅ Yes | Display text for the option |

## Usage Guide

### Method 1: Select Existing Global Choices

The application can browse and select from existing global choices in your Dataverse environment:

#### Step 1: Access Global Choices Selection
1. **Access the application** - Navigate to your deployed App Service URL or use the wizard interface
2. **Navigate to Global Choices** - Use the Global Choices section in the interface
3. **View available choices** - The system automatically fetches all global choices from your Dataverse environment

#### Step 2: Browse Available Choices
The interface shows:
- **Built-in choices** - Microsoft's standard global choices (e.g., status codes, priorities)
- **Custom choices** - Organization-specific global choices already created
- **Choice details** - Name, display name, and option count for each choice set

#### Step 3: Select Choices for Your Solution
1. **Check/uncheck choices** - Select the global choices you want to include in your solution
2. **Review selections** - Verify your selected choices before deployment
3. **Deploy** - The selected choices will be automatically added to your solution

### Method 2: Create New Global Choices from JSON

Create new custom global choice sets by uploading JSON definitions:

#### Step 1: Create JSON File

Create a JSON file containing your global choice definitions. Example `my-choices.json`:

```json
{
  "globalChoices": [
    {
      "name": "priority_level",
      "displayName": "Priority Level",
      "description": "Priority levels for tasks and issues",
      "options": [
        { "value": 100000000, "label": "Low" },
        { "value": 100000001, "label": "Medium" },
        { "value": 100000002, "label": "High" },
        { "value": 100000003, "label": "Critical" },
        { "value": 100000004, "label": "Urgent" }
      ]
    },
    {
      "name": "project_status",
      "displayName": "Project Status", 
      "description": "Status options for projects",
      "options": [
        { "value": 100000000, "label": "Planning" },
        { "value": 100000001, "label": "In Progress" },
        { "value": 100000002, "label": "On Hold" },
        { "value": 100000003, "label": "Completed" },
        { "value": 100000004, "label": "Cancelled" }
      ]
    }
  ]
}
```

#### Step 2: Upload via Web Interface

1. **Access the application** - Navigate to your deployed App Service URL
2. **Upload your JSON file** - Use the "Global Choices File" section
3. **Configure solution settings**:
   - **Solution Name**: Name of the Dataverse solution
   - **Publisher**: Select an existing publisher or create a new one
   - **Publisher Prefix**: 3-8 character prefix for your organization (automatically applied to choice names)
   - **Dry Run**: Enable to preview without creating choices
4. **Process** - Click "Convert & Deploy" to create the global choices
5. **Monitor progress** - Watch real-time logs showing creation status

#### Step 3: Verify in Dataverse

After processing, verify your global choices in Dataverse:

1. Navigate to **Power Apps** → **Data** → **Choice Sets**  
2. Find your newly created choice sets by name
3. Verify they are assigned to your specified solution
4. Check that all options and labels are correct

### Combining Both Methods

You can use both approaches in a single deployment:
1. **Select existing choices** that you want to reuse from Dataverse
2. **Upload JSON file** with new custom choices you want to create
3. **Deploy together** - Both existing and new choices will be added to your solution

This hybrid approach lets you leverage existing organizational standards while adding custom choices specific to your project.

As Mermaid doe not support choice fields, you can ater on enhance your tables with choice columns and pull the values from the global choices that we already added to the solution.

## Best Practices

### Naming Conventions

- **Display names**: Use Title Case (e.g., "Order Status", "Customer Type")
- **Option labels**: Use clear, concise text (e.g., "In Progress", not "in_progress")

### 🔢 Value Ranges
- **Start at 100000000** - Dataverse standard for custom option values
- **Sequential values** - Increment by 1 for each option
- **Consistent numbering** - Don't skip numbers within a choice set

### File Organization
- **Group related choices** - Put related choice sets in the same JSON file
- **Logical file names** - Use descriptive names like `sales-choices.json`
- **Version control** - Store JSON files in source control with your Mermaid files

### Wizard Interface Integration
- **Step-by-step guidance** - The wizard interface walks you through global choice selection
- **Visual choice browser** - Browse existing choices with search and filtering
- **Real-time validation** - Immediate feedback on JSON file format and content
- **Combined deployment** - Include global choices as part of your complete solution deployment

### Solution Management
- **Use consistent solution names** - Same solution for related entities and choices
- **Publisher prefixes** - Use your organization's standard prefix
- **Environment strategy** - Test in development before production deployment

## API Reference

### List Available Global Choices

**Endpoint**: `GET /api/global-choices-list`

Retrieves all global choice sets available in the Dataverse environment, categorized as built-in or custom.

```bash
curl -X GET http://localhost:8082/api/global-choices-list
```

**Response**: JSON with categorized choice sets

```json
{
  "success": true,
  "choiceSets": [
    {
      "MetadataId": "guid-here",
      "Name": "south_priority_level",
      "DisplayName": "Priority Level",
      "IsBuiltIn": false,
      "OptionCount": 5
    }
  ],
  "summary": {
    "total": 150,
    "custom": 25,
    "builtIn": 125
  }
}
```

### Create New Global Choices

**Endpoint**: `POST /api/global-choices`

**Request**: Multipart form data with JSON file

```bash
curl -X POST http://localhost:8082/api/global-choices \
  -F "globalChoicesFile=@my-choices.json" \
  -F "solutionName=MySolution" \
  -F "dryRun=false"
```

**Response**: JSON with creation results

```json
{
  "success": true,
  "created": 2,
  "skipped": 0,
  "errors": [],
  "choiceSets": [
    {
      "success": true,
      "created": true,
      "choiceSet": { "name": "south_priority_level", "displayName": "Priority Level" }
    }
  ]
}
```

## Troubleshooting

### Common Issues

**❌ "Choice set already exists"**
- **Cause**: A choice set with the same name already exists
- **Solution**: The application skips existing choices automatically. Check the logs for confirmation.

**❌ "Invalid JSON format"**
- **Cause**: JSON file has syntax errors or missing required fields
- **Solution**: Validate your JSON using a JSON validator and ensure all required fields are present

**❌ "Solution not found"**
- **Cause**: Specified solution doesn't exist in Dataverse
- **Solution**: Ensure the solution name is correct or enable auto-creation of solutions

**❌ "Authentication failed"**
- **Cause**: Invalid credentials or permissions
- **Solution**: Check Key Vault configuration and Dataverse application user permissions

### Debug Tips

1. **Enable dry run mode** - Test your JSON files without creating actual choices
2. **Check solution assignment** - Verify choices are created in the correct solution
3. **Review option values** - Ensure values start at 100000000 and are sequential
4. **Validate JSON syntax** - Use online JSON validators before uploading

## Examples

See the `examples/` directory for sample JSON files:

- [`examples/unique-global-choices.json`](../examples/unique-global-choices.json) - Sample global choices with tested prefixes
- [`examples/global-choices.json`](../examples/global-choices.json) - General purpose choices
- [`examples/crm-choices.json`](../examples/crm-choices.json) - CRM-related choice sets

## Limitations

### Current Limitations
- **No automatic field linking** - Mermaid enum fields and global choices are not automatically linked
- **Manual prefix required** - Must include publisher prefix in JSON choice names
- **No option updates** - Existing choice sets are skipped entirely during JSON uploads
- **No deletion support** - Cannot remove choice sets or options through the interface
- **Name-only existence check** - Only checks choice set names, not option values for new choices
- **No validation of option values** - Application trusts your value assignments in JSON uploads

### Future Enhancements
- **Automatic field linking** - Connect Mermaid enum fields to selected global choice sets
- **Dynamic prefix application** - Automatically apply solution's publisher prefix to choice names
- **Option set updates** - Update existing choice sets with new options
- **Value validation** - Ensure option values don't conflict with existing choices
- **Choice field mapping** - Visual interface to map Mermaid enums to global choices
- **Bulk management** - Import/export choice sets for backup and migration
- **Choice usage tracking** - Show which entities use which global choices

---

*Last updated: August 2025*
