/**
 * Test Fixtures
 * Sample data for testing ERD parsing, validation, and deployment
 */

module.exports = {
  // Valid ERD examples
  simpleERD: `erDiagram
    Customer {
        string customer_id PK "Unique customer identifier"
        string first_name "Customer first name"
        string last_name "Customer last name"
        string email "Email address"
        datetime created_date "Date customer was created"
        boolean is_active "Whether customer is active"
    }
    
    Order {
        string order_id PK "Unique order identifier"
        string customer_id FK "Reference to customer"
        decimal total_amount "Order total amount"
        datetime order_date "Date order was placed"
        string status "Order status"
    }
    
    Customer ||--o{ Order : places`,

  complexERD: `erDiagram
    Account {
        string accountid PK "Primary Key"
        string name "Account Name"
        string accountnumber "Account Number"
        picklist accountcategorycode "Account Category"
        picklist accountclassificationcode "Account Classification"
        decimal revenue "Annual Revenue"
        datetime createdon "Created On"
        boolean statecode "Status"
    }
    
    Contact {
        string contactid PK "Primary Key"
        string firstname "First Name"
        string lastname "Last Name"
        string emailaddress1 "Email"
        string jobtitle "Job Title"
        string telephone1 "Phone"
        string accountid FK "Parent Account"
        datetime createdon "Created On"
    }
    
    Opportunity {
        string opportunityid PK "Primary Key"
        string name "Topic"
        string accountid FK "Account"
        string contactid FK "Contact"
        decimal estimatedvalue "Est. Revenue"
        datetime estimatedclosedate "Est. Close Date"
        picklist statecode "Status"
        datetime createdon "Created On"
    }
    
    OpportunityProduct {
        string opportunityproductid PK "Primary Key"
        string opportunityid FK "Opportunity"
        string productid FK "Product"
        decimal quantity "Quantity"
        decimal priceperunit "Price Per Unit"
        decimal extendedamount "Extended Amount"
    }
    
    Product {
        string productid PK "Primary Key"
        string name "Name"
        string productnumber "Product Number"
        decimal standardcost "Standard Cost"
        decimal listprice "List Price"
        boolean statecode "Status"
    }
    
    Account ||--o{ Contact : "has contacts"
    Account ||--o{ Opportunity : "has opportunities"
    Contact ||--o{ Opportunity : "owns opportunities"
    Opportunity ||--o{ OpportunityProduct : "contains products"
    Product ||--o{ OpportunityProduct : "appears in opportunities"`,

  // ERD with CDM entities
  cdmERD: `erDiagram
    Account {
        string accountid PK
        string name
        string accountnumber
        decimal revenue
    }
    
    Contact {
        string contactid PK
        string firstname
        string lastname
        string emailaddress1
        string accountid FK
    }
    
    CustomEntity {
        string custom_id PK
        string name
        string description
    }
    
    Account ||--o{ Contact : "primary contact"
    Account ||--o{ CustomEntity : "related custom"`,

  // Invalid ERD examples
  invalidSyntaxERD: `erDiagram
    Entity1 {
        invalid syntax here
        missing types
    }
    
    Entity2 
        missing braces
        string field1
    }`,

  missingPrimaryKeyERD: `erDiagram
    EntityWithoutPK {
        string field1
        string field2
        datetime created_date
    }`,

  invalidNamingERD: `erDiagram
    "Entity With Spaces" {
        string entity_id PK
        string name
    }
    
    entity-with-hyphens {
        string id PK
        string description
    }`,

  // Sample validation results
  validationResults: {
    success: {
      success: true,
      entities: [
        {
          name: 'Customer',
          attributes: [
            { name: 'customer_id', type: 'string', isPrimaryKey: true },
            { name: 'first_name', type: 'string' },
            { name: 'last_name', type: 'string' },
            { name: 'email', type: 'string' }
          ]
        },
        {
          name: 'Order',
          attributes: [
            { name: 'order_id', type: 'string', isPrimaryKey: true },
            { name: 'customer_id', type: 'string', isForeignKey: true },
            { name: 'total_amount', type: 'decimal' }
          ]
        }
      ],
      relationships: [
        {
          from: 'Customer',
          to: 'Order',
          type: 'one-to-many',
          label: 'places'
        }
      ],
      warnings: [],
      validation: { isValid: true },
      cdmDetection: {
        detectedCDM: [],
        customEntities: ['Customer', 'Order']
      }
    },

    withWarnings: {
      success: true,
      entities: [
        {
          name: 'EntityWithIssues',
          attributes: [
            { name: 'field1', type: 'string' }
          ]
        }
      ],
      relationships: [],
      warnings: [
        {
          type: 'primary_key',
          message: 'Entity EntityWithIssues missing primary key',
          entity: 'EntityWithIssues'
        },
        {
          type: 'naming',
          message: 'Entity name EntityWithIssues should use PascalCase',
          entity: 'EntityWithIssues'
        }
      ],
      validation: { isValid: false },
      correctedERD: `erDiagram
        EntityWithIssues {
            string entitywithissues_id PK
            string field1
        }`
    },

    failure: {
      success: false,
      message: 'Invalid ERD syntax',
      errors: [
        'Syntax error on line 3: Expected entity definition',
        'Missing closing brace for entity'
      ]
    }
  },

  // Sample deployment data
  deploymentData: {
    minimal: {
      mermaidContent: `erDiagram
        TestEntity {
          string test_id PK
          string name
        }`,
      solutionName: 'TestSolution',
      solutionDisplayName: 'Test Solution',
      publisherName: 'Test Publisher',
      publisherPrefix: 'test',
      cdmChoice: 'custom'
    },

    withChoices: {
      mermaidContent: `erDiagram
        TestEntity {
          string test_id PK
          string name
          picklist status
        }`,
      solutionName: 'TestSolution',
      solutionDisplayName: 'Test Solution',
      publisherName: 'Test Publisher',
      publisherPrefix: 'test',
      cdmChoice: 'custom',
      selectedChoices: [
        { LogicalName: 'test_status' },
        { LogicalName: 'test_category' }
      ],
      customChoices: [
        {
          name: 'Custom Status',
          logicalName: 'test_custom_status',
          options: [
            { value: 1, label: 'Active' },
            { value: 2, label: 'Inactive' },
            { value: 3, label: 'Pending' }
          ]
        }
      ]
    },

    withCDM: {
      mermaidContent: `erDiagram
        Account {
          string accountid PK
          string name
        }
        CustomEntity {
          string custom_id PK
          string description
        }`,
      solutionName: 'CDMTestSolution',
      solutionDisplayName: 'CDM Test Solution',
      publisherName: 'CDM Publisher',
      publisherPrefix: 'cdm',
      cdmChoice: 'cdm',
      cdmMatches: [
        {
          originalEntity: { name: 'Account' },
          cdmEntity: { logicalName: 'account', displayName: 'Account' }
        }
      ]
    }
  },

  // Sample API responses
  apiResponses: {
    publishers: {
      success: true,
      publishers: [
        {
          id: 'pub-123',
          uniqueName: 'testpublisher',
          friendlyName: 'Test Publisher',
          prefix: 'test'
        },
        {
          id: 'pub-456',
          uniqueName: 'defaultpublisher',
          friendlyName: 'Default Publisher',
          prefix: 'new'
        }
      ]
    },

    solutions: {
      success: true,
      solutions: [
        {
          solutionid: 'sol-123',
          uniquename: 'TestSolution',
          friendlyname: 'Test Solution',
          publisherid: 'pub-123'
        }
      ]
    },

    globalChoices: {
      success: true,
      all: [
        {
          LogicalName: 'test_status',
          DisplayName: 'Status',
          IsCustom: true
        },
        {
          LogicalName: 'statecode',
          DisplayName: 'Status',
          IsCustom: false
        }
      ],
      grouped: {
        custom: [
          {
            LogicalName: 'test_status',
            DisplayName: 'Status',
            IsCustom: true
          }
        ],
        builtIn: [
          {
            LogicalName: 'statecode',
            DisplayName: 'Status',
            IsCustom: false
          }
        ]
      },
      summary: {
        total: 2,
        custom: 1,
        builtIn: 1
      }
    }
  },

  // Mock service responses
  mockResponses: {
    dataverseClient: {
      testConnection: { success: true, message: 'Connected' },
      createEntity: { id: 'entity-123', logicalName: 'test_entity' },
      createRelationship: { id: 'rel-123', schemaName: 'test_relationship' },
      getPublishers: [
        { id: 'pub-123', uniqueName: 'test', prefix: 'test' }
      ],
      getSolutions: [
        { id: 'sol-123', uniqueName: 'TestSolution' }
      ]
    },

    validationService: {
      validateERD: {
        success: true,
        entities: [],
        relationships: [],
        warnings: [],
        validation: { isValid: true }
      }
    },

    deploymentService: {
      deploySolution: {
        success: true,
        entitiesCreated: 2,
        relationshipsCreated: 1,
        globalChoicesAdded: 0,
        message: 'Deployment completed successfully'
      }
    }
  }
};
