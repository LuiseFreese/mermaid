import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../../../src/context/ThemeContext';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
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

const ThemeTestComponent = () => {
  const { theme, effectiveTheme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="effective-theme">{effectiveTheme}</span>
      <button data-testid="toggle-theme" onClick={toggleTheme}>Toggle</button>
      <button data-testid="set-light" onClick={() => setTheme('light')}>Light</button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>Dark</button>
      <button data-testid="set-auto" onClick={() => setTheme('auto')}>Auto</button>
    </div>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('should provide default auto theme when no saved preference', () => {
    localStorageMock.getItem.mockReturnValue(null);
    
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    expect(screen.getByTestId('current-theme')).toHaveTextContent('auto');
    expect(screen.getByTestId('effective-theme')).toHaveTextContent('light');
  });

  it('should load saved theme preference', () => {
    localStorageMock.getItem.mockReturnValue('dark');
    
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('effective-theme')).toHaveTextContent('dark');
  });

  it('should toggle theme correctly', () => {
    localStorageMock.getItem.mockReturnValue('light');
    
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    
    fireEvent.click(screen.getByTestId('toggle-theme'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    
    fireEvent.click(screen.getByTestId('toggle-theme'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('auto');
    
    fireEvent.click(screen.getByTestId('toggle-theme'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
  });

  it('should set theme directly', () => {
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    fireEvent.click(screen.getByTestId('set-dark'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('effective-theme')).toHaveTextContent('dark');
  });

  it('should save theme preference to localStorage', () => {
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    fireEvent.click(screen.getByTestId('set-dark'));
    expect(localStorageMock.setItem).toHaveBeenCalledWith('app-theme', 'dark');
  });

  it('should apply theme attribute to document', () => {
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    fireEvent.click(screen.getByTestId('set-dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    
    fireEvent.click(screen.getByTestId('set-light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('should handle system preference in auto mode', () => {
    // Mock dark system preference
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );
    
    fireEvent.click(screen.getByTestId('set-auto'));
    expect(screen.getByTestId('effective-theme')).toHaveTextContent('dark');
  });

  it('should throw error when useTheme is used outside provider', () => {
    const TestComponent = () => {
      useTheme();
      return <div>Test</div>;
    };
    
    expect(() => render(<TestComponent />)).toThrow(
      'useTheme must be used within ThemeProvider'
    );
  });
});
