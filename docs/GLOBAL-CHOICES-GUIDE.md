# Global Choices Guide

This guide explains how to create and manage Dataverse global choice sets (option sets) using the modern React-based Mermaid to Dataverse Converter.

## Overview

Global choice sets in Dataverse are reusable lists of options that can be used across multiple entities. They provide consistency and centralized management of predefined values like status codes, categories, priorities, and other standardized options.

The React wizard application supports two main approaches for working with global choices:
1. **Select existing choices** - Add built-in or custom global choices that already exist in Dataverse to your solution
2. **Create new choices** - Upload JSON files to create new custom global choice sets through the modern React interface

## Features

### Supported Operations
- **Select existing global choices** - Browse and select from built-in and custom choice sets already in Dataverse
- **Add choices to solution** - Include selected choices in your Dataverse solution automatically
- **Create new global choice sets** from JSON definitions
- **Existence checking** to avoid duplicates 
- **Solution integration** - all choices (existing and new) are added to your specified solution
- **Bulk processing** - upload JSON files with multiple choice sets
- **Real-time feedback** - see creation progress in the React wizard interface
- **Built-in choice detection** - automatically identifies and categorizes Microsoft's built-in choices
- **Modern UI/UX** - Fluent UI v9 components for intuitive interaction

### JSON File Format

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

When this is deployed with a publisher prefix "pink", it will be created in Dataverse as "pink_deployment_stage".

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

The React application can browse and select from existing global choices in your Dataverse environment:

#### Step 1: Access Global Choices Selection
1. **Open the React Wizard** - Navigate to your deployed Azure App Service URL (e.g., `https://your-app-name.azurewebsites.net`)
2. **Navigate to Global Choices Step** - Use the Global Choices section in the wizard workflow
3. **View available choices** - The system automatically fetches all global choices from your Dataverse environment using secure managed identity authentication

#### Step 2: Browse Available Choices
The React interface displays:
- **Built-in choices** - Microsoft's standard global choices (e.g., status codes, priorities)
- **Custom choices** - Organization-specific global choices already created
- **Choice details** - Name, display name, and option count for each choice set
- **Modern search and filtering** - Fluent UI components for easy navigation

#### Step 3: Select Choices for Your Solution
1. **Interactive checkboxes** - Select the global choices you want to include in your solution
2. **Real-time preview** - Review selections with live validation feedback
3. **Continue wizard** - The selected choices will be automatically included in your solution deployment

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

#### Step 2: Upload via React Wizard

1. **Open the React Application** - Navigate to your deployed Azure App Service URL (e.g., `https://your-app-name.azurewebsites.net`)
2. **Global Choices Upload Step** - Use the "Global Choices File" section in the React wizard
3. **Browse** - Upload your JSON file using the modern file upload component
4. **Configure solution settings** in the wizard interface:
   - **Solution Name**: Name of the Dataverse solution
   - **Publisher**: Select an existing publisher or create a new one
   - **Publisher Prefix**: 3-8 character prefix for your organization (automatically applied to choice names)
5. **Real-time Validation** - The React interface provides immediate feedback on JSON format and content
6. **Process Deployment** - Continue through the wizard to deploy global choices as part of your complete solution
7. **Monitor progress** - Watch real-time logs in the React interface showing creation status

### Combining Both Methods

You can use both approaches in a single deployment through the React wizard:
1. **Select existing choices** that you want to reuse from Dataverse (Step 3 of wizard)
2. **Upload JSON file** with new custom choices you want to create (also Step 3)
3. **Deploy together** - Both existing and new choices will be added to your solution in the final deployment step

This hybrid approach lets you leverage existing organizational standards while adding custom choices specific to your project.

As Mermaid does not support choice fields, you can later enhance your tables with choice columns and pull the values from the global choices that we already added to the solution.
