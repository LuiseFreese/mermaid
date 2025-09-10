/**
 * Custom hook for Mermaid diagram rendering
 * Handles Mermaid initialization, theming, and diagram rendering with retry logic
 */

import { useCallback, useState, useEffect } from 'react';
import mermaid from 'mermaid';
import type { MermaidRenderResult } from '../types/file-upload.types';
import { useTheme } from '../../../../../context/ThemeContext';

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
export const useMermaidRenderer = (): MermaidRendererHook => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [lastRenderedContent, setLastRenderedContent] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<MermaidRenderResult | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { effectiveTheme } = useTheme();

  /**
   * Get theme-specific Mermaid configuration
   */
  const getMermaidConfig = useCallback(() => {
    if (effectiveTheme === 'dark') {
      // Dark theme configuration - aligned with Fluent UI dark colors
      return {
        startOnLoad: true,
        theme: 'base',
        securityLevel: 'loose',
        themeVariables: {
          // Dark theme entity styling
          primaryColor: '#2d2d30',              // Dark surface for entity headers
          primaryBorderColor: '#0078d4',        // Fluent UI primary blue for borders
          lineColor: '#0078d4',                 // Relationship lines in blue
          
          // Dark backgrounds
          secondaryColor: '#1e1e1e',            // Main dark background
          tertiaryColor: '#3e3e42',             // Slightly lighter dark surface
          background: '#1e1e1e',                // Dark diagram background
          
          // Light text for dark theme
          primaryTextColor: '#ffffff',          // White text
          secondaryTextColor: '#cccccc',        // Light gray text
          tertiaryTextColor: '#ffffff'          // White text
        }
      };
    } else if (effectiveTheme === 'pink') {
      // Pink theme configuration 🌸 - back to base theme
      const pinkConfig = {
        startOnLoad: true,
        theme: 'base',
        securityLevel: 'loose',
        themeVariables: {
          // Pink theme colors
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
      console.log('🌸 Pink theme config being sent to Mermaid:', pinkConfig);
      return pinkConfig;
    } else {
      // Light theme configuration
      return {
        startOnLoad: true,
        theme: 'base',
        securityLevel: 'loose',
        themeVariables: {
          // Light theme entity styling
          primaryColor: '#e3f2fd',              // Very light blue for entity headers
          primaryBorderColor: '#0078d4',        // Blue for borders
          lineColor: '#0078d4',                 // Relationship lines in blue
          
          // Light backgrounds
          secondaryColor: '#ffffff',            // White backgrounds
          tertiaryColor: '#f8f9fa',            // Very light gray
          background: '#ffffff',               // White diagram background
          
          // Dark text for light theme
          primaryTextColor: '#323130',
          secondaryTextColor: '#323130',
          tertiaryTextColor: '#323130'
        }
      };
    }
  }, [effectiveTheme]);

  /**
   * Initialize Mermaid with theme-aware configuration
   */
  const initializeMermaid = useCallback(() => {
    const config = getMermaidConfig();
    console.log('🎨 Initializing Mermaid with theme:', effectiveTheme, config);
    mermaid.initialize(config);
    setIsInitialized(true);
  }, [getMermaidConfig, effectiveTheme]);

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
      // Force re-initialize Mermaid with current theme on each render
      // This ensures theme changes are applied immediately
      console.log('🔄 Forcing Mermaid re-initialization for theme:', effectiveTheme);
      setIsInitialized(false);
      initializeMermaid();

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

  // Initialize and re-initialize when theme changes
  useEffect(() => {
    initializeMermaid();
    
    // If we have previously rendered content, clear it to force re-render with new theme
    if (lastRenderedContent) {
      setLastRenderedContent(null);
      setRenderResult(null);
    }
  }, [initializeMermaid, effectiveTheme, lastRenderedContent]);

  return {
    renderDiagram,
    renderResult,
    isRendering,
    renderError,
    lastRenderedContent,
    initializeMermaid
  };
};
