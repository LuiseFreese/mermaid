import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  tokens,
  Badge,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Textarea,
  Field,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import { 
  ArrowDownloadRegular,
  DatabaseRegular,
  DocumentTextRegular,
  CopyRegular,
  ArrowLeftRegular,
  CodeRegular
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useSolutions } from '../hooks/useSolutions';

export const ReverseEngineerPage: React.FC = () => {
  const navigate = useNavigate();
  const { solutions, loading: solutionsLoading, error: solutionsError } = useSolutions();
  
  const [environmentUrl, setEnvironmentUrl] = useState('');
  const [selectedSolution, setSelectedSolution] = useState<any>(null);
  const [solutionSearchTerm, setSolutionSearchTerm] = useState('');
  const [showSolutionDropdown, setShowSolutionDropdown] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [extractedErd, setExtractedErd] = useState<string | null>(null);
  const [extractionMetadata, setExtractionMetadata] = useState<any>(null);
  const [publisherPrefix, setPublisherPrefix] = useState<string>('');

  // Auto-detect environment URL from configuration
  useEffect(() => {
    // Try to get the environment URL from the same source as the wizard
    const detectEnvironmentUrl = async () => {
      try {
        // In a real app, this would come from your configuration service
        // For now, we'll use a placeholder that matches the app's deployment
        const response = await fetch('/api/config/environment');
        if (response.ok) {
          const config = await response.json();
          setEnvironmentUrl(config.dataverseUrl || '');
        }
      } catch (error) {
        // Fallback: try to detect from current deployment or use placeholder
        setEnvironmentUrl('https://your-env.crm.dynamics.com'); // This should be replaced with actual detection
      }
    };
    
    detectEnvironmentUrl();
  }, []);

  // Filter solutions based on search term
  const filteredSolutions = useMemo(() => {
    if (!solutionSearchTerm.trim()) return solutions;
    
    const searchLower = solutionSearchTerm.toLowerCase();
    return solutions.filter(solution => 
      solution.friendlyname.toLowerCase().includes(searchLower) ||
      solution.uniquename.toLowerCase().includes(searchLower) ||
      (solution.publisherid?.uniquename?.toLowerCase().includes(searchLower))
    );
  }, [solutions, solutionSearchTerm]);

  // Show solutions to display (all solutions when no search, filtered when searching)
  const solutionsToShow = solutionSearchTerm.trim() ? filteredSolutions : solutions;

  const getPreviewData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        environmentUrl,
        ...(selectedSolution && { solutionName: selectedSolution.uniquename })
      });

      const response = await fetch(`/api/import/dataverse-solution/preview?${params}`);
      const result = await response.json();

      if (result.success) {
        setPreviewData(result.data);
      }
    } catch (error) {
      console.error('Failed to get preview data:', error);
    }
  }, [environmentUrl, selectedSolution]);

  const handleExtractSolution = useCallback(async () => {
    setIsExtracting(true);
    setExtractionError(null);

    try {
      const response = await fetch('/api/import/dataverse-solution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          environmentUrl,
          solutionName: selectedSolution?.uniquename || undefined,
          authMethod: 'managedIdentity'
        }),
      });

      const result = await response.json();

      if (result.success) {
        const { erdContent, metadata } = result.data;
        setExtractedErd(erdContent);
        setExtractionMetadata(metadata);
        setPublisherPrefix(metadata.publisherPrefix || '');
      } else {
        setExtractionError(result.error || 'Extraction failed');
      }
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  }, [environmentUrl, selectedSolution]);

  const handleCopyToClipboard = useCallback(async () => {
    if (extractedErd) {
      try {
        await navigator.clipboard.writeText(extractedErd);
        // Could add a toast notification here
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  }, [extractedErd]);

  const handleDownloadFile = useCallback(() => {
    if (extractedErd) {
      const blob = new Blob([extractedErd], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedSolution?.uniquename || 'dataverse-solution'}.mmd`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [extractedErd, selectedSolution]);

  const handleOpenInWizard = useCallback(() => {
    if (extractedErd) {
      // Navigate to wizard starting point with pre-loaded ERD content
      navigate('/wizard', { 
        state: { 
          preloadedErd: extractedErd,
          source: 'reverse-engineer',
          solutionName: selectedSolution?.friendlyname || selectedSolution?.uniquename || 'Imported Solution',
          fromReverseEngineering: true
        } 
      });
    }
  }, [extractedErd, selectedSolution, navigate]);

  const handleBackToMenu = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <div style={{
      padding: '24px 24px 200px 24px',
      maxWidth: '1000px',
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: tokens.colorNeutralBackground1
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={handleBackToMenu}
          style={{ marginBottom: '16px' }}
        >
          Back to Menu
        </Button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <ArrowDownloadRegular fontSize={28} style={{ color: tokens.colorPaletteBlueForeground1 }} />
          <Text size={700} weight="bold">Solution to Mermaid</Text>
          <Badge appearance="filled" color="brand" size="small">BETA</Badge>
        </div>
        
        <Text size={400} style={{ color: tokens.colorNeutralForeground2 }}>
          Extract ERD diagrams from existing Dataverse solutions for documentation and analysis
        </Text>
      </div>

      {/* Solution Selection Section */}
      <Card style={{ marginBottom: '24px', minHeight: '500px' }}>
        <CardHeader
          header={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DatabaseRegular fontSize={20} />
              <Text weight="semibold">Select Dataverse Solution</Text>
            </div>
          }
          description="Choose a solution to extract entities from, or leave empty to extract all entities"
        />

        <CardPreview style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Solution Search/Selection */}
            <Field 
              label="Solution" 
              hint={selectedSolution ? `Extract entities from "${selectedSolution.friendlyname}" solution` : "Search and select a solution or leave empty to extract all entities"}
            >
              <div style={{ position: 'relative', width: '100%' }}>
                <Input
                  placeholder={solutionsLoading ? "Loading solutions..." : "Click to see all solutions or type to search..."}
                  value={selectedSolution ? 
                    `${selectedSolution.friendlyname} (${selectedSolution.uniquename})` 
                    : solutionSearchTerm
                  }
                  disabled={solutionsLoading || !!solutionsError || isExtracting}
                  onChange={(_, data) => {
                    if (!selectedSolution) {
                      setSolutionSearchTerm(data.value);
                      setShowSolutionDropdown(true);
                    }
                  }}
                  onFocus={() => {
                    if (selectedSolution) {
                      // Clear selection when focusing to allow new search
                      setSelectedSolution(null);
                      setSolutionSearchTerm('');
                    }
                    setShowSolutionDropdown(true);
                  }}
                  onBlur={() => {
                    // Delay hiding to allow click on dropdown items
                    setTimeout(() => setShowSolutionDropdown(false), 150);
                  }}
                  style={{ width: '100%' }}
                />
                
                {/* Dropdown results */}
                {!selectedSolution && showSolutionDropdown && solutionsToShow.length > 0 && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: tokens.colorNeutralBackground1,
                      border: `1px solid ${tokens.colorNeutralStroke1}`,
                      borderRadius: '4px',
                      boxShadow: tokens.shadow8,
                      maxHeight: '300px',
                      overflowY: 'auto',
                      zIndex: 1000,
                    }}
                  >
                    {/* All Entities Option */}
                    <div
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
                        backgroundColor: tokens.colorNeutralBackground1,
                      }}
                      onMouseDown={() => {
                        setSelectedSolution(null);
                        setSolutionSearchTerm('');
                        setShowSolutionDropdown(false);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = tokens.colorNeutralBackground1Hover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = tokens.colorNeutralBackground1;
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Text weight="semibold">All Entities</Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          Extract all entities from the environment (no solution filter)
                        </Text>
                      </div>
                    </div>
                    
                    {/* Solution Options */}
                    {solutionsToShow.map((solution) => (
                      <div
                        key={solution.uniquename}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
                          backgroundColor: tokens.colorNeutralBackground1,
                        }}
                        onMouseDown={() => {
                          setSelectedSolution(solution);
                          setSolutionSearchTerm('');
                          setShowSolutionDropdown(false);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = tokens.colorNeutralBackground1Hover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = tokens.colorNeutralBackground1;
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <Text weight="semibold">{solution.friendlyname}</Text>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                            {solution.uniquename} • Version {solution.version}
                          </Text>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* No results message */}
                {!selectedSolution && showSolutionDropdown && solutionSearchTerm && solutionsToShow.length === 0 && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: tokens.colorNeutralBackground1,
                      border: `1px solid ${tokens.colorNeutralStroke1}`,
                      borderRadius: '4px',
                      boxShadow: tokens.shadow8,
                      padding: '12px',
                      zIndex: 1000,
                    }}
                  >
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      No solutions found matching "{solutionSearchTerm}"
                    </Text>
                  </div>
                )}
              </div>
              
              {solutionsError && (
                <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, marginTop: '4px' }}>
                  Failed to load solutions: {solutionsError}
                </Text>
              )}
            </Field>

            {/* Extract Button */}
            <div style={{ paddingTop: '20px' }}>
              <Button
                appearance="primary"
                size="large"
                icon={isExtracting ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
                onClick={handleExtractSolution}
                disabled={isExtracting}
              >
                {isExtracting ? 'Extracting...' : 'Extract Solution'}
              </Button>
            </div>

            {/* Extraction Error */}
            {extractionError && (
              <div style={{ paddingTop: '12px' }}>
                <MessageBar intent="error">
                  <MessageBarBody>{extractionError}</MessageBarBody>
                </MessageBar>
              </div>
            )}
          </div>
        </CardPreview>
      </Card>

      {/* Preview Section */}
      {previewData && (
        <Card style={{ marginBottom: '24px' }}>
          <CardHeader
            header={<Text weight="semibold">Extraction Preview</Text>}
            description="Estimated data that will be extracted from your Dataverse environment"
          />
          <CardPreview style={{ padding: '16px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
              <div>
                <Text weight="semibold">Entities:</Text> {previewData.preview.estimatedEntities}
              </div>
              <div>
                <Text weight="semibold">Relationships:</Text> {previewData.preview.estimatedRelationships}
              </div>
            </div>
            
            <div style={{ marginTop: '12px' }}>
              <Text weight="semibold" style={{ marginBottom: '4px', display: 'block' }}>Features:</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {previewData.preview.supportedFeatures.map((feature: string, index: number) => (
                  <Badge key={index} appearance="tint" size="small">{feature}</Badge>
                ))}
              </div>
            </div>

            {previewData.preview.limitations && previewData.preview.limitations.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <Text weight="semibold" style={{ marginBottom: '4px', display: 'block' }}>Limitations:</Text>
                <div style={{ fontSize: '12px', color: tokens.colorNeutralForeground3 }}>
                  {previewData.preview.limitations.map((limitation: string, index: number) => (
                    <div key={index}>• {limitation}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Extract Button */}
            <div style={{ marginTop: '16px' }}>
              <Button
                appearance="primary"
                icon={isExtracting ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
                onClick={handleExtractSolution}
                disabled={connectionStatus !== 'success' || isExtracting}
                style={{ minWidth: '160px' }}
              >
                {isExtracting ? 'Extracting...' : 'Extract Solution'}
              </Button>
            </div>

            {/* Extraction Error */}
            {extractionError && (
              <MessageBar intent="error" style={{ marginTop: '12px' }}>
                <MessageBarBody>{extractionError}</MessageBarBody>
              </MessageBar>
            )}
          </CardPreview>
        </Card>
      )}

      {/* Results Section */}
      {extractedErd && (
        <Card>
          <CardHeader
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DocumentTextRegular fontSize={20} />
                <Text weight="semibold">Extracted Mermaid ERD</Text>
                <Badge appearance="filled" color="success" size="small">Complete</Badge>
              </div>
            }
            description="Your Dataverse solution has been successfully converted to Mermaid ERD format"
          />

          <CardPreview style={{ padding: '24px' }}>
            <Accordion multiple collapsible defaultOpenItems={["erd-content", "metadata"]}>
              
              {/* ERD Content */}
              <AccordionItem value="erd-content">
                <AccordionHeader>
                  <Text weight="semibold">Mermaid ERD Content</Text>
                </AccordionHeader>
                <AccordionPanel>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <Button
                        appearance="secondary"
                        icon={<CopyRegular />}
                        onClick={handleCopyToClipboard}
                      >
                        Copy to Clipboard
                      </Button>
                      <Button
                        appearance="secondary"
                        icon={<ArrowDownloadRegular />}
                        onClick={handleDownloadFile}
                      >
                        Download .mmd File
                      </Button>
                      <Button
                        appearance="primary"
                        icon={<CodeRegular />}
                        onClick={handleOpenInWizard}
                      >
                        Open in Wizard
                      </Button>
                    </div>
                    
                    <textarea
                      value={extractedErd}
                      readOnly
                      style={{ 
                        width: '100%', 
                        height: '2000px',
                        minHeight: '2000px',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        backgroundColor: tokens.colorNeutralBackground2,
                        resize: 'vertical',
                        overflow: 'auto',
                        boxSizing: 'border-box',
                        border: '1px solid ' + tokens.colorNeutralStroke1,
                        outline: 'none',
                        padding: '8px'
                      }}
                    />
                  </div>
                </AccordionPanel>
              </AccordionItem>

              {/* Metadata */}
              {extractionMetadata && (
                <AccordionItem value="metadata">
                  <AccordionHeader>
                    <Text weight="semibold">Extraction Metadata</Text>
                  </AccordionHeader>
                  <AccordionPanel>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr', 
                      gap: '12px',
                      fontSize: '14px'
                    }}>
                      <div>
                        <Text weight="semibold">Entities Extracted:</Text> {extractedErd.split('\n').filter(line => line.trim().startsWith('entity')).length}
                      </div>
                      <div>
                        <Text weight="semibold">Relationships Found:</Text> {extractedErd.split('\n').filter(line => line.includes('||') || line.includes('|o') || line.includes('o|')).length}
                      </div>
                      <div>
                        <Text weight="semibold">CDM Entities:</Text> {extractedErd.split('\n').filter(line => line.includes('%% CDM Entity')).length}
                      </div>
                      <div>
                        <Text weight="semibold">Custom Entities:</Text> {extractedErd.split('\n').filter(line => line.includes('%% Custom Entity')).length}
                      </div>
                      <div>
                        <Text weight="semibold">Publisher Prefix:</Text> {publisherPrefix || 'None detected'}
                      </div>
                    </div>

                    {extractionMetadata.processingTime && (
                      <div style={{ marginTop: '12px' }}>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                          Extraction completed in {extractionMetadata.processingTime}
                        </Text>
                      </div>
                    )}
                  </AccordionPanel>
                </AccordionItem>
              )}

            </Accordion>

            {/* Next Steps */}
            <div style={{ 
              marginTop: '24px',
              padding: '16px',
              backgroundColor: tokens.colorNeutralBackground3,
              borderRadius: '6px'
            }}>
              <Text weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
                Next Steps:
              </Text>
              <div style={{ fontSize: '14px', color: tokens.colorNeutralForeground2 }}>
                <div>• Copy the ERD content to your documentation or version control</div>
                <div>• Use the "Deploy Solution" feature to modify and redeploy</div>
                <div>• Share the visual diagram with your team for collaboration</div>
              </div>
            </div>
          </CardPreview>
        </Card>
      )}
    </div>
  );
};