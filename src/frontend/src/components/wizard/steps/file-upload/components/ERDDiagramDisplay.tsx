import React, { useRef, useEffect } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Text,
  Button,
  tokens
} from '@fluentui/react-components';
import { 
  CopyRegular, 
  EditRegular, 
  CheckmarkRegular as CheckmarkIconRegular, 
  DismissRegular 
} from '@fluentui/react-icons';
import { useMermaidRenderer } from '../hooks/useMermaidRenderer';
import { UseERDEditorReturn } from '../hooks/useERDEditor';
import styles from '../FileUploadStep.module.css';

interface ERDDiagramDisplayProps {
  correctedErdContent: string | null;
  theme: 'light' | 'dark' | 'pink' | 'neon';
  erdEditor: UseERDEditorReturn;
}

export const ERDDiagramDisplay: React.FC<ERDDiagramDisplayProps> = ({
  correctedErdContent,
  theme,
  erdEditor
}) => {
  const mermaidElementRef = useRef<HTMLDivElement>(null);
  const { renderDiagram, isRendering } = useMermaidRenderer();

  const {
    isEditingERD,
    editedERDContent,
    copySuccess,
    handleCopyERD,
    handleEditERD,
    handleSaveERD,
    handleCancelERD,
    setEditedERDContent
  } = erdEditor;

  // Get theme-aware success colors
  const getSuccessColor = () => {
    switch (theme) {
      case 'dark':
        return '#107c10';
      case 'pink':
        return '#c71585';
      case 'neon':
        return '#00ff00';
      default:
        return '#0f7b0f';
    }
  };

  const getSuccessBackgroundColor = () => {
    switch (theme) {
      case 'dark':
        return 'rgba(16, 124, 16, 0.2)';
      case 'pink':
        return 'rgba(199, 21, 133, 0.2)';
      case 'neon':
        return 'rgba(0, 255, 0, 0.15)';
      default:
        return 'rgba(15, 123, 15, 0.15)';
    }
  };

  // Render diagram when content changes
  useEffect(() => {
    if (correctedErdContent && mermaidElementRef.current && !isEditingERD) {
      const timeoutId = setTimeout(() => {
        renderDiagram(correctedErdContent, mermaidElementRef);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [correctedErdContent, renderDiagram, theme, isEditingERD]);

  return (
    <>
      {/* Mermaid Diagram */}
      <Accordion multiple collapsible defaultOpenItems={["erd-diagram"]} className={styles.schemaAccordion}>
        <AccordionItem value="erd-diagram">
          <AccordionHeader>
            <Text className={styles.accordionHeaderText}>ERD Diagram</Text>
          </AccordionHeader>
          <AccordionPanel>
            <div 
              ref={mermaidElementRef} 
              className={styles.mermaidDiagram}
              style={{ minHeight: '200px' }}
            >
              {!correctedErdContent && (
                <Text style={{ color: tokens.colorNeutralForeground3 }}>
                  Loading diagram...
                </Text>
              )}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {/* Complete ERD Display */}
      <Accordion multiple collapsible defaultOpenItems={["complete-erd"]} className={styles.schemaAccordion}>
        <AccordionItem value="complete-erd">
          <AccordionHeader>
            <Text className={styles.accordionHeaderText}>Complete ERD</Text>
          </AccordionHeader>
          <AccordionPanel>
            <div style={{ position: 'relative' }}>
              <div style={{ 
                position: 'absolute', 
                top: '12px', 
                right: '12px', 
                display: 'flex', 
                gap: '8px',
                zIndex: 1
              }}>
                {!isEditingERD ? (
                  <>
                    <Button
                      appearance="subtle"
                      icon={<CopyRegular />}
                      onClick={handleCopyERD}
                      title="Copy code"
                      size="small"
                      style={{ 
                        backgroundColor: copySuccess ? getSuccessBackgroundColor() : tokens.colorNeutralBackground1,
                        color: copySuccess ? getSuccessColor() : undefined
                      }}
                    >
                      {copySuccess ? 'Copied!' : ''}
                    </Button>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      onClick={handleEditERD}
                      title="Edit code"
                      size="small"
                      style={{ backgroundColor: tokens.colorNeutralBackground1 }}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      appearance="subtle"
                      icon={<CheckmarkIconRegular />}
                      onClick={handleSaveERD}
                      title="Save changes"
                      size="small"
                      style={{ 
                        backgroundColor: getSuccessBackgroundColor(),
                        color: getSuccessColor()
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      appearance="subtle"
                      icon={<DismissRegular />}
                      onClick={handleCancelERD}
                      title="Cancel edit"
                      size="small"
                      style={{ backgroundColor: tokens.colorNeutralBackground1 }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
              {!isEditingERD ? (
                <div style={{ 
                  position: 'relative',
                  maxHeight: '500px', 
                  overflow: 'auto',
                  backgroundColor: tokens.colorNeutralBackground2,
                  borderRadius: '4px',
                  border: `1px solid ${tokens.colorNeutralStroke1}`
                }}>
                  <pre style={{ 
                    padding: '16px',
                    paddingTop: '48px',
                    margin: 0,
                    whiteSpace: 'pre',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    fontFamily: 'monospace',
                    color: tokens.colorNeutralForeground1,
                    backgroundColor: 'transparent',
                    border: 'none',
                    overflow: 'visible'
                  }}>
                    {(() => {
                      if (!correctedErdContent) return 'No ERD content available';
                      
                      // Convert escaped newlines to actual newlines
                      let formattedContent = correctedErdContent;
                      
                      if (typeof formattedContent === 'string' && formattedContent.includes('\\n')) {
                        formattedContent = formattedContent.replace(/\\n/g, '\n');
                      }
                      
                      return formattedContent.trim();
                    })()}
                  </pre>
                </div>
              ) : (
                <textarea
                  value={editedERDContent}
                  onChange={(e) => setEditedERDContent(e.target.value)}
                  style={{
                    padding: '16px',
                    paddingTop: '48px',
                    backgroundColor: tokens.colorNeutralBackground2,
                    borderRadius: '4px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    width: '100%',
                    minHeight: '400px',
                    border: `1px solid ${tokens.colorNeutralStroke1}`,
                    color: tokens.colorNeutralForeground1,
                    fontFamily: 'monospace',
                    resize: 'vertical'
                  }}
                />
              )}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </>
  );
};
