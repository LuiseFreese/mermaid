# Dev Proxy Configuration for Mermaid to Dataverse Converter

This folder contains [Microsoft Dev Proxy](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/overview) configuration files for testing the Mermaid to Dataverse Converter application against realistic API failure scenarios.

## What is Dev Proxy?

Dev Proxy is a command-line tool from Microsoft that intercepts HTTP requests and simulates various API behaviors like:
- Random errors (503, 500, 429, etc.)
- Rate limiting and throttling
- Slow API responses
- Mock responses for offline development

**Key benefits for this project:**
- Test how the app handles Dataverse API failures without breaking production
- Simulate rate limiting to ensure proper retry logic
- Develop offline with mock Dataverse responses
- Build more robust, production-ready applications

## Installation

### Windows (PowerShell)
```powershell
winget install Microsoft.DevProxy
```

### macOS/Linux
```bash
# macOS
brew install dev-proxy

# Linux
bash -c "$(curl -sL https://aka.ms/devproxy/setup.sh)"
```

Verify installation:
```powershell
devproxy --version
```

## Quick Start

### 1. Test with Random Errors (Default)

Start Dev Proxy with error simulation enabled:

```powershell
# From the devproxy folder
devproxy --config-file devproxyrc.json

# Or from project root
devproxy --config-file devproxy/devproxyrc.json
```

Then run your application:
```powershell
npm run dev
```

Dev Proxy will randomly inject errors (50% failure rate by default) into Dataverse API calls.

### 2. Test Rate Limiting

Enable rate limiting to simulate Dataverse API throttling:

```powershell
# Edit devproxyrc.json
# Change "RateLimitingPlugin" -> "enabled": true

devproxy --config-file devproxy/devproxyrc.json
```

This simulates Dataverse's 6,000 requests per 5 minutes limit.

### 3. Test Slow APIs

Enable latency simulation:

```powershell
# Edit devproxyrc.json
# Change "LatencyPlugin" -> "enabled": true

devproxy --config-file devproxy/devproxyrc.json
```

Adds 200-2000ms delay to API responses to test loading states.

### 4. Offline Development with Mocks

Enable mock responses for offline development:

```powershell
# Edit devproxyrc.json
# Change "MockResponsePlugin" -> "enabled": true
# Change "GenericRandomErrorPlugin" -> "enabled": false

devproxy --config-file devproxy/devproxyrc.json
```

Now you can develop without a real Dataverse environment!

## Configuration Files

### `devproxyrc.json`
Main configuration file that defines which plugins are enabled and how they behave.

**Key settings:**
- `rate`: Failure rate percentage (default: 50%)
- `urlsToWatch`: Which API endpoints to intercept
- `enabled`: Toggle each plugin on/off

### `dataverse-errors.json`
Defines realistic error scenarios for Dataverse API:

**Simulated errors:**
- **503 Service Unavailable** - Server too busy
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Unexpected failures
- **401 Unauthorized** - Token expired
- **400 Bad Request** - Duplicate solution/entity names
- **403 Forbidden** - Insufficient permissions

### `dataverse-mocks.json`
Mock API responses for offline development:

**Mocked endpoints:**
- `GET /publishers` - Returns sample publishers
- `GET /solutions` - Returns sample solutions
- `GET /GlobalOptionSetDefinitions` - Returns sample global choices
- `POST /EntityDefinitions` - Simulates entity creation
- `POST /publishers` - Simulates publisher creation
- `POST /solutions` - Simulates solution creation

## Testing Scenarios

### Scenario 1: Deployment Fails Mid-Way

**Goal**: Ensure app doesn't lose user data if Dataverse fails during deployment.

```powershell
# Start Dev Proxy with 70% failure rate
devproxy --config-file devproxy/devproxyrc.json --failure-rate 70

# In another terminal, run your app
npm run dev

# Upload an ERD and start deployment
# Observe: Does the app show helpful errors? Can you retry?
```

### Scenario 2: Rate Limiting During Bulk Creation

**Goal**: Test retry logic when deploying large ERDs.

```powershell
# Enable rate limiting plugin in devproxyrc.json
# Set rateLimit to 10 requests (very low for testing)

devproxy --config-file devproxy/devproxyrc.json

# Deploy an ERD with 20+ entities
# Observe: Does the app handle throttling gracefully?
```

### Scenario 3: Slow Network Conditions

**Goal**: Verify loading states and timeouts work correctly.

```powershell
# Enable latency plugin in devproxyrc.json
# Set minMs: 2000, maxMs: 5000 for slow network

devproxy --config-file devproxy/devproxyrc.json

# Use the app normally
# Observe: Do loading spinners stay visible? Are there timeouts?
```

