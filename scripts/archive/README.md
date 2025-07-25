# Archive - Development Scripts

This folder contains scripts that were developed during the iterative process of creating the final automated setup solution. These are preserved for reference and learning purposes.

## DO NOT USE THESE SCRIPTS

**Use the main script instead**: `../setup-application-user.cjs`

## What's in here

### Final Iterations (Close to working)
- `complete-setup.cjs` - Unified script attempt 
- `setup-application-user-enhanced.cjs` - Enhanced version with better error handling
- `setup-application-user-complete.cjs` - Another complete version attempt

### Development Approaches
- `admin-create-application-user.cjs` - Admin-only approach
- `create-app-registration.cjs` - App registration focused script
- `create-app-user.cjs` - Application user creation focused
- `setup-simple.cjs` - Simplified approach attempt
- `setup-fresh.cjs` - Fresh setup approach

### Debug and Test Scripts
- `debug-basic.cjs` - Basic debugging utilities
- `debug-setup.cjs` - Setup debugging tools
- `test-direct.cjs` - Direct API testing
- `test-simple.cjs` - Simple authentication tests
- `test-validation.cjs` - Validation testing

### Alternative Technologies
- `setup-app-registration.ps1` - PowerShell approach
- `setup-app-user-cli.cjs` - CLI-based approach
- `setup-application-user.js` - ES6 modules version

## Development History

These scripts represent the evolution of solving the "chicken-and-egg" authentication problem:

1. **Initial attempts**: Simple direct API calls
2. **Authentication challenges**: Discovering the bootstrap problem
3. **Iterative solutions**: Various approaches to handle dual authentication
4. **Final solution**: The working `setup-application-user.cjs` in the parent directory

## Learning Value

These scripts demonstrate:
- Different approaches to Azure authentication
- Evolution of error handling and robustness
- Various ways to structure automation scripts
- How to handle edge cases and authentication flows

Keep these for reference when understanding the development process or if you need to implement similar automation in the future.
