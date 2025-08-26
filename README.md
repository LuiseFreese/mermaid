# Mermaid to Dataverse Converter

An Azure App Service application that converts Mermaid ERD diagrams into Microsoft Dataverse entities, columns, and relationships.

![Mermaid ERD to Dataverse Converter](docs/media/mermaid-converter-final.png)

## Key Features

- **Simple Web Interface**: Upload Mermaid files and deploy with a few clicks
- **Complete Schema Generation**: Creates publishers, solutions, entities, columns, and relationships
- **Relationship Support**: One-to-many relationships and junction tables for many-to-many
- **Global Choice Integration**: Map to existing choice sets or create new ones
- **Azure Security**: Key Vault integration with managed identity for secure credential management

## Quick Start

```powershell
# Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# Run automated setup (creates all Azure resources)
.\scripts\setup-entra-app.ps1
```

## Usage

1. **Access the Application**: Navigate to your deployed App Service URL
2. **Upload Files** in the wizard interface:
   - **Mermaid File**: Select a `.mmd` file containing an ERD diagram
   - **Global Choices File** (Optional): Select a `.json` file with global choice definitions
3. **Configure Options**:
   - **Solution Name**: Name for the Dataverse solution
   - **Publisher Prefix**: 3-8 character prefix for custom entities
   - **Dry Run**: Toggle to validate without creating entities
   - **Create Publisher**: Enable to auto-create publisher if needed
4. **Click "Convert & Deploy"** to start the process

## Troubleshooting

If you experience connection issues after deployment:

```powershell
# Test the application and Dataverse connection
.\scripts\test-connection.ps1 -AppServiceName "your-app-name" -ResourceGroup "your-resource-group"

# Re-run setup if resources were deleted
.\scripts\setup-entra-app.ps1
```

## Documentation

- **[Developer & Architecture Guide](docs/DEVELOPER_ARCHITECTURE.md)** - System architecture and development setup
- **[Global Choices Guide](docs/GLOBAL-CHOICES-GUIDE.md)** - Working with choice columns
- **[Usage Guide](docs/USAGE-GUIDE.md)** - Comprehensive usage examples
- **[Mermaid Guide](docs/MERMAID-GUIDE.md)** - ERD syntax reference
- See the `examples/` directory for sample Mermaid ERD files


## Note on AI Usage

GitHub Copilot has been helpful in this project - not so much for the logic of the app, but for 

* creating all the countless mermaid diagrams
* fleshing out examples
* outlining documentation
* hardening deployments and making them idempotent
* commenting the scripts so that others might understand them more easily. 


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