### Scenario 4: Token Expiration During Long Operations

**Goal**: Test authentication refresh logic.

```powershell
# Dev Proxy will randomly return 401 Unauthorized
devproxy --config-file devproxy/devproxyrc.json

# Start a long-running deployment
# Observe: Does the app refresh tokens and retry automatically?
```

## Customizing Error Responses

Edit `dataverse-errors.json` to add custom error scenarios:

```json
{
  "request": {
    "url": "https://*.dynamics.com/api/data/v9.*/your-endpoint",
    "methods": ["POST"]
  },
  "responses": [
    {
      "statusCode": 400,
      "headers": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ],
      "body": {
        "error": {
          "code": "0x80040217",
          "message": "Your custom error message"
        }
      }
    }
  ]
}
```

## Tips & Best Practices

### 1. Start with Low Failure Rate
```powershell
# Test with 10% failure rate first
devproxy --config-file devproxy/devproxyrc.json --failure-rate 10
```

### 2. Focus on Critical Paths
Enable Dev Proxy only for deployment testing:
```json
"urlsToWatch": [
  "https://*.dynamics.com/api/data/v9.*/EntityDefinitions*",
  "https://*.dynamics.com/api/data/v9.*/RelationshipDefinitions*"
]
```

### 3. Use Mocks for Rapid Development
Switch to mocks when working on UI:
```powershell
# Edit devproxyrc.json:
# GenericRandomErrorPlugin: enabled: false
# MockResponsePlugin: enabled: true
```

### 4. Test Authentication Separately
Use a separate config for auth testing:
```powershell
devproxy --config-file devproxy/devproxyrc-auth.json
```

### 5. Log All Intercepted Requests
```powershell
devproxy --config-file devproxy/devproxyrc.json --log-level debug
```

## Troubleshooting

### Dev Proxy Not Intercepting Requests

**Issue**: Requests go directly to Dataverse, not through proxy.

**Solution**: Ensure your system trusts the Dev Proxy certificate:
```powershell
# Run once after installation
devproxy --install-cert
```

### Certificate Errors

**Issue**: SSL certificate warnings in browser/application.

**Solution**: Trust the Dev Proxy root certificate:
```powershell
# Windows
devproxy --install-cert

# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.config/dev-proxy/rootCert.crt

# Linux
sudo cp ~/.config/dev-proxy/rootCert.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

### Port Conflicts

**Issue**: Dev Proxy can't start because port 8000 is in use.

**Solution**: Change the proxy port:
```powershell
devproxy --config-file devproxy/devproxyrc.json --port 8888
```

### No Errors Being Simulated

**Issue**: Dev Proxy is running but no errors appear.

**Check**:
1. Is `GenericRandomErrorPlugin` enabled in `devproxyrc.json`?
2. Are the `urlsToWatch` patterns correct?
3. Is your app actually calling Dataverse APIs?

**Debug**:
```powershell
devproxy --config-file devproxy/devproxyrc.json --log-level debug
```

## Integration with Testing

### Unit Tests
Use mocks for fast, reliable unit tests:
```javascript
// tests/unit/dataverse-client.test.js
beforeAll(() => {
  // Start Dev Proxy with mocks enabled
});
```

### Integration Tests
Use error simulation for robust integration tests:
```javascript
// tests/integration/deployment.test.js
describe('Deployment with API failures', () => {
  it('should retry on 503 errors', async () => {
    // Dev Proxy will randomly return 503
    // Test that deployment retries and eventually succeeds
  });
});
```

### CI/CD Pipeline
Add Dev Proxy to GitHub Actions:
```yaml
- name: Install Dev Proxy
  run: winget install Microsoft.DevProxy

- name: Run tests with error simulation
  run: |
    devproxy --config-file devproxy/devproxyrc.json &
    npm test
```

## Learn More

- [Dev Proxy Documentation](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/overview)
- [Simulate Random Errors](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/test-my-app-with-random-errors)
- [Rate Limiting](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/simulate-rate-limit-api-responses)
- [Mock API Responses](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/simulate-crud-api)
- [Dev Proxy GitHub](https://github.com/microsoft/dev-proxy)

## Next Steps

1. **Install Dev Proxy**: `winget install Microsoft.DevProxy`
2. **Trust Certificate**: `devproxy --install-cert`
3. **Start Testing**: `devproxy --config-file devproxy/devproxyrc.json`
4. **Run Your App**: `npm run dev`
5. **Observe Behavior**: Watch how your app handles errors!

---

**Happy testing!** 🚀 Build robust apps that handle the unexpected.
