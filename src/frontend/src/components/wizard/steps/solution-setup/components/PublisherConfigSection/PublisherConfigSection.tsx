/**
 * PublisherConfigSection Component
 * Handles publisher selection and configuration
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
  PersonRegular,
} from '@fluentui/react-icons';
import { SearchableDropdown } from '../SearchableDropdown';
import { 
  DataversePublisher, 
  PublisherFormData, 
  UsePublisherConfigurationResult,
} from '../../types';
import styles from './PublisherConfigSection.module.css';

export interface PublisherConfigSectionProps {
  // Configuration result from hook
  publisherConfig: UsePublisherConfigurationResult;
  
  // Form data and validation
  formData: PublisherFormData;
  validationErrors: Record<string, any>;
  onFormDataChange: (updates: Partial<PublisherFormData>) => void;
  
  // Event handlers
  onCreateNewPublisher?: () => void;
  onEditPublisher?: (publisher: DataversePublisher) => void;
  onRefreshPublishers?: () => void;
}

export const PublisherConfigSection: React.FC<PublisherConfigSectionProps> = ({
  publisherConfig,
  formData,
  validationErrors,
  onFormDataChange,
  onCreateNewPublisher,
  onEditPublisher,
  onRefreshPublishers,
}) => {
  const {
    publishers,
    selectedPublisher,
    loadingPublishers: loading,
    publisherError: error,
    publisherDropdown: searchDropdown,
    setSelectedPublisher: selectPublisher,
    clearPublisherSelection: clearSelection,
    refreshPublishers: _retry,
  } = publisherConfig;

  /**
   * Renders a publisher item in the dropdown
   */
  const renderPublisherItem = (publisher: DataversePublisher) => (
    <div className={styles.publisherItem}>
      <div className={styles.publisherHeader}>
        <div className={styles.publisherNameSection}>
          <PersonRegular className={styles.publisherIcon} />
          <Text weight="semibold" className={styles.publisherName}>
            {publisher.friendlyname}
          </Text>
        </div>
        <div className={styles.publisherBadges}>
          {publisher.isreadonly && (
            <Badge color="warning" size="small">Read-only</Badge>
          )}
          {publisher.customizationprefix && (
            <Badge color="informative" size="small">
              {publisher.customizationprefix}_
            </Badge>
          )}
        </div>
      </div>
      
      <div className={styles.publisherDetails}>
        <Text size={200} className={styles.publisherDescription}>
          {publisher.description || 'No description available'}
        </Text>
        <Text size={100} className={styles.publisherMeta}>
          Unique Name: {publisher.uniquename} | Prefix: {publisher.customizationprefix || 'None'}
        </Text>
      </div>
    </div>
  );

  /**
   * Gets display text for selected publisher
   */
  const getSelectedPublisherText = (publisher: DataversePublisher) => {
    return publisher.friendlyname;
  };

  /**
   * Gets unique key for publisher
   */
  const getPublisherKey = (publisher: DataversePublisher) => {
    return publisher.publisherid;
  };

  /**
   * Handles publisher name input change
   */
  const handlePublisherNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newName = event.target.value;
    onFormDataChange({ publisherName: newName });
  };

  /**
   * Handles publisher unique name input change
   */
  const handlePublisherUniqueNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUniqueName = event.target.value;
    onFormDataChange({ publisherUniqueName: newUniqueName });
  };

  /**
   * Handles publisher prefix input change
   */
  const handlePublisherPrefixChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPrefix = event.target.value;
    onFormDataChange({ publisherPrefix: newPrefix });
  };

  /**
   * Handles publisher description input change
   */
  const handlePublisherDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDescription = event.target.value;
    onFormDataChange({ publisherDescription: newDescription });
  };

  return (
    <div className={styles.container}>
      {/* Section Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <Text size={500} weight="semibold">
            Publisher Configuration
          </Text>
          <Text size={200} className={styles.headerDescription}>
            Select an existing publisher or create a new one for your solution
          </Text>
        </div>
        
        {/* Action Buttons */}
        <div className={styles.headerActions}>
          {onRefreshPublishers && (
            <Button
              appearance="subtle"
              size="small"
              onClick={onRefreshPublishers}
              disabled={loading}
            >
              Refresh
            </Button>
          )}
          
          {onCreateNewPublisher && (
            <Button
              appearance="primary"
              size="small"
              icon={<AddRegular />}
              onClick={onCreateNewPublisher}
            >
              Create New
            </Button>
          )}
        </div>
      </div>

      {/* Publisher Selection */}
      <div className={styles.sectionContent}>
        <SearchableDropdown
          label="Select Publisher"
          hint="Choose an existing publisher or create a new one"
          required
          items={publishers}
          selectedItem={selectedPublisher}
          onItemSelect={selectPublisher}
          renderItem={renderPublisherItem}
          renderSelectedItem={getSelectedPublisherText}
          getItemKey={getPublisherKey}
          placeholder="Search publishers by name or unique name..."
          loading={loading}
          error={error}
          searchTerm={searchDropdown.searchTerm}
          onSearchChange={searchDropdown.handleSearchChange}
          isOpen={searchDropdown.isOpen}
          onOpenChange={searchDropdown.setIsOpen}
          maxItemsToShow={10}
        />
      </div>

      {/* Selected Publisher Details */}
      {selectedPublisher && (
        <Card className={styles.selectedPublisherCard}>
          <div className={styles.selectedPublisherHeader}>
            <div className={styles.selectedPublisherInfo}>
              <div className={styles.selectedPublisherTitle}>
                <PersonRegular className={styles.selectedPublisherIcon} />
                <Text size={400} weight="semibold">
                  {selectedPublisher.friendlyname}
                </Text>
              </div>
              <div className={styles.selectedPublisherBadges}>
                {selectedPublisher.isreadonly ? (
                  <Badge color="warning" size="small">Read-only Publisher</Badge>
                ) : (
                  <Badge color="success" size="small">Editable Publisher</Badge>
                )}
                {selectedPublisher.customizationprefix && (
                  <Badge color="informative" size="small">
                    Prefix: {selectedPublisher.customizationprefix}_
                  </Badge>
                )}
              </div>
            </div>
            
            <div className={styles.selectedPublisherActions}>
              <Button
                appearance="subtle"
                size="small"
                onClick={clearSelection}
              >
                Change
              </Button>
              
              {onEditPublisher && !selectedPublisher.isreadonly && (
                <Button
                  appearance="secondary"
                  size="small"
                  icon={<EditRegular />}
                  onClick={() => onEditPublisher(selectedPublisher)}
                >
                  Edit
                </Button>
              )}
            </div>
          </div>

          <div className={styles.selectedPublisherDetails}>
            <Text size={300}>
              <strong>Unique Name:</strong> {selectedPublisher.uniquename}
            </Text>
            <Text size={300}>
              <strong>Customization Prefix:</strong> {selectedPublisher.customizationprefix || 'Not set'}
            </Text>
            {selectedPublisher.description && (
              <Text size={300}>
                <strong>Description:</strong> {selectedPublisher.description}
              </Text>
            )}
          </div>

          {/* Read-only Publisher Warning */}
          {selectedPublisher.isreadonly && (
            <MessageBar intent="warning" className={styles.readonlyWarning}>
              <MessageBarBody>
                <InfoRegular className={styles.warningIcon} />
                This is a read-only system publisher. Consider creating a custom publisher for your organization.
              </MessageBarBody>
            </MessageBar>
          )}
        </Card>
      )}

      {/* New Publisher Form */}
      {!selectedPublisher && (
        <Card className={styles.newPublisherCard}>
          <div className={styles.newPublisherHeader}>
            <Text size={400} weight="semibold">
              Create New Publisher
            </Text>
            <Text size={200} className={styles.newPublisherDescription}>
              Fill in the details below to create a new publisher
            </Text>
          </div>

          <div className={styles.newPublisherForm}>
            {/* Publisher Display Name */}
            <Field
              label="Publisher Name"
              hint="The friendly display name for your publisher"
              required
              validationState={validationErrors.publisherName ? 'error' : 'none'}
              validationMessage={validationErrors.publisherName}
            >
              <Input
                placeholder="e.g., Contoso Corporation"
                value={formData.publisherName}
                onChange={handlePublisherNameChange}
              />
            </Field>

            {/* Publisher Unique Name */}
            <Field
              label="Unique Name"
              hint="Technical name (must be unique, alphanumeric with underscores)"
              required
              validationState={validationErrors.publisherUniqueName ? 'error' : 'none'}
              validationMessage={validationErrors.publisherUniqueName}
            >
              <Input
                placeholder="e.g., contoso_corp"
                value={formData.publisherUniqueName}
                onChange={handlePublisherUniqueNameChange}
              />
            </Field>

            {/* Customization Prefix */}
            <Field
              label="Customization Prefix"
              hint="2-8 character prefix for custom entities and fields (e.g., 'con' for Contoso)"
              required
              validationState={validationErrors.publisherPrefix ? 'error' : 'none'}
              validationMessage={validationErrors.publisherPrefix}
            >
              <Input
                placeholder="e.g., con"
                value={formData.publisherPrefix}
                onChange={handlePublisherPrefixChange}
                maxLength={8}
              />
            </Field>

            {/* Publisher Description */}
            <Field
              label="Description"
              hint="Optional description of your organization or publisher"
              validationState={validationErrors.publisherDescription ? 'error' : 'none'}
              validationMessage={validationErrors.publisherDescription}
            >
              <textarea
                className={styles.descriptionTextarea}
                placeholder="Describe your organization and the purpose of this publisher..."
                value={formData.publisherDescription}
                onChange={handlePublisherDescriptionChange}
                rows={3}
              />
            </Field>
          </div>
        </Card>
      )}

      {/* Configuration Status */}
      <div className={styles.statusIndicator}>
        {selectedPublisher ? (
          <div className={styles.statusSuccess}>
            <CheckmarkCircleRegular className={styles.statusIcon} />
            <Text size={200}>Publisher configured: {selectedPublisher.friendlyname}</Text>
          </div>
        ) : formData.publisherName ? (
          <div className={styles.statusInProgress}>
            <InfoRegular className={styles.statusIcon} />
            <Text size={200}>New publisher ready: {formData.publisherName}</Text>
          </div>
        ) : (
          <div className={styles.statusPending}>
            <WarningRegular className={styles.statusIcon} />
            <Text size={200}>Publisher configuration required</Text>
          </div>
        )}
      </div>
    </div>
  );
};
