/**
 * Global Choices Navigation Component
 * Step navigation controls for global choices step
 */

import React from 'react';
import {
  Button
} from '@fluentui/react-components';
import type { GlobalChoicesNavigationProps } from '../types';
import styles from '../../GlobalChoicesStep.module.css';

export const GlobalChoicesNavigation: React.FC<GlobalChoicesNavigationProps> = ({
  onNext,
  onPrevious,
  isValid,
  className
}) => {
  return (
    <div className={`${styles.navigationButtons} ${className || ''}`}>
      <Button 
        appearance="secondary"
        onClick={onPrevious}
        className={styles.previousButton}
      >
        Previous
      </Button>
      
      <Button 
        appearance="primary"
        onClick={onNext}
        disabled={!isValid}
        className={styles.nextButton}
      >
        Next: Deployment Summary
      </Button>
    </div>
  );
};
