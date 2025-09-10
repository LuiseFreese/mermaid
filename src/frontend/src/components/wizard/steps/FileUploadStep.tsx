import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  tokens,
  MessageBar,
  MessageBarBody,
  Input,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from '@fluentui/react-components';
import { DocumentRegular, DocumentArrowUpRegular } from '@fluentui/react-icons';
import mermaid from 'mermaid';
import { useWizardContext, Entity, Relationship, EntityAttribute } from '../../../context/WizardContext';
import styles from './FileUploadStep.module.css';

interface FileUploadStepProps {
  onFileUploaded?: (file: File, content: string) => void;
  onNext?: () => void;
}

export const FileUploadStep: React.FC<FileUploadStepProps> = ({
  onFileUploaded,
  onNext,
}) => {
  const { wizardData, updateWizardData } = useWizardContext();
  const {
    uploadedFile,
    cdmDetected, 
    detectedEntities, 
    entityChoice, 
    correctedErdContent, 
    fixedIssues,
    parsedEntities,
    parsedRelationships
  } = wizardData;

  const mermaidRef = useRef<HTMLDivElement>(null);

  // Initialize Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {
        // Simple, accessible blue theme
        primaryColor: '#e3f2fd',           // Very light blue for entity headers
        primaryBorderColor: '#0078d4',     // Your blue for borders
        lineColor: '#0078d4',              // Relationship lines in your blue
        
        // Keep colors neutral for readability
        secondaryColor: '#ffffff',         // White backgrounds
        tertiaryColor: '#f8f9fa',         // Very light gray
        background: '#ffffff',            // White diagram background
        
        // Text colors - all dark for readability
        primaryTextColor: '#323130',
        secondaryTextColor: '#323130',
        tertiaryTextColor: '#323130'
      }
    });
    
    // Force re-render of any existing diagrams after theme change
    setTimeout(() => {
      if (correctedErdContent) {
        renderMermaidDiagram();
      }
    }, 100);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file && file.name.endsWith('.mmd')) {
      const content = await file.text();
      
      console.log('🔍 DEBUG: File uploaded', {
        fileName: file.name,
        contentLength: content.length,
        contentPreview: content.substring(0, 200)
      });
      
      // Store original content
      updateWizardData({ originalErdContent: content, correctedErdContent: content });
      
      console.log('🔍 DEBUG: Updated wizard data with content');
      
      // CDM Detection Logic - matches backend list, only checks entity declarations
      const cdmEntities = [
        'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Incident',
        'Activity', 'Email', 'PhoneCall', 'Task', 'Appointment',
        'User', 'Team', 'BusinessUnit', 'SystemUser',
        'Product', 'PriceLevel', 'Quote', 'Order', 'Invoice',
        'Campaign', 'MarketingList', 'Competitor'
      ];
      
      // Only check entity names, not attribute names
      // Look for pattern: entityName { (with optional whitespace)
      const foundCdm = cdmEntities.some(entity => {
        // Match entity name followed by whitespace and opening brace (entity declaration)
        const regex = new RegExp(`\\b${entity}\\s*\\{`, 'i');
        return regex.test(content);
      });
      
      updateWizardData({ cdmDetected: foundCdm });
      if (foundCdm) {
        const detected = cdmEntities.filter(entity => {
          // Match entity name followed by whitespace and opening brace (entity declaration)
          const regex = new RegExp(`\\b${entity}\\s*\\{`, 'i');
          return regex.test(content);
        });
        updateWizardData({ detectedEntities: detected });
      }
      
      // Reset entity choice and fixes when new file is uploaded
      updateWizardData({ 
        entityChoice: null, 
        fixedIssues: new Set(),
        uploadedFile: file
      });
      
      onFileUploaded?.(file, content);
    } else {
      alert('Please select a .mmd file');
    }
  }, [onFileUploaded, updateWizardData]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleBrowseClick = useCallback(() => {
    const input = document.getElementById('file-input') as HTMLInputElement;
    input?.click();
  }, []);

  // Check which issues are still present - Dynamic detection based on actual content
  const hasStatusIssues = correctedErdContent.includes('string status') || correctedErdContent.includes('status ');
  const hasChoiceIssues = /\w+\s+(choice|category)\s+\w+/g.test(correctedErdContent);
  
  // Detect individual naming conflicts per entity - exclude CDM entities
  const namingConflicts = useMemo(() => {
    const conflicts: string[] = [];
    const cdmEntities = [
      'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Incident',
      'Activity', 'Email', 'PhoneCall', 'Task', 'Appointment',
      'User', 'Team', 'BusinessUnit', 'SystemUser',
      'Product', 'PriceLevel', 'Quote', 'Order', 'Invoice',
      'Campaign', 'MarketingList', 'Competitor'
    ];
    
    const entityMatches = correctedErdContent.match(/(\w+)\s*\{[^}]*\}/g);
    if (entityMatches) {
      entityMatches.forEach(entityMatch => {
        const nameMatch = entityMatch.match(/(\w+)\s*\{/);
        if (nameMatch) {
          const entityName = nameMatch[1];
          
          // Skip CDM entities - they are untouchable
          const isCdmEntity = cdmEntities.some(cdmEntity => 
            cdmEntity.toLowerCase() === entityName.toLowerCase()
          );
          
          if (!isCdmEntity) {
            // Check if this entity has a non-PK column named 'name'
            if (entityMatch.match(/string\s+name(?!\w)/) && !entityMatch.match(/string\s+name\s+PK/)) {
              conflicts.push(entityName);
            }
          }
        }
      });
    }
    return conflicts;
  }, [correctedErdContent]);
  
  const hasNamingIssues = namingConflicts.length > 0;

  const applyChoiceColumnFix = useCallback(() => {
    let updatedContent = correctedErdContent;
    console.log('Before choice fix:', updatedContent);
    
    // Remove all choice and category columns from all entities
    // Updated regex to match both formats: "choice columnname" and "type choice columnname"
    updatedContent = updatedContent.replace(/^\s*(\w+\s+)?(choice|category)\s+\w+.*$/gm, '');
    
    console.log('After choice fix:', updatedContent);
    updateWizardData({ 
      correctedErdContent: updatedContent,
      fixedIssues: new Set([...fixedIssues, 'choice-columns'])
    });
  }, [correctedErdContent, fixedIssues, updateWizardData]);

  // Individual naming conflict fixes
  const applyNamingConflictFixForEntity = useCallback((entityName: string) => {
    let updatedContent = correctedErdContent;
    console.log(`Before naming fix for ${entityName}:`, updatedContent);
    
    // Fix naming conflict for specific entity
    const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*?)\\s+string\\s+name`, 'gs');
    updatedContent = updatedContent.replace(entityPattern, `$1 string ${entityName.toLowerCase()}_name`);
    
    console.log(`After naming fix for ${entityName}:`, updatedContent);
    updateWizardData({ 
      correctedErdContent: updatedContent,
      fixedIssues: new Set([...fixedIssues, `naming-conflicts-${entityName}`])
    });
  }, [correctedErdContent, fixedIssues, updateWizardData]);

  const applyAllFixes = useCallback(() => {
    let updatedContent = correctedErdContent;
    
    // Apply all fixes in sequence
    // Remove choice and category columns from any entity (if needed)
    if (hasChoiceIssues) {
      updatedContent = updatedContent.replace(/^\s*\w+\s+(choice|category)\s+\w+.*$/gm, '');
    }
    
    // Fix naming conflicts for all entities with conflicts
    if (hasNamingIssues) {
      namingConflicts.forEach(entityName => {
        const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*?)\\s+string\\s+name`, 'gs');
        updatedContent = updatedContent.replace(entityPattern, `$1 string ${entityName.toLowerCase()}_name`);
      });
    }
    
    updateWizardData({ 
      correctedErdContent: updatedContent,
      fixedIssues: new Set(['naming-conflicts', 'choice-columns'])
    });
  }, [correctedErdContent, updateWizardData, hasChoiceIssues, hasNamingIssues, namingConflicts]);

  // Parse ERD content to extract entities and relationships
  const parseErdContent = useCallback((content: string) => {
    if (!content) return { entities: [], relationships: [] };

    const entities: Entity[] = [];
    const relationships: Relationship[] = [];

    // Parse entities
    const entityMatches = content.match(/(\w+)\s*\{[^}]*\}/g);
    if (entityMatches) {
      entityMatches.forEach(entityMatch => {
        const nameMatch = entityMatch.match(/(\w+)\s*\{/);
        if (nameMatch) {
          const entityName = nameMatch[1];
          const attributes: EntityAttribute[] = [];
          
          // Parse attributes - Updated to handle ERD format properly
          const attributeLines = entityMatch.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.includes('{') && !line.includes('}'));
          
          attributeLines.forEach(line => {
            // Match ERD format: type name constraint "description"
            const attrMatch = line.match(/^(\w+)\s+(\w+)(?:\s+(PK|FK))?(?:\s+"[^"]*")?(?:\s+.*)?$/);
            if (attrMatch) {
              attributes.push({
                type: attrMatch[1],
                name: attrMatch[2],
                constraint: attrMatch[3] || undefined
              });
            }
          });

          // Check if it's a CDM entity - matches backend list with exact name matching
          const cdmEntities = [
            'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Incident',
            'Activity', 'Email', 'PhoneCall', 'Task', 'Appointment',
            'User', 'Team', 'BusinessUnit', 'SystemUser',
            'Product', 'PriceLevel', 'Quote', 'Order', 'Invoice',
            'Campaign', 'MarketingList', 'Competitor'
          ];
          // Exact case-insensitive name match for entity names
          const isCdm = cdmEntities.some(cdmEntity => 
            cdmEntity.toLowerCase() === entityName.toLowerCase()
          );

          entities.push({
            name: entityName,
            attributes,
            isCdm
          });
        }
      });
    }

    // Parse relationships - Handle multiple ERD relationship formats
    const relationshipSet = new Set(); // Prevent duplicates
    const relationshipPatterns = [
      { pattern: /(\w+)\s*\|\|--o\{\s*(\w+)\s*:\s*(.+)/g, type: 'One-to-Many' },  // One-to-many with label
      { pattern: /(\w+)\s*\|\|--\|\|\s*(\w+)\s*:\s*(.+)/g, type: 'One-to-One' }, // One-to-one with label
      { pattern: /(\w+)\s*\}o--o\{\s*(\w+)\s*:\s*(.+)/g, type: 'Many-to-Many' },   // Many-to-many with label
      { pattern: /(\w+)\s*\|\|--o\{\s*(\w+)/g, type: 'One-to-Many' },             // One-to-many without label
      { pattern: /(\w+)\s*\|\|--\|\|\s*(\w+)/g, type: 'One-to-One' },            // One-to-one without label
      { pattern: /(\w+)\s*\}o--o\{\s*(\w+)/g, type: 'Many-to-Many' },               // Many-to-many without label
      { pattern: /(\w+)\s*--\s*(\w+)/g, type: 'Related' }                     // Simple relationship (lowest priority)
    ];

    relationshipPatterns.forEach(({ pattern, type }) => {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches) {
        if (match.length >= 3) {
          const from = match[1];
          const to = match[2];
          const label = match[3] || '';
          
          // Create unique key to prevent duplicates
          const relationshipKey = `${from}->${to}`;
          
          if (!relationshipSet.has(relationshipKey)) {
            relationshipSet.add(relationshipKey);
            relationships.push({
              from,
              to,
              type,
              label: label.trim()
            });
          }
        }
      }
    });

    return { entities, relationships };
  }, []);

  // Save parsed entities and relationships to wizard context whenever corrected content changes
  useEffect(() => {
    if (correctedErdContent) {
      const { entities, relationships } = parseErdContent(correctedErdContent);
      updateWizardData({ 
        parsedEntities: entities,
        parsedRelationships: relationships
      });
    }
  }, [correctedErdContent, parseErdContent, updateWizardData]);

  // Render Mermaid diagram
  const renderMermaidDiagram = useCallback(async () => {
    console.log('🔍 DEBUG: renderMermaidDiagram called', {
      hasMermaidRef: !!mermaidRef.current,
      correctedErdContent,
      contentLength: correctedErdContent?.length
    });
    
    if (!correctedErdContent) {
      console.log('🔍 DEBUG: No content to render');
      return;
    }

    // Retry mechanism for when DOM element isn't ready yet
    let retryCount = 0;
    const maxRetries = 20; // Increased retries
    const retryDelay = 200; // Increased delay

    const attemptRender = async () => {
      console.log(`🔍 DEBUG: Attempt ${retryCount + 1}, mermaidRef.current:`, !!mermaidRef.current);
      
      if (mermaidRef.current) {
        try {
          // Clear previous content
          mermaidRef.current.innerHTML = '';
          
          console.log('🔍 DEBUG: About to render Mermaid diagram with content:', correctedErdContent);
          
          // Generate unique ID for this diagram
          const id = `mermaid-diagram-${Date.now()}`;
          
          // Render the diagram
          const { svg } = await mermaid.render(id, correctedErdContent);
          console.log('🔍 DEBUG: Mermaid render successful, SVG length:', svg?.length);
          mermaidRef.current.innerHTML = svg;
        } catch (error) {
          console.error('Error rendering Mermaid diagram:', error);
          mermaidRef.current.innerHTML = '<p style="color: red;">Error rendering diagram: ' + (error instanceof Error ? error.message : String(error)) + '</p>';
        }
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`🔍 DEBUG: Mermaid ref not ready, retrying ${retryCount}/${maxRetries} in ${retryDelay}ms`);
          setTimeout(attemptRender, retryDelay);
        } else {
          console.log('🔍 DEBUG: Max retries reached, mermaid ref still not available');
        }
      }
    };

    await attemptRender();
  }, [correctedErdContent]);

  // Re-render diagram when content changes
  useEffect(() => {
    if (correctedErdContent) {
      renderMermaidDiagram();
    }
  }, [correctedErdContent, renderMermaidDiagram]);

  return (
    <Card style={{
      boxShadow: tokens.shadow4,
    }}>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <DocumentArrowUpRegular style={{ fontSize: '20px', color: tokens.colorBrandBackground }} />
            <Text className={styles.uploadHeader}>Upload your ERD file</Text>
          </div>
        }
        description={
          <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
            Upload your Mermaid ERD file to begin the conversion process. We support .mmd files with entity relationship diagrams.
          </Text>
        }
      />
      
      <CardPreview>
        <div style={{ padding: '24px' }}>
          
          {/* Input Section */}
          <Accordion multiple collapsible defaultOpenItems={["input-section"]} className={styles.schemaAccordion}>
            <AccordionItem value="input-section">
              <AccordionHeader>
                <Text className={styles.accordionHeaderText}>
                  Input
                </Text>
              </AccordionHeader>
              <AccordionPanel>
                {/* File Upload Section */}
                <div className={styles.fileUploadSection}>
                  <Text className={styles.fileUploadLabel}>Choose ERD File</Text>
                  <div className={styles.fileInputContainer}>
                    <Input
                      placeholder={uploadedFile ? uploadedFile.name : "No file selected"}
                      value={uploadedFile ? uploadedFile.name : ""}
                      readOnly
                      contentBefore={<DocumentRegular />}
                      className={styles.fileInputField}
                    />
                    <Button 
                      data-testid="upload-trigger"
                      appearance="primary"
                      onClick={handleBrowseClick}
                      className={styles.fileUploadButtonPrimary}
                    >
                      Browse
                    </Button>
                  </div>
                  {!uploadedFile && (
                    <Text size={200} style={{ 
                      color: tokens.colorNeutralForeground3,
                      marginTop: '8px',
                      display: 'block' 
                    }}>
                      Example: cdm-mixed-advanced.mmd
                    </Text>
                  )}
                </div>

                {uploadedFile && (
                  /* Compact Success State */
                  <MessageBar intent="success" className={styles.messageBarSpacing}>
                    <MessageBarBody>
                      File uploaded successfully! {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                    </MessageBarBody>
                  </MessageBar>
                )}

                {/* CDM Detection and Choice */}
                {uploadedFile && cdmDetected && (
                  <div style={{ marginBottom: '16px' }}>
                    <MessageBar intent="success" style={{ marginBottom: '16px' }}>
                      <MessageBarBody>
                        CDM entities detected: {detectedEntities.join(', ')}
                      </MessageBarBody>
                    </MessageBar>
                    
                    {!entityChoice && (
                      <div className={styles.cdmDetectionContainer}>
                        <Text className={styles.cdmDetectionHeading}>
                          Choose entity type
                        </Text>
                        <Text className={styles.cdmDetectionText}>
                          We detected Common Data Model (CDM) entities in your ERD. CDM entities provide standardized 
                          schemas, built-in business logic, and seamless integration with Microsoft business applications 
                          in Dynamics 365 and Power Platform.
                        </Text>
                        
                        <div className={styles.cdmChoiceContainer}>
                          <Button 
                            appearance="primary"
                            onClick={() => updateWizardData({ entityChoice: 'cdm' })}
                            className={styles.cdmChoiceButton}
                          >
                            Use CDM entities
                          </Button>
                          <Button 
                            appearance="secondary"
                            onClick={() => updateWizardData({ entityChoice: 'custom' })}
                            className={styles.cdmChoiceButton}
                          >
                            Create custom entities
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {entityChoice && (
                      <div>
                        {entityChoice === 'cdm' ? (
                          <div>
                            {/* CDM Integration Successful */}
                            <MessageBar intent="success" className={styles.messageBarSpacing}>
                              <MessageBarBody>
                                CDM entities selected successfully! Using existing Dataverse entities.
                                <Button 
                                  appearance="transparent" 
                                  onClick={() => updateWizardData({ entityChoice: null })}
                                  className={styles.fileUploadButtonTransparent}
                                >
                                  Change
                                </Button>
                              </MessageBarBody>
                            </MessageBar>
                          </div>
                        ) : (
                          <MessageBar 
                            intent="info"
                            className={styles.messageBarSpacing}
                          >
                            <MessageBarBody>
                              <strong>Creating custom entities for:</strong> {detectedEntities.join(', ')}
                              <Button 
                                appearance="transparent" 
                                onClick={() => updateWizardData({ entityChoice: null })}
                                className={styles.fileUploadButtonTransparent}
                              >
                                Change
                              </Button>
                            </MessageBarBody>
                          </MessageBar>
                        )}
                        
                        {/* Legacy Validation Warnings - Stacked Vertically */}
                        {entityChoice === 'custom' && (
                          <MessageBar intent="warning" className={styles.messageBarSpacing}>
                            <MessageBarBody>
                              <strong>Missing Primary Key:</strong> Some entities may be missing primary keys.<br />
                              Add a primary key attribute using "PK" notation to ensure proper table structure.
                            </MessageBarBody>
                          </MessageBar>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <input
                  id="file-input"
                  type="file"
                  accept=".mmd"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
              </AccordionPanel>
            </AccordionItem>
          </Accordion>

          {/* Only show remaining sections after CDM choice is made or no CDM detected */}
          {uploadedFile && (entityChoice || !cdmDetected) && (
            <>
              {/* Validation Results Section */}
              <Accordion multiple collapsible defaultOpenItems={["validation-results"]} className={styles.schemaAccordion}>
                <AccordionItem value="validation-results">
                  <AccordionHeader>
                    <Text className={styles.accordionHeaderText}>
                      Validation results
                    </Text>
                  </AccordionHeader>
                  <AccordionPanel>
                {/* ERD Structure Needs Attention - Only show if there are issues */}
                {(hasChoiceIssues || hasNamingIssues) ? (
                  <MessageBar intent="warning" className={styles.validationMessageBar}>
                    <MessageBarBody>
                      ERD structure needs attention<br />
                      Your ERD structure is valid but has issues that should be addressed before deployment.
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <MessageBar intent="success" className={styles.validationMessageBar}>
                    <MessageBarBody>
                      <strong>ERD validation complete</strong><br />
                      Your ERD structure looks good! No issues found.
                    </MessageBarBody>
                  </MessageBar>
                )}

                {/* Status Column Warnings */}
                {hasStatusIssues && (
                  <>
                    <MessageBar intent="info" className={styles.validationMessageBar}>
                      <MessageBarBody>
                        <strong>Entity 'Event' contains 'status' columns which will be ignored. Dataverse provides built-in status functionality via statecode/statuscode.</strong><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Entity: Event
                        </Text><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          If you want custom status options, you'll need to manually create choice columns in Dataverse after deployment. You can use the global choices feature to sync predefined choice sets to your manually created choice columns.
                        </Text>
                      </MessageBarBody>
                    </MessageBar>

                    <MessageBar intent="info" className={styles.validationMessageBar}>
                      <MessageBarBody>
                        <strong>Entity 'Location' contains 'status' columns which will be ignored. Dataverse provides built-in status functionality via statecode/statuscode.</strong><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Entity: Location
                        </Text><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          If you want custom status options, you'll need to manually create choice columns in Dataverse after deployment. You can use the global choices feature to sync predefined choice sets to your manually created choice columns.
                        </Text>
                      </MessageBarBody>
                    </MessageBar>

                    <MessageBar intent="info" className={styles.validationMessageBar}>
                      <MessageBarBody>
                        <strong>Entity 'EventAttendee' contains 'status' columns which will be ignored. Dataverse provides built-in status functionality via statecode/statuscode.</strong><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Entity: EventAttendee
                        </Text><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          If you want custom status options, you'll need to manually create choice columns in Dataverse after deployment. You can use the global choices feature to sync predefined choice sets to your manually created choice columns.
                        </Text>
                      </MessageBarBody>
                    </MessageBar>
                  </>
                )}

                {/* Choice Column Issues */}
                {hasChoiceIssues && (
                  <>
                    <MessageBar intent="warning" className={styles.validationMessageBar}>
                      <MessageBarBody>
                        <strong>Entity contains 'choice' or 'category' columns which cannot be automatically created. These columns will be ignored during deployment.</strong><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Entities with choice/category columns detected
                        </Text><br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Mermaid ERD diagrams cannot define choice column options. You'll need to manually create these choice columns in Dataverse after deployment. You can use the global choices feature to sync predefined choice sets to your manually created choice columns. You can automatically fix this below.
                        </Text>
                      </MessageBarBody>
                    </MessageBar>
                  </>
                )}

                {/* Naming Conflicts */}
                {hasNamingIssues && (
                  <>
                    <MessageBar intent="warning" className={styles.validationMessageBar}>
                      <MessageBarBody>
                        <strong>Naming conflict</strong><br />
                        Entity 'Event' has a non-primary column called 'name'. This will conflict with the auto-generated primary name column in Dataverse.<br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Suggestion:
                        </Text> <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Consider renaming the column to something like 'event_name', 'display_name', or 'title'. You can automatically fix this below.
                        </Text>
                      </MessageBarBody>
                    </MessageBar>

                    <MessageBar intent="warning" className={styles.validationMessageBar}>
                      <MessageBarBody>
                        <strong>Naming conflict</strong><br />
                        Entity 'Location' has a non-primary column called 'name'. This will conflict with the auto-generated primary name column in Dataverse.<br />
                        <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Suggestion:
                        </Text> <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                          Consider renaming the column to something like 'location_name', 'display_name', or 'title'. You can automatically fix this below.
                        </Text>
                      </MessageBarBody>
                    </MessageBar>
                  </>
                )}

                {/* Suggested Corrections Section - Only show if there are issues */}
                {(hasNamingIssues || hasChoiceIssues) && (
                  <>
                    <Text className={styles.validationResultsHeading}>
                      Suggested corrections
                    </Text>

                    <div className={styles.correctionComparisonContainer}>
                            {/* Choice Column Correction */}
                            {hasChoiceIssues && (
                              <div className={styles.correctionItem}>
                                <div className={styles.correctionHeader}>
                                  <Text className={styles.correctionTitle}>Remove choice/category columns</Text>
                                  <Button 
                                    appearance="secondary"
                                    size="small"
                                    className={styles.fixButton}
                                    onClick={applyChoiceColumnFix}
                                  >
                                    Fix this
                                  </Button>
                                </div>
                                <div className={styles.comparisonGrid}>
                                  <div className={styles.originalColumn}>
                                    <Text className={styles.columnHeader}>
                                      Original ERD
                                    </Text>
                                    <div className={styles.codeBlock}>
                                      <Text className={styles.codeText}>
                                        Event {`{`}<br />
                                        &nbsp;&nbsp;string id PK<br />
                                        &nbsp;&nbsp;string name<br />
                                        &nbsp;&nbsp;<span className={styles.highlightError}>choice priority</span><br />
                                        {`}`}
                                      </Text>
                                    </div>
                                  </div>
                                  <div className={styles.correctedColumn}>
                                    <Text className={styles.columnHeader}>
                                      Corrected ERD
                                    </Text>
                                    <div className={styles.codeBlock}>
                                      <Text className={styles.codeText}>
                                        Event {`{`}<br />
                                        &nbsp;&nbsp;string id PK<br />
                                        &nbsp;&nbsp;string name<br />
                                        &nbsp;&nbsp;<span className={styles.highlightSuccess}>// choice columns created manually in Dataverse</span><br />
                                        {`}`}
                                      </Text>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Individual Naming Conflict Corrections */}
                            {namingConflicts.map((entityName) => (
                              <div key={entityName} className={styles.correctionItem}>
                                <div className={styles.correctionHeader}>
                                  <Text className={styles.correctionTitle}>Fix naming conflict in {entityName}</Text>
                                  <Button 
                                    appearance="secondary"
                                    size="small"
                                    className={styles.fixButton}
                                    onClick={() => applyNamingConflictFixForEntity(entityName)}
                                  >
                                    Fix this
                                  </Button>
                                </div>
                                <div className={styles.comparisonGrid}>
                                  <div className={styles.originalColumn}>
                                    <Text className={styles.columnHeader}>
                                      Original ERD
                                    </Text>
                                    <div className={styles.codeBlock}>
                                      <Text className={styles.codeText}>
                                        {entityName} {`{`}<br />
                                        &nbsp;&nbsp;string id PK<br />
                                        &nbsp;&nbsp;<span className={styles.highlightError}>string name</span><br />
                                        &nbsp;&nbsp;...<br />
                                        {`}`}
                                      </Text>
                                    </div>
                                  </div>
                                  <div className={styles.correctedColumn}>
                                    <Text className={styles.columnHeader}>
                                      Corrected ERD
                                    </Text>
                                    <div className={styles.codeBlock}>
                                      <Text className={styles.codeText}>
                                        {entityName} {`{`}<br />
                                        &nbsp;&nbsp;string id PK<br />
                                        &nbsp;&nbsp;<span className={styles.highlightSuccess}>string {entityName.toLowerCase()}_name</span><br />
                                        &nbsp;&nbsp;...<br />
                                        {`}`}
                                      </Text>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {(hasChoiceIssues || hasNamingIssues) && (
                            <div className={styles.fixAllContainer}>
                              <Button 
                                appearance="primary"
                                className={styles.fixAllButton}
                                onClick={applyAllFixes}
                              >
                                Fix All Issues
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                          </AccordionPanel>
                        </AccordionItem>
                      </Accordion>

                      {/* Only show Complete ERD, ERD Diagram and Parsed Schema Overview when there are no validation issues */}
                      {!hasChoiceIssues && !hasNamingIssues && (
                        <>
                          {/* Complete ERD Display */}
                          <Accordion multiple collapsible defaultOpenItems={["complete-erd"]} className={styles.schemaAccordion}>
                            <AccordionItem value="complete-erd">
                              <AccordionHeader>
                                <Text className={styles.accordionHeaderText}>
                                  Complete ERD
                                </Text>
                              </AccordionHeader>
                              <AccordionPanel>
                                <div className={styles.erdCodeBlock}>
                                  <pre className={styles.erdCodeText}>
                                    {correctedErdContent || 'No ERD content available'}
                                  </pre>
                                </div>
                              </AccordionPanel>
                            </AccordionItem>
                          </Accordion>
                          {/* Mermaid Diagram */}
                          <Accordion multiple collapsible defaultOpenItems={["erd-diagram"]} className={styles.schemaAccordion}>
                            <AccordionItem value="erd-diagram">
                              <AccordionHeader>
                                <Text className={styles.accordionHeaderText}>
                                  ERD Diagram
                                </Text>
                              </AccordionHeader>
                              <AccordionPanel>
                                <div 
                                  ref={mermaidRef} 
                                  className={styles.mermaidDiagram}
                                />
                              </AccordionPanel>
                            </AccordionItem>
                          </Accordion>

                          {/* Parsed Schema Overview */}
                          <Accordion multiple collapsible defaultOpenItems={["parsed-schema-overview"]} className={styles.schemaAccordion}>
                        <AccordionItem value="parsed-schema-overview">
                          <AccordionHeader>
                            <Text className={styles.accordionHeaderText}>
                              Parsed Schema Overview
                            </Text>
                          </AccordionHeader>
                          <AccordionPanel>
                            <Text className={styles.schemaOverviewDescription}>
                              Here's what the parser understood from your ERD. Review this to ensure all entities, attributes, and relationships are correctly interpreted:
                            </Text>

                            <Accordion multiple collapsible defaultOpenItems={["cdm-integration", "custom-tables", "relationships"]} className={styles.schemaAccordion}>
                        {/* CDM Integration Section */}
                        {parsedEntities.filter(e => e.isCdm).length > 0 && (
                          <AccordionItem value="cdm-integration">
                            <AccordionHeader>
                              <Text className={styles.accordionHeaderText}>
                                CDM Integration ({parsedEntities.filter(e => e.isCdm).length} entities)
                              </Text>
                            </AccordionHeader>
                            <AccordionPanel>
                              <div className={styles.accordionContent}>
                                {parsedEntities.filter(e => e.isCdm).map(entity => (
                                  <div key={entity.name} className={styles.entityCard}>
                                    <div className={styles.entityHeader}>
                                      <Text className={styles.entityName}>{entity.name}</Text>
                                      <div className={styles.entityBadge}>
                                        <span className={styles.cdmBadge}>CDM</span>
                                        <span className={styles.attributeCount}>(0+ standard CDM attributes)</span>
                                      </div>
                                    </div>
                                    <div className={styles.entityDescription}>
                                      <Text className={styles.cdmDescription}>Standard {entity.name} entity with built-in attributes and relationships</Text>
                                    </div>
                                   
                                  </div>
                                ))}
                              </div>
                            </AccordionPanel>
                          </AccordionItem>
                        )}

                        {/* Custom Tables Section */}
                        {parsedEntities.filter(e => !e.isCdm).length > 0 && (
                          <AccordionItem value="custom-tables">
                            <AccordionHeader>
                              <Text className={styles.accordionHeaderText}>
                                Custom Tables ({parsedEntities.filter(e => !e.isCdm).length} entities)
                              </Text>
                            </AccordionHeader>
                            <AccordionPanel>
                              <div className={styles.accordionContent}>
                                {parsedEntities.filter(e => !e.isCdm).map(entity => (
                                  <div key={entity.name} className={styles.entityCard}>
                                    <div className={styles.entityHeader}>
                                      <Text className={styles.entityName}>{entity.name}</Text>
                                      <div className={styles.entityBadge}>
                                        <span className={styles.customBadge}>CUSTOM</span>
                                        <span className={styles.attributeCount}>({entity.attributes?.length || 0} attributes)</span>
                                      </div>
                                    </div>
                                    <div className={styles.attributeList}>
                                      {entity.attributes?.map((attr, index) => (
                                        <div key={index} className={styles.attribute}>
                                          {typeof attr === 'object' && attr.constraint ? (
                                            <span className={styles.attributeLabel}>{attr.constraint}</span>
                                          ) : (
                                            <span></span>
                                          )}
                                          <span className={styles.attributeName}>
                                            {typeof attr === 'string' ? attr : attr.name}
                                          </span>
                                          <span className={styles.attributeType}>
                                            {typeof attr === 'string' ? 'string' : attr.type}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </AccordionPanel>
                          </AccordionItem>
                        )}

                        {/* Relationships Section */}
                        {parsedRelationships.length > 0 && (
                          <AccordionItem value="relationships">
                            <AccordionHeader>
                              <Text className={styles.accordionHeaderText}>
                                Relationships ({parsedRelationships.length} relationships)
                              </Text>
                            </AccordionHeader>
                            <AccordionPanel>
                              <div className={styles.accordionContent}>
                                {parsedRelationships.map((rel, index) => (
                                  <div key={index} className={styles.entityCard}>
                                    <div className={styles.relationshipContent}>
                                      <Text className={styles.relationshipTitle}>
                                        {rel.from} → {rel.to}
                                      </Text>
                                      <Text className={styles.relationshipDetails}>
                                        {rel.type} {rel.label}
                                      </Text>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </AccordionPanel>
                          </AccordionItem>
                        )}
                      </Accordion>
                          </AccordionPanel>
                        </AccordionItem>
                      </Accordion>
                        </>
                      )}
            </>
          )}

          {/* Next Button - Always visible, enabled when all conditions are met */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: `1px solid ${tokens.colorNeutralStroke2}`
          }}>
            <Button 
              appearance="primary"
              size="large"
              className={styles.nextButton}
              disabled={!uploadedFile || !(entityChoice || !cdmDetected) || hasNamingIssues || hasChoiceIssues}
              onClick={onNext}
            >
              Next: Solution & Publisher
            </Button>
          </div>
        </div>
      </CardPreview>
    </Card>
  );
};
