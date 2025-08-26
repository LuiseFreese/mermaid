# Usage Guide

This guide explains how to use the Mermaid to Dataverse web application to transform Mermaid entity-relationship diagrams into Microsoft Dataverse solutions, tables, columns, and relationships.

## Getting Started

### 1. Initial Setup

Before using the application, you need to deploy it to Azure. The entire setup is automated with a single command:

```powershell
# Login to Azure
az login

# Run the automated setup script
./scripts/setup-entra-app.ps1
```

The setup script will:
- Create all Azure resources (App Service, Key Vault, Managed Identity)
- Deploy the web application 
- Configure Dataverse integration
- Provide you with the application URL

### 2. Prerequisites

**Mermaid ERD file** (`.mmd` extension) with valid ER diagram syntax  
**Dataverse environment** with admin access
**Global Choices file** (optional) - JSON file with choice definitions if needed

## Overview

The application provides a **step-by-step wizard interface** for uploading Mermaid ERD files and automatically creating corresponding Dataverse entities. Once deployed, everything runs in your browser!

## Web Interface Features

### Status Dashboard

The application shows real-time status of all components:

- **Application Health**: Server status
- **Azure Key Vault**: Secret access  
- **Managed Identity**: Authentication status
- **Dataverse Connection**: API connectivity

### API Endpoints

The application provides several REST API endpoints for integration and automation:

#### Web Interface Endpoints
- **`GET /`** - Web interface for file upload
- **`POST /upload`** - File upload and processing with streaming logs

#### Health Check Endpoints  
- **`GET /health`** - Overall application health
- **`GET /keyvault`** - Key Vault connectivity test
- **`GET /managed-identity`** - Managed identity authentication status

#### Validation & Testing Endpoints
- **`POST /api/validate`** - Validate Mermaid entities without creation
- **`POST /api/test-dataverse`** - Test Dataverse operations and connectivity

#### Global Choices Endpoint
- **`POST /api/global-choices`** - Create global choice sets from JSON

Access additional diagnostic information through these endpoints for troubleshooting and integration purposes.


## Quick Start

### 1. Access the Application

After running the setup script, navigate to your deployed Azure App Service URL:
```
https://your-app-name.azurewebsites.net/wizard
```

### 2. Use the Step-by-Step Wizard

1. **ERD Validation & Upload**:
   - Upload your Mermaid ERD file (`.mmd` extension)
   - Review the parsed entities and relationships
   - Click "Next" to proceed

2. **Solution & Publisher Setup**:
   - **Solution Name**: Name for your Dataverse solution (e.g., "Customer Management")
   - **Publisher Prefix**: 3-8 character prefix (e.g., "cmgt")
   - **Publisher Options**: Create new or use existing publisher
   - Click "Next" to continue

3. **Global Choices** (Optional):
   - Upload JSON file with global choice definitions if needed
   - Review and select existing choices from Dataverse
   - Click "Next" to continue

4. **Final Review & Deploy**:
   - Review your complete configuration
   - Click "Convert & Deploy" to create your solution

### 3. Monitor Real-Time Progress

Watch the live log output in the wizard interface as your solution is created:

```
Processing file: customer-management.mmd (2.3 KB)
✅ File contains valid erDiagram syntax
Parsing Mermaid ERD structure...
Found 3 entities: Customer, Order, Product
Found 2 relationships
✅ Validation completed successfully

Connecting to Dataverse...
✅ Dataverse connection successful
Creating solution: Customer Management
✅ Creating entity: Customer (3 columns)
✅ Creating entity: Order (4 columns)  
✅ Creating entity: Product (5 columns)
✅ Creating relationship: Customer → Order
✅ Creating relationship: Order → Product

✅ Deployment completed successfully!
✓ Solution 'Customer Management' created in Dataverse
✓ 3 entities created
✓ 2 relationships established
✓ Global choices processed (if provided)
```

## What Happens During Deployment

When you use the wizard interface to deploy your Mermaid ERD:

```mermaid
flowchart TD
    %% Wizard interface flow
    start([User]) --> wizard[Navigate through Wizard Steps]
    wizard --> upload[Upload Mermaid & Global Choices files]
    upload --> config[Configure Deployment Options]
    config --> review[Review Settings]
    review --> validate[Validate file format]
    validate --> parse[Parse Mermaid ERD structure]
    parse --> auth[Authenticate to Dataverse]
    auth --> create[Create Dataverse components]
    create --> complete[Display success summary]
    
    %% Detailed creation process
    create --> publisher[Create/Validate Publisher]
    publisher --> solution[Create Solution]
    solution --> entities[Create Entities & Columns]
    entities --> relationships[Create Relationships]
    relationships --> complete
    
    %% Styling
    classDef userAction fill:#d1eaff,stroke:#0078d7,stroke-width:2px
    classDef process fill:#d5f5d5,stroke:#107c10,stroke-width:2px
    classDef dataverse fill:#f5e1ff,stroke:#8661c5,stroke-width:2px
    
    class start,upload userAction
    class validate,parse,complete process
    class auth,publisher,solution,entities,relationships dataverse
```

### Processing Steps

1. **File Upload**: Browser uploads your `.mmd` file
2. **Validation**: Checks for valid Mermaid ERD syntax
3. **Parsing**: Extracts entities, columns, and relationships
4. **Authentication**: Connects to Dataverse using managed identity
5. **Publisher Creation**: Creates or validates publisher prefix
6. **Solution Creation**: Creates Dataverse solution container
7. **Entity Creation**: Creates tables with specified columns
8. **Relationship Creation**: Establishes entity relationships
9. **Summary**: Displays deployment results

## Supported Mermaid Syntax

### Basic Entity Example

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

| Mermaid Type | Dataverse Type | Notes |
|-------------|----------------|-------|
| `string` | Single Line Text | Max 255 characters |
| `integer` | Whole Number | Integer values |
| `decimal` | Decimal Number | Floating point |
| `boolean` | Yes/No | True/false values |
| `datetime` | Date and Time | Full timestamp |

### Supported Constraints

| Constraint | Meaning | Implementation |
|-----------|---------|----------------|
| `PK` | Primary Key | Creates GUID primary key + name field |
| `FK` | Foreign Key | Will be used for relationship creation |
| `UK` | Unique Key | Creates unique constraint |

### Relationship Examples

```mermaid
erDiagram
    Customer ||--o{ Order : "places"
    Order ||--o{ OrderItem : "contains"
    Product ||--o{ OrderItem : "included_in"
    
    Customer {
        string customer_id PK
        string name
        string email UK
    }
    
    Order {
        string order_id PK
        string customer_id FK
        datetime order_date
        decimal total_amount
    }
    
    Product {
        string product_id PK
        string name
        decimal price
        boolean is_active
    }
    
    OrderItem {
        string item_id PK
        string order_id FK
        string product_id FK
        integer quantity
        decimal unit_price
    }
```