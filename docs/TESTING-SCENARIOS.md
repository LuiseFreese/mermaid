# Testing Scenarios with Dev Proxy

This document provides step-by-step testing scenarios for using Microsoft Dev Proxy to test the Mermaid to Dataverse Converter application against realistic API failures, rate limiting, slow networks, and offline development.

## Prerequisites

- Dev Proxy installed
- Dev Proxy certificate installed (first-time setup)
- Node.js dependencies installed (`npm install`)
- Test ERD files in `examples/` directory

## Scenario 1: Test Error Handling and Retry Logic

**Goal**: Verify the application handles random API failures gracefully and retries automatically.

### Steps

1. **Start Dev Proxy with Error Simulation**
   ```powershell
   npm run dev:proxy:errors
   ```
   
   You should see:
   ```
   ✅ 16 errors loaded from dataverse-errors.json
   ℹ️ Dev Proxy listening on port 8000
   ```

2. **Open the Application**
   - Navigate to `http://localhost:3000`
   - Log in with your Dataverse credentials

3. **Upload a Simple ERD**
   - Use `examples/simple-test.mmd` or `examples/department-employee.mmd`
   - Click "Upload ERD" and select the file

4. **Configure Solution**
   - Enter Solution Name: `Test Error Handling`
   - Select or create a publisher
   - Click "Next"

5. **Start Deployment**
   - Click "Deploy to Dataverse"
   - **Observe the behavior:**
     - ✅ Console logs show retry attempts: `Request failed with 503 (attempt 1/6). Retrying in 1000ms...`
     - ✅ Application doesn't crash on errors
     - ✅ Retries happen automatically with exponential backoff
     - ✅ Success after retries: `Request succeeded after 2 retry attempt(s)`

6. **Check Dev Proxy Logs**
   - Dev Proxy terminal shows intercepted requests
   - Random errors (503, 500, 429, etc.) are injected
   - Some requests succeed, some fail and retry

### Expected Results

- **Automatic Retries**: Failed requests retry up to 5 times
- **Exponential Backoff**: 1s → 2s → 4s → 8s → 16s delays
- **Respects Retry-After**: Rate limit headers are honored
- **User Experience**: Loading indicators show progress
- **No Data Loss**: User's ERD data is preserved

### What to Look For

❌ **Bad**: App crashes on first error  
✅ **Good**: App retries automatically

❌ **Bad**: No feedback during retries  
✅ **Good**: Console logs show retry attempts

❌ **Bad**: Same delay every retry  
✅ **Good**: Increasing delays (exponential backoff)

---

## Scenario 2: Test Rate Limiting

**Goal**: Verify the application handles Dataverse API rate limits correctly.

### Steps

1. **Start Dev Proxy with Rate Limiting**
   ```powershell
   npm run dev:proxy:rate-limit
   ```
   
   Configuration:
   - **100 requests per 5 minutes**
   - Returns 429 after limit
   - `Retry-After: 60` seconds

2. **Upload a Large ERD**
   - Use `examples/university.mmd` (10+ entities)
   - Or create a larger ERD with 20+ entities

3. **Start Deployment**
   - Click "Deploy to Dataverse"
   - **This will make many API calls:**
     - Create entities
     - Create attributes
     - Create relationships
     - Create global option sets

4. **Observe Rate Limiting**
   - After ~50-60 requests, you'll hit the rate limit
   - Console logs: `Rate limited (429). Retry-After: 60s. Waiting 60000ms...`
   - Application pauses for 60 seconds
   - Then resumes deployment

5. **Check Progress Indicators**
   - Loading spinner remains active
   - Progress messages update
   - User can see deployment is paused, not stuck

### Expected Results

- **Rate Limit Detected**: 429 errors are caught
- **Retry-After Respected**: Waits 60 seconds before retrying
- **Deployment Continues**: Resumes after wait period
- **No Manual Intervention**: User doesn't need to restart

### What to Look For

❌ **Bad**: Deployment fails with "Too many requests"  
✅ **Good**: Deployment pauses and resumes automatically

