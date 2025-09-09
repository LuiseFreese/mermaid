#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * Runs all test suites with coverage reporting and performance metrics
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.results = {
      unit: { passed: 0, failed: 0, duration: 0 },
      integration: { passed: 0, failed: 0, duration: 0 },
      e2e: { passed: 0, failed: 0, duration: 0 },
      coverage: { lines: 0, branches: 0, functions: 0, statements: 0 }
    };
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async runCommand(command, description) {
    this.log(`Starting: ${description}`);
    const startTime = Date.now();
    
    try {
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      const duration = Date.now() - startTime;
      this.log(`✓ Completed: ${description} (${duration}ms)`, 'success');
      return { success: true, output, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`✗ Failed: ${description} (${duration}ms)`, 'error');
      this.log(`Error: ${error.message}`, 'error');
      return { success: false, error: error.message, duration };
    }
  }

  async setupTestEnvironment() {
    this.log('Setting up test environment...', 'info');
    
    // Ensure test directories exist
    const testDirs = [
      'tests/unit',
      'tests/integration', 
      'tests/e2e',
      'tests/fixtures',
      'coverage',
      'logs/test-results'
    ];

    testDirs.forEach(dir => {
      const fullPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        this.log(`Created directory: ${dir}`);
      }
    });

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.DATAVERSE_URL = 'https://test.crm.dynamics.com';
    process.env.TENANT_ID = 'test-tenant-id';
    
    this.log('Test environment setup complete', 'success');
  }

  async runUnitTests() {
    this.log('Running unit tests...', 'info');
    
    const result = await this.runCommand(
      'npx jest tests/unit --coverage --coverageDirectory=coverage/unit --testTimeout=30000 --verbose',
      'Unit Tests'
    );

    if (result.success) {
      this.parseJestResults(result.output, 'unit');
    } else {
      this.results.unit.failed = 1;
    }

    return result.success;
  }

  async runIntegrationTests() {
    this.log('Running integration tests...', 'info');
    
    const result = await this.runCommand(
      'npx jest tests/integration --coverage --coverageDirectory=coverage/integration --testTimeout=60000 --verbose',
      'Integration Tests'
    );

    if (result.success) {
      this.parseJestResults(result.output, 'integration');
    } else {
      this.results.integration.failed = 1;
    }

    return result.success;
  }

  async runE2ETests() {
    this.log('Running end-to-end tests...', 'info');
    
    const result = await this.runCommand(
      'npx jest tests/e2e --testTimeout=120000 --verbose --runInBand',
      'End-to-End Tests'
    );

    if (result.success) {
      this.parseJestResults(result.output, 'e2e');
    } else {
      this.results.e2e.failed = 1;
    }

    return result.success;
  }

  parseJestResults(output, testType) {
    try {
      // Parse Jest output for test results
      const lines = output.split('\n');
      
      // Look for test results summary
      const summaryLine = lines.find(line => line.includes('Tests:') && line.includes('passed'));
      if (summaryLine) {
        const passedMatch = summaryLine.match(/(\d+) passed/);
        const failedMatch = summaryLine.match(/(\d+) failed/);
        
        if (passedMatch) this.results[testType].passed = parseInt(passedMatch[1]);
        if (failedMatch) this.results[testType].failed = parseInt(failedMatch[1]);
      }

      // Look for coverage information
      const coverageLine = lines.find(line => line.includes('All files') && line.includes('%'));
      if (coverageLine) {
        const parts = coverageLine.split('|').map(p => p.trim());
        if (parts.length >= 5) {
          this.results.coverage.statements = parseFloat(parts[1]) || 0;
          this.results.coverage.branches = parseFloat(parts[2]) || 0;
          this.results.coverage.functions = parseFloat(parts[3]) || 0;
          this.results.coverage.lines = parseFloat(parts[4]) || 0;
        }
      }
    } catch (error) {
      this.log(`Error parsing Jest results: ${error.message}`, 'warning');
    }
  }

  async generateCoverageReport() {
    this.log('Generating coverage report...', 'info');
    
    // Merge coverage reports
    const mergeResult = await this.runCommand(
      'npx nyc merge coverage coverage/merged.json',
      'Merge Coverage Reports'
    );

    if (mergeResult.success) {
      // Generate HTML report
      await this.runCommand(
        'npx nyc report --reporter=html --reporter=text --reporter=lcov --temp-dir=coverage --report-dir=coverage/html',
        'Generate HTML Coverage Report'
      );
    }

    return mergeResult.success;
  }

  async runLinting() {
    this.log('Running code linting...', 'info');
    
    const result = await this.runCommand(
      'npx eslint "src/backend/**/*.js" "tests/**/*.js" --format=compact',
      'ESLint Code Analysis'
    );

    return result.success;
  }

  async runSecurityAudit() {
    this.log('Running security audit...', 'info');
    
    const result = await this.runCommand(
      'npm audit --audit-level=moderate',
      'NPM Security Audit'
    );

    return result.success;
  }

  async runPerformanceTests() {
    this.log('Running performance benchmarks...', 'info');
    
    // Basic performance test for ERD parsing
    const perfTest = `
      const ERDParser = require('./src/backend/parsers/erd-parser');
      const testData = require('./tests/fixtures/test-data');
      
      const parser = new ERDParser();
      const iterations = 100;
      
      console.time('ERD Parsing Performance');
      for (let i = 0; i < iterations; i++) {
        parser.parse(testData.complexERD);
      }
      console.timeEnd('ERD Parsing Performance');
      
      console.log(\`Processed \${iterations} ERDs\`);
    `;

    fs.writeFileSync('temp-perf-test.js', perfTest);
    
    const result = await this.runCommand(
      'node temp-perf-test.js',
      'Performance Benchmarks'
    );

    // Clean up temp file
    if (fs.existsSync('temp-perf-test.js')) {
      fs.unlinkSync('temp-perf-test.js');
    }

    return result.success;
  }

  async generateTestReport() {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      summary: {
        totalTests: this.results.unit.passed + this.results.unit.failed +
                   this.results.integration.passed + this.results.integration.failed +
                   this.results.e2e.passed + this.results.e2e.failed,
        totalPassed: this.results.unit.passed + this.results.integration.passed + this.results.e2e.passed,
        totalFailed: this.results.unit.failed + this.results.integration.failed + this.results.e2e.failed
      },
      results: this.results,
      coverage: this.results.coverage
    };

    // Save detailed report
    const reportPath = path.join('logs', 'test-results', `test-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Display summary
    this.log('\n' + '='.repeat(60), 'info');
    this.log('TEST EXECUTION SUMMARY', 'info');
    this.log('='.repeat(60), 'info');
    
    this.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'info');
    this.log(`Total Tests: ${report.summary.totalTests}`, 'info');
    this.log(`Passed: ${report.summary.totalPassed}`, report.summary.totalPassed > 0 ? 'success' : 'info');
    this.log(`Failed: ${report.summary.totalFailed}`, report.summary.totalFailed > 0 ? 'error' : 'info');
    
    this.log('\nTest Breakdown:', 'info');
    this.log(`  Unit Tests: ${this.results.unit.passed} passed, ${this.results.unit.failed} failed`);
    this.log(`  Integration Tests: ${this.results.integration.passed} passed, ${this.results.integration.failed} failed`);
    this.log(`  E2E Tests: ${this.results.e2e.passed} passed, ${this.results.e2e.failed} failed`);
    
    if (this.results.coverage.lines > 0) {
      this.log('\nCode Coverage:', 'info');
      this.log(`  Lines: ${this.results.coverage.lines.toFixed(1)}%`);
      this.log(`  Branches: ${this.results.coverage.branches.toFixed(1)}%`);
      this.log(`  Functions: ${this.results.coverage.functions.toFixed(1)}%`);
      this.log(`  Statements: ${this.results.coverage.statements.toFixed(1)}%`);
    }
    
    this.log('\n' + '='.repeat(60), 'info');
    
    const success = report.summary.totalFailed === 0;
    this.log(`Overall Result: ${success ? 'SUCCESS' : 'FAILURE'}`, success ? 'success' : 'error');
    
    return success;
  }

  async run() {
    try {
      this.log('Starting comprehensive test execution...', 'info');
      
      // Setup
      await this.setupTestEnvironment();
      
      // Run linting first
      const lintSuccess = await this.runLinting();
      if (!lintSuccess) {
        this.log('Linting failed - continuing with tests but will report issues', 'warning');
      }
      
      // Run security audit
      const auditSuccess = await this.runSecurityAudit();
      if (!auditSuccess) {
        this.log('Security audit found issues - continuing with tests', 'warning');
      }
      
      // Run test suites
      await this.runUnitTests();
      await this.runIntegrationTests();
      await this.runE2ETests();
      
      // Generate coverage report
      await this.generateCoverageReport();
      
      // Run performance tests
      await this.runPerformanceTests();
      
      // Generate final report
      const overallSuccess = await this.generateTestReport();
      
      // Exit with appropriate code
      process.exit(overallSuccess ? 0 : 1);
      
    } catch (error) {
      this.log(`Test execution failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Handle command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);
  const runner = new TestRunner();
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node run-tests.js [options]

Options:
  --help, -h     Show this help message
  --unit         Run only unit tests
  --integration  Run only integration tests
  --e2e          Run only end-to-end tests
  --coverage     Generate coverage report
  --performance  Run performance benchmarks
  --no-lint      Skip linting
  --no-audit     Skip security audit

Examples:
  node run-tests.js              # Run all tests
  node run-tests.js --unit       # Run only unit tests
  node run-tests.js --coverage   # Run tests with coverage
    `);
    process.exit(0);
  }
  
  // Run specific test suites based on arguments
  if (args.includes('--unit')) {
    runner.setupTestEnvironment().then(() => runner.runUnitTests());
  } else if (args.includes('--integration')) {
    runner.setupTestEnvironment().then(() => runner.runIntegrationTests());
  } else if (args.includes('--e2e')) {
    runner.setupTestEnvironment().then(() => runner.runE2ETests());
  } else if (args.includes('--coverage')) {
    runner.setupTestEnvironment().then(() => runner.generateCoverageReport());
  } else if (args.includes('--performance')) {
    runner.setupTestEnvironment().then(() => runner.runPerformanceTests());
  } else {
    // Run full test suite
    runner.run();
  }
}

module.exports = TestRunner;
