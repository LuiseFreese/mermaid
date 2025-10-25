import React, { useCallback, useState } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  tokens,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from '@fluentui/react-components';
import { DocumentArrowUpRegular } from '@fluentui/react-icons';
import { useWizardContext } from '../../../context/WizardContext';
import { useTheme } from '../../../context/ThemeContext';
// import { ApiService } from '../../../services/apiService';
import styles from './FileUploadStep.module.css';
import { ImportSourceSelector, ImportSource } from './file-upload/ImportSourceSelector';
import { FileUpload } from './file-upload/FileUpload';
import { DataverseImport } from './file-upload/DataverseImport';
import { CDMDetectionCard } from './file-upload/components/CDMDetectionCard';
import { ValidationResultsDisplay } from './file-upload/components/ValidationResultsDisplay';
import { ERDDiagramDisplay } from './file-upload/components/ERDDiagramDisplay';
import { detectCDMEntities } from './file-upload/utils/cdmDetectionHandler';
import { useFileValidation } from './file-upload/hooks/useFileValidation';
import { useERDEditor } from './file-upload/hooks/useERDEditor';

interface FileUploadStepProps {
  onFileUploaded?: (file: File, content: string) => void;
  onNext?: () => void;
}

export const FileUploadStep: React.FC<FileUploadStepProps> = ({
  onFileUploaded,
  onNext,
}) => {
  const { wizardData, updateWizardData } = useWizardContext();
  const { effectiveTheme } = useTheme();
  const [selectedImportSource, setSelectedImportSource] = useState<ImportSource | null>(null);

  const {
    uploadedFile,
    cdmDetected,
    detectedEntities,
    entityChoice,
    correctedErdContent,
    originalErdContent,
    fixedIssues = new Set(),
    parsedEntities = [],
    parsedRelationships = [],
    importSource,
    validationResults
  } = wizardData;

  // Ensure parsedEntities and parsedRelationships are always arrays
  const safeEntities = Array.isArray(parsedEntities) ? parsedEntities : [];
  const safeRelationships = Array.isArray(parsedRelationships) ? parsedRelationships : [];

  // Use validation hook
  const {
    isValidating,
    validationError,
    hasBackendWarnings,
    hasAnyIssues,
    validateFile,
    handleBackendWarningFix,
    applyAllFixes,
    setValidationError
  } = useFileValidation({
    originalErdContent,
    correctedErdContent,
    uploadedFile,
    entityChoice,
    validationResults,
    fixedIssues,
    onValidationComplete: (results) => {
      updateWizardData({
        correctedErdContent: results.correctedERD || originalErdContent,
        parsedEntities: results.entities || [],
        parsedRelationships: results.relationships || [],
        validationResults: results
      });
    },
    onContentUpdate: (content) => {
      updateWizardData({ correctedErdContent: content });
    },
    onFixedIssuesUpdate: (issues) => {
      updateWizardData({ fixedIssues: issues });
    }
  });

  // Use ERD editor hook
  const erdEditor = useERDEditor({
    correctedErdContent,
    uploadedFile,
    importSource: importSource as string | null,
    entityChoice,
    onContentUpdate: (content) => {
      updateWizardData({ correctedErdContent: content });
    },
    onValidationComplete: (results) => {
      updateWizardData({
        correctedErdContent: results.correctedERD || correctedErdContent,
        parsedEntities: results.entities || [],
        parsedRelationships: results.relationships || [],
        validationResults: results
      });
    },
    onValidationError: (error) => {
      setValidationError(error);
    }
  });

  // Handle Dataverse import completion
  const handleImportCompleted = useCallback(async (content: string, metadata?: any) => {
    // Debounce to prevent multiple rapid calls
    if (content === lastImportContentRef.current) {
      console.log('� DEBUG: Duplicate import detected, skipping');
      return;
    }
    
    lastImportContentRef.current = content;
    
    // Clear any existing timeout
    if (importTimeoutRef.current) {
      clearTimeout(importTimeoutRef.current);
    }
    
    // Debounce the import processing
    importTimeoutRef.current = setTimeout(async () => {
      console.log('�🔍 DEBUG: Import completed', {
        contentLength: content.length,
        hasMetadata: !!metadata,
        entityChoice: metadata?.entityChoice,
        cdmDetected: metadata?.cdmDetected,
        entitiesCount: metadata?.entities?.length
      });

      setValidationError(null);

      try {
        const virtualFile = new File([content], 'dataverse-import.mmd', { type: 'text/plain' });

        // Call validation to parse entities and relationships
      console.log('🔍 DEBUG: Validating Dataverse import...');
      const validationResults = await validateFile({
        name: virtualFile.name,
        content,
        size: virtualFile.size,
        lastModified: virtualFile.lastModified
      }, metadata?.entityChoice || null);

      updateWizardData({
        correctedErdContent: content,
        originalErdContent: content,
        parsedEntities: validationResults.entities || [],
        parsedRelationships: validationResults.relationships || [],
        cdmDetected: metadata?.cdmDetected || false,
        detectedEntities: metadata?.detectedEntities || [],
        entityChoice: metadata?.entityChoice || null,
        uploadedFile: virtualFile,
        importSource: selectedImportSource || 'dataverse'
      });

      if (selectedImportSource === 'dataverse') {
        onFileUploaded?.(virtualFile, content);
      }
    } catch (error) {
      console.error('Import processing error:', error);
      setValidationError(error instanceof Error ? error.message : 'Import processing failed');
    }
  }, [updateWizardData, onFileUploaded, selectedImportSource, setValidationError, validateFile]);

  // Handle CDM choice selection
  const handleCDMChoice = useCallback(async (choice: 'cdm' | 'custom') => {
    console.log('🔘 DEBUG: CDM choice selected:', choice);

    updateWizardData({ entityChoice: choice });

    // For file uploads, trigger validation now that we have the entity choice
    if (importSource === 'file' && uploadedFile && originalErdContent) {
      console.log('🔘 DEBUG: File upload - triggering validation with entity choice:', choice);

      try {
        const validationResult = await validateFile({
          name: uploadedFile.name,
          content: originalErdContent,
          size: uploadedFile.size,
          lastModified: uploadedFile.lastModified
        }, choice);

        // Mark entities with CDM flag based on choice
        const updatedEntities = validationResult.entities?.map((entity: any) => ({
          ...entity,
          isCdm: choice === 'cdm' && detectedEntities?.includes(entity.name)
        })) || [];

        console.log('✅ DEBUG: Validation completed after CDM choice', {
          correctedERD: !!validationResult.correctedERD,
          entitiesCount: updatedEntities.length,
          relationshipsCount: validationResult.relationships?.length || 0
        });

        updateWizardData({
          correctedErdContent: validationResult.correctedERD || originalErdContent,
          parsedEntities: updatedEntities,
          parsedRelationships: validationResult.relationships || [],
          validationResults: validationResult
        });
      } catch (error) {
        console.error('Validation error:', error);
        setValidationError(error instanceof Error ? error.message : 'Validation failed');
      }
    } else if (safeEntities.length > 0) {
      // For Dataverse imports or already validated files, just update entity flags
      console.log('🔘 DEBUG: Updating existing parsedEntities with CDM flags', {
        safeEntitiesCount: safeEntities.length,
        detectedCDMNames: detectedEntities,
        choice,
        correctedErdContent: !!correctedErdContent
      });

      const detectedCDMNames = detectedEntities || [];
      const updatedEntities = safeEntities.map(entity => ({
        ...entity,
        isCdm: choice === 'cdm' && detectedCDMNames.includes(entity.name)
      }));

      console.log('🔘 DEBUG: Updated entities with CDM flags:', updatedEntities);

      updateWizardData({ parsedEntities: updatedEntities });
    } else {
      console.log('⚠️ DEBUG: CDM choice made but no entities to update!', {
        safeEntitiesCount: safeEntities.length,
        importSource,
        uploadedFile: !!uploadedFile,
        correctedErdContent: !!correctedErdContent
      });
    }
  }, [safeEntities, detectedEntities, updateWizardData, importSource, uploadedFile, originalErdContent, validateFile, setValidationError]);

  // Handle file upload from FileUpload component
  const handleFileUpload = useCallback(async (content: string, metadata?: any) => {
    const fileName = metadata?.fileName || 'uploaded.mmd';
    const virtualFile = new File([content], fileName, { type: 'text/plain' });

    console.log('🔍 DEBUG: File uploaded via FileUpload component', {
      fileName,
      contentLength: content.length
    });

    setValidationError(null);

    updateWizardData({
      uploadedFile: virtualFile,
      originalErdContent: content,
      importSource: 'file',
      entityChoice: null,
      fixedIssues: new Set()
    });

    // Detect CDM entities
    const cdmDetection = detectCDMEntities(content);

    if (cdmDetection.cdmDetected) {
      console.log('🔍 DEBUG: CDM entities detected:', cdmDetection.detectedEntities);
      updateWizardData({
        cdmDetected: true,
        detectedEntities: cdmDetection.detectedEntities
      });
    } else {
      console.log('🔍 DEBUG: No CDM entities detected, validating immediately');
      updateWizardData({ cdmDetected: false });

      // No CDM detected - validate immediately with 'custom' entity choice
      try {
        const validationResult = await validateFile({
          name: fileName,
          content,
          size: content.length,
          lastModified: Date.now()
        }, 'custom'); // Default to custom entities when no CDM detected

        console.log('✅ DEBUG: Validation completed (no CDM)', {
          correctedERD: !!validationResult.correctedERD,
          entitiesCount: validationResult.entities?.length || 0,
          relationshipsCount: validationResult.relationships?.length || 0
        });

        // Update wizard data with validation results
        updateWizardData({
          correctedErdContent: validationResult.correctedERD || content,
          parsedEntities: validationResult.entities || [],
          parsedRelationships: validationResult.relationships || [],
          validationResults: validationResult,
          entityChoice: 'custom' // Set default choice for no CDM
        });
      } catch (error) {
        console.error('Validation error:', error);
        setValidationError(error instanceof Error ? error.message : 'Validation failed');
      }
    }

    onFileUploaded?.(virtualFile, content);
  }, [updateWizardData, validateFile, onFileUploaded, setValidationError]);

  // Auto-select 'preloaded' option if we have pre-loaded content
  // useEffect(() => {
  //   if (originalErdContent && !selectedImportSource) {
  //     setSelectedImportSource('preloaded');
  //   }
  // }, [originalErdContent, selectedImportSource]);

  // Process pre-loaded content when 'preloaded' is selected
  // useEffect(() => {
  //   if (selectedImportSource === 'preloaded' && originalErdContent && !correctedErdContent) {
  //     handleImportCompleted(originalErdContent);
  //   }
  // }, [selectedImportSource, originalErdContent, correctedErdContent, handleImportCompleted]);

  return (
    <Card style={{ boxShadow: tokens.shadow4 }}>
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
                <Text weight="regular" className={styles.accordionHeaderText}>Input</Text>
              </AccordionHeader>
              <AccordionPanel>
                {/* Import Source Selector */}
                <ImportSourceSelector
                  selectedSource={selectedImportSource}
                  onSourceSelect={setSelectedImportSource}
                  isDataverseImported={selectedImportSource === 'dataverse' && !!uploadedFile}
                  isFileUploaded={selectedImportSource === 'file' && !!uploadedFile}
                />

                {/* File Upload Interface */}
                {selectedImportSource === 'file' && (
                  <FileUpload onFileUploaded={handleFileUpload} />
                )}

                {/* Dataverse Import Interface */}
                {selectedImportSource === 'dataverse' && (
                  <DataverseImport onImportCompleted={handleImportCompleted} />
                )}
              </AccordionPanel>
            </AccordionItem>
          </Accordion>

          {/* CDM Detection Accordion (for both file uploads and Dataverse imports) */}
          {uploadedFile && cdmDetected && (
            <Accordion multiple collapsible defaultOpenItems={["cdm-detection"]} className={styles.schemaAccordion}>
              <AccordionItem value="cdm-detection">
                <AccordionHeader>
                  <Text weight="regular" className={styles.accordionHeaderText}>CDM Entity Detection</Text>
                </AccordionHeader>
                <AccordionPanel>
                  <CDMDetectionCard
                    detectionResult={{
                      detected: cdmDetected,
                      entities: detectedEntities || [],
                      choice: entityChoice
                    }}
                    onChoiceSelected={handleCDMChoice}
                    onChoiceChanged={() => {
                      // Reset entity choice when user wants to change
                      updateWizardData({ entityChoice: null });
                    }}
                  />
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          )}

          {/* Validation Results */}
          {uploadedFile && (entityChoice || !cdmDetected) && (
            <ValidationResultsDisplay
              isValidating={isValidating}
              validationError={validationError}
              validationResults={validationResults}
              entities={safeEntities}
              relationships={safeRelationships}
              hasBackendWarnings={hasBackendWarnings}
              hasAnyIssues={hasAnyIssues}
              fixedIssues={fixedIssues}
              onApplyFix={handleBackendWarningFix}
              onApplyAllFixes={applyAllFixes}
            />
          )}

          {/* ERD Diagram Display */}
          {(() => {
            const shouldShowDiagram = uploadedFile && (entityChoice || !cdmDetected) && safeEntities.length > 0;
            console.log('🖼️ DEBUG: ERD Diagram Display condition:', {
              uploadedFile: !!uploadedFile,
              entityChoice,
              cdmDetected,
              hasAnyIssues,
              safeEntitiesLength: safeEntities.length,
              correctedErdContent: !!correctedErdContent,
              shouldShowDiagram
            });
            return shouldShowDiagram ? (
              <ERDDiagramDisplay
                correctedErdContent={correctedErdContent}
                theme={effectiveTheme}
                erdEditor={erdEditor}
              />
            ) : null;
          })()}

          {/* Next Button */}
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
              disabled={!uploadedFile || !(entityChoice || !cdmDetected) || (importSource !== 'dataverse' && safeEntities.length === 0)}
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
