import React from 'react';
import { FileUploadStepMinimal } from './components/wizard/steps/FileUploadStepMinimal';

// ULTRA FAST App without heavy dependencies
export const AppMinimal: React.FC = () => {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ 
        padding: '40px 20px',
        color: 'white',
        textAlign: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '2.5rem' }}>
          ⚡ Mermaid to Dataverse
        </h1>
        <p style={{ margin: '10px 0 40px', opacity: 0.9 }}>
          Lightning Fast Development Mode
        </p>
      </div>
      
      <div style={{
        background: 'white',
        margin: '0 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <FileUploadStepMinimal />
      </div>
    </div>
  );
};

export default AppMinimal;
