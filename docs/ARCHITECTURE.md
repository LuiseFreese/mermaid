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
