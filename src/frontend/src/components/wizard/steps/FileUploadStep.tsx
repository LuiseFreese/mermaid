import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
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
import { useWizardContext } from '../../../context/WizardContext';
import { useTheme } from '../../../context/ThemeContext';
import { ApiService } from '../../../services/apiService';
import { ValidationWarning } from '../../../../../shared/types';
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
  const { effectiveTheme } = useTheme();
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const {
    uploadedFile,
    cdmDetected, 
    detectedEntities, 
    entityChoice, 
    correctedErdContent, 
    originalErdContent,
    fixedIssues,
    parsedEntities,
    parsedRelationships
  } = wizardData;

  const mermaidRef = useRef<HTMLDivElement>(null);
  const revalidationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRenderingRef = useRef<boolean>(false);

  // Render Mermaid diagram - defined early to avoid initialization order issues
  const renderMermaidDiagram = useCallback(async () => {
    const timestamp = new Date().toISOString();
    console.log(`🔍 DEBUG: renderMermaidDiagram called at ${timestamp}`, {
      hasMermaidRef: !!mermaidRef.current,
      correctedErdContent: correctedErdContent?.substring(0, 100) + (correctedErdContent?.length > 100 ? '...' : ''),
      contentLength: correctedErdContent?.length,
      isCurrentlyRendering: isRenderingRef.current
    });
    
    // Prevent overlapping renders
    if (isRenderingRef.current) {
      console.log('🔍 DEBUG: Already rendering, skipping this call');
      return;
    }
    
    // Debug: Log the full content when there's a parsing error
    if (correctedErdContent && correctedErdContent.includes('123invalid')) {
      console.log('🚨 DEBUG: Invalid content detected:');
      console.log(correctedErdContent);
    }
    
    if (!correctedErdContent) {
      console.log('🔍 DEBUG: No content to render');
      return;
    }
    
    isRenderingRef.current = true;

    // Debug: Check for PK FK combinations that cause Mermaid errors
    const pkFkLines = correctedErdContent.split('\n').filter(line => line.includes('PK FK'));
    if (pkFkLines.length > 0) {
      console.log('🚨 DEBUG: Found PK FK combinations that will cause Mermaid errors:', pkFkLines);
    }

    // Clean up any remaining PK FK combinations before rendering
    let cleanedContent = correctedErdContent;
    if (pkFkLines.length > 0) {
      console.log('🔧 DEBUG: Cleaning up PK FK combinations...');
      // Replace PK FK with just PK to make valid Mermaid syntax (prefer PK over FK for clarity)
      cleanedContent = correctedErdContent.replace(/\bPK\s+FK\b/g, 'PK');
      console.log('🔧 DEBUG: Cleaned content, removed FK from PK FK combinations (kept PK)');
      
      // Log the cleaned lines for verification
      const cleanedPkFkLines = cleanedContent.split('\n').filter(line => line.includes('PK FK'));
      if (cleanedPkFkLines.length === 0) {
        console.log('✅ DEBUG: All PK FK combinations successfully cleaned');
      } else {
        console.log('⚠️ DEBUG: Some PK FK combinations still remain:', cleanedPkFkLines);
      }
    }

    // Retry mechanism for when DOM element isn't ready yet
    let retryCount = 0;
    const maxRetries = 30; // More retries for slow accordion animations
    const retryDelay = 300; // Longer delay to account for accordion animations

    const attemptRender = async () => {
      if (mermaidRef.current) {
        // Check if the element is visible and has dimensions
        const rect = mermaidRef.current.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        console.log('🔍 DEBUG: Mermaid container check', {
          hasRef: !!mermaidRef.current,
          isVisible,
          dimensions: { width: rect.width, height: rect.height },
          retryCount
        });
        
        // If the element exists but isn't visible yet (accordion still animating), retry
        if (!isVisible && retryCount < maxRetries) {
          retryCount++;
          setTimeout(attemptRender, retryDelay);
          return;
        }
        
        try {
          // Clear previous content
          console.log('🧹 DEBUG: Clearing previous diagram content');
          mermaidRef.current.innerHTML = '';
          
          // Generate unique ID for this diagram
          const id = `mermaid-diagram-${Date.now()}`;
          
          // Render the diagram
          console.log('🔍 DEBUG: About to render Mermaid with ID:', id);
          console.log('🔍 DEBUG: Content to render (first 200 chars):', cleanedContent.substring(0, 200));
          console.log('🔍 DEBUG: Full content length:', cleanedContent.length);
          
          const { svg } = await mermaid.render(id, cleanedContent);
          console.log('✅ DEBUG: Mermaid render successful, SVG length:', svg.length);
          mermaidRef.current.innerHTML = svg;
          console.log('✅ DEBUG: SVG inserted into DOM element');
        } catch (error) {
          console.error('🚨 ERROR: Mermaid rendering failed:', error);
          console.error('🚨 ERROR: Content that failed to render:', cleanedContent);
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('🚨 ERROR: Error message:', errorMessage);
          mermaidRef.current.innerHTML = '<p style="color: red; padding: 10px; border: 1px solid red; margin: 10px;">Error rendering diagram: ' + errorMessage + '</p>';
        } finally {
          isRenderingRef.current = false;
        }
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`🔍 DEBUG: mermaidRef not available, retry ${retryCount}/${maxRetries}`);
          setTimeout(attemptRender, retryDelay);
        } else {
          console.warn('🚨 DEBUG: Max retries reached, mermaidRef still not available');
          isRenderingRef.current = false;
        }
      }
    };

    await attemptRender();
  }, [correctedErdContent]);

  // Initialize Mermaid with theme-aware configuration
  useEffect(() => {
    console.log('🎨 DEBUG: Initializing Mermaid with theme:', effectiveTheme);
    
    const isDark = effectiveTheme === 'dark';
    const isPink = effectiveTheme === 'pink';
    const isNeon = effectiveTheme === 'neon';
    
    let themeConfig;
    
    if (isNeon) {
      // Neon/Retrowave theme configuration 🌈✨
      themeConfig = {
        startOnLoad: true,
        theme: 'dark' as const,
        securityLevel: 'loose' as const,
        themeVariables: {
          // Neon synthwave colors
          primaryColor: '#2d1b4e',              // Deep purple for entity headers
          primaryBorderColor: '#ff007f',        // Neon pink borders
          lineColor: '#00ffff',                 // Cyan relationship lines
          
          // Dark neon backgrounds
          secondaryColor: '#0a0015',            // Very dark purple background
          tertiaryColor: '#1a0033',             // Dark purple surface
          background: '#0a0015',                // Dark diagram background
          
          // Neon text colors
          primaryTextColor: '#ffffff',          // White text
          secondaryTextColor: '#ff007f',        // Neon pink text
          tertiaryTextColor: '#00ffff',         // Cyan accent text
          
          // Additional neon styling
          mainBkg: '#2d1b4e',                   // Entity background
          secondBkg: '#1a0033',                 // Secondary background
          border1: '#ff007f',                   // Primary border
          border2: '#8a2be2',                   // Secondary border
          arrowheadColor: '#00ffff',            // Arrow heads
          fontFamily: '"Courier New", monospace', // Retro font
          fontSize: '14px'
        }
      };
    } else if (isPink) {
      // Pink theme configuration 🌸
      themeConfig = {
        startOnLoad: true,
        theme: 'base' as const,
        securityLevel: 'loose' as const,
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
    } else if (isDark) {
      // Dark theme configuration
      themeConfig = {
        startOnLoad: true,
        theme: 'dark' as const,
        securityLevel: 'loose' as const,
        themeVariables: {
          // Dark theme styling - aligned with Fluent UI dark colors
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
    } else {
      // Light theme configuration
      themeConfig = {
        startOnLoad: true,
        theme: 'base' as const,
        securityLevel: 'loose' as const,
        themeVariables: {
          // Light theme styling
          primaryColor: '#e3f2fd',              // Very light blue for entity headers
          primaryBorderColor: '#0078d4',        // Fluent UI blue for borders
          lineColor: '#0078d4',                 // Relationship lines in blue
          
          // Light backgrounds
          secondaryColor: '#ffffff',            // White backgrounds
          tertiaryColor: '#f8f9fa',             // Very light gray
          background: '#ffffff',               // White diagram background
          
          // Dark text for light theme
          primaryTextColor: '#323130',
          secondaryTextColor: '#323130',
          tertiaryTextColor: '#323130'
        }
      };
    }
    
    mermaid.initialize(themeConfig);
    
    // Force re-render of any existing diagrams after theme change
    // But only if user has made entity choice or no CDM detected
    setTimeout(() => {
      const shouldRender = correctedErdContent && (entityChoice || !cdmDetected);
      console.log('🎨 DEBUG: Post-theme-init render check', {
        shouldRender,
        theme: effectiveTheme,
        hasCorrectedErdContent: !!correctedErdContent,
        entityChoice,
        cdmDetected
      });
      if (shouldRender) {
        // We'll add a separate effect for this after variables are defined
        console.log('🎨 DEBUG: Theme initialized, will trigger render via separate effect');
      }
    }, 100);
  }, [effectiveTheme]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file && file.name.endsWith('.mmd')) {
      const content = await file.text();
      
      console.log('🔍 DEBUG: File uploaded', {
        fileName: file.name,
        contentLength: content.length,
        contentPreview: content.substring(0, 200)
      });
      
      // Store original content
      updateWizardData({ originalErdContent: content });
      
      console.log('🔍 DEBUG: Updated wizard data with content');
      
      // Reset state for new file
      setValidationError(null);
      setIsValidating(true);
      
      // Reset entity choice and fixes when new file is uploaded
      updateWizardData({ 
        entityChoice: null, 
        fixedIssues: new Set(),
        uploadedFile: file
      });
      
      try {
        // Call backend validation to get corrected ERD and parsed data
        const validationResult = await ApiService.validateFile({
          name: file.name,
          content: content,
          size: file.size,
          lastModified: file.lastModified
        }, wizardData.entityChoice);
        
        console.log('🔧 DEBUG: Validation result structure:', {
          hasEntities: !!validationResult.entities,
          entitiesCount: validationResult.entities?.length || 0,
          entitiesPreview: validationResult.entities?.slice(0, 2)?.map((e: any) => e.name) || [],
          validationResultKeys: Object.keys(validationResult),
          hasCustomEntities: !!validationResult.customEntities,
          customEntitiesCount: validationResult.customEntities?.length || 0,
          hasCdmEntities: !!validationResult.cdmEntities,
          cdmEntitiesCount: validationResult.cdmEntities?.length || 0
        });
        
        // Update wizard data with corrected information from backend
        const entities = validationResult.entities || [];
        const relationships = validationResult.relationships || [];
        const correctedERD = validationResult.correctedERD || content;
        const validationResults = validationResult;
        
        console.log('🔧 DEBUG: Extracted data:', {
          entitiesCount: entities.length,
          relationshipsCount: relationships.length,
          entitiesNames: entities.map((e: any) => e.name)
        });
        
        updateWizardData({
          correctedErdContent: correctedERD,
          parsedEntities: entities,
          parsedRelationships: relationships,
          validationResults: validationResults
        });
        
        // CDM Detection Logic - use backend results if available
        const cdmDetection = validationResult.cdmDetection;
        if (cdmDetection && cdmDetection.detectedCDM) {
          const detectedEntities = cdmDetection.detectedCDM.map((match: any) => match.originalEntity?.name).filter(Boolean);
          updateWizardData({ 
            cdmDetected: detectedEntities.length > 0,
            detectedEntities: detectedEntities
          });
        } else {
          // Fallback to client-side CDM detection
          const cdmEntities = [
            'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Incident',
            'Activity', 'Email', 'PhoneCall', 'Task', 'Appointment',
            'User', 'Team', 'BusinessUnit', 'SystemUser',
            'Product', 'PriceLevel', 'Quote', 'Order', 'Invoice',
            'Campaign', 'MarketingList', 'Competitor'
          ];
          
          const foundCdm = cdmEntities.some(entity => {
            const regex = new RegExp(`\\b${entity}\\s*\\{`, 'i');
            return regex.test(content);
          });
          
          updateWizardData({ cdmDetected: foundCdm });
          if (foundCdm) {
            const detected = cdmEntities.filter(entity => {
              const regex = new RegExp(`\\b${entity}\\s*\\{`, 'i');
              return regex.test(content);
            });
            updateWizardData({ detectedEntities: detected });
          }
        }
        
        onFileUploaded?.(file, content);
      } catch (error) {
        console.error('Validation error:', error);
        setValidationError(error instanceof Error ? error.message : 'Validation failed');
        // Fall back to original content if validation fails
        updateWizardData({ correctedErdContent: content });
        onFileUploaded?.(file, content);
      } finally {
        setIsValidating(false);
      }
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

  // Handle CDM choice selection and update entities with isCdm flag
  const handleCDMChoice = useCallback((choice: 'cdm' | 'custom') => {
    console.log('🔘 DEBUG: CDM choice selected:', choice);
    
    // Update the entity choice
    updateWizardData({ entityChoice: choice });
    
    // If CDM is selected, update parsedEntities to mark CDM entities with isCdm: true
    if (choice === 'cdm' && parsedEntities.length > 0) {
      console.log('🔘 DEBUG: Updating parsedEntities with CDM flags');
      console.log('🔘 DEBUG: Current parsedEntities:', parsedEntities);
      
      // Get detected CDM entities from wizardData
      const detectedCDMNames = detectedEntities || [];
      console.log('🔘 DEBUG: Detected CDM entity names:', detectedCDMNames);
      
      // Update parsedEntities to mark CDM entities
      const updatedEntities = parsedEntities.map(entity => {
        const isCdmEntity = detectedCDMNames.includes(entity.name);
        console.log(`🔘 DEBUG: Entity ${entity.name}: isCdm = ${isCdmEntity}`);
        return {
          ...entity,
          isCdm: isCdmEntity
        };
      });
      
      console.log('🔘 DEBUG: Updated parsedEntities:', updatedEntities);
      updateWizardData({ parsedEntities: updatedEntities });
    } else if (choice === 'custom' && parsedEntities.length > 0) {
      // If custom is selected, ensure all entities are marked as non-CDM
      console.log('🔘 DEBUG: Marking all entities as custom (non-CDM)');
      const updatedEntities = parsedEntities.map(entity => ({
        ...entity,
        isCdm: false
      }));
      
      console.log('🔘 DEBUG: Updated parsedEntities (all custom):', updatedEntities);
      updateWizardData({ parsedEntities: updatedEntities });
    }
  }, [parsedEntities, detectedEntities, updateWizardData]);

  // Legacy frontend validation (now handled by backend warnings)
  const hasChoiceIssues = false; // Deprecated - handled by backend warnings
  const namingConflicts: string[] = []; // Deprecated - handled by backend warnings  
  const hasNamingIssues = false; // Deprecated - handled by backend warnings
  
  // Check if there are any backend validation warnings that should prevent showing "looks good"
  const hasBackendWarnings = useMemo(() => {
    // For CDM entities, trust the backend completely - if user selected CDM, no frontend warnings needed
    if (wizardData.entityChoice === 'cdm') {
      console.log('🔧 DEBUG: CDM entity choice - trusting backend validation (no frontend warnings)');
      return false;
    }

    if (!wizardData.validationResults?.warnings) {
      console.log('🔧 DEBUG: No validation results or warnings found');
      return false;
    }
    
    const totalWarnings = wizardData.validationResults.warnings.length;
    console.log('🔧 DEBUG: Processing warnings for non-CDM entities:', {
      totalWarnings,
      entityChoice: wizardData.entityChoice
    });
    
    // For non-CDM entities, check each warning
    const visibleWarnings = wizardData.validationResults.warnings.filter((warning: any) => {
      // Check if this specific warning has been fixed by the user
      if (fixedIssues.has(warning.id)) {
        console.log('🔧 DEBUG: Warning filtered out (already fixed):', warning.id, warning.type);
        return false;
      }
      
      // Count all non-auto-fixed warnings except pure info messages
      return !warning.autoFixed && warning.severity !== 'info';
    });
    
    const hasWarnings = visibleWarnings.length > 0;
    console.log('🔧 DEBUG: Final hasBackendWarnings result:', {
      visibleWarningsCount: visibleWarnings.length,
      hasWarnings
    });
    
    return hasWarnings;
  }, [wizardData.validationResults, wizardData.entityChoice, fixedIssues]);
  
  // Check if ERD has any issues at all
  const hasAnyIssues = hasBackendWarnings; // Only backend warnings matter now

  // Re-render diagram when content, theme, or validation state changes
  useEffect(() => {
    // Only render diagram if:
    // 1. We have content AND
    // 2. User has made a choice (entityChoice is set) OR no CDM was detected (no choice needed) AND
    // 3. There are no validation issues (container is actually rendered)
    const shouldRender = correctedErdContent && 
                         (entityChoice || !cdmDetected) && 
                         !hasChoiceIssues && 
                         !hasNamingIssues;
    
    console.log('🔍 DEBUG: useEffect for diagram rendering', {
      hasCorrectedErdContent: !!correctedErdContent,
      entityChoice,
      cdmDetected,
      hasChoiceIssues,
      hasNamingIssues,
      shouldRender,
      effectiveTheme
    });
    
    if (shouldRender) {
      // Add small delay to ensure DOM is ready and prevent rapid re-renders
      const timeoutId = setTimeout(() => {
        renderMermaidDiagram();
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [correctedErdContent, renderMermaidDiagram, entityChoice, cdmDetected, hasAnyIssues, effectiveTheme]);

  // Track last revalidated entity choice to prevent infinite loops
  const lastRevalidatedChoiceRef = useRef<string | null>(null);

  // Re-validate when entity choice changes
  useEffect(() => {
    console.log('🔧 DEBUG: entityChoice changed, checking if revalidation needed', {
      entityChoice,
      hasUploadedFile: !!uploadedFile,
      hasOriginalContent: !!originalErdContent,
      fileName: uploadedFile?.name,
      lastRevalidatedChoice: lastRevalidatedChoiceRef.current
    });

    // Only revalidate if:
    // 1. User has made an entity choice (not null)
    // 2. We have a file uploaded
    // 3. We have original content to revalidate
    // 4. Choice is different from last revalidated choice (prevent loops)
    if (entityChoice && 
        uploadedFile && 
        originalErdContent && 
        entityChoice !== lastRevalidatedChoiceRef.current) {
      
      console.log('🔧 DEBUG: Triggering revalidation with entityChoice:', entityChoice);
      lastRevalidatedChoiceRef.current = entityChoice;

      const revalidateWithChoice = async () => {
        try {
          console.log('🔧 DEBUG: Starting revalidation request with entityChoice:', entityChoice);
          
          const revalidationResult = await ApiService.validateFile({
            name: uploadedFile.name,
            content: originalErdContent,
            size: uploadedFile.size,
            lastModified: uploadedFile.lastModified
          }, entityChoice);
          
          console.log('🔧 DEBUG: Revalidation completed with entityChoice:', {
            entityChoice,
            warningsCount: revalidationResult.warnings?.length || 0,
            autoFixableWarnings: revalidationResult.warnings?.filter((w: any) => w.autoFixable).length || 0,
            totalValidationResults: revalidationResult
          });

          console.log('🔧 DEBUG: About to update wizard data with new validation results');
          
          // Ensure we completely replace validation results, not merge them
          updateWizardData({
            validationResults: revalidationResult, // This should completely replace the old validation results
            correctedErdContent: revalidationResult.correctedERD || originalErdContent
          });

          console.log('🔧 DEBUG: Wizard data updated successfully');

          // Force a small delay to ensure state update completes
          setTimeout(() => {
            console.log('🔧 DEBUG: Delayed check - current validation warnings count:', 
              wizardData.validationResults?.warnings?.length || 0);
          }, 100);

        } catch (error) {
          console.error('Error during revalidation with entityChoice:', error);
        }
      };

      revalidateWithChoice();
    }
  }, [entityChoice, uploadedFile, originalErdContent]);
  // Removed updateWizardData and isValidating from dependencies to prevent infinite loops

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

  // Individual naming conflict fixes - CUSTOM PRIMARY COLUMNS SUPPORT
  const applyNamingConflictFixForEntity = useCallback((entityName: string) => {
    let updatedContent = correctedErdContent;
    
    // Ensure we have proper line breaks before processing
    if (updatedContent.includes('\\n')) {
      updatedContent = updatedContent.replace(/\\n/g, '\n');
    }
    
    // Find the specific warning for this entity to determine fix type
    const entityWarning = wizardData.validationResults?.warnings?.find((w: any) => 
      w.type === 'naming_conflict' && w.entity === entityName
    );
    
    const hasCustomPrimaryColumn = entityWarning?.message?.includes('custom primary column');
    const isInfoLevel = entityWarning?.severity === 'info';
    
    if (hasCustomPrimaryColumn) {
      // Case: Entity has custom PK + separate 'name' column - rename the 'name' column
      const entityRegex = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\bstring\\s+name\\s+([^\n]*?)(\\s*[\\s\\S]*?\\})`, 'g');
      updatedContent = updatedContent.replace(entityRegex, (match, entityStart, columnDescription, entityEnd) => {
        if (!columnDescription.includes('PK')) {
          return `${entityStart}string ${entityName.toLowerCase()}_name ${columnDescription}${entityEnd}`;
        }
        return match;
      });
    } else if (isInfoLevel) {
      // Case: Entity has no explicit PK but has 'name' column - make it primary
      const entityRegex = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\bstring\\s+name\\s+([^\n]*?)(\\s*[\\s\\S]*?\\})`, 'g');
      updatedContent = updatedContent.replace(entityRegex, (match, entityStart, columnDescription, entityEnd) => {
        if (!columnDescription.includes('PK')) {
          return `${entityStart}string name PK ${columnDescription}${entityEnd}`;
        }
        return match;
      });
    } else {
      // Legacy behavior - rename name column
      const entityPattern = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\n?\\s*string\\s+name(?![\\w_])`, 'g');
      updatedContent = updatedContent.replace(entityPattern, `$1\n        string ${entityName.toLowerCase()}_name`);
    }
    
    updateWizardData({ 
      correctedErdContent: updatedContent,
      fixedIssues: new Set([...fixedIssues, `naming-conflicts-${entityName}`])
    });
  }, [correctedErdContent, fixedIssues, updateWizardData, wizardData.validationResults]);

  const handleBackendWarningFix = useCallback(async (warningOrId: any) => {
    console.log('🔧 DEBUG: handleBackendWarningFix called with:', warningOrId);
    
    // Handle both warning object and warning ID
    const warningId = typeof warningOrId === 'string' ? warningOrId : warningOrId?.id;
    
    if (!warningId) {
      console.error('Warning ID not found in:', warningOrId);
      return;
    }

    try {
      console.log('🔧 DEBUG: Sending to API:', {
        mermaidContentLength: correctedErdContent?.length,
        mermaidContentPreview: correctedErdContent?.substring(0, 200),
        warningId: warningId
      });
      
      // Call the individual fix API
      console.log('🔧 FRONTEND DEBUG: Calling backend fix with entityChoice:', wizardData.entityChoice);
      const fixResult = await ApiService.fixIndividualWarning({
        mermaidContent: correctedErdContent,
        warningId: warningId,
        entityChoice: wizardData.entityChoice || undefined,
        options: {}
      });

      console.log('🔧 DEBUG: Fix result received:', fixResult);

      // Cast to any to handle the actual API response structure which has a data wrapper
      const result = fixResult as any;

      if (result.success && (result.fixedContent || result.data?.fixedContent)) {
        console.log('🔧 DEBUG: Individual fix applied successfully:', result.appliedFix || result.data?.appliedFix);
        
        const fixedContent = result.fixedContent || result.data?.fixedContent;
        
        // Update the corrected ERD content
        updateWizardData({
          correctedErdContent: fixedContent,
          fixedIssues: new Set([...fixedIssues, warningId])
        });

        // Re-validate to get updated warnings
        const revalidationResult = await ApiService.validateFile({
          name: uploadedFile?.name || 'fixed.mmd',
          content: fixedContent,
          size: fixedContent.length,
          lastModified: Date.now()
        }, wizardData.entityChoice);

        updateWizardData({
          validationResults: revalidationResult
        });

      } else {
        console.error('Individual fix failed:', result.error || result.message || result.data?.error || result.data?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('Error applying individual fix:', error);
    }
  }, [correctedErdContent, fixedIssues, updateWizardData, uploadedFile, wizardData.entityChoice]);

  const applyAllFixes = useCallback(async () => {
    // Apply all auto-fixable warnings one by one
    const autoFixableWarnings = wizardData.validationResults?.warnings?.filter((w: ValidationWarning) => w.autoFixable) || [];
    
    for (const warning of autoFixableWarnings) {
      try {
        await handleBackendWarningFix(warning.id);
      } catch (error) {
        console.error('Failed to fix warning:', warning.id, error);
      }
    }
  }, [handleBackendWarningFix, wizardData.validationResults]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (revalidationTimeoutRef.current) {
        clearTimeout(revalidationTimeoutRef.current);
      }
    };
  }, []);

  // Note: Parsed entities and relationships now come from backend validation

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

                {/* Validation Loading State */}
                {isValidating && (
                  <MessageBar intent="info" className={styles.validationMessageBar}>
                    <MessageBarBody>
                      <strong>Validating ERD...</strong><br />
                      Analyzing your ERD structure and applying corrections...
                    </MessageBarBody>
                  </MessageBar>
                )}

                {/* Validation Error State */}
                {validationError && (
                  <MessageBar intent="error" className={styles.validationMessageBar}>
                    <MessageBarBody>
                      <strong>Validation Error</strong><br />
                      {validationError}
                    </MessageBarBody>
                  </MessageBar>
                )}

                {uploadedFile && !isValidating && (
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
                            onClick={() => handleCDMChoice('cdm')}
                            className={styles.cdmChoiceButton}
                          >
                            Use CDM entities
                          </Button>
                          <Button 
                            appearance="secondary"
                            onClick={() => handleCDMChoice('custom')}
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
                
                {/* Backend Validation Warnings */}
                {wizardData.validationResults?.warnings?.length > 0 && (
                  <>
                    {/* Auto-corrected warnings (info style) */}
                    {wizardData.validationResults.warnings
                      .filter((warning: any) => {
                        // Hide CDM-related warnings if user has already chosen to use CDM entities
                        if (wizardData.entityChoice === 'cdm' && 
                            (warning.category === 'cdm' || warning.type === 'cdm_entity_detected' || warning.type === 'cdm_summary')) {
                          return false;
                        }
                        return warning.autoFixed;
                      })
                      .map((warning: any, index: number) => (
                      <MessageBar 
                        key={`auto-${index}`}
                        intent="info"
                        className={styles.validationMessageBar}
                      >
                        <MessageBarBody>
                          <strong>
                            Auto-corrected: {warning.category === 'relationships' && warning.type === 'many_to_many_auto_corrected' ? 'Many-to-Many Relationship Converted' : warning.message}
                          </strong><br />
                          {warning.corrections && (
                            <>
                              <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                                Original: {warning.corrections.originalRelationship}
                              </Text><br />
                              <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                                Created junction table: {warning.corrections.junctionTable}
                              </Text><br />
                              <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                                New relationships: {warning.corrections.newRelationships.join(' and ')}
                              </Text>
                            </>
                          )}
                        </MessageBarBody>
                      </MessageBar>
                    ))}

                    {/* Warning messages for fixable warnings */}
                    {wizardData.validationResults.warnings
                      .filter((warning: any) => {
                        // Hide CDM-related warnings if user has already chosen to use CDM entities
                        if (wizardData.entityChoice === 'cdm' && 
                            (warning.category === 'cdm' || warning.type === 'cdm_entity_detected' || warning.type === 'cdm_summary')) {
                          return false;
                        }
                        
                        // Never show warnings for CDM entities (Account, Contact)
                        const cdmEntities = ['Account', 'Contact'];
                        if (warning.entity && cdmEntities.includes(warning.entity)) {
                          return false;
                        }
                        
                        // For FK warnings, also check the relationship field for CDM entities
                        if (warning.relationship) {
                          const relationshipMatch = warning.relationship.match(/(\w+)\s*→\s*(\w+)/);
                          if (relationshipMatch) {
                            const [, fromEntity, toEntity] = relationshipMatch;
                            if (cdmEntities.includes(fromEntity) || cdmEntities.includes(toEntity)) {
                              return false;
                            }
                          }
                        }
                        
                        // Show all warnings that are auto-fixable and not already auto-fixed or user-fixed
                        return !warning.autoFixed && warning.autoFixable === true && !fixedIssues.has(warning.id);
                      })
                      .map((warning: any, index: number) => (
                        <MessageBar 
                          key={`fixable-warning-msg-${index}`}
                          intent="warning"
                          className={styles.validationMessageBar}
                        >
                          <MessageBarBody>
                            <strong>Warning: {warning.message}</strong><br />
                            <Text style={{ fontSize: '10px', color: tokens.colorNeutralForeground3, fontFamily: 'monospace' }}>
                              ID: {warning.id}
                            </Text><br />
                            <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                              {warning.suggestion || 'This issue can be automatically fixed.'}
                            </Text>
                          </MessageBarBody>
                        </MessageBar>
                      ))}

                    {/* Fixable warnings with comparison format */}
                    {wizardData.validationResults.warnings
                      .filter((warning: any) => {
                        
                        // Hide CDM-related warnings if user has already chosen to use CDM entities
                        if (wizardData.entityChoice === 'cdm' && 
                            (warning.category === 'cdm' || warning.type === 'cdm_entity_detected' || warning.type === 'cdm_summary')) {
                          return false;
                        }
                        
                        // Never show warnings for CDM entities (Account, Contact)
                        const cdmEntities = ['Account', 'Contact'];
                        if (warning.entity && cdmEntities.includes(warning.entity)) {
                          return false;
                        }
                        
                        // For FK warnings, also check the relationship field for CDM entities
                        if (warning.relationship) {
                          const relationshipMatch = warning.relationship.match(/(\w+)\s*→\s*(\w+)/);
                          if (relationshipMatch) {
                            const [, fromEntity, toEntity] = relationshipMatch;
                            if (cdmEntities.includes(fromEntity) || cdmEntities.includes(toEntity)) {
                              return false;
                            }
                          }
                        }
                        
                        // Check if this specific warning has been fixed
                        if (warning.type === 'missing_primary_key') {
                          const entityMatch = warning.message.match(/Entity '(\w+)'/);
                          if (entityMatch) {
                            const warningId = `missing_primary_key_${entityMatch[1]}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        } else if (warning.type === 'missing_foreign_key') {
                          const entityMatch = warning.message.match(/no foreign key found in '(\w+)'/) || warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/);
                          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                          if (entityMatch && relationshipMatch) {
                            const warningId = `missing_foreign_key_${entityMatch[1]}_${relationshipMatch[1]}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        } else if (warning.type === 'foreign_key_naming') {
                          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                          if (relationshipMatch) {
                            const warningId = `foreign_key_naming_${relationshipMatch[2]}_${relationshipMatch[1]}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        } else if (warning.type === 'naming_conflict') {
                          const entityName = warning.entity || warning.message.match(/Entity '(\w+)'/)?.[1];
                          if (entityName) {
                            // Check if this entity actually has a 'name' column in the current ERD content
                            const entityRegex = new RegExp(`${entityName}\\s*\\{[\\s\\S]*?\\}`, 'g');
                            const entityMatch = correctedErdContent.match(entityRegex);
                            if (entityMatch && entityMatch[0]) {
                              // Check if there's actually a literal 'name' column (not event_name, location_name, etc.)
                              const hasLiteralNameColumn = /\bstring\s+name\s+/i.test(entityMatch[0]);
                              if (!hasLiteralNameColumn) {
                                return false;
                              }
                            }
                            
                            const warningId = `naming_conflict_${entityName}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        }
                        
                        // Check if this specific warning has been fixed (same logic as fixable warnings)
                        if (warning.type === 'missing_primary_key') {
                          const entityMatch = warning.message.match(/Entity '(\w+)'/);
                          if (entityMatch) {
                            const warningId = `missing_primary_key_${entityMatch[1]}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        } else if (warning.type === 'missing_foreign_key') {
                          const entityMatch = warning.message.match(/no foreign key found in '(\w+)'/) || warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/);
                          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                          if (entityMatch && relationshipMatch) {
                            const warningId = `missing_foreign_key_${entityMatch[1]}_${relationshipMatch[1]}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        } else if (warning.type === 'foreign_key_naming') {
                          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                          if (relationshipMatch) {
                            const warningId = `foreign_key_naming_${relationshipMatch[2]}_${relationshipMatch[1]}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        } else if (warning.type === 'multiple_primary_keys') {
                          const entityMatch = warning.message.match(/Entity '(\w+)'/);
                          if (entityMatch) {
                            const warningId = `multiple_primary_keys_${entityMatch[1]}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        } else if (warning.type === 'duplicate_columns') {
                          const entityName = warning.entity;
                          if (entityName) {
                            const warningId = `duplicate_columns_${entityName}`;
                            if (fixedIssues.has(warningId)) return false;
                          }
                        }
                        
                        // Show all warnings that are auto-fixable and not already auto-fixed or user-fixed
                        return !warning.autoFixed && warning.autoFixable === true && !fixedIssues.has(warning.id);
                      })
                      .map((warning: any, index: number) => {
                        let entityName = 'Entity';
                        
                        // First try to get entity name from warning.entity field
                        if (warning.entity) {
                          entityName = warning.entity;
                        } else if (warning.type === 'foreign_key_naming') {
                          // For foreign key naming, extract the target entity from the relationship
                          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                          entityName = relationshipMatch ? relationshipMatch[2] : 'Entity';
                        } else {
                          // For other warning types, extract from message using multiple patterns
                          const entityMatch = warning.message.match(/Entity '(\w+)'/) || 
                                            warning.message.match(/entity '(\w+)'/) ||
                                            warning.message.match(/no foreign key found in '(\w+)'/) || 
                                            warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/) ||
                                            warning.message.match(/in entity (\w+)/) ||
                                            warning.message.match(/(\w+) entity/) ||
                                            warning.message.match(/for (\w+):/) ||
                                            warning.message.match(/(\w+) has/);
                          entityName = entityMatch ? entityMatch[1] : 'Entity';
                        }
                        
                        return (
                          <div key={`fixable-${index}`} className={styles.backendWarningContainer}>
                            <div className={styles.correctionHeader}>
                              <Text className={styles.correctionTitle}>
                                {warning.type === 'missing_primary_key' 
                                  ? `Fix missing primary key in ${entityName}`
                                  : warning.type === 'missing_foreign_key'
                                  ? `Fix missing foreign key in ${entityName}`
                                  : warning.type === 'foreign_key_naming'
                                  ? `Fix foreign key naming in ${entityName}`
                                  : warning.type === 'naming_conflict'
                                  ? `Fix naming conflict in ${entityName}`
                                  : warning.type === 'multiple_primary_keys'
                                  ? `Fix multiple primary keys in ${entityName}`
                                  : warning.type === 'duplicate_columns'
                                  ? `Fix duplicate columns in ${entityName}`
                                  : `Fix issue in ${entityName}`}
                              </Text>
                              <Button
                                size="small"
                                appearance="primary"
                                className={styles.fixButton}
                                onClick={() => {
                                  console.log('🔘 DEBUG: Naming conflict fix button clicked for warning:', warning);
                                  handleBackendWarningFix(warning);
                                }}
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
                                    &nbsp;&nbsp;string existing_field<br />
                                    &nbsp;&nbsp;<span className={styles.highlightError}>
                                      {warning.type === 'missing_primary_key' 
                                        ? '// no primary key' 
                                        : warning.type === 'missing_foreign_key'
                                        ? '// missing foreign key'
                                        : warning.type === 'multiple_primary_keys'
                                        ? 'string id PK "First primary"\nstring other_id PK "Second primary"'
                                        : (() => {
                                            // For foreign key naming, find the actual existing FK name
                                            const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                                            if (relationshipMatch) {
                                              const toEntity = relationshipMatch[2];
                                              const fromEntity = relationshipMatch[1];
                                              const expectedFK = `${fromEntity.toLowerCase()}_id`;
                                              
                                              // Find existing FK in the ERD content for this entity
                                              const entityRegex = new RegExp(`${toEntity}\\s*\\{[\\s\\S]*?\\}`, 'g');
                                              const entityMatch = correctedErdContent.match(entityRegex);
                                              if (entityMatch && entityMatch[0]) {
                                                const fkRegex = /string\s+(\w+)\s+FK/g;
                                                let fkMatch;
                                                while ((fkMatch = fkRegex.exec(entityMatch[0])) !== null) {
                                                  const fkName = fkMatch[1];
                                                  if (fkName !== expectedFK && fkName.includes(fromEntity.toLowerCase())) {
                                                    return `string ${fkName} FK "Incorrectly named"`;
                                                  }
                                                }
                                              }
                                            }
                                            return 'string existing_fk FK "Incorrectly named"';
                                          })()}
                                    </span><br />
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
                                    &nbsp;&nbsp;string existing_field<br />
                                    &nbsp;&nbsp;<span className={styles.highlightSuccess}>
                                      {warning.type === 'missing_primary_key' 
                                        ? 'string id PK "Unique identifier"'
                                        : warning.type === 'multiple_primary_keys'
                                        ? 'string id PK "Primary key"\nstring other_id "Regular field"'
                                        : (() => {
                                            const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                                            const fromEntity = relationshipMatch ? relationshipMatch[1] : 'related';
                                            return `string ${fromEntity.toLowerCase()}_id FK "Foreign key to ${fromEntity}"`;
                                          })()}
                                    </span><br />
                                    &nbsp;&nbsp;...<br />
                                    {`}`}
                                  </Text>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                    {/* Non-fixable warnings (use severity-based intent) */}
                    {wizardData.validationResults.warnings
                      .filter((warning: any) => {
                        
                        // Hide CDM-related warnings if user has already chosen to use CDM entities
                        if (wizardData.entityChoice === 'cdm' && 
                            (warning.category === 'cdm' || warning.type === 'cdm_entity_detected' || warning.type === 'cdm_summary')) {
                          return false;
                        }
                        
                        // Never show warnings for CDM entities (Account, Contact)
                        const cdmEntities = ['Account', 'Contact'];
                        if (warning.entity && cdmEntities.includes(warning.entity)) {
                          return false;
                        }
                        
                        // For FK warnings, also check the relationship field for CDM entities
                        if (warning.type === 'foreign_key_naming' && warning.relationship) {
                          const relationshipMatch = warning.relationship.match(/(\w+)\s*→\s*(\w+)/);
                          if (relationshipMatch) {
                            const [, fromEntity, toEntity] = relationshipMatch;
                            if (cdmEntities.includes(fromEntity) || cdmEntities.includes(toEntity)) {
                              return false;
                            }
                          }
                        }
                        
                        return !warning.autoFixed && warning.type !== 'missing_primary_key' && warning.type !== 'missing_foreign_key' && warning.type !== 'foreign_key_naming' && warning.type !== 'naming_conflict' && warning.type !== 'multiple_primary_keys' && warning.type !== 'duplicate_columns';
                      })
                      .map((warning: any, index: number) => (
                      <MessageBar 
                        key={`warning-${index}`}
                        intent={warning.severity === 'info' ? 'info' : 'warning'}
                        className={styles.validationMessageBar}
                      >
                        <MessageBarBody>
                          <strong>{warning.severity === 'info' ? 'Info' : 'Warning'}: {warning.message}</strong><br />
                          <Text style={{ fontSize: '10px', color: tokens.colorNeutralForeground3, fontFamily: 'monospace' }}>
                            ID: {warning.id}
                          </Text><br />
                          <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                            {warning.suggestion || warning.message}
                          </Text>
                        </MessageBarBody>
                      </MessageBar>
                    ))}
                  </>
                )}
                
                {/* ERD Structure Status - Show success only when no issues exist */}
                {hasAnyIssues ? (
                  <MessageBar intent="warning" className={styles.validationMessageBar}>
                    <MessageBarBody>
                      ERD structure needs attention<br />
                      Your ERD structure is valid but has issues that should be addressed before deployment.
                    </MessageBarBody>
                  </MessageBar>
                ) : (!validationError && (
                  <MessageBar intent="success" className={styles.validationMessageBar}>
                    <MessageBarBody>
                      <strong>ERD validation complete</strong><br />
                      Your ERD structure looks good! No issues found.
                    </MessageBarBody>
                  </MessageBar>
                ))}

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
                    {namingConflicts.map((entityName) => (
                      <div key={entityName}>
                        <MessageBar intent="warning" className={styles.validationMessageBar}>
                          <MessageBarBody>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <strong>Naming conflict</strong><br />
                                Entity '{entityName}' has a non-primary column called 'name'. This will conflict with the auto-generated primary name column in Dataverse.<br />
                                <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>
                                  Suggestion: Consider renaming the column to something like '{entityName.toLowerCase()}_name', 'display_name', or 'title'.
                                </Text>
                              </div>
                              <Button 
                                appearance="secondary"
                                size="small"
                                className={styles.fixButton}
                                onClick={() => applyNamingConflictFixForEntity(entityName)}
                                style={{ marginLeft: '12px', flexShrink: 0 }}
                              >
                                Fix this (N/A)
                              </Button>
                            </div>
                          </MessageBarBody>
                        </MessageBar>
                      </div>
                    ))}
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
                                    Fix this (N/A)
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
                            {namingConflicts.map((entityName) => {
                              // Find the specific warning for this entity to determine fix type
                              const entityWarning = wizardData.validationResults?.warnings?.find((w: any) => 
                                w.type === 'naming_conflict' && w.entity === entityName
                              );
                              
                              const hasCustomPrimaryColumn = entityWarning?.message?.includes('custom primary column');
                              const isInfoLevel = entityWarning?.severity === 'info';
                              
                              return (
                                <div key={entityName} className={styles.correctionItem}>
                                  <div className={styles.correctionHeader}>
                                    <Text className={styles.correctionTitle}>
                                      {hasCustomPrimaryColumn 
                                        ? `Fix naming conflict in ${entityName} (Custom Primary Column)`
                                        : isInfoLevel
                                        ? `Optimize primary column in ${entityName}`
                                        : `Fix naming conflict in ${entityName}`
                                      }
                                    </Text>
                                    <Button 
                                      appearance="secondary"
                                      size="small"
                                      className={styles.fixButton}
                                      onClick={() => applyNamingConflictFixForEntity(entityName)}
                                    >
                                      Fix this (N/A)
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
                                          {hasCustomPrimaryColumn ? (
                                            <>
                                              &nbsp;&nbsp;string customer_code PK<br />
                                              &nbsp;&nbsp;<span className={styles.highlightError}>string name</span><br />
                                            </>
                                          ) : isInfoLevel ? (
                                            <>
                                              &nbsp;&nbsp;string other_field<br />
                                              &nbsp;&nbsp;<span className={styles.highlightError}>string name</span><br />
                                            </>
                                          ) : (
                                            <>
                                              &nbsp;&nbsp;string id<br />
                                              &nbsp;&nbsp;<span className={styles.highlightError}>string name</span><br />
                                            </>
                                          )}
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
                                          {hasCustomPrimaryColumn ? (
                                            <>
                                              &nbsp;&nbsp;string customer_code PK<br />
                                              &nbsp;&nbsp;<span className={styles.highlightSuccess}>string {entityName.toLowerCase()}_name</span><br />
                                            </>
                                          ) : isInfoLevel ? (
                                            <>
                                              &nbsp;&nbsp;string other_field<br />
                                              &nbsp;&nbsp;<span className={styles.highlightSuccess}>string name PK "Primary Name"</span><br />
                                            </>
                                          ) : (
                                            <>
                                              &nbsp;&nbsp;string id<br />
                                              &nbsp;&nbsp;<span className={styles.highlightSuccess}>string {entityName.toLowerCase()}_name</span><br />
                                            </>
                                          )}
                                          &nbsp;&nbsp;...<br />
                                          {`}`}
                                        </Text>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
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

                      {/* Show Complete ERD, ERD Diagram and Parsed Schema Overview when file is processed */}
                      {(() => {
                        console.log('🔍 DEBUG: Parsed Schema Display Condition Check:', {
                          parsedEntitiesLength: parsedEntities.length,
                          hasAnyIssues,
                          shouldShow: parsedEntities.length > 0 || !hasAnyIssues,
                          parsedEntities: parsedEntities,
                          validationError
                        });
                        return (parsedEntities.length > 0 || !hasAnyIssues);
                      })() && (
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
                                    {(() => {
                                      if (!correctedErdContent) return 'No ERD content available';
                                      
                                      // Convert escaped newlines to actual newlines
                                      // This handles JSON-escaped content from the backend
                                      let formattedContent = correctedErdContent;
                                      
                                      // Handle escaped newlines from JSON transmission
                                      if (typeof formattedContent === 'string' && formattedContent.includes('\\n')) {
                                        formattedContent = formattedContent.replace(/\\n/g, '\n');
                                      }
                                      
                                      return formattedContent.trim();
                                    })()}
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
                                        {rel.fromEntity} → {rel.toEntity}
                                      </Text>
                                      <Text className={styles.relationshipDetails}>
                                        {(typeof rel.cardinality === 'object' ? rel.cardinality?.type : rel.cardinality) || 'relationship'} - {rel.displayName || rel.name || 'Unnamed relationship'}
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
              disabled={!uploadedFile || !(entityChoice || !cdmDetected) || (parsedEntities.length === 0)}
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
