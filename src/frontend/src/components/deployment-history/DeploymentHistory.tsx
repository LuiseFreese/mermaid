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
  DialogActions
} from '@fluentui/react-components';
import {
  HistoryRegular,
  CalendarLtrRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  ClockRegular,
  EyeRegular,
  ArrowSyncRegular,
  ArrowLeftRegular,
  DismissRegular
} from '@fluentui/react-icons';
import { DeploymentHistoryService } from '../../services/deploymentHistoryService';
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

interface DeploymentHistoryProps {}

export const DeploymentHistory: React.FC<DeploymentHistoryProps> = () => {
  const styles = useStyles();
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnvironment] = useState('v2fixed');
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentSummary | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    loadDeploymentHistory();
  }, [selectedEnvironment]);

  const loadDeploymentHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await DeploymentHistoryService.getDeploymentHistory(selectedEnvironment, 50);
      
      if (response.success) {
        setDeployments(response.deployments);
      } else {
        setError('Failed to load deployment history');
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

  const formatDuration = (duration?: number) => {
    if (!duration) return 'N/A';
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckmarkCircleRegular style={{ color: 'var(--color-success)' }} />;
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

  const handleViewDetails = (deploymentId: string) => {
    const deployment = deployments.find(d => d.deploymentId === deploymentId);
    if (deployment) {
      setSelectedDeployment(deployment);
      setShowDetailsModal(true);
    }
  };

  const handleCompare = (deploymentId: string) => {
    console.log('Compare deployment:', deploymentId);
    // TODO: Open deployment comparison view
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
              No deployment history found for the {selectedEnvironment} environment.
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
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Solution</TableHeaderCell>
                <TableHeaderCell>Publisher</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Duration</TableHeaderCell>
                <TableHeaderCell>Entities</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.deploymentId}>
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
                      <Text weight="semibold">{deployment.solutionInfo?.solutionName || 'N/A'}</Text>
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
                      <Text>{formatDuration(deployment.duration)}</Text>
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
                  <TableCell>
                    <TableCellLayout>
                      <Button 
                        size="small" 
                        appearance="subtle"
                        icon={<EyeRegular />}
                        onClick={() => handleViewDetails(deployment.deploymentId)}
                        className={styles.actionButton}
                      >
                        Details
                      </Button>
                      <Button 
                        size="small" 
                        appearance="subtle"
                        icon={<ArrowSyncRegular />}
                        onClick={() => handleCompare(deployment.deploymentId)}
                        className={styles.actionButton}
                      >
                        Compare
                      </Button>
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
                <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px' }}>
                  <strong>Deployment ID:</strong>
                  <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>{selectedDeployment.deploymentId}</span>
                  
                  <strong>Status:</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getStatusIcon(selectedDeployment.status)}
                    <Badge appearance="tint" color={getStatusColor(selectedDeployment.status)}>
                      {selectedDeployment.status}
                    </Badge>
                  </div>
                  
                  <strong>Solution Name:</strong>
                  <span>{selectedDeployment.solutionInfo?.solutionName || 'N/A'}</span>
                  
                  <strong>Publisher:</strong>
                  <span>{selectedDeployment.solutionInfo?.publisherName || 'N/A'}</span>
                  
                  <strong>Environment:</strong>
                  <Badge appearance="outline">{selectedDeployment.environmentSuffix}</Badge>
                  
                  <strong>Started:</strong>
                  <span>{formatDate(selectedDeployment.timestamp)}</span>
                  
                  <strong>Completed:</strong>
                  <span>{selectedDeployment.completedAt ? formatDate(selectedDeployment.completedAt) : 'N/A'}</span>
                  
                  <strong>Duration:</strong>
                  <span>{formatDuration(selectedDeployment.duration)}</span>
                  
                  <strong>Total Entities:</strong>
                  <span>{selectedDeployment.summary?.totalEntities || 0}</span>
                  
                  <strong>CDM Entities:</strong>
                  <span>{selectedDeployment.summary?.cdmEntities || 0}</span>
                  
                  <strong>Custom Entities:</strong>
                  <span>{selectedDeployment.summary?.customEntities || 0}</span>
                  
                  <strong>Total Attributes:</strong>
                  <span>{selectedDeployment.summary?.totalAttributes || 0}</span>
                </div>
                
                {selectedDeployment.summary?.entitiesAdded && selectedDeployment.summary.entitiesAdded.length > 0 && (
                  <div style={{ marginTop: '24px' }}>
                    <strong>Entities Added:</strong>
                    <div style={{ marginTop: '8px' }}>
                      {selectedDeployment.summary?.entitiesAdded?.map(entity => (
                        <Badge key={entity} appearance="tint" color="brand" style={{ margin: '2px' }}>
                          {entity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedDeployment.summary?.entitiesModified && selectedDeployment.summary.entitiesModified.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <strong>Entities Modified:</strong>
                    <div style={{ marginTop: '8px' }}>
                      {selectedDeployment.summary?.entitiesModified?.map(entity => (
                        <Badge key={entity} appearance="tint" color="warning" style={{ margin: '2px' }}>
                          {entity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedDeployment.summary?.entitiesRemoved && selectedDeployment.summary.entitiesRemoved.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <strong>Entities Removed:</strong>
                    <div style={{ marginTop: '8px' }}>
                      {selectedDeployment.summary?.entitiesRemoved?.map(entity => (
                        <Badge key={entity} appearance="tint" color="danger" style={{ margin: '2px' }}>
                          {entity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </DialogBody>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setShowDetailsModal(false)}>
                Close
              </Button>
            </DialogActions>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
};

export default DeploymentHistory;