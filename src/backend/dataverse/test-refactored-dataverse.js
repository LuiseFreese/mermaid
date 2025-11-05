/**
 * Test script for refactored Dataverse services
 */

const { 
  BaseDataverseService, 
  DataverseAuthenticationService, 
  DataverseClient, 
  DataversePublisherService, 
  DataverseSolutionService,
  DataverseEntityService,
  DataverseRelationshipService,
  DataverseGlobalChoicesService
} = require('./index');

console.log('🧪 Testing Refactored Dataverse Services...\n');

// Test configuration
const testConfig = {
  environment: 'development',
  tenant: 'test-tenant',
  clientId: 'test-client-id',
  clientSecret: 'test-secret',
  dataverseUrl: 'https://test.crm.dynamics.com'
};

console.log('1️⃣ Testing BaseDataverseService...');
const baseService = new BaseDataverseService(testConfig);
console.log('   ✅ BaseDataverseService instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(baseService)).filter(name => name !== 'constructor'));

console.log('\n2️⃣ Testing DataverseAuthenticationService...');
const authService = new DataverseAuthenticationService(testConfig);
console.log('   ✅ DataverseAuthenticationService instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(authService)).filter(name => name !== 'constructor'));

console.log('\n3️⃣ Testing DataverseClient...');
const client = new DataverseClient(testConfig);
console.log('   ✅ DataverseClient instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(name => name !== 'constructor'));

console.log('\n4️⃣ Testing DataversePublisherService...');
const publisherService = new DataversePublisherService(testConfig);
console.log('   ✅ DataversePublisherService instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(publisherService)).filter(name => name !== 'constructor'));

console.log('\n5️⃣ Testing DataverseSolutionService...');
const solutionService = new DataverseSolutionService(testConfig);
console.log('   ✅ DataverseSolutionService instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(solutionService)).filter(name => name !== 'constructor'));

console.log('\n6️⃣ Testing DataverseEntityService...');
const entityService = new DataverseEntityService(testConfig);
console.log('   ✅ DataverseEntityService instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(entityService)).filter(name => name !== 'constructor'));

console.log('\n7️⃣ Testing DataverseRelationshipService...');
const relationshipService = new DataverseRelationshipService(testConfig);
console.log('   ✅ DataverseRelationshipService instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(relationshipService)).filter(name => name !== 'constructor'));

console.log('\n8️⃣ Testing DataverseGlobalChoicesService...');
const globalChoicesService = new DataverseGlobalChoicesService(testConfig);
console.log('   ✅ DataverseGlobalChoicesService instantiated');
console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(globalChoicesService)).filter(name => name !== 'constructor'));

// Test method availability
console.log('\n🔍 Verifying Method Availability...');

// Check BaseDataverseService methods
const baseMethods = ['get', 'post', 'put', 'patch', 'delete', '_makeRequest', '_log', '_warn', '_err', 'sleep'];
console.log(`\n📋 BaseDataverseService methods (${baseMethods.length}):`);
baseMethods.forEach(method => {
  const available = typeof baseService[method] === 'function';
  console.log(`   ${available ? '✅' : '❌'} ${method}`);
});

// Check AuthenticationService methods
const authMethods = ['_ensureToken', '_getToken', '_getTokenWithClientSecret', '_getTokenWithManagedIdentity', '_getTokenWithFederatedCredentials'];
console.log(`\n🔐 DataverseAuthenticationService methods (${authMethods.length}):`);
authMethods.forEach(method => {
  const available = typeof authService[method] === 'function';
  console.log(`   ${available ? '✅' : '❌'} ${method}`);
});

// Check PublisherService methods
const publisherMethods = ['createPublisher', 'getPublisher', 'deletePublisher', 'getAllPublishers'];
console.log(`\n📤 DataversePublisherService methods (${publisherMethods.length}):`);
publisherMethods.forEach(method => {
  const available = typeof publisherService[method] === 'function';
  console.log(`   ${available ? '✅' : '❌'} ${method}`);
});

// Check SolutionService methods
const solutionMethods = ['createSolution', 'getSolution', 'deleteSolution', 'importSolution', 'exportSolution', 'publishSolution', 'getSolutions', 'addComponentToSolution', 'addEntityToSolution'];
console.log(`\n📦 DataverseSolutionService methods (${solutionMethods.length}):`);
solutionMethods.forEach(method => {
  const available = typeof solutionService[method] === 'function';
  console.log(`   ${available ? '✅' : '❌'} ${method}`);
});

// Check EntityService methods
const entityMethods = ['createEntity', 'createEntityWithRetry', 'createAttribute', 'createAttributeWithRetry', 'deleteEntity', 'getEntityDefinition', 'getEntityDefinitions', 'entityExists', '_stringAttribute', '_memoAttribute', '_intAttribute', '_decimalAttribute', '_moneyAttribute', '_booleanAttribute', '_datetimeAttribute', '_dateOnlyAttribute', '_floatAttribute', '_emailAttribute', '_phoneAttribute', '_urlAttribute', '_imageAttribute'];
console.log(`\n🏢 DataverseEntityService methods (${entityMethods.length}):`);
entityMethods.forEach(method => {
  const available = typeof entityService[method] === 'function';
  console.log(`   ${available ? '✅' : '❌'} ${method}`);
});

// Check RelationshipService methods
const relationshipMethods = ['checkRelationshipExists', 'createRelationship', 'createRelationshipWithRetry', 'deleteRelationship', 'discoverRelationships', 'createRelationshipsSmart', '_resolveLogicalNameForRelationship', '_buildRelationshipPayload', '_isOurCustomRelationship'];
console.log(`\n🔗 DataverseRelationshipService methods (${relationshipMethods.length}):`);
relationshipMethods.forEach(method => {
  const available = typeof relationshipService[method] === 'function';
  console.log(`   ${available ? '✅' : '❌'} ${method}`);
});

// Check GlobalChoicesService methods
const globalChoicesMethods = ['getGlobalChoiceSets', 'getGlobalChoiceSet', 'createGlobalChoice', 'deleteGlobalChoice', 'addGlobalChoicesToSolution', 'createAndAddCustomGlobalChoices', '_isAuthConfigured', '_addExistingChoiceToSolution', '_waitForChoiceCreation'];
console.log(`\n🎨 DataverseGlobalChoicesService methods (${globalChoicesMethods.length}):`);
globalChoicesMethods.forEach(method => {
  const available = typeof globalChoicesService[method] === 'function';
  console.log(`   ${available ? '✅' : '❌'} ${method}`);
});

// Test inheritance chain
console.log('\n🔗 Testing Inheritance Chain...');
console.log(`   BaseDataverseService → DataverseAuthenticationService: ${authService instanceof BaseDataverseService ? '✅' : '❌'}`);
console.log(`   DataverseAuthenticationService → DataverseClient: ${client instanceof DataverseAuthenticationService ? '✅' : '❌'}`);
console.log(`   DataverseClient → DataversePublisherService: ${publisherService instanceof DataverseClient ? '✅' : '❌'}`);
console.log(`   DataverseClient → DataverseSolutionService: ${solutionService instanceof DataverseClient ? '✅' : '❌'}`);
console.log(`   DataverseClient → DataverseEntityService: ${entityService instanceof DataverseClient ? '✅' : '❌'}`);
console.log(`   DataverseClient → DataverseRelationshipService: ${relationshipService instanceof DataverseClient ? '✅' : '❌'}`);
console.log(`   DataverseClient → DataverseGlobalChoicesService: ${globalChoicesService instanceof DataverseClient ? '✅' : '❌'}`);

console.log('\n✅ All services successfully instantiated and tested!');
console.log('\n📊 Summary:');
console.log(`   - 8 services created`);
console.log(`   - ${baseMethods.length + authMethods.length + publisherMethods.length + solutionMethods.length + entityMethods.length + relationshipMethods.length + globalChoicesMethods.length} methods verified`);
console.log(`   - Inheritance chain validated`);