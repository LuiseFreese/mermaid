# Global Choices Workflow Documentation

## Overview

This document describes the global choices functionality in the Mermaid to Dataverse application, including creation, verification, and solution integration processes.

## Features

### Global Choice Creation
- **Custom Global Choices**: Upload and create custom global choice sets with user-defined options
- **Duplicate Detection**: Case-insensitive duplicate checking to prevent conflicts
- **Solution Integration**: Automatic addition of created choices to the target solution
- **Robust Verification**: Multi-attempt verification with fallback mechanisms

### Supported Operations
1. Create new global choice sets in Dataverse
2. Add existing global choices to solutions
3. Verify creation success with retry logic
4. Handle API timing and caching issues

## API Endpoints

### Get Global Choices List
```
GET /api/global-choices-list
```
Returns all global choices available in Dataverse, grouped by built-in and custom choices.

**Response Format:**
```json
{
  "total": 180,
  "builtIn": 148,
  "custom": 32,
  "grouped": {
    "builtIn": [...],
    "custom": [...]
  }
}
```

## File Upload Format

### Global Choices JSON Structure
```json
[
  {
    "name": "Status",
    "displayName": "Status",
    "description": "Simple status options",
    "options": [
      {
        "value": 1,
        "label": "Active"
      },
      {
        "value": 2,
        "label": "Inactive"
      }
    ]
  }
]
```

### Required Fields
- `name`: Logical name of the choice set
- `displayName`: Display name shown in UI
- `options`: Array of choice options

### Optional Fields
- `description`: Description of the choice set
- `value`: Numeric value for each option (auto-generated if not provided)

## Implementation Details

### Duplicate Detection Process
1. Fetch all existing global choices using `GlobalOptionSetDefinitions?$select=Name`
2. Convert existing names to lowercase for case-insensitive comparison
3. Check if choice name (with publisher prefix) already exists
4. If duplicate found, skip creation but attempt to add existing choice to solution

### Creation and Verification Workflow
1. **Create Choice Set**: POST to `/GlobalOptionSetDefinitions` with choice metadata
2. **Multi-Attempt Verification**: Try up to 5 times with progressive delays (3s, 5s, 7s, 9s, 10s)
3. **Fallback Verification**: Use comprehensive global choices list if direct lookup fails
4. **Solution Addition**: Add successfully created/found choices to target solution

### Error Handling
- **API Limitations**: Handle unsupported `$filter` operations on `GlobalOptionSetDefinitions`
- **Timing Issues**: Account for Dataverse caching with retry mechanisms
- **Non-Fatal Failures**: Treat verification failures as warnings when choices likely exist

## API Constraints and Workarounds

### Known Dataverse API Limitations
1. **No Filter Support**: `$filter` parameter not supported on `GlobalOptionSetDefinitions`
   - **Workaround**: Fetch all choices and filter client-side
2. **Property Limitations**: `IsCustom` property not available on `OptionSetMetadataBase`
   - **Workaround**: Use `IsManaged` property instead
3. **Caching Delays**: Created choices may not be immediately discoverable
   - **Workaround**: Progressive retry with increasing delays

### Fixed Query Examples

#### ❌ Unsupported (causes API errors)
```javascript
// These queries will fail
`GlobalOptionSetDefinitions?$filter=Name eq '${choiceName}'`
`GlobalOptionSetDefinitions?$select=MetadataId,Name,IsCustom`
```

#### ✅ Supported (working queries)
```javascript
// Get all choices and filter client-side
`GlobalOptionSetDefinitions?$select=MetadataId,Name,DisplayName`
const foundChoice = allChoices.value?.find(choice => choice.Name === targetName);

// Use IsManaged instead of IsCustom
`GlobalOptionSetDefinitions?$select=MetadataId,Name,IsManaged`
```

## UI Integration

### Wizard Steps
1. **Upload Global Choices**: Users can upload JSON files with choice definitions
2. **Review and Select**: Preview choices before deployment
3. **Deploy**: Create choices and add to solution automatically
4. **Results**: Display creation results with success/failure counts

### Status Messages
- `✅ Created and added`: Choice successfully created and added to solution
- `⚠️ Skipped`: Choice already exists, attempted to add to solution
- `❌ Failed`: Choice creation failed with error details

## Testing

### Minimal Test Files
- `test-minimal.mmd`: Minimal ERD for fast testing
- `test-minimal-choices.json`: Minimal global choices for testing

### Test Command Example
```bash
curl -X POST "http://localhost:3000/upload" \
  -H "Content-Type: application/json" \
  -d '{"customChoices":[...],"solutionName":"TestSolution",...}'
```

## Troubleshooting

### Common Issues

#### Global Choices Not Found After Creation
- **Cause**: Dataverse caching delay
- **Solution**: Wait for verification attempts to complete (up to 50 seconds)

#### API Error: "IsCustom property not found"
- **Cause**: Using unsupported property in API query
- **Solution**: Remove `IsCustom` from queries, use `IsManaged` instead

#### API Error: "$filter not supported"
- **Cause**: Using `$filter` on `GlobalOptionSetDefinitions`
- **Solution**: Fetch all choices and filter client-side

#### Choices Created But Not in Solution
- **Cause**: Solution addition failed after creation
- **Solution**: Check component addition logs, verify solution exists

### Debug Logging
The application provides detailed logging for troubleshooting:
- `🔍 Found X existing global choices for duplicate checking`
- `🔍 Attempt X/5: Looking for created global choice set`
- `🔄 Final verification using comprehensive global choices list`
- `✅ Created and added custom global choice set to solution`

## Code References

### Main Implementation
- **File**: `src/dataverse-client.js`
- **Method**: `createAndAddCustomGlobalChoices()`
- **Lines**: ~1100-1320

### Key Functions
- Duplicate detection and creation logic
- Multi-attempt verification with fallback
- Solution component addition
- Error handling and retry mechanisms

## Version History

### Latest (September 2025)
- Fixed `IsCustom` property errors
- Removed unsupported `$filter` operations
- Improved duplicate detection (case-insensitive)
- Enhanced verification with comprehensive fallback
- Added robust solution integration

### Previous Issues (Resolved)
- Global choices created but not detected
- API errors due to unsupported properties
- Timing issues with Dataverse caching
- Duplicate detection failures
