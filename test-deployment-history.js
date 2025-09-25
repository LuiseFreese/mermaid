/**
 * Test script for deployment history functionality
 * This script simulates a deployment and tests the history capture
 */

const { DeploymentHistoryService } = require('./src/backend/services/deployment-history-service');

async function testDeploymentHistory() {
    console.log('🧪 Testing deployment history service...');
    
    // Create deployment history service
    const historyService = new DeploymentHistoryService({
        logger: console
    });
    
    // Simulate deployment data
    const testDeploymentData = {
        mermaidContent: 'erDiagram\n    Customer ||--o{ Order : places\n    Customer { string name }',
        solutionName: 'TestSolution',
        publisherName: 'TestPublisher',
        publisherPrefix: 'tst',
        environmentSuffix: 'test',
        entities: [
            { name: 'Customer', displayName: 'Customer' },
            { name: 'Order', displayName: 'Order' }
        ],
        relationships: [
            { from: 'Customer', to: 'Order', type: 'OneToMany' }
        ]
    };
    
    const testResult = {
        success: true,
        message: 'Deployment completed successfully',
        solutionId: 'test-solution-123',
        duration: 45000, // 45 seconds
        entitiesCreated: 2,
        relationshipsCreated: 1
    };
    
    try {
        // Test 1: Save deployment
        console.log('📝 Testing deployment save...');
        const deploymentId = await historyService.recordDeployment(testDeploymentData);
        console.log(`✅ Deployment recorded with ID: ${deploymentId}`);
        
        // Update deployment to completed status
        await historyService.updateDeployment(deploymentId, {
            status: 'success',
            result: testResult
        });
        
        // Test 2: Get deployment history
        console.log('📋 Testing deployment history retrieval...');
        const history = await historyService.getDeploymentHistory('test', 10);
        console.log(`✅ Retrieved ${history.length} deployment(s)`);
        
        if (history.length > 0) {
            console.log('📄 Latest deployment:');
            console.log(JSON.stringify(history[0], null, 2));
        }
        
        // Test 3: Get deployment details
        console.log('🔍 Testing deployment details retrieval...');
        const details = await historyService.getDeploymentById(deploymentId);
        console.log('✅ Retrieved deployment details');
        console.log(`   Solution: ${details.solutionName}`);
        console.log(`   Status: ${details.status}`);
        console.log(`   Duration: ${details.duration}ms`);
        
        console.log('🎉 All tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testDeploymentHistory()
        .then(() => {
            console.log('✅ Test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test failed:', error);
            process.exit(1);
        });
}

module.exports = { testDeploymentHistory };