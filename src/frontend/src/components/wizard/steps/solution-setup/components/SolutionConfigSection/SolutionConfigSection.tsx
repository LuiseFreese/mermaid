/**
 * SolutionConfigSection Component
 * Handles solution selection and configuration
 */

import React from 'react';
import {
  Text,
  Field,
  Input,
  Button,
  MessageBar,
  MessageBarBody,
  Card,
  Badge,
} from '@fluentui/react-components';
import { 
  InfoRegular, 
  EditRegular, 
  AddRegular,
  WarningRegular,
  CheckmarkCircleRegular,
} from '@fluentui/react-icons';
import { SearchableDropdown } from '../SearchableDropdown';
import { 
  DataverseSolution, 
  SolutionFormData, 
  UseSolutionConfigurationResult,
} from '../../types';
import styles from './SolutionConfigSection.module.css';

export interface SolutionConfigSectionProps {
  // Configuration result from hook
  solutionConfig: UseSolutionConfigurationResult;
  
  // Form data and validation
  formData: SolutionFormData;
  validationErrors: Record<string, any>;
  onFormDataChange: (updates: Partial<SolutionFormData>) => void;
  
  // Event handlers
  onCreateNewSolution?: () => void;
  onEditSolution?: (solution: DataverseSolution) => void;
  onRefreshSolutions?: () => void;
}

