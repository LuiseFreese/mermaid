import React, { useState } from 'react';

// MINIMAL FileUploadStep without heavy Fluent UI
export const FileUploadStepMinimal: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [cdmDetected, setCdmDetected] = useState(false);
  const [entityChoice, setEntityChoice] = useState<'cdm' | 'custom' | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.name.endsWith('.mmd')) {
      const content = await selectedFile.text();
      
      // CDM Detection
      const cdmEntities = ['Contact', 'Account', 'Opportunity', 'Lead', 'Case', 'Product'];
      const foundCdm = cdmEntities.some(entity => 
        content.toLowerCase().includes(entity.toLowerCase())
      );
      
      setCdmDetected(foundCdm);
      setFile(selectedFile);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2>🚀 Fast Upload (Minimal UI)</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".mmd"
          onChange={handleFileChange}
          style={{ marginBottom: '10px' }}
        />
      </div>

      {file && (
        <div style={{ 
          background: '#d4edda', 
          border: '1px solid #c3e6cb', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          ✅ File uploaded: {file.name}
        </div>
      )}

      {file && cdmDetected && (
        <div style={{ 
          background: '#f8f9fa', 
          border: '1px solid #dee2e6', 
          padding: '20px', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <h3>🎯 CDM Entities Detected!</h3>
          <p>Choose your approach:</p>
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button 
              onClick={() => setEntityChoice('cdm')}
              style={{
                background: '#0066cc',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              📊 Use CDM Entities (Recommended)
            </button>
            
            <button 
              onClick={() => setEntityChoice('custom')}
              style={{
                background: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🔧 Create Custom Entities
            </button>
          </div>

          {entityChoice && (
            <div style={{ 
              marginTop: '15px', 
              padding: '10px', 
              background: entityChoice === 'cdm' ? '#d1ecf1' : '#fff3cd',
              border: `1px solid ${entityChoice === 'cdm' ? '#bee5eb' : '#ffeaa7'}`,
              borderRadius: '4px'
            }}>
              {entityChoice === 'cdm' ? '🎉 Using CDM entities!' : '⚡ Creating custom entities!'}
              <button 
                onClick={() => setEntityChoice(null)}
                style={{ marginLeft: '10px', padding: '2px 8px' }}
              >
                Change
              </button>
            </div>
          )}
        </div>
      )}

      {file && !cdmDetected && (
        <div style={{ 
          background: '#cce7ff', 
          border: '1px solid #99d6ff', 
          padding: '10px', 
          borderRadius: '4px'
        }}>
          ℹ️ No CDM entities detected. Creating custom entities.
        </div>
      )}
    </div>
  );
};
