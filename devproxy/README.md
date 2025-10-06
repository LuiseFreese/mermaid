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

## First-Time Setup: Certificate Installation

**Important**: The first time you run Dev Proxy, it will prompt for administrator password to install a trusted root certificate. This is required to intercept HTTPS traffic.

**Why is this needed?**
- Dev Proxy intercepts HTTPS requests to Dataverse API (`*.dynamics.com`)
- To do this securely, it needs to install a trusted certificate
- This is a one-time setup per machine
- The certificate is only used for local development

**What to do:**
1. When prompted "Dev Proxy wants to make changes", click **Yes** (or enter your admin password)
2. Dev Proxy will install the certificate to your system's trusted root store
3. You won't be prompted again on subsequent runs

**Security note**: The certificate is only trusted on your local machine and only intercepts traffic that Dev Proxy is configured to watch (Dataverse URLs).

## Understanding "Errors Loaded"

When you start Dev Proxy, you'll see a message like:

```
✅ 5 errors loaded from dataverse-errors.json
```

It means:
- Dev Proxy successfully loaded your **test error scenarios**
- 
- These are **simulated failures** it will randomly inject into API calls
- This helps you test how your app handles real-world API problems

**The "errors" are not actual problems** - they're your test cases! Dev Proxy will use them to simulate failures like:
- 500 Internal Server Error - "Something went wrong"
- 503 Service Unavailable - "Server is busy"
- 429 Rate Limit Exceeded - "Too many requests"
- 401 Unauthorized - "Token expired"
- 400 Bad Request - "Invalid data"

When your app makes Dataverse API calls, Dev Proxy will randomly inject these errors so you can verify your app handles them gracefully.

## Quick Start (3 Easy Ways!)

### Option 1: npm Scripts (Recommended)

```powershell
# Start dev environment with Dev Proxy (default mode)
npm run dev:proxy

# Start with error simulation (random API failures)
npm run dev:proxy:errors

# Start with mocked responses (offline development)
npm run dev:proxy:mocks

# Start with rate limiting (test throttling)
npm run dev:proxy:rate-limit
```

### Option 2: PowerShell Script

```powershell
# Default mode
.\scripts\dev-with-proxy.ps1

# Error simulation
.\scripts\dev-with-proxy.ps1 -Mode errors

# Mocked responses
.\scripts\dev-with-proxy.ps1 -Mode mocks

# Rate limiting
.\scripts\dev-with-proxy.ps1 -Mode rate-limit

# Run without Dev Proxy
.\scripts\dev-with-proxy.ps1 -NoProxy
```

### Option 3: VS Code Tasks (One-Click!)

1. Press `Ctrl+Shift+P` → "Run Task"
2. Select:
   - **Dev: Start with Dev Proxy** - Default mode
   - **Dev: Start with Error Simulation** - Random errors
   - **Dev: Start with Mocked APIs** - Offline development
   - **Dev: Start with Rate Limiting** - Throttling simulation

## Installation

### Windows (winget)
```powershell
winget install Microsoft.DevProxy
```

### macOS (Homebrew)
```bash
brew install --cask devproxy
```

### Linux
```bash
bash <(curl -sL https://aka.ms/devproxy/setup.sh)
```

### Verify Installation
```powershell
devproxy --version
```

## Configuration Files

### 📁 `devproxyrc.json` (Default)
Basic Dev Proxy configuration with minimal logging. Use this for normal development when you want Dev Proxy running but not interfering with your workflow.

**Start with:**
```powershell
npm run dev:proxy
# or
devproxy --config-file devproxy/devproxyrc.json
```

### 🎲 `devproxyrc-errors.json` (Error Simulation)
Simulates random Dataverse API errors (50% failure rate):
- **503 Service Unavailable** - "The server is busy"
- **500 Internal Server Error** - "An unexpected error occurred"
- **429 Too Many Requests** - "API rate limit exceeded"
- **401 Unauthorized** - "Authentication failed"

**Use case:** Test error handling, retry logic, and user-facing error messages.

**Start with:**
```powershell
npm run dev:proxy:errors
# or
devproxy --config-file devproxy/devproxyrc-errors.json
```

**What to test:**
- Upload ERD and trigger deployment
- Verify error messages are clear
- Check retry mechanisms work
- Ensure no data loss on failures

### 🎭 `devproxyrc-mocks.json` (Mocked Responses)
Returns fake Dataverse API responses without hitting real APIs:
- Mock publishers list
- Mock solutions list
- Mock entity creation responses
- Mock global choices

**Use case:** Offline development, onboarding new developers, faster testing.

