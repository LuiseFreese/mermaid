/**
 * Jest Test Setup
 * Global configuration and mocks for all tests
 */

// Environment setup
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test timeout
jest.setTimeout(30000);

// Key Vault removed - using managed identity only

// Mock Azure Identity for tests
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
  ManagedIdentityCredential: jest.fn(),
  ChainedTokenCredential: jest.fn()
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Global test utilities
global.testUtils = {
  createMockRequest: (overrides = {}) => ({
    method: 'GET',
    url: '/',
    headers: {},
    body: {},
    ...overrides
  }),
  
  createMockResponse: () => {
    const res = {
      statusCode: 200,
      headers: {},
      writeHead: jest.fn(),
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      json: jest.fn()
    };
    return res;
  },
  
  createMockLogger: () => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }),
  
  // Sample test data
  mockERDContent: `erDiagram
    Customer {
        string customer_id PK
        string first_name
        string last_name
        string email
    }
    Order {
        string order_id PK
        string customer_id FK
        decimal amount
    }
    Customer ||--o{ Order : places`,
    
  mockValidationResult: {
    success: true,
    entities: [
      {
        name: 'Customer',
        attributes: [
          { name: 'customer_id', type: 'string', isPrimaryKey: true },
          { name: 'first_name', type: 'string' },
          { name: 'last_name', type: 'string' },
          { name: 'email', type: 'string' }
        ]
      },
      {
        name: 'Order',
        attributes: [
          { name: 'order_id', type: 'string', isPrimaryKey: true },
          { name: 'customer_id', type: 'string', isForeignKey: true },
          { name: 'amount', type: 'decimal' }
        ]
      }
    ],
    relationships: [
      {
        fromEntity: 'Customer',
        toEntity: 'Order',
        type: 'one-to-many',
        label: 'places'
      }
    ]
  }
};

// Suppress console.log during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: console.warn, // Keep warnings
    error: console.error // Keep errors
  };
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
