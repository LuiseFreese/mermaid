import React, { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  tokens,
  Field,
  Input,
  RadioGroup,
  Radio,
  Checkbox,
  Tooltip,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  MessageBar,
  MessageBarBody,
  Spinner,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import { SettingsRegular, InfoRegular, ErrorCircleRegular } from '@fluentui/react-icons';
import { usePublishers } from '../../../hooks/usePublishers';
import { useSolutions } from '../../../hooks/useSolutions';
import { useWizardContext } from '../../../context/WizardContext';

import styles from './SolutionSetupStep.module.css';

// Type definition for environment
interface DataverseEnvironment {
  id: string;
  name: string;
  url: string;
  powerPlatformEnvironmentId?: string;
  color?: string;
  metadata?: any;
}

interface SolutionSetupStepProps {
  onNext?: () => void;
  onPrevious?: () => void;
}

export const SolutionSetupStep: React.FC<SolutionSetupStepProps> = ({
  onNext,
  onPrevious,
}) => {
  const { wizardData, updateWizardData } = useWizardContext();
  const { 
    solutionType,
    solutionName,
    solutionInternalName,
    selectedSolution,
    publisherType,
    selectedPublisher,
    newPublisherName,
    newPublisherInternalName,
    newPublisherPrefix,
    includeRelatedTables
  } = wizardData;
  
  // Local state for search
  const [solutionSearchTerm, setSolutionSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [publisherSearchTerm, setPublisherSearchTerm] = useState('');
  const [showPublisherDropdown, setShowPublisherDropdown] = useState(false);
  
  // Environment state
  const [environments, setEnvironments] = useState<DataverseEnvironment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<DataverseEnvironment | null>(null);
  const [environmentsLoading, setEnvironmentsLoading] = useState(false);
  const [environmentsError, setEnvironmentsError] = useState<string | null>(null);
  
  // Use the custom hooks for publisher and solution data (with environment-specific loading)
  const { publishers, loading: loadingPublishers, error: publisherError, refetch: refetchPublishers } = usePublishers(selectedEnvironment?.id);
  const { solutions, loading: loadingSolutions, error: solutionError, refetch: refetchSolutions } = useSolutions(selectedEnvironment?.id);

  // Reset local search state when there's no wizard content (fresh start)
  useEffect(() => {
    if (!wizardData.originalErdContent) {
      setPublisherSearchTerm('');
      setSolutionSearchTerm('');
    }
  }, [wizardData.originalErdContent]);

  // Load environments on component mount
  useEffect(() => {
    const loadEnvironments = async () => {
      setEnvironmentsLoading(true);
      setEnvironmentsError(null);
      
      try {
        const response = await fetch('/api/environments');
        if (!response.ok) {
          throw new Error(`Failed to load environments: ${response.statusText}`);
        }
        
        const envData = await response.json();
        setEnvironments(envData.environments || []);
        
        // Auto-select first environment if available
        if (envData.environments && envData.environments.length > 0 && !selectedEnvironment) {
          const firstEnv = envData.environments[0];
          setSelectedEnvironment(firstEnv);
          // Also update wizard context immediately
          updateWizardData({ targetEnvironment: firstEnv });
        }
      } catch (error) {
        console.error('Failed to load environments:', error);
        setEnvironmentsError(error instanceof Error ? error.message : 'Failed to load environments');
      } finally {
        setEnvironmentsLoading(false);
      }
    };
    
    loadEnvironments();
  }, []);

  // Handle environment selection
  const handleEnvironmentChange = (environment: DataverseEnvironment) => {
    setSelectedEnvironment(environment);
    
    // Store in wizard data
    updateWizardData({
      targetEnvironment: environment,
    });
  };

  // Filter solutions based on search term
  const filteredSolutions = useMemo(() => {
    if (!solutionSearchTerm.trim()) return solutions;
    
    const searchLower = solutionSearchTerm.toLowerCase();
    return solutions.filter(solution => 
      solution.friendlyname.toLowerCase().includes(searchLower) ||
      solution.uniquename.toLowerCase().includes(searchLower) ||
      (solution.publisherid?.uniquename?.toLowerCase().includes(searchLower))
    );
  }, [solutions, solutionSearchTerm]);

  // Show solutions to display (all solutions when no search, filtered when searching)
  const solutionsToShow = solutionSearchTerm.trim() ? filteredSolutions : solutions;

  // Filter publishers based on search term
  const filteredPublishers = useMemo(() => {
    if (!publisherSearchTerm.trim()) return publishers;
    
    const searchLower = publisherSearchTerm.toLowerCase();
    return publishers.filter(publisher => 
      publisher.displayName.toLowerCase().includes(searchLower) ||
      publisher.uniqueName.toLowerCase().includes(searchLower) ||
      publisher.prefix.toLowerCase().includes(searchLower)
    );
  }, [publishers, publisherSearchTerm]);

  // Show publishers to display (all publishers when no search, filtered when searching)
  const publishersToShow = publisherSearchTerm.trim() ? filteredPublishers : publishers;

  // Auto-generate internal names and prefix
  const handlesolutionNameChange = (value: string) => {
    updateWizardData({ solutionName: value });
    // Generate internal name by removing spaces and special characters
    const internal = value.replace(/[^a-zA-Z0-9]/g, '');
    updateWizardData({ solutionInternalName: internal });
  };

  const handlenewPublisherNameChange = (value: string) => {
    updateWizardData({ newPublisherName: value });
    // Generate internal name
    const internal = value.replace(/[^a-zA-Z0-9]/g, '');
    updateWizardData({ newPublisherInternalName: internal });
    // Auto-generate prefix from first 8 characters of unique name
    const prefix = internal.substring(0, 8).toLowerCase();
    updateWizardData({ newPublisherPrefix: prefix });
  };

  const handlenewPublisherInternalNameChange = (value: string) => {
    updateWizardData({ newPublisherInternalName: value });
    // Auto-generate prefix from first 8 characters
    const prefix = value.substring(0, 8).toLowerCase();
    updateWizardData({ newPublisherPrefix: prefix });
  };

  const isFormValid = () => {
    // Solution validation
    if (solutionType === 'new') {
      if (!solutionName || !solutionInternalName) return false;
    } else {
      if (!selectedSolution) return false;
    }
    
    // Publisher validation (only required for new solutions)
    if (solutionType === 'new') {
      if (publisherType === 'existing') {
        return !!selectedPublisher;
      } else {
        return !!(newPublisherName && newPublisherInternalName && newPublisherPrefix);
      }
    }
    
    return true;
  };

  return (
    <Card style={{ 
      boxShadow: tokens.shadow4,
      minHeight: '1200px',
      height: 'auto',
      width: '100%'
    }}>
      <CardHeader
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SettingsRegular style={{ fontSize: '20px', color: tokens.colorBrandBackground }} />
            <Text className={styles.headerText} weight="bold">Solution & Publisher Setup</Text>
          </div>
        }
        description={
          <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
            Define your solution name and choose or create a publisher for your Dataverse solution.
          </Text>
        }
      />
      
      <CardPreview style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          padding: '24px',
          flex: 1,
          minHeight: '600px'
        }}>
          
          {/* Environment Selection Accordion */}
          <Accordion multiple collapsible defaultOpenItems={["environment-config"]} className={styles.schemaAccordion}>
            <AccordionItem value="environment-config">
              <AccordionHeader>
                <Text className={styles.accordionHeaderText}>
                  Target Environment
                </Text>
              </AccordionHeader>
              <AccordionPanel>
                {environmentsLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', justifyContent: 'center', color: 'var(--colorNeutralForeground3)' }}>
                    <Spinner size="small" />
                    <Text size={300}>Loading environments...</Text>
                  </div>
                ) : environmentsError ? (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <ErrorCircleRegular style={{ marginRight: '8px' }} />
                      {environmentsError}
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <Field label="Search and Select Environment">
                    <Dropdown
                      placeholder="Select an environment"
                      value={selectedEnvironment ? selectedEnvironment.name : ''}
                      selectedOptions={selectedEnvironment ? [selectedEnvironment.id] : []}
                      onOptionSelect={(_, data) => {
                        const env = environments.find(e => e.id === data.optionValue);
                        if (env) {
                          handleEnvironmentChange(env);
                        }
                      }}
                    >
                      {environments.map(env => (
                        <Option key={env.id} value={env.id} text={env.name}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: env.color === 'blue' ? '#0078d4' : 
                                              env.color === 'yellow' ? '#ffd23f' :
                                              env.color === 'red' ? '#d13438' : '#6b6b6b',
                              flexShrink: 0
                            }}></div>
                            <div>
                              <div style={{ fontWeight: '600' }}>{env.name}</div>
                              <div style={{ fontSize: '12px', color: '#605e5c' }}>{env.url}</div>
                            </div>
                          </div>
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>
                )}
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
          
          {/* Solution Configuration Accordion */}
          <Accordion multiple collapsible defaultOpenItems={["solution-config"]} className={styles.schemaAccordion}>
            <AccordionItem value="solution-config">
              <AccordionHeader>
                <Text className={styles.accordionHeaderText}>
                  Solution
                </Text>
              </AccordionHeader>
              <AccordionPanel>
                <RadioGroup
                  value={solutionType}
                  onChange={(_, data) => updateWizardData({ solutionType: data.value as 'new' | 'existing' })}
                  style={{ marginBottom: '16px' }}
                >
                  <Radio value="new" label="Create new solution" />
                  <Radio value="existing" label="Add to existing solution" />
                </RadioGroup>

                {solutionType === 'existing' && (
                  <div style={{ 
                    marginLeft: '24px', 
                    marginBottom: '24px',
                    position: 'relative',
                    zIndex: 1
                  }}>
                    {solutionError && (
                      <MessageBar intent="error" style={{ marginBottom: '12px' }}>
                        <MessageBarBody>
                          Failed to load solutions: {solutionError}
                          <Button 
                            appearance="transparent" 
                            size="small"
                            onClick={refetchSolutions}
                            style={{ marginLeft: '8px' }}
                          >
                            Retry
                          </Button>
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    
                    <Field label="Search and Select Solution">
                      <div style={{ position: 'relative', width: '100%' }}>
                        <Input
                          placeholder={loadingSolutions ? "Loading solutions..." : "Click to see all solutions or type to search..."}
                          value={selectedSolution ? 
                            `${selectedSolution.friendlyname} (${selectedSolution.uniquename})` 
                            : solutionSearchTerm
                          }
                          disabled={loadingSolutions || !!solutionError}
                          onChange={(_, data) => {
                            if (!selectedSolution) {
                              setSolutionSearchTerm(data.value);
                              setShowDropdown(true);
                            }
                          }}
                          onFocus={() => {
                            if (selectedSolution) {
                              // Clear selection when focusing to allow new search
                              updateWizardData({ selectedSolution: null });
                              setSolutionSearchTerm('');
                            }
                            setShowDropdown(true);
                          }}
                          onBlur={() => {
                            // Delay hiding to allow click on dropdown items
                            setTimeout(() => setShowDropdown(false), 150);
                          }}
                          style={{ width: '100%' }}
                        />
                        
                        {/* Dropdown results */}
                        {!selectedSolution && showDropdown && solutionsToShow.length > 0 && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              backgroundColor: tokens.colorNeutralBackground1,
                              border: `1px solid ${tokens.colorNeutralStroke1}`,
                              borderRadius: tokens.borderRadiusMedium,
                              boxShadow: tokens.shadow8,
                              maxHeight: '400px',
                              overflowY: 'auto',
                              zIndex: 1000,
                              marginTop: '2px'
                            }}
                            onMouseDown={(e) => {
                              // Prevent input blur when clicking on dropdown
                              e.preventDefault();
                            }}
                          >
                            {solutionsToShow.slice(0, 15).map((solution) => (
                              <div
                                key={solution.solutionid}
                                onClick={() => {
                                  updateWizardData({ selectedSolution: solution });
                                  // When selecting an existing solution, automatically set its publisher
                                  if (solution.publisherid) {
                                    updateWizardData({ 
                                      selectedPublisher: {
                                        id: solution.publisherid.publisherid,
                                        uniqueName: solution.publisherid.uniquename,
                                        displayName: solution.publisherid.uniquename, // Will use uniquename as display name
                                        prefix: solution.publisherid.customizationprefix
                                      }
                                    });
                                  }
                                  setSolutionSearchTerm('');
                                  setShowDropdown(false);
                                }}
                                style={{
                                  padding: '12px 16px',
                                  cursor: 'pointer',
                                  borderBottom: `1px solid ${tokens.colorNeutralStroke2}`
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = tokens.colorNeutralBackground1Hover;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                              >
                                <div style={{ fontWeight: '500', marginBottom: '4px' }}>{solution.friendlyname}</div>
                                <div style={{ 
                                  fontSize: '12px', 
                                  color: tokens.colorNeutralForeground2,
                                  lineHeight: '1.3'
                                }}>
                                  {solution.uniquename} • Publisher: {solution.publisherid?.uniquename || 'Unknown'}
                                </div>
                              </div>
                            ))}
                            {solutionsToShow.length > 15 && (
                              <div style={{
                                padding: '8px 12px',
                                fontSize: '12px',
                                color: tokens.colorNeutralForeground2,
                                borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
                                textAlign: 'center'
                              }}>
                                {solutionsToShow.length - 15} more results available. Type to search and filter.
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* No results message */}
                        {!selectedSolution && showDropdown && solutionSearchTerm && solutionsToShow.length === 0 && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              backgroundColor: tokens.colorNeutralBackground1,
                              border: `1px solid ${tokens.colorNeutralStroke1}`,
                              borderRadius: tokens.borderRadiusMedium,
                              padding: '12px',
                              color: tokens.colorNeutralForeground2,
                              textAlign: 'center',
                              zIndex: 1000,
                              marginTop: '2px'
                            }}
                          >
                            No solutions found matching "{solutionSearchTerm}"
                          </div>
                        )}
                      </div>
                      
                      {selectedSolution && (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px',
                          backgroundColor: tokens.colorNeutralBackground2,
                          borderRadius: tokens.borderRadiusMedium,
                          fontSize: '12px'
                        }}>
                          <strong>Selected:</strong> {selectedSolution.friendlyname} ({selectedSolution.uniquename})
                          <br />
                          <strong>Publisher:</strong> {selectedSolution.publisherid?.uniquename || 'Unknown'}
                          <Button
                            appearance="transparent"
                            size="small"
                            onClick={() => {
                              updateWizardData({ selectedSolution: null });
                              setSolutionSearchTerm('');
                            }}
                            style={{ marginLeft: '8px', fontSize: '10px' }}
                          >
                            Change
                          </Button>
                        </div>
                      )}
                    </Field>
                  </div>
                )}

                {solutionType === 'new' && (
                  <div style={{ marginLeft: '24px' }}>
                    <Field
                      label="Solution Display Name (Friendly)"
                      required
                      hint="Friendly name for your solution that users will see"
                      style={{ marginBottom: '16px' }}
                    >
                      <Input
                        placeholder="e.g., Customer Management Solution"
                        value={solutionName}
                        onChange={(e) => handlesolutionNameChange(e.target.value)}
                      />
                    </Field>

                    <Field
                      label="Solution Name (Internal)"
                      hint="Auto-generated internal unique name for Dataverse (no spaces, letters and numbers only)"
                      style={{ marginBottom: '24px' }}
                    >
                      <Input
                        value={solutionInternalName}
                        onChange={(e) => updateWizardData({ solutionInternalName: e.target.value })}
                        placeholder="CustomerManagementSolution"
                      />
                    </Field>
                  </div>
                )}

                {/* Solution Component Options - only for new solutions */}
                {solutionType === 'new' && (
                  <>
                    <Text 
                      size={400} 
                      weight="semibold"
                      style={{ 
                        display: 'block', 
                        marginBottom: '16px',
                        color: tokens.colorNeutralForeground1 
                      }}
                    >
                      Solution Component Options
                    </Text>
                    
                    <Field>
                      <Checkbox
                        checked={includeRelatedTables}
                        onChange={(_, data) => updateWizardData({ includeRelatedTables: data.checked === true })}
                        label={
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Text>Include related tables that have relationships with your ERD tables</Text>
                            <Tooltip
                              content={
                                <div>
                                  <Text weight="semibold">Unchecked (recommended):</Text> Only tables defined in your ERD will be added to the solution.
                                  <br /><br />
                                  <Text weight="semibold">Checked:</Text> Dataverse will automatically include existing tables that have relationships with your ERD tables (like Contact, Account, etc.).
                                </div>
                              }
                              relationship="label"
                            >
                              <InfoRegular style={{ fontSize: '16px', color: tokens.colorNeutralForeground2, cursor: 'help' }} />
                            </Tooltip>
                          </div>
                        }
                      />
                    </Field>
                  </>
                )}
              </AccordionPanel>
            </AccordionItem>
          </Accordion>

          {/* Publisher Configuration Accordion - only for new solutions */}
          {solutionType === 'new' && (
            <Accordion multiple collapsible defaultOpenItems={["publisher-config"]} className={styles.schemaAccordion}>
              <AccordionItem value="publisher-config">
                <AccordionHeader>
                  <Text className={styles.accordionHeaderText}>
                    Publisher
                  </Text>
                </AccordionHeader>
              <AccordionPanel>
                <RadioGroup
                  value={publisherType}
                  onChange={(_, data) => updateWizardData({ publisherType: data.value as 'existing' | 'new' })}
                  style={{ marginBottom: '16px' }}
                >
                  <Radio value="existing" label="Use existing publisher" />
                  <Radio value="new" label="Create new publisher" />
                </RadioGroup>

                {publisherType === 'existing' && (
                  <div style={{ 
                    marginLeft: '24px', 
                    marginBottom: '24px',
                    position: 'relative',
                    zIndex: 1
                  }}>
                    {publisherError && (
                      <MessageBar intent="error" style={{ marginBottom: '12px' }}>
                        <MessageBarBody>
                          Failed to load publishers: {publisherError}
                          <Button 
                            appearance="transparent" 
                            size="small"
                            onClick={refetchPublishers}
                            style={{ marginLeft: '8px' }}
                          >
                            Retry
                          </Button>
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    
                    <Field label="Search and Select Publisher">
                      <div style={{ position: 'relative', width: '100%' }}>
                        <Input
                          placeholder={loadingPublishers ? "Loading publishers..." : "Click to see all publishers or type to search..."}
                          value={selectedPublisher ? 
                            `${selectedPublisher.displayName} (${selectedPublisher.prefix})` 
                            : publisherSearchTerm || ''
                          }
                          disabled={loadingPublishers || !!publisherError}
                          onChange={(_, data) => {
                            if (!selectedPublisher) {
                              setPublisherSearchTerm(data.value || '');
                              setShowPublisherDropdown(true);
                            }
                          }}
                          onFocus={() => {
                            if (selectedPublisher) {
                              // Clear selection when focusing to allow new search
                              updateWizardData({ selectedPublisher: null });
                              setPublisherSearchTerm('');
                            }
                            setShowPublisherDropdown(true);
                          }}
                          onBlur={() => {
                            // Delay hiding to allow click on dropdown items
                            setTimeout(() => setShowPublisherDropdown(false), 150);
                          }}
                          style={{ width: '100%' }}
                        />
                        
                        {/* Dropdown results */}
                        {!selectedPublisher && showPublisherDropdown && publishersToShow.length > 0 && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              backgroundColor: tokens.colorNeutralBackground1,
                              border: `1px solid ${tokens.colorNeutralStroke1}`,
                              borderRadius: tokens.borderRadiusMedium,
                              boxShadow: tokens.shadow8,
                              maxHeight: '300px',
                              overflowY: 'auto',
                              zIndex: 1000,
                              marginTop: '2px'
                            }}
                            onMouseDown={(e) => {
                              // Prevent input blur when clicking on dropdown
                              e.preventDefault();
                            }}
                          >
                            {publishersToShow.slice(0, 10).map((publisher) => (
                              <div
                                key={publisher.id}
                                onClick={() => {
                                  updateWizardData({ selectedPublisher: publisher });
                                  setPublisherSearchTerm('');
                                  setShowPublisherDropdown(false);
                                }}
                                style={{
                                  padding: '12px 16px',
                                  cursor: 'pointer',
                                  borderBottom: `1px solid ${tokens.colorNeutralStroke2}`
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = tokens.colorNeutralBackground1Hover;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                              >
                                <div style={{ fontWeight: '500', marginBottom: '4px' }}>{publisher.displayName}</div>
                                <div style={{ 
                                  fontSize: '12px', 
                                  color: tokens.colorNeutralForeground2,
                                  lineHeight: '1.3'
                                }}>
                                  {publisher.uniqueName} • Prefix: {publisher.prefix}
                                </div>
                              </div>
                            ))}
                            {publishersToShow.length > 10 && (
                              <div style={{
                                padding: '8px 12px',
                                fontSize: '12px',
                                color: tokens.colorNeutralForeground2,
                                borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
                                textAlign: 'center'
                              }}>
                                {publishersToShow.length - 10} more publishers available. Type to search and filter.
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* No results message */}
                        {!selectedPublisher && showPublisherDropdown && publisherSearchTerm && publishersToShow.length === 0 && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              backgroundColor: tokens.colorNeutralBackground1,
                              border: `1px solid ${tokens.colorNeutralStroke1}`,
                              borderRadius: tokens.borderRadiusMedium,
                              padding: '12px',
                              color: tokens.colorNeutralForeground2,
                              textAlign: 'center',
                              zIndex: 1000,
                              marginTop: '2px'
                            }}
                          >
                            No publishers found matching "{publisherSearchTerm}"
                          </div>
                        )}
                      </div>
                      
                      {selectedPublisher && (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px',
                          backgroundColor: tokens.colorNeutralBackground2,
                          borderRadius: tokens.borderRadiusMedium,
                          fontSize: '12px'
                        }}>
                          <strong>Selected:</strong> {selectedPublisher.displayName} ({selectedPublisher.uniqueName})
                          <br />
                          <strong>Prefix:</strong> {selectedPublisher.prefix}
                          <Button
                            appearance="transparent"
                            size="small"
                            onClick={() => {
                              updateWizardData({ selectedPublisher: null });
                              setPublisherSearchTerm('');
                            }}
                            style={{ marginLeft: '8px', fontSize: '10px' }}
                          >
                            Change
                          </Button>
                        </div>
                      )}
                    </Field>
                  </div>
                )}

                {publisherType === 'new' && (
                  <div style={{ marginLeft: '24px' }}>
                    <Field
                      label="Publisher Display Name"
                      hint="Display name for the publisher (letters, numbers and spaces only)"
                      style={{ marginBottom: '16px' }}
                    >
                      <Input
                        placeholder="e.g., Fancy New Publisher"
                        value={newPublisherName}
                        onChange={(e) => handlenewPublisherNameChange(e.target.value)}
                      />
                    </Field>

                    <Field
                      label="Publisher Unique Name (Internal)"
                      hint="Auto-generated internal unique name for Dataverse (no spaces, letters and numbers only)"
                      style={{ marginBottom: '16px' }}
                    >
                      <Input
                        value={newPublisherInternalName}
                        onChange={(e) => handlenewPublisherInternalNameChange(e.target.value)}
                        placeholder="FancyNewPublisher"
                      />
                    </Field>

                    <Field
                      label="Prefix (3-8 characters)"
                      hint="Auto-generated prefix for all custom entities and fields (letters only, 3-8 characters). You can edit this if needed."
                    >
                      <Input
                        placeholder="fancynew"
                        value={newPublisherPrefix}
                        onChange={(e) => updateWizardData({ newPublisherPrefix: e.target.value })}
                        maxLength={8}
                      />
                    </Field>
                  </div>
                )}
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
          )}

          {/* Navigation Buttons */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginTop: '32px',
            paddingTop: '16px',
            borderTop: `1px solid ${tokens.colorNeutralStroke2}`
          }}>
            <Button 
              appearance="secondary"
              onClick={onPrevious}
            >
              Previous: File Upload
            </Button>
            
            <Button 
              appearance="primary"
              size="large"
              disabled={!isFormValid()}
              onClick={onNext}
            >
              Next: Global Choices
            </Button>
          </div>
        </div>
      </CardPreview>
    </Card>
  );
};