**Start with:**
```powershell
npm run dev:proxy:mocks
# or
devproxy --config-file devproxy/devproxyrc-mocks.json
```

**Benefits:**
- No Dataverse environment needed
- Faster response times
- Work on airplane/train
- Don't hit API rate limits

### 🚦 `devproxyrc-rate-limit.json` (Rate Limiting)
Simulates Dataverse API rate limits:
- **100 requests per 5 minutes**
- Returns **429 Too Many Requests** when exceeded
- Includes `Retry-After: 60` header

**Use case:** Test rate limiting handling, especially for large ERD deployments.

**Start with:**
```powershell
npm run dev:proxy:rate-limit
# or
devproxy --config-file devproxy/devproxyrc-rate-limit.json
```

**What to test:**
- Deploy large ERD (20+ entities)
- Verify rate limit detection
- Check retry logic with backoff
- Ensure progress indicators work

## Test Scenarios

### Scenario 1: Test Error Handling
```powershell
# Start with error simulation
npm run dev:proxy:errors

# Then in the app:
# 1. Upload an ERD file
# 2. Start deployment
# 3. Observe random failures
# 4. Verify error messages are helpful
# 5. Check retry mechanisms
```

### Scenario 2: Offline Development
```powershell
# Start with mocked responses
npm run dev:proxy:mocks

# Then in the app:
# 1. Use the app normally
# 2. All API calls return mock data
# 3. No real Dataverse connection needed
# 4. Faster development cycle
```

### Scenario 3: Rate Limit Testing
```powershell
# Start with rate limiting
npm run dev:proxy:rate-limit

# Then in the app:
# 1. Deploy a large ERD (20+ entities)
# 2. Watch for rate limit errors
# 3. Verify retry logic activates
# 4. Check user sees progress updates
```

## Data Files

### `dataverse-errors.json`
Contains error response definitions:
- HTTP status codes
- Error messages
- Headers
- Response bodies

**Customize:** Add your own error scenarios by editing this file.

### `dataverse-mocks.json`
Contains mock API response definitions:
- Publishers list
- Solutions list
- Entity creation responses
- Global choices

**Customize:** Add more mock responses as needed for your testing scenarios.

## Troubleshooting

### Dev Proxy Not Found
```powershell
# Install Dev Proxy first
winget install Microsoft.DevProxy

# Verify installation
devproxy --version
```

### Port Conflicts
Dev Proxy uses port 8000 by default. If you have a conflict:
```json
// Edit devproxyrc.json
{
  "port": 8001
}
```

### Certificate Issues
Dev Proxy uses a self-signed certificate. Trust it:
```powershell
devproxy install-certificate
```

### Dev Proxy Not Intercepting Requests
1. Ensure Dev Proxy starts BEFORE your app
2. Check `urlsToWatch` matches your Dataverse URL
3. Verify your app isn't bypassing the proxy

### Running Multiple Instances
Only one Dev Proxy instance can run at a time. Stop existing instance:
```powershell
# Windows
Stop-Process -Name "devproxy" -Force

# macOS/Linux
pkill devproxy
```

## Advanced Usage

### Run Dev Proxy Standalone
```powershell
# Start Dev Proxy only (without app)
npm run proxy:start        # Default
npm run proxy:errors       # Error simulation
npm run proxy:mocks        # Mocked responses
npm run proxy:rate-limit   # Rate limiting

# Then start your app separately
npm run dev
```

### Custom Configuration
Create your own config file:
```powershell
devproxy --config-file devproxy/my-custom-config.json
```

### Recording Mode
Record real API responses for later mocking:
```powershell
devproxy --record
```

## Integration with CI/CD

Add Dev Proxy tests to your CI pipeline:

```yaml
# GitHub Actions example
- name: Install Dev Proxy
  run: winget install Microsoft.DevProxy

- name: Run tests with error simulation
  run: |
    npm run proxy:errors &
    npm run test:integration
```

## Related Documentation

- [Microsoft Dev Proxy Overview](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/overview)
- [Simulate Random Errors](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/test-my-app-with-random-errors)
- [Simulate Rate Limits](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/simulate-rate-limit-api-responses)
- [Mock API Responses](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/simulate-crud-api)

## Contributing

Found a useful Dev Proxy configuration? Add it to this folder and document it here!

**Ideas for new configurations:**
- Slow response simulation
- Network latency testing
- Partial failure scenarios
- Authentication timeout testing

## Support

For issues specific to Dev Proxy:
- [Dev Proxy GitHub Issues](https://github.com/microsoft/dev-proxy/issues)
- [Dev Proxy Documentation](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/)

For issues with this project's Dev Proxy integration:
- Open an issue in this repository
- Tag it with `dev-proxy` label
