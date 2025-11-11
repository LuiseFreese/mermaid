# Dev Proxy Testing Guide

This guide covers API resilience testing using [Microsoft Dev Proxy](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/overview) to simulate realistic Dataverse API failure scenarios.

## Overview

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

## Choose Your Development Mode

Different modes for different needs:

| Command | Use Case | What It Does |
|---------|----------|--------------|
| `npm run dev` | **Normal local development** | No Dev Proxy - connects directly to real Dataverse |
| `npm run dev:proxy:mocks` | **Fast offline development** | Returns instant mock responses, no Dataverse needed |
| `npm run dev:proxy:errors` | **Test error handling** | Randomly injects API failures (429, 500, 401, etc.) |
| `npm run dev:proxy:rate-limit` | **Test rate limiting** | Simulates Dataverse rate limits (100 req/5min) |


**💡 Recommendation:**
- **Daily development?** Use `npm run dev` (no proxy)
- **Building new features?** Use `npm run dev:proxy:mocks` (fast mocks)
- **Before deploying?** Test with `npm run dev:proxy:errors` to verify error handling

## Quick Start

### Option 1: npm Scripts (Recommended)

```powershell
# Normal development (no Dev Proxy)
npm run dev

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


## Understanding "Errors Loaded"

When you start Dev Proxy, you'll see a message like:

```
✅ 5 errors loaded from dataverse-errors.json
```

This means:
- Dev Proxy successfully loaded your **test error scenarios**
- These are **simulated failures** it will randomly inject into API calls
- This helps you test how your app handles real-world API problems

**The "errors" are not actual problems** - they're your test cases! Dev Proxy will use them to simulate failures like:
- 500 Internal Server Error - "Something went wrong"
- 503 Service Unavailable - "Server is busy"
- 429 Rate Limit Exceeded - "Too many requests"
- 401 Unauthorized - "Token expired"
- 400 Bad Request - "Invalid data"

When your app makes Dataverse API calls, Dev Proxy will randomly inject these errors so you can verify your app handles them gracefully.

## Configuration Files

All Dev Proxy configuration files are located in the `devproxy/` folder:

| File | Purpose | Usage |
|------|---------|-------|
| `devproxyrc.json` | Default configuration | General Dev Proxy settings |
| `devproxyrc-errors.json` | Error simulation | Random API failures with 50% rate |
| `devproxyrc-mocks.json` | Mock responses | Offline development with instant responses |
| `devproxyrc-rate-limit.json` | Rate limiting | Simulates Dataverse throttling (100 req/5min) |
| `devproxyrc-latency.json` | Slow API | Adds 2-5 second delays to test loading states |
| `dataverse-errors.json` | Error scenarios | 15+ realistic Dataverse error responses |
| `dataverse-mocks.json` | Mock data | Comprehensive mock Dataverse API responses |

## Testing Scenarios

For detailed testing scenarios and workflows, see [TESTING-SCENARIOS.md](./TESTING-SCENARIOS.md).

### Example: Testing Error Handling

1. **Start with error simulation**:
   ```powershell
   npm run dev:proxy:errors
   ```

2. **Try to deploy an ERD**:
   - Upload a Mermaid file
   - Configure solution and publisher
   - Click Deploy

3. **Observe behavior**:
   - Dev Proxy randomly injects errors (50% failure rate)
   - Watch how the app handles 429, 500, 503 errors
   - Backend retry logic should kick in automatically
   - Check logs for retry attempts with exponential backoff

4. **Expected results**:
   - App doesn't crash on API failures
   - User sees meaningful error messages
   - Retry logic respects Retry-After headers
   - Deployment eventually succeeds despite transient failures

### Example: Testing Rate Limiting

1. **Start with rate limit simulation**:
   ```powershell
   npm run dev:proxy:rate-limit
   ```

2. **Make multiple API calls quickly**:
   - Load publishers list multiple times
   - Upload and validate several ERDs
   - Watch for rate limit responses

3. **Observe behavior**:
   - After 100 requests in 5 minutes, Dev Proxy blocks requests
   - Backend receives 429 with Retry-After headers
   - Retry logic waits appropriate duration before retrying

### Example: Offline Development

1. **Start with mock responses**:
   ```powershell
   npm run dev:proxy:mocks
   ```

2. **Develop without Dataverse**:
   - All API calls return instant mock responses
   - No network latency or authentication needed
   - Perfect for UI development and testing

## Backend Retry Logic

The application has built-in retry logic in `src/backend/dataverse/services/`:

**Features**:
- **Exponential backoff**: 1s, 2s, 4s, 8s, 16s delays
- **Retry-After respect**: Honors 429 rate limit headers
- **Token refresh**: Automatic token refresh on 401 errors
- **Smart retries**: Only retries transient failures (429, 500, 502, 503, 504)

**Example retry flow**:
```javascript
// Automatic retry with exponential backoff
const result = await makeRequestWithRetry('GET', url, null, options);

// Console logs show retry attempts:
// ⚠️ Request failed with status 503, retrying (1/5) after 1000ms
// ⚠️ Request failed with status 503, retrying (2/5) after 2000ms
// ⚠️ Request failed with status 429, retrying (3/5) after 5000ms (Retry-After)
// ✅ Request succeeded after 3 retries
```

## Troubleshooting

### Dev Proxy Not Intercepting Requests

**Problem**: Dev Proxy starts but doesn't intercept API calls

**Solution**:
1. Check certificate installation: `devproxy --cert`
2. Verify URLs in config match Dataverse: `*.dynamics.com`
3. Ensure app is making HTTPS requests to Dataverse

### Certificate Trust Issues

**Problem**: Browser shows SSL/TLS errors

**Solution**:
1. Re-run Dev Proxy with admin privileges
2. Install certificate manually: `devproxy --install-cert`
3. Restart browser after certificate installation

### Too Many Errors

**Problem**: Error simulation causes too many failures

**Solution**:
1. Reduce error rate in `devproxyrc-errors.json`:
   ```json
   "failureRate": 25  // Reduce from 50 to 25%
   ```
2. Or use mock mode for more predictable testing: `npm run dev:proxy:mocks`

### Rate Limiting Too Aggressive

**Problem**: Rate limit kicks in too quickly

**Solution**:
1. Increase limits in `devproxyrc-rate-limit.json`:
   ```json
   "costPerRequest": 1,
   "rateLimit": 200,  // Increase from 100
   "resetAfter": 300000
   ```

## Best Practices

1. **Development Mode Selection**:
   - Use `npm run dev` for normal local development
   - Use `npm run dev:proxy:mocks` for fast UI development
   - Use `npm run dev:proxy:errors` before deploying to production

2. **Error Testing**:
   - Test all deployment workflows with error simulation
   - Verify user-facing error messages are clear
   - Ensure no data loss on failures

3. **Rate Limit Testing**:
   - Test with realistic Dataverse rate limits
   - Verify retry logic respects Retry-After headers
   - Check UI provides feedback during rate limiting


## Additional Resources

- [Microsoft Dev Proxy Documentation](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/overview)
- [Dataverse API Limits](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits)
- [Testing Scenarios Guide](./TESTING-SCENARIOS.md)
- [Local Development Guide](./LOCAL-DEVELOPMENT.md)
