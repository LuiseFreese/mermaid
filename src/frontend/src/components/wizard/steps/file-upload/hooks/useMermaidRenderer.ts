/**
 * Custom hook for Mermaid diagram rendering
 * Handles Mermaid initialization, theming, and diagram rendering with retry logic
 */

import { useCallback, useState, useEffect } from 'react';
import mermaid from 'mermaid';
import type { MermaidRenderResult } from '../types/file-upload.types';

export interface UseMermaidRendererResult {
  renderDiagram: (content: string, elementRef: React.RefObject<HTMLDivElement>) => Promise<MermaidRenderResult>;
  renderResult: MermaidRenderResult | null;
  isRendering: boolean;
  renderError: string | null;
  lastRenderedContent: string | null;
  initializeMermaid: () => void;
}

/**
 * Hook for managing Mermaid diagram rendering
 * @returns Mermaid rendering state and functions
 */
export const useMermaidRenderer = (): UseMermaidRendererResult => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [lastRenderedContent, setLastRenderedContent] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<MermaidRenderResult | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Initialize Mermaid with theme and configuration
   */
  const initializeMermaid = useCallback(() => {
    if (isInitialized) return;

    mermaid.initialize({
      startOnLoad: true,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {
        // Simple, accessible blue theme
        primaryColor: '#e3f2fd',           // Very light blue for entity headers
        primaryBorderColor: '#0078d4',     // Blue for borders
        lineColor: '#0078d4',              // Relationship lines in blue
        
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

    setIsInitialized(true);
  }, [isInitialized]);

  /**
   * Render a Mermaid diagram with retry logic
   */
  const renderDiagram = useCallback(async (
    content: string, 
    elementRef: React.RefObject<HTMLDivElement>
  ): Promise<MermaidRenderResult> => {
    if (!content) {
      return {
        success: false,
        error: 'No content provided for rendering'
      };
    }

    setIsRendering(true);
    setRenderError(null);

    try {
      // Ensure Mermaid is initialized
      if (!isInitialized) {
        initializeMermaid();
      }

      // Retry mechanism for when DOM element isn't ready yet
      const maxRetries = 20;
      const retryDelay = 200;
      let retryCount = 0;

      const attemptRender = async (): Promise<MermaidRenderResult> => {
        if (!elementRef.current) {
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return attemptRender();
          } else {
            throw new Error('DOM element not available after maximum retries');
          }
        }

        // Clear previous content
        elementRef.current.innerHTML = '';

        // Generate unique ID for this diagram
        const id = `mermaid-diagram-${Date.now()}`;

        // Render the diagram
        const { svg } = await mermaid.render(id, content);
        
        if (!svg) {
          throw new Error('Mermaid failed to generate SVG');
        }

        // Insert the rendered SVG
        elementRef.current.innerHTML = svg;
        
        setLastRenderedContent(content);

        return {
          success: true,
          svg
        };
      };

      const result = await attemptRender();
      setRenderResult(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown rendering error';
      setRenderError(errorMessage);
      
      // Show error in the element if available
      if (elementRef.current) {
        elementRef.current.innerHTML = `
          <div style="color: red; padding: 16px; border: 1px solid #ff4444; border-radius: 4px; background: #fff5f5;">
            <strong>Error rendering diagram:</strong><br/>
            ${errorMessage}
          </div>
        `;
      }

      const errorResult = {
        success: false,
        error: errorMessage
      };
      setRenderResult(errorResult);
      return errorResult;
    } finally {
      setIsRendering(false);
    }
  }, [isInitialized, initializeMermaid]);

  // Auto-initialize on mount
  useEffect(() => {
    initializeMermaid();
  }, [initializeMermaid]);

  return {
    renderDiagram,
    renderResult,
    isRendering,
    renderError,
    lastRenderedContent,
    initializeMermaid
  };
};
