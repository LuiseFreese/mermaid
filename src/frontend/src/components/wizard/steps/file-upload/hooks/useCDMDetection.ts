/**
 * Custom hook for CDM (Common Data Model) entity detection
 * Handles detection of CDM entities in ERD content and user choice management
 */

import { useState, useCallback, useMemo } from 'react';
import { findCDMEntitiesInContent } from '../utils/cdmEntityList';
import type { CDMDetectionResult } from '../types/file-upload.types';

export interface UseCDMDetectionResult {
  detectionResult: CDMDetectionResult;
  cdmDetection: CDMDetectionResult;
  detectCDMEntities: (content: string) => void;
  setCDMChoice: (choice: 'cdm' | 'custom' | null) => void;
  setEntityChoice: (choice: 'cdm' | 'custom' | null) => void;
  resetDetection: () => void;
  hasCDMEntities: boolean;
  detectedEntityCount: number;
}

/**
 * Hook for managing CDM entity detection and user choices
 * @param initialContent - Optional initial content to analyze
 * @returns CDM detection state and management functions
 */
export const useCDMDetection = (initialContent?: string): UseCDMDetectionResult => {
  const [detectionResult, setDetectionResult] = useState<CDMDetectionResult>({
    detected: false,
    entities: [],
    choice: null
  });

  /**
   * Detect CDM entities in the provided content
   */
  const detectCDMEntities = useCallback((content: string) => {
    const entities = findCDMEntitiesInContent(content);
    
    setDetectionResult({
      detected: entities.length > 0,
      entities: entities,
      choice: null // Reset choice when new content is analyzed
    });
  }, []);

  /**
   * Set the user's choice for handling CDM entities
   */
  const setEntityChoice = useCallback((choice: 'cdm' | 'custom' | null) => {
    setDetectionResult(prev => ({
      ...prev,
      choice
    }));
  }, []);

  /**
   * Reset the detection state
   */
  const resetDetection = useCallback(() => {
    setDetectionResult({
      detected: false,
      entities: [],
      choice: null
    });
  }, []);

  /**
   * Computed values for convenience
   */
  const hasCDMEntities = useMemo(() => 
    detectionResult.detected && detectionResult.entities.length > 0, 
    [detectionResult]
  );

  const detectedEntityCount = useMemo(() => 
    detectionResult.entities.length, 
    [detectionResult.entities]
  );

  // Auto-detect on initial content if provided
  useMemo(() => {
    if (initialContent) {
      detectCDMEntities(initialContent);
    }
  }, [initialContent, detectCDMEntities]);

  return {
    detectionResult,
    cdmDetection: detectionResult, // Alias for compatibility
    detectCDMEntities,
    setCDMChoice: setEntityChoice, // Alias for compatibility
    setEntityChoice,
    resetDetection,
    hasCDMEntities,
    detectedEntityCount
  };
};
