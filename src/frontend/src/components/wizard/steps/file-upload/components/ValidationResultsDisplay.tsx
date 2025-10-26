import React from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Text,
  MessageBar,
  MessageBarBody,
  Button,
  tokens,
  Spinner
} from '@fluentui/react-components';
import { CheckmarkCircleRegular } from '@fluentui/react-icons';
import styles from '../FileUploadStep.module.css';

interface ValidationResultsDisplayProps {
  isValidating: boolean;
  validationError: string | null;
  validationResults: any;
  entities: any[];
  relationships: any[];
  hasBackendWarnings: boolean;
  hasAnyIssues: boolean;
  fixedIssues: Set<string>;
  onApplyFix: (warningId: string) => Promise<void>;
  onApplyAllFixes: () => Promise<void>;
}

export const ValidationResultsDisplay: React.FC<ValidationResultsDisplayProps> = ({
  isValidating,
  validationError,
  validationResults,
  entities,
  relationships,
  hasBackendWarnings,
  // hasAnyIssues,
  fixedIssues,
  onApplyFix,
  onApplyAllFixes
}) => {
  // Don't show validation results if there's nothing to display
  const hasWarnings = validationResults?.warnings && validationResults.warnings.length > 0;
  const hasSuccess = !isValidating && !validationError && !hasBackendWarnings && entities.length > 0 && !hasWarnings;
  const hasContent = isValidating || validationError || hasWarnings || hasSuccess;
  
  if (!hasContent) {
    return null;
  }
  
  return (
    <Accordion multiple collapsible defaultOpenItems={["validation-results"]} className={styles.schemaAccordion}>
      <AccordionItem value="validation-results">
        <AccordionHeader>
          <Text weight="regular" className={styles.accordionHeaderText}>Validation Results</Text>
        </AccordionHeader>
        <AccordionPanel>
          {/* Loading State */}
          {isValidating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px' }}>
              <Spinner size="small" />
              <Text>Validating ERD...</Text>
            </div>
          )}

          {/* Validation Error */}
          {validationError && (
            <MessageBar intent="error" className={styles.validationMessageBar}>
              <MessageBarBody>
                <strong>Validation Error:</strong><br />
                {validationError}
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Success State - only show if no warnings at all */}
          {!isValidating && 
           !validationError && 
           !hasBackendWarnings && 
           entities.length > 0 && 
           (!validationResults?.warnings || validationResults.warnings.length === 0) && (
            <MessageBar intent="success" className={styles.validationMessageBar}>
              <MessageBarBody>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckmarkCircleRegular style={{ fontSize: '20px' }} />
                  <div>
                    <strong>ERD looks good!</strong><br />
                    <Text size={200}>
                      Found {entities.length} {entities.length === 1 ? 'entity' : 'entities'} and{' '}
                      {relationships.length} {relationships.length === 1 ? 'relationship' : 'relationships'}
                    </Text>
                  </div>
                </div>
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Backend Validation Warnings */}
          {validationResults?.warnings && validationResults.warnings.length > 0 && (
            <>
              {/* Auto-fixed warnings (info) */}
              {validationResults.warnings
                .filter((warning: any) => warning.autoFixed)
                .map((warning: any, index: number) => (
                  <MessageBar 
                    key={`auto-${index}`}
                    intent="info"
                    className={styles.validationMessageBar}
                    style={{ marginBottom: '12px' }}
                  >
                    <MessageBarBody>
                      <div style={{ wordWrap: 'break-word', overflowWrap: 'break-word', maxWidth: '100%' }}>
                        <strong>Auto-corrected: {warning.message}</strong><br />
                        {warning.suggestion && (
                          <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                            {warning.suggestion}
                          </Text>
                        )}
                      </div>
                    </MessageBarBody>
                  </MessageBar>
                ))}

              {/* Fixable warnings */}
              {validationResults.warnings
                .filter((warning: any) => 
                  !warning.autoFixed && 
                  warning.autoFixable === true && 
                  !fixedIssues.has(warning.id)
                )
                .map((warning: any, index: number) => (
                  <MessageBar 
                    key={`fixable-${index}`}
                    intent="warning"
                    className={styles.validationMessageBar}
                    style={{ marginBottom: '12px' }}
                  >
                    <MessageBarBody>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                        width: '100%',
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          flex: 1, 
                          minWidth: '0',
                          maxWidth: '100%',
                          wordWrap: 'break-word', 
                          overflowWrap: 'break-word',
                          whiteSpace: 'normal'
                        }}>
                          <strong style={{ 
                            display: 'block',
                            wordWrap: 'break-word', 
                            overflowWrap: 'break-word',
                            whiteSpace: 'normal'
                          }}>
                            Warning: {warning.message}
                          </strong>
                          <Text 
                            size={200} 
                            style={{ 
                              color: tokens.colorNeutralForeground2,
                              display: 'block',
                              wordWrap: 'break-word', 
                              overflowWrap: 'break-word',
                              whiteSpace: 'normal'
                            }}
                          >
                            {warning.suggestion || 'This issue can be automatically fixed.'}
                          </Text>
                        </div>
                        <Button
                          size="small"
                          appearance="primary"
                          onClick={() => onApplyFix(warning.id)}
                          style={{ flexShrink: 0 }}
                        >
                          Fix
                        </Button>
                      </div>
                    </MessageBarBody>
                  </MessageBar>
                ))}

              {/* Apply All Fixes Button */}
              {(() => {
                const fixableWarnings = validationResults.warnings.filter((w: any) => 
                  !w.autoFixed && w.autoFixable && !fixedIssues.has(w.id)
                );
                const shouldShowButton = fixableWarnings.length > 1;
                
                console.log('🔧 DEBUG: Apply All Fixes button state:', {
                  totalWarnings: validationResults.warnings.length,
                  fixableWarnings: fixableWarnings.length,
                  shouldShowButton,
                  fixedIssuesSize: fixedIssues.size
                });

                return shouldShowButton ? (
                  <MessageBar 
                    intent="info"
                    className={styles.validationMessageBar}
                    style={{ marginTop: '16px', marginBottom: '12px' }}
                  >
                    <MessageBarBody>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                        width: '100%',
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          flex: 1, 
                          minWidth: '0',
                          maxWidth: '100%',
                          wordWrap: 'break-word', 
                          overflowWrap: 'break-word',
                          whiteSpace: 'normal'
                        }}>
                          <strong style={{ 
                            display: 'block',
                            wordWrap: 'break-word', 
                            overflowWrap: 'break-word'
                          }}>
                            Multiple fixes available
                          </strong>
                          <Text 
                            size={200}
                            style={{ 
                              display: 'block',
                              wordWrap: 'break-word', 
                              overflowWrap: 'break-word'
                            }}
                          >
                            {fixableWarnings.length} warnings can be automatically fixed
                          </Text>
                        </div>
                        <Button
                          appearance="primary"
                          size="medium"
                          onClick={() => {
                            console.log('🔧 DEBUG: Apply All Fixes clicked!');
                            onApplyAllFixes();
                          }}
                          style={{ flexShrink: 0 }}
                        >
                          Apply All Fixes ({fixableWarnings.length})
                        </Button>
                      </div>
                    </MessageBarBody>
                  </MessageBar>
                ) : null;
              })()}
            </>
          )}
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};
