# Mermaid ERD Guide for Dataverse

## Overview

This guide explains how to create Mermaid Entity Relationship Diagrams (ERDs) that work optimally with the Mermaid to Dataverse web application. Learn the syntax, best practices, and advanced features to create professional data models.

## Basic Mermaid ERD Syntax

### Entity Definition

```mermaid
erDiagram
    ENTITY_NAME {
        datatype field_name PK "Description"
        datatype field_name FK "Description"
        datatype field_name "Description"
    }
```

**Key Components:**
- **ENTITY_NAME**: Use UPPERCASE for entity names
- **datatype**: Specify the field data type (see supported types below)
- **field_name**: Use lowercase with underscores for field names
- **PK**: Primary Key marker
- **FK**: Foreign Key marker
- **"Description"**: Optional field description in quotes

### Supported Data Types

| Mermaid Type | Dataverse Type | Description |
|--------------|----------------|-------------|
| `string` | Single Line of Text | Text up to 4,000 characters |
| `text` | Multiple Lines of Text | Large text fields |
| `int` | Whole Number | Integer values |
| `decimal` | Decimal Number | Numbers with decimal places |
| `boolean` | Two Options (Yes/No) | True/false values |
| `datetime` | Date and Time | Date and time values |
| `date` | Date Only | Date without time |

> **Note**: Choice columns (picklists) cannot be defined in Mermaid ERD syntax. They should be added manually after entity creation or configured as global choice sets.

### Relationships

```mermaid
erDiagram
    PARENT ||--o{ CHILD : "relationship_name"
```

**Supported Relationship Types:**
- `||--o{` : One-to-many (creates lookup relationship)
- All relationships are created as referential (lookup) relationships by default

## Complete Example

```mermaid
erDiagram
    CUSTOMER {
        string customer_id PK "Unique customer identifier"
        string first_name "Customer first name"
        string last_name "Customer last name"
        string email "Email address"
        string phone "Phone number"
        datetime created_date "Account creation date"
        boolean is_active "Active status"
        string notes "Additional customer notes"
    }
    
    ADDRESS {
        string address_id PK "Unique address identifier"
        string customer_id FK "Associated customer"
        string street "Street address"
        string city "City name"
        string state "State or province"
        string postal_code "Postal/ZIP code"
        string country "Country name"
        boolean is_primary "Primary address flag"
    }
    
    ORDER {
        string order_id PK "Unique order identifier"
        string customer_id FK "Customer reference"
        datetime order_date "Order placement date"
        decimal total_amount "Total order amount"
        string notes "Order notes"
        string payment_method "Payment method used"
    }
    
    ORDER_ITEM {
        string item_id PK "Unique item identifier"
        string order_id FK "Order reference"
        string product_id FK "Product reference"
        int quantity "Item quantity"
        decimal unit_price "Price per unit"
        decimal line_total "Total for this line"
    }
    
    PRODUCT {
        string product_id PK "Unique product identifier"
        string name "Product name"
        string sku "Stock keeping unit"
        text description "Product description"
        decimal price "Product price"
        int stock_quantity "Available stock"
        string department "Product department"
        boolean is_active "Product availability"
    }
    
    CUSTOMER ||--o{ ADDRESS : "has"
    CUSTOMER ||--o{ ORDER : "places"
    ORDER ||--o{ ORDER_ITEM : "contains"
    PRODUCT ||--o{ ORDER_ITEM : "appears_in"
```

## Many-to-Many Relationships

Since Dataverse doesn't support direct many-to-many relationships through the web application, use junction entities. **This is actually considered a best practice** in database design as it provides better control, performance, and flexibility compared to native many-to-many relationships.

**Why Junction Tables are Recommended:**
- **Additional Attributes**: Store relationship-specific data (dates, quantities, statuses)
- **Better Performance**: More efficient queries and indexing
- **Explicit Control**: Clear understanding of the relationship structure
- **Future-Proof**: Easier to extend and modify relationships
- **Dataverse Optimized**: Works seamlessly with Dataverse's lookup relationship model

```mermaid
erDiagram
    STUDENT {
        string student_id PK "Student identifier"
        string first_name "First name"
        string last_name "Last name"
        string email "Email address"
    }
    
    COURSE {
        string course_id PK "Course identifier"
        string title "Course title"
        string description "Course description"
        int credits "Credit hours"
    }
    
    ENROLLMENT {
        string enrollment_id PK "Enrollment identifier"
        string student_id FK "Student reference"
        string course_id FK "Course reference"
        datetime enrollment_date "Enrollment date"
        string notes "Enrollment notes"
        string grade "Final grade"
    }
    
    STUDENT ||--o{ ENROLLMENT : "enrolls_in"
    COURSE ||--o{ ENROLLMENT : "has_student"
```

## Choice Fields (Post-Creation Configuration)

Choice fields provide predefined options for users but **cannot be defined in Mermaid ERD syntax**. They must be configured after entity creation.

## Lookup Fields

Lookup relationships are created automatically through foreign key (FK) relationships in your ERD:

```mermaid
erDiagram
    ACCOUNT {
        string account_id PK "Account identifier"
        string name "Account name"
        string primary_contact_id FK "Primary contact reference"
    }
    
    CONTACT {
        string contact_id PK "Contact identifier"
        string name "Contact name"
        string account_id FK "Associated account reference"
    }
    
    ACCOUNT ||--o{ CONTACT : "has_contacts"
```

> **Note**: The application automatically creates lookup relationships based on FK fields and relationship definitions. You don't need special syntax beyond marking fields as FK.

## Best Practices

### 2. **Field Descriptions**
- Always include descriptions in quotes
- Be clear and concise
- Explain the purpose, not just repeat the field name
- Good: `"Customer's preferred contact method"`
- Poor: `"Contact method"`

### 4. **Relationships**
- Keep relationship names descriptive
- Use present tense verbs ("has", "contains", "manages")
- Model many-to-many as junction entities with additional attributes

## Advanced Features

### Audit Fields Pattern
```mermaid
ENTITY {
    string entity_id PK "Unique identifier"
    string name "Entity name"
    datetime created_date "Creation timestamp"
    datetime modified_date "Last modification timestamp"
    string created_by_id FK "Created by user reference"
    string modified_by_id FK "Modified by user reference"
    boolean is_active "Active status"
}
```

### Address Pattern
```mermaid
ADDRESS {
    string address_id PK "Address identifier"
    string street_1 "Street address line 1"
    string street_2 "Street address line 2"
    string city "City name"
    string state_province "State or province"
    string postal_code "Postal or ZIP code"
    string country "Country name"
    string address_label "Address label or description"
    boolean is_primary "Primary address flag"
}
```

### Contact Information Pattern
```mermaid
CONTACT_INFO {
    string contact_label "Label or description for contact method"
    string value "Contact value"
    boolean is_primary "Primary contact flag"
    boolean is_active "Active status"
}
```

## Validation and Testing

Before using your ERD with the web application:

1. **Check Syntax**: Ensure proper Mermaid syntax
2. **Validate Relationships**: Verify all FK references exist
3. **Review Data Types**: Confirm appropriate types for each field
4. **Test Relationships**: Ensure relationships make business sense
5. **Consider Scale**: Think about performance with large datasets

This guide provides the foundation for creating effective Mermaid ERDs that work seamlessly with the Dataverse web application. Start with simple examples and gradually add complexity as you become more comfortable with the syntax and patterns.
