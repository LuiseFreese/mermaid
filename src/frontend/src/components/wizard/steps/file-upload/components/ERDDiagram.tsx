import React, { useRef } from 'react';
import {
  Text,
  Button,
  tokens,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from '@fluentui/react-components';
import { CopyRegular, EditRegular, CheckmarkRegular, DismissRegular } from '@fluentui/react-icons';
// import { useMermaidRenderer } from '../hooks/useMermaidRenderer';
// import { useERDEditor } from '../hooks/useERDEditor';
import styles from '../../FileUploadStep.module.css';

interface ERDDiagramProps {
  correctedErdContent: string;
  // onERDChange?: (content: string) => void;
  getSuccessColor: () => string;
  getSuccessBackgroundColor: () => string;
}

export const ERDDiagram: React.FC<ERDDiagramProps> = ({
  correctedErdContent,
  // onERDChange,
  getSuccessColor,
  getSuccessBackgroundColor,
}) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  
  // Use mermaid renderer hook
  // useMermaidRenderer(mermaidRef, correctedErdContent);
  // const { renderDiagram } = useMermaidRenderer();

  // Use ERD editor hook - DISABLED: Hook signature has changed
  // const {
  //   isEditing,
  //   editedContent,
  //   copySuccess,
  //   handleCopy,
  //   handleEdit,
  //   handleSave,
  //   handleCancel,
  //   setEditedContent,
  // } = useERDEditor(correctedErdContent, onERDChange);
  
  // Temporary placeholders
  const isEditing = false;
  const editedContent = correctedErdContent;
  const copySuccess = false;
  const handleCopy = () => {};
  const handleEdit = () => {};
  const handleSave = () => {};
  const handleCancel = () => {};
  const setEditedContent = (_content: string) => {};

  const formatERDContent = (content: string): string => {
    if (!content) return 'No ERD content available';
    
    // Convert escaped newlines to actual newlines
    let formattedContent = content;
    if (typeof formattedContent === 'string' && formattedContent.includes('\\n')) {
      formattedContent = formattedContent.replace(/\\n/g, '\n');
    }
    
    return formattedContent.trim();
  };

  return (
    <>
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
            <Text className={styles.accordionHeaderText}>
              Complete ERD
            </Text>
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
                {!isEditing ? (
                  <>
                    <Button
                      appearance="subtle"
                      icon={<CopyRegular />}
                      onClick={handleCopy}
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
                      onClick={handleEdit}
                      title="Edit code"
                      size="small"
                      style={{ backgroundColor: tokens.colorNeutralBackground1 }}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      appearance="subtle"
                      icon={<CheckmarkRegular />}
                      onClick={handleSave}
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
                      onClick={handleCancel}
                      title="Cancel edit"
                      size="small"
                      style={{ backgroundColor: tokens.colorNeutralBackground1 }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
              {!isEditing ? (
                <div className={styles.erdCodeBlock}>
                  <pre className={styles.erdCodeText} style={{ paddingTop: '48px' }}>
                    {formatERDContent(correctedErdContent)}
                  </pre>
                </div>
              ) : (
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
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