export const SolutionConfigSection: React.FC<SolutionConfigSectionProps> = ({
  solutionConfig,
  formData,
  validationErrors,
  onFormDataChange,
  onCreateNewSolution,
  onEditSolution,
  onRefreshSolutions,
}) => {
  const {
    solutions,
    selectedSolution,
    loadingSolutions: loading,
    solutionError: error,
    solutionDropdown: searchDropdown,
    setSelectedSolution: selectSolution,
    clearSolutionSelection: clearSelection,
    refreshSolutions: _retry,
  } = solutionConfig;

  /**
   * Renders a solution item in the dropdown
   */
  const renderSolutionItem = (solution: DataverseSolution) => (
    <div className={styles.solutionItem}>
      <div className={styles.solutionHeader}>
        <Text weight="semibold" className={styles.solutionName}>
          {solution.friendlyname}
        </Text>
        <div className={styles.solutionBadges}>
          {solution.ismanaged && (
            <Badge color="brand" size="small">Managed</Badge>
          )}
          {!solution.ismanaged && (
            <Badge color="subtle" size="small">Unmanaged</Badge>
          )}
          <Badge color="informative" size="small">
            v{solution.version}
          </Badge>
        </div>
      </div>
      
      <div className={styles.solutionDetails}>
        <Text size={200} className={styles.solutionDescription}>
          {solution.description || 'No description available'}
        </Text>
        <Text size={100} className={styles.solutionMeta}>
          Unique Name: {solution.uniquename} | Publisher: {solution.publisherdisplayname || 'Unknown'}
        </Text>
      </div>
    </div>
  );

  /**
   * Gets display text for selected solution
   */
  const getSelectedSolutionText = (solution: DataverseSolution) => {
    return solution.friendlyname;
  };

  /**
   * Gets unique key for solution
   */
  const getSolutionKey = (solution: DataverseSolution) => {
    return solution.solutionid;
  };

  /**
   * Handles solution name input change
   */
  const handleSolutionNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newName = event.target.value;
    onFormDataChange({ solutionName: newName });
  };

  /**
   * Handles solution unique name input change
   */
  const handleSolutionUniqueNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUniqueName = event.target.value;
    onFormDataChange({ solutionUniqueName: newUniqueName });
  };

  return (
        <div className={styles.container} data-testid="solution-config-section">
      {/* Section Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <Text size={500} weight="semibold">
            Solution Configuration
          </Text>
          <Text size={200} className={styles.headerDescription}>
            Select an existing solution or create a new one for your schema
          </Text>
        </div>
        
        {/* Action Buttons */}
        <div className={styles.headerActions}>
          {onRefreshSolutions && (
            <Button
              appearance="subtle"
              size="small"
              onClick={onRefreshSolutions}
              disabled={loading}
            >
              Refresh
            </Button>
          )}
          
          {onCreateNewSolution && (
            <Button
              appearance="primary"
              size="small"
              icon={<AddRegular />}
              onClick={onCreateNewSolution}
            >
              Create New
            </Button>
          )}
        </div>
      </div>

      {/* Solution Selection */}
      <div className={styles.sectionContent}>
        <SearchableDropdown
          label="Select Solution"
          hint="Choose an existing solution or create a new one"
          required
          items={solutions}
          selectedItem={selectedSolution}
          onItemSelect={selectSolution}
          renderItem={renderSolutionItem}
          renderSelectedItem={getSelectedSolutionText}
          getItemKey={getSolutionKey}
          placeholder="Search solutions by name or unique name..."
          loading={loading}
          error={error}
          searchTerm={searchDropdown.searchTerm}
          onSearchChange={searchDropdown.handleSearchChange}
          isOpen={searchDropdown.isOpen}
          onOpenChange={searchDropdown.setIsOpen}
          maxItemsToShow={10}
        />
      </div>

      {/* Selected Solution Details */}
      {selectedSolution && (
        <Card className={styles.selectedSolutionCard}>
          <div className={styles.selectedSolutionHeader}>
            <div className={styles.selectedSolutionInfo}>
              <Text size={400} weight="semibold">
                {selectedSolution.friendlyname}
              </Text>
              <div className={styles.selectedSolutionBadges}>
                {selectedSolution.ismanaged ? (
                  <Badge color="brand" size="small">Managed Solution</Badge>
                ) : (
                  <Badge color="subtle" size="small">Unmanaged Solution</Badge>
                )}
                <Badge color="informative" size="small">
                  Version {selectedSolution.version}
                </Badge>
              </div>
            </div>
            
            <div className={styles.selectedSolutionActions}>
              <Button
                appearance="subtle"
                size="small"
                onClick={clearSelection}
              >
                Change
              </Button>
              
              {onEditSolution && !selectedSolution.ismanaged && (
                <Button
                  appearance="secondary"
                  size="small"
                  icon={<EditRegular />}
                  onClick={() => onEditSolution(selectedSolution)}
                >
                  Edit
                </Button>
              )}
            </div>
          </div>

          <div className={styles.selectedSolutionDetails}>
            <Text size={300}>
              <strong>Unique Name:</strong> {selectedSolution.uniquename}
            </Text>
            <Text size={300}>
              <strong>Publisher:</strong> {selectedSolution.publisherdisplayname || 'Unknown'}
            </Text>
            {selectedSolution.description && (
              <Text size={300}>
                <strong>Description:</strong> {selectedSolution.description}
              </Text>
            )}
          </div>

          {/* Managed Solution Warning */}
          {selectedSolution.ismanaged && (
            <MessageBar intent="warning" className={styles.managedWarning}>
              <MessageBarBody>
                <InfoRegular className={styles.warningIcon} />
                This is a managed solution. Some properties may not be editable after deployment.
              </MessageBarBody>
            </MessageBar>
          )}
        </Card>
      )}

      {/* New Solution Form */}
      {!selectedSolution && (
        <Card className={styles.newSolutionCard}>
          <div className={styles.newSolutionHeader}>
            <Text size={400} weight="semibold">
              Create New Solution
            </Text>
            <Text size={200} className={styles.newSolutionDescription}>
              Fill in the details below to create a new solution
            </Text>
          </div>

          <div className={styles.newSolutionForm}>
            {/* Solution Display Name */}
            <Field
              label="Solution Name"
              hint="The friendly display name for your solution"
              required
              validationState={validationErrors.solutionName ? 'error' : 'none'}
              validationMessage={validationErrors.solutionName}
            >
              <Input
                placeholder="e.g., Customer Relationship Management"
                value={formData.solutionName}
                onChange={handleSolutionNameChange}
              />
            </Field>

            {/* Solution Unique Name */}
            <Field
              label="Unique Name"
              hint="Technical name (must be unique, alphanumeric with underscores)"
              required
              validationState={validationErrors.solutionUniqueName ? 'error' : 'none'}
              validationMessage={validationErrors.solutionUniqueName}
            >
              <Input
                placeholder="e.g., crm_solution"
                value={formData.solutionUniqueName}
                onChange={handleSolutionUniqueNameChange}
              />
            </Field>
          </div>
        </Card>
      )}

      {/* Configuration Status */}
      <div className={styles.statusIndicator}>
        {selectedSolution ? (
          <div className={styles.statusSuccess}>
            <CheckmarkCircleRegular className={styles.statusIcon} />
            <Text size={200}>Solution configured: {selectedSolution.friendlyname}</Text>
          </div>
        ) : formData.solutionName ? (
          <div className={styles.statusInProgress}>
            <InfoRegular className={styles.statusIcon} />
            <Text size={200}>New solution ready: {formData.solutionName}</Text>
          </div>
        ) : (
          <div className={styles.statusPending}>
            <WarningRegular className={styles.statusIcon} />
            <Text size={200}>Solution configuration required</Text>
          </div>
        )}
      </div>
    </div>
  );
};
