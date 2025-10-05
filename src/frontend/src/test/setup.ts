import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll } from 'vitest';
import { configureAxe } from 'jest-axe';

// Configure axe for accessibility testing
const axe = configureAxe({
  rules: {
    // Disable some rules that might be problematic in test environment
    'region': { enabled: false },
    'page-has-heading-one': { enabled: false },
    'landmark-one-main': { enabled: false },
  }
});

// Make axe available globally for tests
(global as any).axe = axe;

// Suppress act() warnings from Fluent UI components
// These are expected and benign for async state updates in Menu components
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    const message = args[0];
    if (
      typeof message === 'string' &&
      (message.includes('Warning: An update to') && message.includes('inside a test was not wrapped in act')) ||
      (message.includes('Warning: ReactDOM.render'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
