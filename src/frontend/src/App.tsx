import { Routes, Route, Navigate } from 'react-router-dom';
import { FluentProvider, makeStyles } from '@fluentui/react-components';
import { WizardShell } from './components/wizard/WizardShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { lightTheme, darkTheme, pinkTheme } from './styles/FluentTheme';
import './styles/themes.css';

const useStyles = makeStyles({
  app: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
  },
});

const AppContent: React.FC = () => {
  const { effectiveTheme } = useTheme();
  const styles = useStyles();
  
  // Select the appropriate Fluent UI theme
  const getFluentTheme = () => {
    switch (effectiveTheme) {
      case 'dark': return darkTheme;
      case 'pink': return pinkTheme;
      default: return lightTheme;
    }
  };
  
  return (
    <FluentProvider theme={getFluentTheme()}>
      <div className={styles.app}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/wizard" replace />} />
            <Route path="/wizard/*" element={<WizardShell />} />
            {/* Future routes can be added here */}
          </Routes>
        </ErrorBoundary>
      </div>
    </FluentProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
