
/**
 * Global test setup for console output suppression
 * Suppresses console.warn, console.error, and console.log during tests for cleaner output
 */

// Store original console methods
global.originalConsoleWarn = console.warn;
global.originalConsoleError = console.error;
global.originalConsoleLog = console.log;

// Mock console.warn to suppress all warnings
console.warn = jest.fn();

// Mock console.error to suppress all errors
console.error = jest.fn();

// Mock console.log (optional - uncomment if you want to suppress logs too)
// console.log = jest.fn();

// Create spies for potential inspection in tests
global.consoleWarnSpy = jest.spyOn(console, 'warn');
global.consoleErrorSpy = jest.spyOn(console, 'error');
// global.consoleLogSpy = jest.spyOn(console, 'log');

// Provide cleanup function if needed in specific tests
global.restoreConsole = () => {
    console.warn = global.originalConsoleWarn;
    console.error = global.originalConsoleError;
    console.log = global.originalConsoleLog;
};

// Provide selective restoration
global.restoreConsoleWarn = () => {
    console.warn = global.originalConsoleWarn;
};

global.restoreConsoleError = () => {
    console.error = global.originalConsoleError;
};

global.restoreConsoleLog = () => {
    console.log = global.originalConsoleLog;
};
