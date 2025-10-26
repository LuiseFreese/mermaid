import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Text,
  Button,
  Combobox,
  Option,
  MessageBar,
  MessageBarBody,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import { 
  SearchRegular,
  CheckmarkCircleRegular
} from '@fluentui/react-icons';
import mermaid from 'mermaid';
import { useWizardContext } from '../../../../context/WizardContext';
import { useSolutions } from '../../../../hooks/useSolutions';
import { useCDMDetection } from './hooks/useCDMDetection';
import { CDMDetectionCard } from './components/CDMDetectionCard';
import { useTheme } from '../../../../context/ThemeContext';

interface DataverseImportProps {
  onImportCompleted?: (erdContent: string, metadata: any) => void;
  onCDMChoiceSelected?: (choice: 'cdm' | 'custom') => void;
}

export const DataverseImport: React.FC<DataverseImportProps> = ({
  onImportCompleted,
  onCDMChoiceSelected
}) => {
  const { updateWizardData } = useWizardContext();
  const { solutions, loading: solutionsLoading, error: solutionsError } = useSolutions();
  const [selectedSolutionId, setSelectedSolutionId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [environmentUrl, setEnvironmentUrl] = useState('');
  const [environmentLoading, setEnvironmentLoading] = useState(true);
  const [importedContent, setImportedContent] = useState<string | null>(null);
  const [importedMetadata, setImportedMetadata] = useState<any>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);
  
  // Theme context
  const { effectiveTheme } = useTheme();

  const getCardBackgroundColor = useCallback(() => {
    switch (effectiveTheme) {
      case 'dark':
        return '#2d2d30'; // Dark gray for dark theme
      case 'neon':
        return 'rgba(60, 30, 90, 0.3)'; // Semi-transparent purple for neon theme (matches card background)
      default:
        return '#ffffff'; // White for light and pink themes
    }
  }, [effectiveTheme]);
  
  // CDM Detection
  const { detectCDMEntities, cdmDetection, setCDMChoice } = useCDMDetection();

  // Get theme-specific Mermaid configuration
  const getMermaidConfig = useCallback(() => {
    if (effectiveTheme === 'dark') {
      return {
        startOnLoad: true,
        theme: 'base' as const,
        securityLevel: 'loose' as const,
        themeVariables: {
          primaryColor: '#2d2d30',
          primaryBorderColor: '#0078d4',
          lineColor: '#0078d4',
          secondaryColor: '#1e1e1e',
          tertiaryColor: '#3e3e42',
          background: '#1e1e1e',
          primaryTextColor: '#ffffff',
          secondaryTextColor: '#cccccc',
          tertiaryTextColor: '#ffffff'
        }
      };
    } else if (effectiveTheme === 'pink') {
      return {
        startOnLoad: true,
        theme: 'base' as const,
        securityLevel: 'loose' as const,
        themeVariables: {
          primaryColor: '#fce7f3',
          primaryBorderColor: '#C71585',
          lineColor: '#C71585',
          secondaryColor: '#fdf2f8',
          tertiaryColor: '#fce7f3',
          background: '#fdf2f8',
          primaryTextColor: '#323130',
          secondaryTextColor: '#323130',
          tertiaryTextColor: '#323130'
        }
      };
    } else if (effectiveTheme === 'neon') {
      return {
        startOnLoad: true,
        theme: 'base' as const,
        securityLevel: 'loose' as const,
        themeVariables: {
          primaryColor: '#1a0a2e',
          primaryBorderColor: '#00ff00',
          lineColor: '#00ff00',
          secondaryColor: '#0f0524',
          tertiaryColor: '#16082b',
          background: '#0f0524',
          primaryTextColor: '#ffffff',
          secondaryTextColor: '#e0e0e0',
          tertiaryTextColor: '#ffffff'
        }
      };
    } else {
      return {
        startOnLoad: true,
        theme: 'base' as const,
        securityLevel: 'loose' as const,
        themeVariables: {
          primaryColor: '#e3f2fd',
          primaryBorderColor: '#0078d4',
          lineColor: '#0078d4',
          secondaryColor: '#ffffff',
          tertiaryColor: '#f8f9fa',
          background: '#ffffff',
          primaryTextColor: '#323130',
          secondaryTextColor: '#323130',
          tertiaryTextColor: '#323130'
        }
      };
    }
  }, [effectiveTheme]);

  // Initialize Mermaid with theme
  useEffect(() => {
    const config = getMermaidConfig();
    console.log('🎨 DataverseImport: Initializing Mermaid with theme:', effectiveTheme, config);
    mermaid.initialize(config);
  }, [getMermaidConfig, effectiveTheme]);

  // Auto-detect environment URL from configuration
  useEffect(() => {
    const detectEnvironmentUrl = async () => {
      try {
        const response = await fetch('/api/config/environment');
        if (response.ok) {
          const config = await response.json();
          setEnvironmentUrl(config.dataverseUrl || '');
        }
      } catch (error) {
        // Fallback: try to detect from current deployment or use placeholder
        setEnvironmentUrl('https://your-env.crm.dynamics.com');
      } finally {
        setEnvironmentLoading(false);
      }
    };
    
    detectEnvironmentUrl();
  }, []);

  // Handle CDM detection completion - auto-complete if no CDM entities found
  useEffect(() => {
    if (importedContent && importedMetadata && !cdmDetection.detected && !isImporting) {
      // No CDM entities detected, complete the import immediately
      updateWizardData({
        originalErdContent: importedContent,
        correctedErdContent: importedContent,
        importSource: 'dataverse'
      });

      onImportCompleted?.(importedContent, importedMetadata);
    }
  }, [importedContent, importedMetadata, cdmDetection.detected, isImporting, updateWizardData, environmentUrl]); // Removed onImportCompleted

  // Filter solutions based on search term
  const filteredSolutions = useMemo(() => {
    if (!solutions) return [];
    if (!searchTerm.trim()) return solutions;
    
    const term = searchTerm.toLowerCase();
    return solutions.filter(solution => 
      solution.friendlyname.toLowerCase().includes(term) ||
      solution.uniquename.toLowerCase().includes(term)
    );
  }, [solutions, searchTerm]);

  // Selected solution derived from solutions and selectedSolutionId
  const selectedSolution = useMemo(() => {
    return solutions?.find(s => s.solutionid === selectedSolutionId);
  }, [solutions, selectedSolutionId]);

  // CDM choice handler
  const handleCDMChoiceSelected = useCallback(async (choice: 'cdm' | 'custom') => {
    console.log('🔧 FRONTEND DEBUG: DataverseImport handleCDMChoiceSelected called', {
      choice,
      detectedEntities: cdmDetection.entities,
      timestamp: new Date().toISOString()
    });

    setCDMChoice(choice);
    
    // Notify parent component of CDM choice
    onCDMChoiceSelected?.(choice);

    // Complete the import process after CDM choice
    if (importedContent && importedMetadata) {
      // Add entityChoice to metadata before passing to parent
      const metadataWithChoice = {
        ...importedMetadata,
        entityChoice: choice
      };

      updateWizardData({
        originalErdContent: importedContent,
        correctedErdContent: importedContent,
        importSource: 'dataverse',
        entityChoice: choice
      });

      onImportCompleted?.(importedContent, metadataWithChoice);
    }
  }, [cdmDetection.entities, setCDMChoice, importedContent, importedMetadata, updateWizardData, environmentUrl, selectedSolution]); // Removed onImportCompleted and onCDMChoiceSelected

  // Render the diagram when CDM choice is made and we have content
  useEffect(() => {
    if (!cdmDetection.choice || !importedContent || !mermaidRef.current) {
      return;
    }

    const renderDiagram = async () => {
      try {
        if (!mermaidRef.current) return;
        
        // Re-initialize Mermaid with current theme before rendering
        const config = getMermaidConfig();
        console.log('🎨 Re-initializing Mermaid before render with theme:', effectiveTheme);
        mermaid.initialize(config);
        
        mermaidRef.current.innerHTML = '';
        const id = `mermaid-dataverse-${Date.now()}`;
        const { svg } = await mermaid.render(id, importedContent);
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error('Error rendering diagram:', error);
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = '<p style="color: red; padding: 10px;">Error rendering diagram</p>';
        }
      }
    };

    renderDiagram();
  }, [cdmDetection.choice, importedContent, effectiveTheme, getMermaidConfig]);

  const handleImport = useCallback(async () => {
    if (!selectedSolution) {
      setImportError('Please select a solution');
      return;
    }

    if (!environmentUrl) {
      setImportError('Environment URL not configured');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const response = await fetch('/api/import/dataverse-solution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          environmentUrl,
          solutionName: selectedSolution.uniquename,
          authMethod: 'managedIdentity'
        }),
      });

      const result = await response.json();

      if (result.success) {
        const { erdContent, metadata } = result.data;
        
        // Store imported content for later processing
        setImportedContent(erdContent);
        setImportedMetadata(metadata);
        
        // Detect CDM entities in the imported content
        detectCDMEntities(erdContent);
        
        // Note: CDM detection completion is handled in useEffect below
      } else {
        setImportError(result.error || 'Import failed');
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  }, [selectedSolution, environmentUrl, updateWizardData, detectCDMEntities, cdmDetection.detected]); // Removed onImportCompleted

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Solution Selector */}
          <div>
            <Text weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
              Select Dataverse Solution *
            </Text>
            
            {solutionsLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px' }}>
                <Spinner size="tiny" />
                <Text size={300}>Loading solutions...</Text>
              </div>
            )}

            {solutionsError && (
              <MessageBar intent="error" style={{ marginBottom: '12px' }}>
                <MessageBarBody>
                  Failed to load solutions: {solutionsError}
                </MessageBarBody>
              </MessageBar>
            )}

            {!solutionsLoading && !solutionsError && !environmentUrl && !environmentLoading && (
              <MessageBar intent="warning" style={{ marginBottom: '12px' }}>
                <MessageBarBody>
                  Environment configuration is required before selecting solutions.
                </MessageBarBody>
              </MessageBar>
            )}

            {!solutionsLoading && !solutionsError && environmentUrl && (
              <>
                <Combobox
                  placeholder="Search and select a solution..."
                  value={searchTerm}
                  selectedOptions={selectedSolutionId ? [selectedSolutionId] : []}
                  onOptionSelect={(_, data) => {
                    setSelectedSolutionId(data.optionValue || '');
                  }}
                  onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                  style={{ width: '100%', marginBottom: '8px' }}
                  disabled={isImporting || environmentLoading || !environmentUrl || importedContent !== null}
                >
                  {filteredSolutions.map((solution) => (
                    <Option 
                      key={solution.solutionid} 
                      value={solution.solutionid}
                      text={solution.friendlyname}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <Text weight="semibold" size={300}>
                          {solution.friendlyname}
                        </Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          {solution.uniquename}
                        </Text>
                      </div>
                    </Option>
                  ))}
                </Combobox>
              </>
            )}
          </div>

          {/* Selected Solution Info */}
          {selectedSolution && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: getCardBackgroundColor(), 
              borderRadius: '8px',
              border: `1px solid ${tokens.colorNeutralStroke2}`
            }}>
              <Text weight="semibold" style={{ marginBottom: '4px', display: 'block' }}>
                Selected Solution
              </Text>
              <Text size={300} style={{ color: tokens.colorNeutralForeground2, marginBottom: '4px', display: 'block' }}>
                {selectedSolution.friendlyname}
              </Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Internal Name: {selectedSolution.uniquename}
              </Text>
            </div>
          )}

          {/* Import Error */}
          {importError && (
            <MessageBar intent="error">
              <MessageBarBody>{importError}</MessageBarBody>
            </MessageBar>
          )}

          {/* Import Button */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Button
              appearance="primary"
              icon={isImporting ? <Spinner size="tiny" /> : <SearchRegular />}
              onClick={handleImport}
              disabled={!selectedSolution || !environmentUrl || isImporting || environmentLoading || importedContent !== null}
            >
              {isImporting ? 'Importing Solution...' : 'Import Selected Solution'}
            </Button>

            {isImporting && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                This may take a few moments...
              </Text>
            )}
          </div>

          {/* Import Results */}
          {importedContent && importedMetadata && (
            <div style={{ 
              padding: '16px', 
              backgroundColor: tokens.colorNeutralBackground1, 
              borderRadius: '8px',
              border: `1px solid ${tokens.colorNeutralStroke2}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <CheckmarkCircleRegular fontSize={20} style={{ color: tokens.colorPaletteGreenForeground1 }} />
                <Text weight="semibold">Solution Imported Successfully</Text>
              </div>
              
              {/* Entity Counts */}
              {importedMetadata.entities && (
                <div style={{ marginBottom: '12px' }}>
                  <Text weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
                    Extracted Tables: {importedMetadata.entities}
                  </Text>
                  
                  {/* Custom vs CDM Classification */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    {importedMetadata.customEntities > 0 && (
                      <div>
                        <Text size={300} weight="semibold">
                          Custom Tables: {importedMetadata.customEntities}
                        </Text>
                      </div>
                    )}
                    {importedMetadata.cdmEntities > 0 && (
                      <div>
                        <Text size={300} weight="semibold">
                          CDM Tables: {importedMetadata.cdmEntities}
                        </Text>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CDM Detection Results */}
          {importedContent && cdmDetection.detected && (
            <CDMDetectionCard
              detectionResult={cdmDetection}
              onChoiceSelected={handleCDMChoiceSelected}
              onChoiceChanged={() => setCDMChoice(null)}
            />
          )}
    </div>
  );
};