---
sidebar_position: 1
---

# Welcome to Mermaid to Dataverse Converter

The **Mermaid to Dataverse Converter** is a powerful tool that converts Mermaid ERD diagrams into fully functional Microsoft Dataverse solutions. This tool streamlines the process of creating Dataverse data models, saving hours of manual configuration.

## What You Can Do

- **Convert ERD Diagrams**: Transform Mermaid ERD syntax into Dataverse tables and relationships
- **Automatic Validation**: Detect and fix common Dataverse naming and structure issues
- **Global Choices**: Automatically manage and reuse global choice sets
- **CDM Integration**: Seamlessly integrate with Common Data Model entities
- **Solution Packaging**: Create complete Dataverse solutions ready for deployment
- **Azure AD Authentication**: Secure access with Microsoft identity
- **Deployment History**: Track all your deployments with detailed logging
- **Modular Rollback**: Selectively rollback components of your deployment

## Quick Start

Get up and running in minutes:

```bash
# Clone the repository
git clone https://github.com/LuiseFreese/mermaid.git
cd mermaid

# Install dependencies
npm install

# Set up environment variables
copy .env.example .env.local

# Start the development server
npm start
```

The application will be available at `http://localhost:8080`.

## Key Features

### Intuitive UI
A wizard-based interface guides you through the process:
1. Upload your Mermaid ERD file
2. Configure solution and publisher settings
3. Validate and preview your data model
4. Deploy to Dataverse

### Smart Validation
The wizard automatically detects and suggests fixes for:
- Invalid entity and attribute names
- Missing primary keys
- Incorrect relationship definitions
- Dataverse reserved words
- Naming convention violations

### Powerful Deployment
- Direct deployment to Microsoft Dataverse
- Automatic retry logic for transient failures
- Progress tracking with detailed logging
- Rollback capabilities for failed deployments

## Architecture

The application consists of three main components:

1. **Frontend** (React + TypeScript + Fluent UI)
   - Wizard interface for file upload and configuration
   - Real-time validation and preview
   - Deployment progress tracking

2. **Backend** (Node.js + Express)
   - Mermaid ERD parsing and validation
   - Dataverse API integration
   - Authentication middleware
   - Deployment orchestration

3. **Azure Integration**
   - Managed Identity for secure, passwordless authentication
   - Azure AD for user authentication
   - App Service hosting

## What's Next?

Explore the documentation to learn more:

- [Local Development Guide](./LOCAL-DEVELOPMENT.md) - Set up your development environment
- [Deployment Guide](./DEPLOYMENT.md) - Deploy to Azure
- [Mermaid Guide](./MERMAID-GUIDE.md) - Learn the ERD syntax
- [Testing Guide](./TESTING.md) - Run and write tests
- [Architecture](./DEVELOPER_ARCHITECTURE.md) - Understand the system design

## Need Help?

- Browse the documentation
- Report issues on [GitHub](https://github.com/LuiseFreese/mermaid/issues)
- Join discussions on [GitHub Discussions](https://github.com/LuiseFreese/mermaid/discussions)

---

Ready to get started? Head over to the [Local Development Guide](./LOCAL-DEVELOPMENT.md)!
