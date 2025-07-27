# Architecture Diagrams

## System Architecture

```mermaid
graph TB
    A[Mermaid ERD File] --> B[CLI Interface]
    B --> C[ERD Parser]
    C --> D[Schema Generator]
    D --> E[Relationship Validator]
    E --> F[Dataverse Client]
    F --> G[Microsoft Dataverse]
    
    B --> H[Interactive Prompts]
    H --> I[Configuration]
    I --> F
    
    F --> J[Authentication]
    J --> K[Microsoft Entra ID]
    
    subgraph "Core Components"
        C
        D
        E
        F
    end
    
    subgraph "External Services"
        G
        K
    end
    
    subgraph "Validation Layer"
        E
    end
```

> **Note:** The Dataverse Client is responsible for both authentication and all API operations. After processing and validation, results and warnings are reported back to the CLI for user feedback.
>
> **Note:** The "Validation Layer" is a visual grouping for the Relationship Validator. Validation is performed during schema generation and is not a separate architectural layer.

## Data Flow Architecture

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Parser
    participant Generator
    participant Validator
    participant Client
    participant Dataverse
    participant EntraID

    User->>CLI: Run command with ERD file
    CLI->>User: Prompt for solution details
    User->>CLI: Provide solution name & publisher
    CLI->>Parser: Parse ERD file
    Parser->>CLI: Return structured data
    CLI->>Generator: Generate Dataverse schema
    Generator->>Validator: Validate relationships
    Validator->>Generator: Return validation results
    Generator->>CLI: Return API-ready metadata with warnings
    CLI->>Client: Create entities with schema
    Client->>EntraID: Authenticate
    EntraID->>Client: Return access token
    Client->>Dataverse: Create solution
    Client->>Dataverse: Create entities
    Client->>Dataverse: Create relationships
    Dataverse->>Client: Confirm creation
    Client->>CLI: Report results
    CLI->>User: Display summary with validation warnings
```

> **Note:** Error handling and reporting are integrated throughout the workflow. Any validation warnings, API errors, or configuration issues are surfaced to the user via CLI feedback at each relevant step.

## Component Relationships

```mermaid
classDiagram
    class CLIInterface {
        +parseArguments()
        +promptForInput()
        +validateConfig()
        +orchestrateFlow()
    }
    
    class ERDParser {
        +parse(content)
        +extractEntities()
        +extractRelationships()
        +validateSyntax()
    }
    
    class SchemaGenerator {
        +generateEntitySchema()
        +generateColumnMetadata()
        +generateRelationshipMetadata()
        +mapFieldTypes()
    }
    
    class RelationshipValidator {
        +validateRelationships()
        +detectMultipleParental()
        +detectCircularCascades()
        +detectSelfReferences()
        +generateWarnings()
    }
    
    class DataverseClient {
        +authenticate()
        +createSolution()
        +createEntity()
        +createColumn()
        +createRelationship()
    }
    
    CLIInterface --> ERDParser
    CLIInterface --> SchemaGenerator
    CLIInterface --> DataverseClient
    ERDParser --> SchemaGenerator
    SchemaGenerator --> RelationshipValidator
    SchemaGenerator --> DataverseClient
```

> **Note:** The CLIInterface surfaces all validation warnings, errors, and results to the user, integrating feedback from every component in the workflow.
