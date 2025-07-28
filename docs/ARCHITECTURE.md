# Architecture Diagrams

## System Architecture

```mermaid
graph TB
    A[Mermaid ERD File] --> B[CLI Interface]
    L[Global Choice JSON File] --> B
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
    
    subgraph "Global Choices"
        L
        M[Global Choice Processor]
    end
    
    subgraph "Publisher Management"
        N[Publisher Manager]
    end
    
    B --> M
    M --> F
    B --> N
    N --> F
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
    
    opt Global Choices Configuration
        CLI->>CLI: Load global choices JSON
    end
    
    CLI->>Generator: Generate Dataverse schema
    Generator->>Validator: Validate relationships
    Validator->>Generator: Return validation results
    Generator->>CLI: Return API-ready metadata with warnings
    CLI->>Client: Create entities with schema
    Client->>EntraID: Authenticate
    EntraID->>Client: Return access token
    
    opt Publisher Management
        Client->>Dataverse: List existing publishers
        Dataverse->>Client: Return publishers
        alt Publisher exists
            Client->>Client: Select existing publisher
        else Publisher doesn't exist
            Client->>Dataverse: Create new publisher
            Dataverse->>Client: Return publisher ID
        end
    end
    
    Client->>Dataverse: Create solution
    
    opt Global Choices Creation
        Client->>Dataverse: Create global choice sets
        Dataverse->>Client: Return choice set IDs
    end
    
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
        +loadGlobalChoices()
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
        +processGlobalChoices()
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
        +listPublishers()
        +createPublisher()
        +ensurePublisher()
        +createSolution()
        +createEntity()
        +createColumn()
        +createRelationship()
        +createGlobalChoiceSet()
        +createGlobalChoiceSets()
        +addComponentToSolution()
    }
    
    class GlobalChoiceProcessor {
        +loadChoicesFromJSON()
        +processChoiceOptions()
        +mapChoiceToSchema()
    }
    
    class PublisherManager {
        +listPublishers()
        +findPublisherByPrefix()
        +createPublisher()
        +ensurePublisherExists()
        +validatePublisherPrefix()
    }
    
    CLIInterface --> ERDParser
    CLIInterface --> SchemaGenerator
    CLIInterface --> DataverseClient
    CLIInterface --> GlobalChoiceProcessor
    CLIInterface --> PublisherManager
    ERDParser --> SchemaGenerator
    SchemaGenerator --> RelationshipValidator
    SchemaGenerator --> DataverseClient
    GlobalChoiceProcessor --> SchemaGenerator
    GlobalChoiceProcessor --> DataverseClient
    PublisherManager --> DataverseClient
```

> **Note:** The CLIInterface surfaces all validation warnings, errors, and results to the user, integrating feedback from every component in the workflow.
