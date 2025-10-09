module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.test.js'],
  testTimeout: 120000,
  globalSetup: '<rootDir>/e2e/setup/global-setup.js',
  globalTeardown: '<rootDir>/e2e/setup/global-teardown.js',
  setupFilesAfterEnv: ['<rootDir>/e2e/setup/jest-setup.js'],
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  maxWorkers: 1, // Run tests serially for e2e
  collectCoverage: false, // Disable coverage for e2e tests
};
