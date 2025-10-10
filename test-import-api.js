// Quick test script for the new import API endpoints
const http = require('http');

function testEndpoint(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: `/api/${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsedData });
        } catch (error) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('Testing Import API Endpoints...\n');

  try {
    // Test 1: Get import sources
    console.log('1. Testing GET /api/import/sources');
    const sourcesResult = await testEndpoint('import/sources');
    console.log(`   Status: ${sourcesResult.status}`);
    console.log(`   Response:`, JSON.stringify(sourcesResult.data, null, 2));
    console.log('');

    // Test 2: Test connection endpoint
    console.log('2. Testing POST /api/import/dataverse-solution/test-connection');
    const connectionTest = await testEndpoint('import/dataverse-solution/test-connection', 'POST', {
      environmentUrl: 'https://example.crm.dynamics.com'
    });
    console.log(`   Status: ${connectionTest.status}`);
    console.log(`   Response:`, JSON.stringify(connectionTest.data, null, 2));
    
    // Test 2b: Test with a proper Dataverse URL
    console.log('2b. Testing with proper Dataverse URL');
    const connectionTest2 = await testEndpoint('import/dataverse-solution/test-connection', 'POST', {
      environmentUrl: 'https://testorg.crm.dynamics.com'
    });
    console.log(`   Status: ${connectionTest2.status}`);
    console.log(`   Response:`, JSON.stringify(connectionTest2.data, null, 2));
    console.log('');

    // Test 3: Preview endpoint
    console.log('3. Testing GET /api/import/dataverse-solution/preview');
    const previewResult = await testEndpoint('import/dataverse-solution/preview?environmentUrl=https://example.crm.dynamics.com');
    console.log(`   Status: ${previewResult.status}`);
    console.log(`   Response:`, JSON.stringify(previewResult.data, null, 2));
    console.log('');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runTests();