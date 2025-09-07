import { Routes, Route, Navigate } from 'react-router-dom';
import { makeStyles } from '@fluentui/react-components';
import { WizardShell } from './components/wizard/WizardShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const useStyles = makeStyles({
  app: {
    minHeight: '100vh',
    backgroundColor: '#f8f9fa',
  },
});

function App() {
  const styles = useStyles();

  return (
    <div className={styles.app}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Navigate to="/wizard" replace />} />
          <Route path="/wizard/*" element={<WizardShell />} />
          {/* Future routes can be added here */}
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

export default App;