❌ **Bad**: Ignores Retry-After and retries immediately  
✅ **Good**: Waits full 60 seconds before retry

❌ **Bad**: User thinks app is frozen  
✅ **Good**: Clear progress indicators during wait

---

## Scenario 3: Test Offline Development with Mocks

**Goal**: Verify the application works without a real Dataverse connection using mock responses.

### Steps

1. **Start Dev Proxy with Mocked Responses**
   ```powershell
   npm run dev:proxy:mocks
   ```
   
   Mock responses loaded for:
   - GET `/publishers` → Returns fake publishers
   - GET `/solutions` → Returns fake solutions
   - POST `/EntityDefinitions` → Returns success
   - POST `/RelationshipDefinitions` → Returns success

2. **Disconnect from Internet** (Optional)
   - This proves you're truly offline
   - Dev Proxy mocks work even without internet

3. **Open the Application**
   - Navigate to `http://localhost:3000`
   - **Note**: You'll still need MSAL authentication (use cached token)

4. **Use the Application Normally**
   - Upload ERD
   - Select publisher (from mocked list)
   - Select solution (from mocked list)
   - Deploy to "Dataverse" (actually Dev Proxy)

5. **Verify Mock Responses**
   - Publishers dropdown shows "Contoso Ltd", "Fabrikam Inc"
   - Solutions dropdown shows "Contoso Solution", "Fabrikam Solution"
   - Deployment "succeeds" (204 No Content responses)

### Expected Results

- **No Real API Calls**: All requests go to Dev Proxy mocks
- **Faster Development**: Instant responses (no network delay)
- **Consistent Data**: Same mock data every time
- **No Rate Limits**: Unlimited requests

### What to Look For

✅ **Good**: Application functions normally  
✅ **Good**: Publishers and solutions list appear  
✅ **Good**: Deployment completes "successfully"  
✅ **Good**: No errors about missing Dataverse connection

### Benefits of Mocking

- **Onboarding**: New developers don't need Dataverse access
- **Demos**: Reliable demo environment
- **Testing**: Consistent test data
- **Travel**: Work on airplane/train without internet

---

## Scenario 4: Test Large ERD Deployment

**Goal**: Stress-test the application with a large, complex ERD to simulate production workloads.

### Steps

1. **Create a Large ERD** (or use provided)
   - 20+ entities
   - 50+ attributes
   - 30+ relationships
   - 10+ global option sets

2. **Start Dev Proxy with Combined Testing**
   ```powershell
   # Terminal 1: Dev Proxy with errors + rate limiting
   npm run dev:proxy:errors
   ```

3. **Deploy the Large ERD**
   - Upload the ERD file
   - Configure solution
   - Start deployment
   - **This will take several minutes**

4. **Monitor the Process**
   - Watch console logs for:
     - Retry attempts
     - Rate limiting pauses
     - Progress updates
   - Check Dev Proxy logs for intercepted requests

5. **Verify Completion**
   - Deployment eventually succeeds
   - All entities created
   - All relationships established
   - No data corruption

### Expected Results

- **Handles Retries**: Automatic recovery from errors
- **Handles Rate Limits**: Pauses and resumes
- **Progress Tracking**: User sees what's happening
- **Data Integrity**: No partial deployments

---

## Scenario 5: Test Authentication Failures

**Goal**: Verify the application handles 401 Unauthorized errors gracefully.

### Steps

1. **Start Dev Proxy**
   ```powershell
   npm run dev:proxy:errors
   ```

2. **Wait for Token Expiration** (or force it)
   - MSAL tokens expire after ~1 hour
   - Dev Proxy will inject 401 errors randomly

3. **Perform Operations After Token Expires**
   - Try to load publishers
   - Dev Proxy returns 401 Unauthorized

4. **Observe Behavior**
   - **Expected**: Application prompts for re-authentication
   - **Not Expected**: Silent failure or crash

### Expected Results

- **401 Detected**: App recognizes authentication failure
- **Re-auth Prompt**: User redirected to login
- **Seamless Recovery**: After login, operation continues

---

## Scenario 6: Test Deployment History Resilience

**Goal**: Verify deployment tracking works even when APIs fail.

