import React from 'react';
import ReactDOM from 'react-dom/client';
import AppMinimal from './AppMinimal';

// ULTRA FAST main entry point
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppMinimal />
  </React.StrictMode>,
);
