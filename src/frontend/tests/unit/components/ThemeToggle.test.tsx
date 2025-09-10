import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemeToggle } from '../../../src/components/common/ThemeToggle';
import { ThemeProvider } from '../../../src/context/ThemeContext';

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
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('ThemeToggle', () => {
  const renderWithTheme = () => {
    return render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
  };

  it('should render theme toggle button', () => {
    renderWithTheme();
    
    const button = screen.getByRole('button', { name: /change theme/i });
    expect(button).toBeInTheDocument();
  });

  it('should show current theme in button text', () => {
    localStorageMock.getItem.mockReturnValue('light');
    renderWithTheme();
    
    expect(screen.getByText('Light')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    renderWithTheme();
    
    const button = screen.getByRole('button', { name: /change theme/i });
    expect(button).toHaveAttribute('aria-label', 'Change theme');
  });
});