### Steps

1. **Start Dev Proxy with Errors**
   ```powershell
   npm run dev:proxy:errors
   ```

2. **Deploy an ERD**
   - Some operations will fail
   - Some will succeed
   - Dev Proxy injects random errors

3. **Check Deployment History**
   - Navigate to "Deployment History" page
   - Verify entries show:
     - ✅ Succeeded operations
     - ❌ Failed operations
     - ⚠️ Partial deployments

4. **Retry Failed Deployment**
   - Click "Retry" on failed deployment
   - Should resume from where it failed
   - Not start from scratch

### Expected Results

- **Accurate Tracking**: History shows correct status
- **Error Details**: Failed items show error messages
- **Retry Support**: Can resume failed deployments

---

## Tips for Effective Testing

### 1. Start Simple
- Begin with `simple-test.mmd` (2-3 entities)
- Graduate to `university.mmd` (10+ entities)
- Finally test with large, custom ERDs (20+ entities)

### 2. Check Console Logs
```powershell
# Enable verbose logging
$env:DEBUG="*"
npm run dev:backend:proxy
```

### 3. Monitor Dev Proxy Output
- Dev Proxy terminal shows intercepted requests
- Look for status codes: 200, 204, 429, 500, 503
- Check Retry-After headers

### 4. Test One Thing at a Time
- **First**: Test errors only (`dev:proxy:errors`)
- **Then**: Test rate limiting (`dev:proxy:rate-limit`)
- **Then**: Test mocks (`dev:proxy:mocks`)
- **Finally**: Combine scenarios

### 5. Use Browser DevTools
- Open Network tab
- Filter by `dynamics.com`
- Watch requests go through `localhost:8000` (Dev Proxy)

---

## Troubleshooting Common Issues

### Dev Proxy Not Intercepting Requests

**Problem**: Requests go directly to Dataverse, bypassing Dev Proxy.

**Solution**:
1. Ensure Dev Proxy starts BEFORE backend:
   ```powershell
   # Start Dev Proxy first
   npm run proxy:start
   
   # Then start backend
   npm run dev:backend:proxy
   ```

2. Check environment variables:
   ```powershell
   # Backend should use HTTP_PROXY
   $env:HTTP_PROXY="http://127.0.0.1:8000"
   $env:HTTPS_PROXY="http://127.0.0.1:8000"
   ```

### Requests Fail with Certificate Errors

**Problem**: `Error: self-signed certificate`

**Solution**:
1. Install Dev Proxy certificate:
   ```powershell
   devproxy install-certificate
   ```

2. Trust the certificate when prompted

### Rate Limiting Too Aggressive

**Problem**: Hit rate limit too quickly during testing.

**Solution**:
1. Edit `devproxy/devproxyrc-rate-limit.json`:
   ```json
   {
     "rateLimit": 200,  // Increase from 100
     "resetTimeWindowSeconds": 300
   }
   ```

2. Restart Dev Proxy

### Want Fewer Errors

**Problem**: 50% error rate is too high for usability testing.

**Solution**:
1. Edit `devproxy/devproxyrc-errors.json`:
   ```json
   {
     "plugins": [{
       "name": "GenericRandomErrorPlugin",
       "pluginPath": "~appFolder/plugins/dev-proxy-plugins.dll",
       "configSection": "errorsDataverse"
     }],
     "rate": 10  // Change from 50 to 10 (10% error rate)
   }
   ```

2. Restart Dev Proxy

---

## Next Steps

After completing these scenarios, you'll have:

✅ **Verified** error handling and retry logic  
✅ **Tested** rate limiting resilience  
✅ **Validated** offline development capability  
✅ **Stress-tested** large ERD deployments  
✅ **Proven** authentication failure recovery  

**Your application is now production-ready!** 🚀

---

## Related Documentation

- [Dev Proxy Testing Guide](./DEV-PROXY-TESTING.md) - Complete Dev Proxy documentation
- [Testing Guide](./TESTING.md) - General testing strategies
- [Local Development Guide](./LOCAL-DEVELOPMENT.md) - Development setup
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment
