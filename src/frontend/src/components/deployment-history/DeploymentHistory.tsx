import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Title1,
  Title2,
  Text,
  Button,
  Badge,
  Spinner,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TableCellLayout,
  tokens,
  makeStyles,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogBody,
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel
} from '@fluentui/react-components';
import {
  HistoryRegular,
  CalendarLtrRegular,
  ErrorCircleRegular,
  ClockRegular,
  ArrowLeftRegular,
  DismissRegular,
  LinkRegular
} from '@fluentui/react-icons';
import { DeploymentHistoryService } from '../../services/deploymentHistoryService';
import { ApiService } from '../../services/apiService';
import type { DeploymentSummary } from '../../types/deployment-history.types';
import { ThemeToggle } from '../common/ThemeToggle';

const useStyles = makeStyles({
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
  },
  header: {
    backgroundColor: 'var(--color-banner-background)',
    color: 'var(--color-banner-text)',
    padding: '32px 24px',
    textAlign: 'center',
    position: 'relative',
  },
  themeToggle: {
    position: 'absolute',
    top: '16px',
    right: '24px',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: '16px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: '16px',
    textAlign: 'center',
  },
  tableContainer: {
    marginTop: '24px',
    backgroundColor: 'var(--color-surface)',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid var(--color-border)`,
  },
  tableRowEven: {
    backgroundColor: 'transparent',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  tableRowOdd: {
    backgroundColor: tokens.colorNeutralBackground2,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
  },
  statusBadge: {
    marginLeft: '8px',
  },
  actionButton: {
    marginLeft: '8px',
  },
  errorContainer: {
    padding: '24px',
    textAlign: 'center',
    backgroundColor: 'var(--color-error-background)',
    border: `1px solid var(--color-error-border)`,
    borderRadius: tokens.borderRadiusMedium,
    color: 'var(--color-error)',
  },
});

// Helper function to generate Power Platform solution URL
const generateSolutionUrl = async (solutionId: string): Promise<string> => {
  try {
    const config = await ApiService.getConfig();
    return `https://make.powerapps.com/environments/${config.powerPlatformEnvironmentId}/solutions/${solutionId}`;
  } catch (error) {
    console.error('Failed to fetch environment config:', error);
    // Return null if API fails - solution link won't be shown
    throw new Error('Unable to generate solution URL: environment configuration not available');
  }
};

interface DeploymentHistoryProps {}

export const DeploymentHistory: React.FC<DeploymentHistoryProps> = () => {
  const styles = useStyles();
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentSummary | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [solutionUrl, setSolutionUrl] = useState<string | null>(null);

  useEffect(() => {
    loadDeploymentHistory();
  }, []);

  const loadDeploymentHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await DeploymentHistoryService.getDeploymentHistory('default', 50);
      
      console.log('🔧 DEBUG: Deployment History API Response:', {
        success: response.success,
        count: response.count,
        environmentSuffix: response.environmentSuffix,
        deploymentsLength: response.deployments?.length || 0,
        deployments: response.deployments,
        fullResponse: response
      });
      
      if (response.success) {
        setDeployments(response.deployments);
        console.log('🔧 DEBUG: Set deployments state:', response.deployments);
      } else {
        setError('Failed to load deployment history');
        console.log('🔧 DEBUG: API returned success=false');
      }
    } catch (err) {
      console.error('Error loading deployment history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deployment history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return null; // No icon for success - text is sufficient
      case 'failed':
        return <ErrorCircleRegular style={{ color: 'var(--color-error)' }} />;
      case 'pending':
        return <ClockRegular style={{ color: 'var(--color-warning)' }} />;
      default:
        return <ClockRegular />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success' as const;
      case 'failed':
        return 'danger' as const;
      case 'pending':
        return 'warning' as const;
      default:
        return 'subtle' as const;
    }
  };

  const handleViewDetails = async (deploymentId: string) => {
    const deployment = deployments.find(d => d.deploymentId === deploymentId);
    if (deployment) {
      setSelectedDeployment(deployment);
      setShowDetailsModal(true);
      
      // Generate solution URL if solution ID exists
      if (deployment.solutionInfo?.solutionId) {
        try {
          const url = await generateSolutionUrl(deployment.solutionInfo.solutionId);
          setSolutionUrl(url);
        } catch (error) {
          console.error('Failed to generate solution URL:', error);
          setSolutionUrl(null);
        }
      } else {
        setSolutionUrl(null);
      }
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.themeToggle}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Link to="/wizard" style={{ textDecoration: 'none' }}>
                <Button 
                  appearance="subtle"
                  icon={<ArrowLeftRegular />}
                  style={{ 
                    color: 'var(--color-banner-text)',
                    border: `1px solid ${tokens.colorNeutralStroke2}`,
                  }}
                >
                  Back to Wizard
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
          <div className={styles.headerContent}>
            <Title1 as="h1" style={{ 
              color: 'var(--color-banner-text)'
            }}>
              <HistoryRegular style={{ marginRight: '12px' }} />
              Deployment History
            </Title1>
            <Text size={400} style={{ 
              color: 'var(--color-banner-text-secondary)'
            }}>
              View and manage your solution deployment history
            </Text>
          </div>
        </header>
        
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <Spinner size="large" />
            <Text>Loading deployment history...</Text>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.themeToggle}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Link to="/wizard" style={{ textDecoration: 'none' }}>
                <Button 
                  appearance="subtle"
                  icon={<ArrowLeftRegular />}
                  style={{ 
                    color: 'var(--color-banner-text)',
                    border: `1px solid ${tokens.colorNeutralStroke2}`,
                  }}
                >
                  Back to Wizard
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
          <div className={styles.headerContent}>
            <Title1 as="h1" style={{ 
              color: 'var(--color-banner-text)'
            }}>
              <HistoryRegular style={{ marginRight: '12px' }} />
              Deployment History
            </Title1>
            <Text size={400} style={{ 
              color: 'var(--color-banner-text-secondary)'
            }}>
              View and manage your solution deployment history
            </Text>
          </div>
        </header>
        
        <div className={styles.content}>
          <div className={styles.errorContainer}>
            <ErrorCircleRegular style={{ fontSize: '48px', marginBottom: '16px' }} />
            <Title2>Error Loading Deployment History</Title2>
            <Text>{error}</Text>
            <Button 
              appearance="primary" 
              onClick={loadDeploymentHistory}
              style={{ marginTop: '16px' }}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.themeToggle}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Link to="/wizard" style={{ textDecoration: 'none' }}>
                <Button 
                  appearance="subtle"
                  icon={<ArrowLeftRegular />}
                  style={{ 
                    color: 'var(--color-banner-text)',
                    border: `1px solid ${tokens.colorNeutralStroke2}`,
                  }}
                >
                  Back to Wizard
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
          <div className={styles.headerContent}>
            <Title1 style={{ color: 'var(--color-banner-text)', marginBottom: '8px' }}>
              <HistoryRegular style={{ marginRight: '12px' }} />
              Deployment History
            </Title1>
            <Text style={{ color: 'var(--color-banner-text)', opacity: 0.9 }}>
              View and manage your solution deployment history
            </Text>
          </div>
        </header>
        
        <div className={styles.content}>
          <div className={styles.emptyState}>
            <HistoryRegular style={{ fontSize: '64px', color: 'var(--color-text-secondary)' }} />
            <Title2>No Deployments Found</Title2>
            <Text style={{ color: 'var(--color-text-secondary)' }}>
              No deployment history found.
              <br />
              Start by deploying a solution using the wizard.
            </Text>
            <Button appearance="primary" onClick={() => window.location.href = '/wizard'}>
              Start New Deployment
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.themeToggle}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Link to="/wizard" style={{ textDecoration: 'none' }}>
              <Button 
                appearance="subtle"
                icon={<ArrowLeftRegular />}
                style={{ 
                  color: 'var(--color-banner-text)',
                  border: `1px solid ${tokens.colorNeutralStroke2}`,
                }}
              >
                Back to Wizard
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <div className={styles.headerContent}>
          <Title1 style={{ color: 'var(--color-banner-text)', marginBottom: '8px' }}>
            <HistoryRegular style={{ marginRight: '12px' }} />
            Deployment History
          </Title1>
          <Text style={{ color: 'var(--color-banner-text)', opacity: 0.9 }}>
            View and manage your solution deployment history ({deployments.length} deployments)
          </Text>
        </div>
      </header>
      
      <div className={styles.content}>
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title2>Recent Deployments</Title2>
          <Button appearance="primary" onClick={loadDeploymentHistory}>
            Refresh
          </Button>
        </div>

        <div className={styles.tableContainer}>
          <Table arial-label="Deployment history table">
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ fontWeight: 'bold' }}>Status</TableHeaderCell>
                <TableHeaderCell style={{ fontWeight: 'bold' }}>Solution</TableHeaderCell>
                <TableHeaderCell style={{ fontWeight: 'bold' }}>Publisher</TableHeaderCell>
                <TableHeaderCell style={{ fontWeight: 'bold' }}>Date</TableHeaderCell>
                <TableHeaderCell style={{ fontWeight: 'bold' }}>Tables</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment, index) => (
                <TableRow 
                  key={deployment.deploymentId}
                  onClick={() => handleViewDetails(deployment.deploymentId)}
                  className={index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}
                  style={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <TableCellLayout>
                      {getStatusIcon(deployment.status)}
                      <Badge 
                        appearance="tint" 
                        color={getStatusColor(deployment.status)}
                        className={styles.statusBadge}
                      >
                        {deployment.status}
                      </Badge>
                    </TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>
                      <Text>{deployment.solutionInfo?.solutionName || 'N/A'}</Text>
                    </TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>
                      <Text>{deployment.solutionInfo?.publisherName || 'N/A'}</Text>
                    </TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>
                      <CalendarLtrRegular style={{ marginRight: '4px' }} />
                      <Text>{formatDate(deployment.timestamp)}</Text>
                    </TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>
                      <Text weight="semibold">{deployment.summary?.totalEntities || 0}</Text>
                      <Text size={200} style={{ marginLeft: '4px', opacity: 0.7 }}>
                        ({deployment.summary?.cdmEntities || 0} CDM, {deployment.summary?.customEntities || 0} custom)
                      </Text>
                    </TableCellLayout>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Deployment Details Modal */}
      {showDetailsModal && selectedDeployment && (
        <Dialog 
          open={showDetailsModal}
          onOpenChange={(_, data) => setShowDetailsModal(data.open)}
        >
          <DialogSurface style={{ maxWidth: '800px', minHeight: '600px' }}>
            <DialogTitle>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Deployment Details</span>
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={() => setShowDetailsModal(false)}
                />
              </div>
            </DialogTitle>
            <DialogContent>
              <DialogBody>
                <Accordion multiple collapsible>
                  {/* Deployment Details Accordion */}
                  <AccordionItem value="details">
                    <AccordionHeader>Deployment Details</AccordionHeader>
                    <AccordionPanel>
                      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px' }}>
                        <strong>Status:</strong>
                        <span style={{ color: selectedDeployment.status === 'success' ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                          {selectedDeployment.status}
                        </span>
                        
                        <strong>Solution Name:</strong>
                        <span>{selectedDeployment.solutionInfo?.solutionName || 'N/A'}</span>
                        
                        <strong>Publisher:</strong>
                        <span>{selectedDeployment.solutionInfo?.publisherName || 'N/A'}</span>
                        
                        {selectedDeployment.solutionInfo?.solutionId && solutionUrl && (
                          <>
                            <strong>Solution Link:</strong>
                            <div>
                              <a 
                                href={solutionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  color: tokens.colorBrandForeground1,
                                  textDecoration: 'none'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.textDecoration = 'underline';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.textDecoration = 'none';
                                }}
                              >
                                <LinkRegular style={{ fontSize: '14px' }} />
                                Open in Power Platform
                              </a>
                            </div>
                          </>
                        )}
                        
                        <strong>Deployed:</strong>
                        <span>{formatDate(selectedDeployment.timestamp)}</span>
                        
                        <strong>Total Entities:</strong>
                        <span>{selectedDeployment.summary?.totalEntities || 0}</span>
                        
                        <strong>Total Attributes:</strong>
                        <span>{selectedDeployment.summary?.totalAttributes || 0}</span>
                      </div>
                    </AccordionPanel>
                  </AccordionItem>

                  {/* Deployed Entities Accordion */}
                  <AccordionItem value="entities">
                    <AccordionHeader>Deployed Tables</AccordionHeader>
                    <AccordionPanel>
                      {/* CDM Entities Section */}
                      {((selectedDeployment.summary?.cdmEntityNames && selectedDeployment.summary.cdmEntityNames.length > 0) ||
                        (selectedDeployment.summary?.cdmEntitiesAdded && selectedDeployment.summary.cdmEntitiesAdded.length > 0)) && (
                        <div style={{ marginBottom: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                            <strong>CDM Tables</strong>
                          </div>
                          <Text size={200} style={{ color: '#666', marginBottom: '8px', display: 'block' }}>
                            Common Data Model tables
                          </Text>
                          <div style={{ marginTop: '8px' }}>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                              {selectedDeployment.summary?.cdmEntityNames?.map(entityName => (
                                <li key={entityName}>{entityName}</li>
                              ))}
                              {selectedDeployment.summary?.cdmEntitiesAdded?.map(entityName => (
                                <li key={entityName}>{entityName}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      
                      {/* Custom Entities Section */}
                      {selectedDeployment.summary?.customEntityNames && selectedDeployment.summary.customEntityNames.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                            <strong>Custom Tables</strong>
                          </div>
                          <Text size={200} style={{ color: '#666', marginBottom: '8px', display: 'block' }}>
                            Custom tables created specifically for this solution
                          </Text>
                          <div style={{ marginTop: '8px' }}>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                              {selectedDeployment.summary.customEntityNames.map(entityName => (
                                <li key={entityName}>{entityName}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      
                      {/* Fallback for legacy data without detailed entity names */}
                      {(!selectedDeployment.summary?.cdmEntityNames && !selectedDeployment.summary?.customEntityNames && 
                        !selectedDeployment.summary?.cdmEntitiesAdded) && (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px' }}>
                            <strong>CDM Tables:</strong>
                            <span>{selectedDeployment.summary?.cdmEntities || 0}</span>
                            
                            <strong>Custom Tables:</strong>
                            <span>{selectedDeployment.summary?.customEntities || 0}</span>
                          </div>
                          {(selectedDeployment.summary?.cdmEntities || selectedDeployment.summary?.customEntities) && (
                            <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '12px', color: '#666' }}>
                              <em>Detailed entity information not available for deployments created before the latest update.</em>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Show message if no entities */}
                      {(!selectedDeployment.summary?.cdmEntityNames?.length && !selectedDeployment.summary?.customEntityNames?.length && 
                        !selectedDeployment.summary?.cdmEntitiesAdded?.length && !selectedDeployment.summary?.cdmEntities && 
                        !selectedDeployment.summary?.customEntities) && (
                        <div>
                          <span style={{ color: '#888', fontStyle: 'italic' }}>No entities were deployed</span>
                        </div>
                      )}
                    </AccordionPanel>
                  </AccordionItem>

                  {/* More Accordion */}
                  <AccordionItem value="more">
                    <AccordionHeader>More</AccordionHeader>
                    <AccordionPanel>
                      {/* Global Choices Section */}
                      {((selectedDeployment.summary?.globalChoicesAdded && selectedDeployment.summary.globalChoicesAdded.length > 0) ||
                        (selectedDeployment.summary?.globalChoicesCreated && selectedDeployment.summary.globalChoicesCreated.length > 0)) && (
                        <div style={{ marginBottom: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                            <strong>Global Choices</strong>
                          </div>
                          <Text size={200} style={{ color: '#666', marginBottom: '8px', display: 'block' }}>
                            Option sets added to your solution
                          </Text>
                          {selectedDeployment.summary?.globalChoicesAdded && selectedDeployment.summary.globalChoicesAdded.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                              <Text size={100} weight="semibold" style={{ display: 'block', marginBottom: '4px' }}>Added:</Text>
                              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {selectedDeployment.summary.globalChoicesAdded.map(choice => (
                                  <li key={choice}>{choice}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {selectedDeployment.summary?.globalChoicesCreated && selectedDeployment.summary.globalChoicesCreated.length > 0 && (
                            <div>
                              <Text size={100} weight="semibold" style={{ display: 'block', marginBottom: '4px' }}>Created:</Text>
                              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {selectedDeployment.summary.globalChoicesCreated.map(choice => (
                                  <li key={choice}>{choice}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Legacy Entities Added/Modified/Removed - only if they don't duplicate CDM entities */}
                      {selectedDeployment.summary?.entitiesAdded && selectedDeployment.summary.entitiesAdded.length > 0 && 
                       !selectedDeployment.summary?.cdmEntityNames && !selectedDeployment.summary?.cdmEntitiesAdded && (
                        <div style={{ marginTop: '16px' }}>
                          <strong>Entities Added:</strong>
                          <ul style={{ margin: '8px 0 0 20px' }}>
                            {selectedDeployment.summary?.entitiesAdded?.map(entity => (
                              <li key={entity}>{entity}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {selectedDeployment.summary?.entitiesModified && selectedDeployment.summary.entitiesModified.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <strong>Entities Modified:</strong>
                          <ul style={{ margin: '8px 0 0 20px' }}>
                            {selectedDeployment.summary?.entitiesModified?.map(entity => (
                              <li key={entity}>{entity}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {selectedDeployment.summary?.entitiesRemoved && selectedDeployment.summary.entitiesRemoved.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <strong>Entities Removed:</strong>
                          <ul style={{ margin: '8px 0 0 20px' }}>
                            {selectedDeployment.summary?.entitiesRemoved?.map(entity => (
                              <li key={entity}>{entity}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Show message if no additional information */}
                      {(!selectedDeployment.summary?.globalChoicesAdded?.length && 
                        !selectedDeployment.summary?.globalChoicesCreated?.length &&
                        !selectedDeployment.summary?.entitiesAdded?.length &&
                        !selectedDeployment.summary?.entitiesModified?.length &&
                        !selectedDeployment.summary?.entitiesRemoved?.length) && (
                        <div>
                          <span style={{ color: '#888', fontStyle: 'italic' }}>No additional deployment information available</span>
                        </div>
                      )}
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              </DialogBody>
            </DialogContent>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
};

export default DeploymentHistory;