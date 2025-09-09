/**
 * Mermaid Diagram Viewer Component
 * Displays Mermaid ERD diagrams with error handling
 */

import React, { useRef, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Spinner,
  tokens
} from '@fluentui/react-components';
import { useMermaidRenderer } from '../hooks/useMermaidRenderer';
import type { MermaidDiagramViewerProps } from '../types/file-upload.types';
import styles from './MermaidDiagramViewer.module.css';

export const MermaidDiagramViewer: React.FC<MermaidDiagramViewerProps> = ({
  content,
  onRenderError,
  className = ''
}) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const { renderDiagram, isRendering, renderError } = useMermaidRenderer();

  /**
   * Render diagram when content changes
   */
  useEffect(() => {
    if (content && mermaidRef.current) {
      renderDiagram(content, mermaidRef).then(result => {
        if (!result.success && result.error) {
          onRenderError?.(result.error);
        }
      });
    }
  }, [content, renderDiagram, onRenderError]);

  /**
   * Notify parent of render errors
   */
  useEffect(() => {
    if (renderError) {
      onRenderError?.(renderError);
    }
  }, [renderError, onRenderError]);

  if (!content) {
    return null;
  }

  return (
    <Card className={`${styles.diagramCard} ${className}`}>
      <CardHeader
        header={
          <Text weight="semibold" size={400}>
            ERD Diagram Preview
          </Text>
        }
        description={
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            Visual representation of your Entity Relationship Diagram
          </Text>
        }
      />
      <CardPreview>
        <div className={styles.diagramContainer}>
          {isRendering && (
            <div className={styles.loadingContainer}>
              <Spinner size="medium" />
              <Text size={300} style={{ marginTop: '8px' }}>
                Rendering diagram...
              </Text>
            </div>
          )}
          
          <div 
            ref={mermaidRef} 
            className={`${styles.mermaidContainer} ${isRendering ? styles.hidden : ''}`}
            data-testid="mermaid-diagram"
          />
          
          {renderError && !isRendering && (
            <div className={styles.errorContainer}>
              <Text size={300} style={{ color: tokens.colorPaletteRedForeground1 }}>
                Failed to render diagram: {renderError}
              </Text>
            </div>
          )}
        </div>
      </CardPreview>
    </Card>
  );
};
