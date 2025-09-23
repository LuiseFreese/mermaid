import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'pink' | 'neon' | 'auto';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark' | 'pink' | 'neon';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme') as Theme;
    return saved || 'auto';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark' | 'pink' | 'neon'>('light');

  useEffect(() => {
    // Handle system preference detection
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateEffectiveTheme = () => {
      if (theme === 'auto') {
        setEffectiveTheme(mediaQuery.matches ? 'dark' : 'light');
      } else {
        setEffectiveTheme(theme as 'light' | 'dark' | 'pink' | 'neon');
      }
    };

    updateEffectiveTheme();
    mediaQuery.addEventListener('change', updateEffectiveTheme);

    // Apply theme to document
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    
    // Save preference
    localStorage.setItem('app-theme', theme);

    return () => mediaQuery.removeEventListener('change', updateEffectiveTheme);
  }, [theme, effectiveTheme]);

  const toggleTheme = () => {
    setTheme(current => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'pink';
      if (current === 'pink') return 'neon';
      if (current === 'neon') return 'auto';
      return 'light';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
