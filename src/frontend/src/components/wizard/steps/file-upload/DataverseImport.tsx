import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  Combobox,
  Option,
  MessageBar,
  MessageBarBody,
  Spinner,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { 
  CloudDatabaseRegular, 
  SearchRegular,
  CheckmarkCircleRegular,
  CopyRegular,
  EditRegular
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
  const [copySuccess, setCopySuccess] = useState(false);
  const mermaidRef = useRef<HTMLDivElement>(null);
  
  // Theme context
  const { effectiveTheme } = useTheme();
  
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
        importSource: {
          type: 'dataverse',
          environmentUrl,
          solutionName: selectedSolution?.friendlyname,
          metadata: importedMetadata
        }
      });

      onImportCompleted?.(importedContent, importedMetadata);
    }
  }, [importedContent, importedMetadata, cdmDetection.detected, isImporting, updateWizardData, environmentUrl, onImportCompleted]);

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
      updateWizardData({
        originalErdContent: importedContent,
        correctedErdContent: importedContent,
        importSource: {
          type: 'dataverse',
          environmentUrl,
          solutionName: selectedSolution?.friendlyname,
          metadata: importedMetadata
        },
        cdmChoice: choice
      });

      onImportCompleted?.(importedContent, importedMetadata);
    }
  }, [cdmDetection.entities, setCDMChoice, onCDMChoiceSelected, importedContent, importedMetadata, updateWizardData, environmentUrl, selectedSolution, onImportCompleted]);

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

  const handleCopyCode = useCallback(async () => {
    if (!importedContent) return;
    
    try {
      await navigator.clipboard.writeText(importedContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }, [importedContent]);

  const handleEditCode = useCallback(() => {
    // This will trigger navigation to the editor with the code
    // The wizard context already has the content, so just notify parent
    console.log('Edit code clicked - content ready in wizard context');
  }, []);

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
  }, [selectedSolution, environmentUrl, updateWizardData, onImportCompleted, detectCDMEntities, cdmDetection.detected]);

  return (
    <Card style={{ minHeight: '400px' }}>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CloudDatabaseRegular fontSize={20} />
            <Text weight="semibold">Import from Dataverse Solution</Text>
            <Badge appearance="filled" color="brand" size="small">BETA</Badge>
          </div>
        }
        description="Extract ERD diagrams from existing Dataverse solutions"
      />

      <CardPreview style={{ padding: '16px 24px' }}>
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
                  disabled={isImporting || environmentLoading || !environmentUrl}
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
                
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {filteredSolutions.length} solution{filteredSolutions.length !== 1 ? 's' : ''} available
                  {searchTerm && ` • Filtered by "${searchTerm}"`}
                </Text>
              </>
            )}
          </div>

          {/* Selected Solution Info */}
          {selectedSolution && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: tokens.colorNeutralBackground2, 
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

          {/* ER Diagram Display - Show after CDM choice is made */}
          {importedContent && cdmDetection.choice && (
            <>
              <Card style={{ marginTop: '16px' }}>
                <CardHeader
                  header={<Text weight="semibold">Entity Relationship Diagram</Text>}
                  description={<Text size={200}>Preview of your imported Dataverse solution</Text>}
                />
                <CardPreview>
                  <div 
                    ref={mermaidRef} 
                    style={{ 
                      padding: '20px', 
                      backgroundColor: tokens.colorNeutralBackground1,
                      minHeight: '200px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }} 
                  />
                </CardPreview>
              </Card>

              <Card style={{ marginTop: '16px' }}>
                <CardHeader
                  header={<Text weight="semibold">Mermaid Diagram Code</Text>}
                />
                <CardPreview>
                  <div style={{ position: 'relative' }}>
                    <div style={{ 
                      position: 'absolute', 
                      top: '12px', 
                      right: '12px', 
                      display: 'flex', 
                      gap: '8px',
                      zIndex: 1
                    }}>
                      <Button
                        appearance="subtle"
                        icon={<CopyRegular />}
                        onClick={handleCopyCode}
                        title="Copy code"
                        size="small"
                        style={{ 
                          backgroundColor: copySuccess ? tokens.colorPaletteGreenBackground2 : tokens.colorNeutralBackground1
                        }}
                      >
                        {copySuccess ? 'Copied!' : ''}
                      </Button>
                      <Button
                        appearance="subtle"
                        icon={<EditRegular />}
                        onClick={handleEditCode}
                        title="Edit code"
                        size="small"
                        style={{ backgroundColor: tokens.colorNeutralBackground1 }}
                      />
                    </div>
                    <pre style={{ 
                      padding: '16px', 
                      paddingTop: '48px',
                      backgroundColor: tokens.colorNeutralBackground2,
                      borderRadius: '4px',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      <code>{importedContent}</code>
                    </pre>
                  </div>
                </CardPreview>
              </Card>
            </>
          )}
        </div>
      </CardPreview>
    </Card>
  );
};