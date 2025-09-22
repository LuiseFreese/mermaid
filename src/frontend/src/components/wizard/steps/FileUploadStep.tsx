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
    fixedIssues,
    parsedEntities,
    parsedRelationships
  } = wizardData;

  const mermaidRef = useRef<HTMLDivElement>(null);
  const revalidationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Render Mermaid diagram - defined early to avoid initialization order issues
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
    const maxRetries = 20; // Increased retries
    const retryDelay = 200; // Increased delay

    const attemptRender = async () => {
      if (mermaidRef.current) {
        try {
          // Clear previous content
          mermaidRef.current.innerHTML = '';
          
          // Generate unique ID for this diagram
          const id = `mermaid-diagram-${Date.now()}`;
          
          // Render the diagram
          const { svg } = await mermaid.render(id, cleanedContent);
          mermaidRef.current.innerHTML = svg;
        } catch (error) {
          console.error('Error rendering Mermaid diagram:', error);
          mermaidRef.current.innerHTML = '<p style="color: red;">Error rendering diagram: ' + (error instanceof Error ? error.message : String(error)) + '</p>';
        }
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          setTimeout(attemptRender, retryDelay);
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
    
    let themeConfig;
    
    if (isPink) {
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
        
        // Use corrected ERD from backend if available, otherwise use original
        const correctedERD = validationResult.correctedERD || content;
        
        // Update wizard data with corrected information from backend
        updateWizardData({
          correctedErdContent: correctedERD,
          parsedEntities: validationResult.entities || [],
          parsedRelationships: validationResult.relationships || [],
          validationResults: validationResult
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

  // Check which issues are still present - Dynamic detection based on actual content
  const hasChoiceIssues = /\w+\s+(choice|category)\s+\w+/g.test(correctedErdContent);
  
  
  // Detect individual naming conflicts per entity - exclude CDM entities and fixed ones
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
          
          // Skip already fixed naming conflicts
          if (fixedIssues.has(`naming-conflicts-${entityName}`)) {
            return;
          }
          
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
  }, [correctedErdContent, fixedIssues]);
  
  const hasNamingIssues = namingConflicts.length > 0;
  
  // Check if there are any backend validation warnings that should prevent showing "looks good"
  const hasBackendWarnings = useMemo(() => {
    if (!wizardData.validationResults?.warnings) return false;
    
    return wizardData.validationResults.warnings.some((warning: any) => {
      // Hide CDM-related warnings if user has already chosen to use CDM entities
      if (wizardData.entityChoice === 'cdm' && 
          (warning.category === 'cdm' || warning.type === 'cdm_entity_detected' || warning.type === 'cdm_summary')) {
        return false;
      }
      
      // Never count warnings for CDM entities (Account, Contact)
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
      
      // Check if this specific warning has been fixed by the user
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
              return false; // False positive, don't count it
            }
          }
          
          const warningId = `naming_conflict_${entityName}`;
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
      
      // Count all non-auto-fixed warnings except pure info messages (like status column info)
      return !warning.autoFixed && warning.severity !== 'info';
    });
  }, [wizardData.validationResults, wizardData.entityChoice, fixedIssues, correctedErdContent]);
  
  // Check if ERD has any issues at all
  const hasAnyIssues = hasChoiceIssues || hasNamingIssues || hasBackendWarnings;

  // Re-render diagram when content changes AND user has made entity choice AND no validation issues
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
      shouldRender
    });
    
    if (shouldRender) {
      renderMermaidDiagram();
    }
  }, [correctedErdContent, renderMermaidDiagram, entityChoice, cdmDetected, hasAnyIssues]);

  // Re-render diagram when theme changes (if all conditions are met)
  useEffect(() => {
    const shouldRender = correctedErdContent && 
                         (entityChoice || !cdmDetected) && 
                         !hasChoiceIssues && 
                         !hasNamingIssues;
    
    if (shouldRender) {
      console.log('🎨 DEBUG: Theme changed, re-rendering diagram');
      setTimeout(() => renderMermaidDiagram(), 100);
    }
  }, [effectiveTheme, renderMermaidDiagram, correctedErdContent, entityChoice, cdmDetected, hasAnyIssues]);

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

  const handleBackendWarningFix = useCallback(async (warning: any) => {
    console.log('🔧 DEBUG: handleBackendWarningFix called with warning type:', warning.type, 'entity:', warning.entity);
    let updatedContent = correctedErdContent;
    let warningId = '';
    
    // Ensure we have proper line breaks before processing
    if (updatedContent.includes('\\n')) {
      updatedContent = updatedContent.replace(/\\n/g, '\n');
    }
    
    if (warning.type === 'missing_primary_key') {
      // Extract entity name from warning message
      const entityMatch = warning.message.match(/Entity '(\w+)'/);
      if (entityMatch) {
        const entityName = entityMatch[1];
        warningId = `missing_primary_key_${entityName}`;
        
        // Check if entity already has columns that could be primary keys
        const entityRegex = new RegExp(`${entityName}\\s*\\{[\\s\\S]*?\\}`, 'g');
        const entityContentMatch = updatedContent.match(entityRegex);
        if (entityContentMatch && entityContentMatch[0]) {
          // Look for an existing id-like column that's not marked as PK
          const idColumnMatch = entityContentMatch[0].match(/((?:string|int)\s+)(\w*id\w*|id)(\s+(?!PK)[^\n]*)/i);
          if (idColumnMatch) {
            // Mark existing id column as PK
            const oldColumn = idColumnMatch[0];
            const newColumn = `${idColumnMatch[1]}${idColumnMatch[2]} PK${idColumnMatch[3]}`;
            updatedContent = updatedContent.replace(oldColumn, newColumn);
          } else {
            // Add a new primary key attribute to the entity - preserve line structure
            const entityPattern = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)(\\n\\s*\\})`, 'g');
            updatedContent = updatedContent.replace(entityPattern, `$1\n        string id PK "Unique identifier"$2`);
          }
        }
      }
    } else if (warning.type === 'multiple_primary_keys') {
      // Fix multiple primary keys based on the specific issue
      const entityMatch = warning.message.match(/Entity '(\w+)'/);
      if (entityMatch) {
        const entityName = entityMatch[1];
        warningId = `multiple_primary_keys_${entityName}`;
        console.log('🔧 DEBUG: Fixing multiple primary keys for entity:', entityName);
        
        // Find the entity and analyze its columns
        const entityRegex = new RegExp(`${entityName}\\s*\\{[\\s\\S]*?\\}`, 'g');
        updatedContent = updatedContent.replace(entityRegex, (entityMatch) => {
          console.log('🔧 DEBUG: Entity content before fix:', entityMatch);
          
          // Collect all columns and their current attributes
          const columnRegex = /((?:string|int|number|datetime|date|time|bool|boolean)\s+\w+)\s*([^\n\r]*)?/g;
          const columns = [];
          let match;
          
          while ((match = columnRegex.exec(entityMatch)) !== null) {
            const attributes = (match[2] || '').trim();
            columns.push({
              fullMatch: match[0],
              columnDef: match[1],
              attributes: attributes,
              hasPK: attributes.includes('PK'),
              hasFK: attributes.includes('FK')
            });
          }
          
          console.log('🔧 DEBUG: Found columns:', columns.map(c => ({ def: c.columnDef, attrs: c.attributes, hasPK: c.hasPK, hasFK: c.hasFK })));
          
          const pkColumns = columns.filter(col => col.hasPK);
          const fkColumns = columns.filter(col => col.hasFK);
          
          let result = entityMatch;
          
          if (pkColumns.length > 1) {
            // Case 1: Multiple PK columns - keep only the first one
            console.log('🔧 DEBUG: Case 1 - Multiple PKs, keeping first');
            let foundFirstPK = false;
            result = result.replace(columnRegex, (match, columnDef, attributes) => {
              const attrs = (attributes || '').trim();
              if (attrs.includes('PK')) {
                if (!foundFirstPK) {
                  foundFirstPK = true;
                  console.log('🔧 DEBUG: Keeping first PK:', match);
                  return match;
                } else {
                  // Remove PK, keep FK if present
                  let cleanedAttrs = attrs.replace(/\bPK\b/g, '').replace(/\s+/g, ' ').trim();
                  if (cleanedAttrs.includes('FK')) {
                    const fkMatch = cleanedAttrs.match(/FK(\s*"[^"]*")?/);
                    cleanedAttrs = fkMatch ? fkMatch[0] : 'FK';
                  }
                  const newResult = cleanedAttrs ? `${columnDef} ${cleanedAttrs}` : columnDef;
                  console.log('🔧 DEBUG: Removed extra PK:', match, '->', newResult);
                  return newResult;
                }
              }
              return match;
            });
          } else if (pkColumns.length === 0 && fkColumns.length >= 2) {
            // Case 2: Junction table - no PKs but multiple FKs
            // Convert all FKs to PKs (composite primary key for junction table)
            console.log('🔧 DEBUG: Case 2 - Junction table, converting FKs to PKs');
            result = result.replace(columnRegex, (match, columnDef, attributes) => {
              const attrs = (attributes || '').trim();
              if (attrs.includes('FK')) {
                // Extract FK description if present
                const fkDescMatch = attrs.match(/FK\s*"([^"]*)"/);
                const description = fkDescMatch ? ` "Primary key - references ${fkDescMatch[1]}"` : '';
                const newResult = `${columnDef} PK${description}`;
                console.log('🔧 DEBUG: Converted FK to PK:', match, '->', newResult);
                return newResult;
              }
              return match;
            });
          } else if (pkColumns.length === 0) {
            // Case 3: No PKs at all - add PK to first suitable column
            console.log('🔧 DEBUG: Case 3 - No PKs, adding to first column');
            let addedPK = false;
            result = result.replace(columnRegex, (match, columnDef, attributes) => {
              if (!addedPK && !attributes.includes('FK')) {
                addedPK = true;
                const newResult = attributes ? `${columnDef} PK ${attributes}` : `${columnDef} PK`;
                console.log('🔧 DEBUG: Added PK to first column:', match, '->', newResult);
                return newResult;
              }
              return match;
            });
          }
          
          console.log('🔧 DEBUG: Entity content after fix:', result);
          return result;
        });
      }
    } else if (warning.type === 'missing_foreign_key') {
      // Extract entity and foreign key info from warning
      const entityMatch = warning.message.match(/no foreign key found in '(\w+)'/) || warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/);
      const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
      
      if (entityMatch && relationshipMatch) {
        const entityName = entityMatch[1];
        const fromEntity = relationshipMatch[1];
        const fkName = `${fromEntity.toLowerCase()}_id`;
        warningId = `missing_foreign_key_${entityName}_${fromEntity}`;
        
        // Add foreign key attribute to the entity - preserve line structure
        const entityPattern = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)(\\n\\s*\\})`, 'g');
        updatedContent = updatedContent.replace(entityPattern, 
          `$1\n        string ${fkName} FK "Foreign key to ${fromEntity}"$2`);
      }
    } else if (warning.type === 'foreign_key_naming') {
      // Extract entity and expected FK info from warning
      const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
      
      if (relationshipMatch) {
        const fromEntity = relationshipMatch[1];
        const toEntity = relationshipMatch[2];
        const expectedFK = `${fromEntity.toLowerCase()}_id`;
        warningId = `foreign_key_naming_${toEntity}_${fromEntity}`;
        
        // Find and rename the specific FK that should reference the fromEntity
        const entityRegex = new RegExp(`${toEntity}\\s*\\{[\\s\\S]*?\\}`, 'g');
        updatedContent = updatedContent.replace(entityRegex, (entityMatch) => {
          // Look for FK that contains the fromEntity name but isn't properly formatted
          const fromEntityLower = fromEntity.toLowerCase();
          const fkRegex = new RegExp(`((?:string|int)\\s+)(${fromEntityLower}\\w*)\\s+(FK[^\n]*)`, 'g');
          
          return entityMatch.replace(fkRegex, (fkMatch, typePart, currentFK, fkPart) => {
            // Only rename if it's not already the expected name and relates to this entity
            if (currentFK !== expectedFK && currentFK.includes(fromEntityLower)) {
              return `${typePart}${expectedFK} ${fkPart}`;
            }
            return fkMatch;
          });
        });
      }
    } else if (warning.type === 'naming_conflict') {
      // CUSTOM PRIMARY COLUMNS SUPPORT: Handle naming conflicts intelligently
      const entityName = warning.entity || warning.message.match(/Entity '(\w+)'/)?.[1];
      console.log('🔧 DEBUG: Extracted entity name:', entityName);
      if (entityName) {
        warningId = `naming_conflict_${entityName}`;
        console.log('🔧 DEBUG: Generated warning ID:', warningId);
        console.log('🔧 DEBUG: Warning message:', warning.message);
        
        // Determine the type of naming conflict and appropriate fix
        const hasCustomPrimaryColumn = warning.message.includes('custom primary column');
        const isInfoLevel = warning.severity === 'info';
        const contentBeforeReplace = updatedContent;
        
        if (hasCustomPrimaryColumn) {
          // Case: Entity has custom PK + separate 'name' column - rename the 'name' column
          console.log('🔧 DEBUG: Fixing custom primary column naming conflict');
          const entityRegex = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\bstring\\s+name\\s+([^\n]*?)(\\s*[\\s\\S]*?\\})`, 'g');
          updatedContent = updatedContent.replace(entityRegex, (match, entityStart, columnDescription, entityEnd) => {
            // Only replace if it's not a PK and is literally 'name'
            if (!columnDescription.includes('PK')) {
              const result = `${entityStart}string ${entityName.toLowerCase()}_name ${columnDescription}${entityEnd}`;
              console.log('🔧 DEBUG: Renamed conflicting name column:', result);
              return result;
            }
            return match;
          });
        } else if (isInfoLevel) {
          // Case: Entity has no explicit PK but has 'name' column - suggest making it primary
          console.log('🔧 DEBUG: Converting name column to primary key');
          const entityRegex = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\bstring\\s+name\\s+([^\n]*?)(\\s*[\\s\\S]*?\\})`, 'g');
          updatedContent = updatedContent.replace(entityRegex, (match, entityStart, columnDescription, entityEnd) => {
            // Add PK to the name column if it doesn't already have it
            if (!columnDescription.includes('PK')) {
              const result = `${entityStart}string name PK ${columnDescription}${entityEnd}`;
              console.log('🔧 DEBUG: Made name column primary:', result);
              return result;
            }
            return match;
          });
        } else {
          // Legacy behavior - rename name column
          console.log('🔧 DEBUG: Applying legacy naming conflict fix');
          const entityRegex = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\bstring\\s+name\\s+([^\n]*?)(\\s*[\\s\\S]*?\\})`, 'g');
          updatedContent = updatedContent.replace(entityRegex, (match, entityStart, columnDescription, entityEnd) => {
            if (!columnDescription.includes('PK')) {
              const result = `${entityStart}string ${entityName.toLowerCase()}_name ${columnDescription}${entityEnd}`;
              return result;
            }
            return match;
          });
        }
        
        console.log('🔧 DEBUG: Content changed?', contentBeforeReplace !== updatedContent);
        console.log('🔧 DEBUG: Content after naming fix:', updatedContent);
      }
    } else if (warning.type === 'duplicate_columns') {
      // Fix duplicate columns by renaming duplicates with incremental suffixes
      const entityName = warning.entity;
      if (entityName && warning.columns) {
        warningId = `duplicate_columns_${entityName}`;
        
        const entityRegex = new RegExp(`${entityName}\\s*\\{[\\s\\S]*?\\}`, 'g');
        updatedContent = updatedContent.replace(entityRegex, (entityMatch) => {
          let modifiedEntity = entityMatch;
          
          // For each duplicate column, rename subsequent occurrences
          warning.columns.forEach((duplicateColumn: string) => {
            const columnRegex = new RegExp(`((?:string|int)\\s+)${duplicateColumn}(\\s+[^\n]*)`, 'gi');
            let occurrenceCount = 0;
            
            modifiedEntity = modifiedEntity.replace(columnRegex, (match, typePart, rest) => {
              occurrenceCount++;
              if (occurrenceCount === 1) {
                return match; // Keep first occurrence as is
              } else {
                return `${typePart}${duplicateColumn}_${occurrenceCount}${rest}`;
              }
            });
          });
          
          return modifiedEntity;
        });
        
        console.log(`Fixed duplicate columns in ${entityName}: ${warning.columns.join(', ')}`);
      }
    }
    
    // Update the content and mark as fixed
    updateWizardData({ 
      correctedErdContent: updatedContent,
      fixedIssues: new Set([...fixedIssues, warningId])
    });
    
    // Debounce re-validation to prevent multiple simultaneous calls
    if (revalidationTimeoutRef.current) {
      clearTimeout(revalidationTimeoutRef.current);
    }
    
    console.log('🔧 DEBUG: Scheduling re-validation...');
    revalidationTimeoutRef.current = setTimeout(async () => {
      console.log('🔧 DEBUG: Starting re-validation...');
      try {
        const validationResult = await ApiService.validateFile({
          name: wizardData.uploadedFile?.name || 'corrected.mmd',
          content: updatedContent,
          size: updatedContent.length,
          lastModified: Date.now()
        }, wizardData.entityChoice);
        
        console.log('🔧 DEBUG: Re-validation completed, new warnings:', validationResult.warnings?.length || 0);
        console.log('🔧 DEBUG: New warnings details:', validationResult.warnings?.map(w => `${w.type}: ${w.entity || 'N/A'} - ${w.message?.substring(0, 50)}...`));
        
        // Update with fresh validation results
        updateWizardData({
          validationResults: validationResult,
          correctedErdContent: validationResult.correctedERD || updatedContent,
          parsedEntities: validationResult.entities || [],
          relationships: validationResult.relationships || [],
          cdmEntitiesDetected: validationResult.cdmEntitiesDetected || [],
          hasErrors: validationResult.hasErrors || false
        });
      } catch (error) {
        console.error('🔧 ERROR: Re-validation failed:', error);
      }
    }, 500); // 500ms debounce
  }, [correctedErdContent, fixedIssues, updateWizardData, wizardData.uploadedFile]);

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
    
    // Apply backend warning fixes
    wizardData.validationResults?.warnings?.forEach((warning: any) => {
      if (!warning.autoFixed && (warning.type === 'missing_primary_key' || warning.type === 'missing_foreign_key' || warning.type === 'foreign_key_naming')) {
        if (warning.type === 'missing_primary_key') {
          const entityMatch = warning.message.match(/Entity '(\w+)'/);
          if (entityMatch) {
            const entityName = entityMatch[1];
            const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*?)(\\s*\\})`, 'gs');
            updatedContent = updatedContent.replace(entityPattern, `$1        string id PK "Unique identifier"$2`);
          }
        } else if (warning.type === 'missing_foreign_key') {
          const entityMatch = warning.message.match(/no foreign key found in '(\w+)'/) || warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/);
          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
          
          if (entityMatch && relationshipMatch) {
            const entityName = entityMatch[1];
            const fromEntity = relationshipMatch[1];
            const fkName = `${fromEntity.toLowerCase()}_id`;
            
            const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*?)(\\s*\\})`, 'gs');
            updatedContent = updatedContent.replace(entityPattern, 
              `$1        string ${fkName} FK "Foreign key to ${fromEntity}"$2`);
          }
        } else if (warning.type === 'foreign_key_naming') {
          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
          
          if (relationshipMatch) {
            const fromEntity = relationshipMatch[1];
            const toEntity = relationshipMatch[2];
            const expectedFK = `${fromEntity.toLowerCase()}_id`;
            
            // Find and rename the specific FK that should reference the fromEntity
            const entityRegex = new RegExp(`${toEntity}\\s*\\{[\\s\\S]*?\\}`, 'g');
            updatedContent = updatedContent.replace(entityRegex, (entityMatch) => {
              // Look for FK that contains the fromEntity name but isn't properly formatted
              const fromEntityLower = fromEntity.toLowerCase();
              const fkRegex = new RegExp(`(string\\s+)(${fromEntityLower}\\w*)\\s+(FK[^\\n]*)`, 'g');
              
              return entityMatch.replace(fkRegex, (fkMatch, stringPart, currentFK, fkPart) => {
                // Only rename if it's not already the expected name and relates to this entity
                if (currentFK !== expectedFK && currentFK.includes(fromEntityLower)) {
                  return `${stringPart}${expectedFK} ${fkPart}`;
                }
                return fkMatch;
              });
            });
          }
        }
      }
    });
    
    updateWizardData({ 
      correctedErdContent: updatedContent,
      fixedIssues: new Set(['naming-conflicts', 'choice-columns', 'backend-warnings'])
    });
  }, [correctedErdContent, updateWizardData, hasChoiceIssues, hasNamingIssues, namingConflicts, wizardData.validationResults]);

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
                        // Use the same filtering logic as fixable warnings
                        if (wizardData.entityChoice === 'cdm' && 
                            (warning.category === 'cdm' || warning.type === 'cdm_entity_detected' || warning.type === 'cdm_summary')) {
                          return false;
                        }
                        
                        const cdmEntities = ['Account', 'Contact'];
                        if (warning.entity && cdmEntities.includes(warning.entity)) {
                          return false;
                        }
                        
                        if (warning.type === 'foreign_key_naming' && warning.relationship) {
                          const relationshipMatch = warning.relationship.match(/(\w+)\s*→\s*(\w+)/);
                          if (relationshipMatch) {
                            const [, fromEntity, toEntity] = relationshipMatch;
                            if (cdmEntities.includes(fromEntity) || cdmEntities.includes(toEntity)) {
                              return false;
                            }
                          }
                        }
                        
                        if (warning.type === 'naming_conflict') {
                          const entityName = warning.entity || warning.message.match(/Entity '(\w+)'/)?.[1];
                          if (entityName) {
                            const entityRegex = new RegExp(`${entityName}\\s*\\{[\\s\\S]*?\\}`, 'g');
                            const entityMatch = correctedErdContent.match(entityRegex);
                            if (entityMatch && entityMatch[0]) {
                              const hasLiteralNameColumn = /\bstring\s+name\s+/i.test(entityMatch[0]);
                              if (!hasLiteralNameColumn) {
                                return false;
                              }
                            }
                          }
                        }
                        
                        return !warning.autoFixed && (warning.type === 'missing_primary_key' || warning.type === 'missing_foreign_key' || warning.type === 'foreign_key_naming' || warning.type === 'naming_conflict' || warning.type === 'multiple_primary_keys' || warning.type === 'duplicate_columns');
                      })
                      .map((warning: any, index: number) => (
                        <MessageBar 
                          key={`fixable-warning-msg-${index}`}
                          intent="warning"
                          className={styles.validationMessageBar}
                        >
                          <MessageBarBody>
                            <strong>Warning: {warning.message}</strong><br />
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
                        if (warning.type === 'foreign_key_naming' && warning.relationship) {
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
                        
                        return !warning.autoFixed && (warning.type === 'missing_primary_key' || warning.type === 'missing_foreign_key' || warning.type === 'foreign_key_naming' || warning.type === 'naming_conflict' || warning.type === 'multiple_primary_keys' || warning.type === 'duplicate_columns');
                      })
                      .map((warning: any, index: number) => {
                        let entityName = 'Entity';
                        if (warning.type === 'foreign_key_naming') {
                          // For foreign key naming, extract the target entity from the relationship
                          const relationshipMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
                          entityName = relationshipMatch ? relationshipMatch[2] : 'Entity';
                        } else {
                          // For other warning types, extract from message
                          const entityMatch = warning.message.match(/Entity '(\w+)'/) || warning.message.match(/no foreign key found in '(\w+)'/) || warning.message.match(/Relationship defined but no foreign key found in '(\w+)'/);
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
                ) : (
                  <MessageBar intent="success" className={styles.validationMessageBar}>
                    <MessageBarBody>
                      <strong>ERD validation complete</strong><br />
                      Your ERD structure looks good! No issues found.
                    </MessageBarBody>
                  </MessageBar>
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
                                Fix this
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

                      {/* Only show Complete ERD, ERD Diagram and Parsed Schema Overview when there are no validation issues */}
                      {!hasAnyIssues && (
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
              disabled={!uploadedFile || !(entityChoice || !cdmDetected) || hasAnyIssues}
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
