/**
 * FileUploadStep Orchestrator Component
 * Main orchestrator that integrates all extracted components
 */

import React, { useState, useCallback } from 'react';
import {
  Card,
  CardHeader,
  Text,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  tokens
} from '@fluentui/react-components';
import { 
  ArrowRightRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular
} from '@fluentui/react-icons';

// Import custom hooks
import { useFileProcessing } from './hooks/useFileProcessing';
import { useCDMDetection } from './hooks/useCDMDetection';
import { useERDValidation } from './hooks/useERDValidation';
import { useAutoFix } from './hooks/useAutoFix';
import { useMermaidRenderer } from './hooks/useMermaidRenderer';

// Import UI components
import {
  FileUploadZone,
  MermaidDiagramViewer,
  CDMDetectionCard,
  ERDValidationPanel,
  AutoFixSuggestions,
  ERDSummaryAccordion
} from './components';

// Import types
import type { 
  UploadedFile, 
  FileProcessingResult,
  ERDStructure,
  ERDValidationResult
} from './types/file-upload.types';

import styles from './FileUploadStep.module.css';

export const FileUploadStep: React.FC = () => {
  // State management
  const [currentFile, setCurrentFile] = useState<UploadedFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erdStructure, setERDStructure] = useState<ERDStructure | null>(null);

  // Custom hooks
  const { processFile, isLoading: isFileProcessing } = useFileProcessing();
  const { detectCDMEntities, cdmDetection, setCDMChoice } = useCDMDetection();
  const { validateERD, validationResult } = useERDValidation();
  const { generateAutoFixes, applyFix, applyAllFixes, autoFixes, isApplying } = useAutoFix();
  const { renderDiagram, renderResult } = useMermaidRenderer();

  // File upload handler
  const handleFileSelected = useCallback(async (file: File, _content: string) => {
    setError(null);
    setIsProcessing(true);
    
    try {
      // Process the file
      const result: FileProcessingResult = await processFile(file);
      
      if (result.success && result.file && result.content) {
        const uploadedFile: UploadedFile = {
          file: result.file,
          content: result.content,
          processed: true
        };
        
        setCurrentFile(uploadedFile);
        
        // Auto-detect CDM entities
        await detectCDMEntities(result.content);
        
        // For now, we'll skip rendering until we have a ref
        // await renderDiagram(result.content, diagramRef);
        
      } else {
        setError(result.error || 'Failed to process file');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  }, [processFile, detectCDMEntities, renderDiagram]);

  // CDM choice handler
  const handleCDMChoiceSelected = useCallback(async (choice: 'cdm' | 'custom') => {
    if (!currentFile) return;
    
    setCDMChoice(choice);
    
    // Validate ERD after CDM choice
    await validateERD(currentFile.content, choice === 'cdm');
    
    if (validationResult && validationResult.issues.length > 0) {
      // Generate auto-fixes if there are issues
      await generateAutoFixes(currentFile.content, validationResult.issues);
    }
    
    // Parse ERD structure for summary
    // This would be implemented based on your ERD parsing logic
    // For now, using placeholder structure
    setERDStructure({
      entities: [],
      relationships: []
    });
  }, [currentFile, setCDMChoice, validateERD, generateAutoFixes]);

  // Auto-fix handlers
  const handleApplyFix = useCallback(async (fixId: string) => {
    if (!currentFile) return;
    
    try {
      const fixedContent = applyFix(currentFile.content, fixId);
      
      // Update current file with fixed content
      setCurrentFile(prev => prev ? {
        ...prev,
        content: fixedContent
      } : null);
      
      // Re-render diagram with fixed content (will need ref)
      // await renderDiagram(fixedContent, diagramRef);
      
      // Re-validate
      if (cdmDetection?.choice) {
        await validateERD(fixedContent, cdmDetection.choice === 'cdm');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to apply fix');
    }
  }, [currentFile, applyFix, cdmDetection?.choice, validateERD]);

  const handleApplyAllFixes = useCallback(async () => {
    if (!currentFile || !autoFixes || autoFixes.length === 0) return;
    
    try {
      const fixedContent = applyAllFixes(currentFile.content, autoFixes);
      
      // Update current file with fixed content
      setCurrentFile(prev => prev ? {
        ...prev,
        content: fixedContent
      } : null);
      
      // Re-render diagram with fixed content (will need ref)
      // await renderDiagram(fixedContent, diagramRef);
      
      // Re-validate
      if (cdmDetection?.choice) {
        await validateERD(fixedContent, cdmDetection.choice === 'cdm');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to apply all fixes');
    }
  }, [currentFile, autoFixes, applyAllFixes, cdmDetection?.choice, validateERD]);

  // Proceed to next step
  const handleProceedToNext = useCallback(() => {
    // Navigate to next step in wizard
    console.log('Proceeding to next step with:', {
      file: currentFile,
      cdmChoice: cdmDetection?.choice,
      validationPassed: !(validationResult?.issues.length ?? 0 > 0)
    });
  }, [currentFile, cdmDetection?.choice, validationResult?.issues.length]);

  // Convert ValidationResult to ERDValidationResult for compatibility
  const erdValidationResult: ERDValidationResult | null = validationResult ? {
    hasIssues: validationResult.issues.length > 0,
    issues: validationResult.issues,
    namingConflicts: validationResult.issues
      .filter(issue => issue.type === 'naming')
      .map(issue => issue.entityName || ''),
    hasChoiceIssues: validationResult.issues.some(issue => issue.type === 'choice'),
    hasStatusIssues: validationResult.issues.some(issue => issue.type === 'status'),
    hasNamingIssues: validationResult.issues.some(issue => issue.type === 'naming')
  } : null;

  const canProceed = currentFile && 
                    cdmDetection?.choice && 
                    (!(validationResult?.issues.length ?? 0 > 0) || 
                     (validationResult?.issues.every(issue => issue.severity !== 'error')));

  return (
    <div className={styles.fileUploadStep}>
      <Card className={styles.stepCard}>
        <CardHeader
          header={
            <Text size={600} weight="semibold">
              Step 1: Upload ERD File
            </Text>
          }
          description={
            <Text size={400} style={{ color: tokens.colorNeutralForeground2 }}>
              Upload your Mermaid ERD file to get started. We'll analyze the structure and help you prepare it for Dataverse.
            </Text>
          }
        />
        
        <div className={styles.stepContent}>
          {/* Error Display */}
          {error && (
            <MessageBar intent="error" className={styles.errorMessage}>
              <MessageBarBody>
                <div className={styles.errorContent}>
                  <ErrorCircleRegular className={styles.errorIcon} />
                  <Text>{error}</Text>
                </div>
              </MessageBarBody>
            </MessageBar>
          )}

          {/* File Upload Zone */}
          <FileUploadZone
            onFileSelected={handleFileSelected}
            disabled={isProcessing || isFileProcessing}
            className={styles.uploadZone}
          />

          {/* Processing Indicator */}
          {(isProcessing || isFileProcessing) && (
            <div className={styles.processingIndicator}>
              <Spinner size="small" />
              <Text size={300}>Processing file...</Text>
            </div>
          )}

          {/* CDM Detection Card */}
          {cdmDetection && currentFile && (
            <CDMDetectionCard
              detectionResult={cdmDetection}
              onChoiceSelected={handleCDMChoiceSelected}
              onChoiceChanged={() => setCDMChoice(null)}
              className={styles.cdmCard}
            />
          )}

          {/* Mermaid Diagram Viewer */}
          {currentFile && renderResult && (
            <MermaidDiagramViewer
              content={currentFile.content}
              onRenderError={(err) => setError(`Diagram render error: ${err}`)}
              className={styles.diagramViewer}
            />
          )}

          {/* Validation Results */}
          {erdValidationResult && (
            <ERDValidationPanel
              validationResult={erdValidationResult}
              className={styles.validationPanel}
            />
          )}

          {/* Auto-Fix Suggestions */}
          {autoFixes && autoFixes.length > 0 && (
            <AutoFixSuggestions
              autoFixes={autoFixes}
              onApplyFix={handleApplyFix}
              onApplyAllFixes={handleApplyAllFixes}
              isLoading={isApplying}
              className={styles.autoFixSuggestions}
            />
          )}

          {/* ERD Summary */}
          {erdStructure && cdmDetection?.choice && (
            <ERDSummaryAccordion
              erdStructure={erdStructure}
              className={styles.erdSummary}
            />
          )}

          {/* Next Step Button */}
          {currentFile && (
            <div className={styles.actionButtons}>
              <Button
                appearance="primary"
                icon={<ArrowRightRegular />}
                iconPosition="after"
                disabled={!canProceed}
                onClick={handleProceedToNext}
                className={styles.nextButton}
              >
                {canProceed ? 'Continue to Solution Setup' : 'Complete validation to continue'}
              </Button>
              
              {canProceed && (
                <div className={styles.successIndicator}>
                  <CheckmarkCircleRegular className={styles.successIcon} />
                  <Text size={300} style={{ color: tokens.colorPaletteGreenForeground1 }}>
                    Ready to proceed
                  </Text>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
