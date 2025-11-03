import React, { useState, useEffect } from 'react';
import {
  Card,
  Title1,
  Title2,
  Text,
  Button,
  Field,
  SearchBox,
  Dropdown,
  Option,
  Input,
  Badge,
  Spinner,
  MessageBar,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  tokens,
  makeStyles,
  shorthands,
} from '@fluentui/react-components';
import {
  Search24Filled,
  Filter24Regular,
  CheckmarkCircle24Filled,
  ErrorCircle24Filled,
  Warning24Filled,
  MoreHorizontal24Regular,
  Eye24Regular,
  ArrowUndo24Regular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '100vh',
    ...shorthands.gap('24px'),
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.margin('0', '0', '24px', '0'),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('12px'),
  },
  searchCard: {
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },
  searchRow: {
    display: 'flex',
    alignItems: 'end',
    ...shorthands.gap('16px'),
    flexWrap: 'wrap',
    ...shorthands.margin('16px', '0', '0', '0'),
  },
  searchField: {
    flex: '1',
    minWidth: '200px',
  },
  filterField: {
    minWidth: '150px',
  },
  resultsCard: {
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },
  resultsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.margin('0', '0', '16px', '0'),
  },
  tableContainer: {
    ...shorthands.margin('16px', '0', '0', '0'),
    maxHeight: '600px',
    overflowY: 'auto',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  statusBadge: {
    ...shorthands.padding('4px', '8px'),
    ...shorthands.borderRadius('12px'),
    fontSize: '12px',
    fontWeight: '500',
  },
  environmentBadge: {
    ...shorthands.padding('4px', '8px'),
    ...shorthands.borderRadius('12px'),
    fontSize: '12px',
    fontWeight: '500',
    color: tokens.colorNeutralForeground1,
  },
  actionButton: {
    minWidth: 'auto',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '200px',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    ...shorthands.gap('12px'),
    color: tokens.colorNeutralForeground2,
  },
});

interface DeploymentRecord {
  deploymentId: string;
  timestamp: string;
  status: string;
  summary: string | object;
  environmentId: string;
  environmentName: string;
  solutionInfo?: any;
}

export const EnhancedSearch: React.FC = () => {
  const styles = useStyles();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [environmentFilter, setEnvironmentFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState('20');
  const [results, setResults] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Available filter options based on actual system data
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed' },
    { value: 'rolled-back', label: 'Rolled Back' }
  ];

  const environmentOptions = [
    { value: '', label: 'All Environments' },
    { value: 'dev-princess', label: 'dev-princess (Development)', color: 'blue' },
    { value: 'test-princess', label: 'test-princess (Testing)', color: 'yellow' },
    { value: 'prod-princess', label: 'prod-princess (Production)', color: 'red' }
  ];

  const limitOptions = [
    { value: '10', label: '10 results' },
    { value: '20', label: '20 results' },
    { value: '50', label: '50 results' },
    { value: '100', label: '100 results' },
  ];

  useEffect(() => {
    performSearch();
  }, []);

  // Live filtering - trigger search when filters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch();
    }, 300); // Debounce for 300ms to avoid too many API calls

    return () => clearTimeout(timeoutId);
  }, [searchTerm, statusFilter, environmentFilter, fromDate, toDate, limit]);

  const performSearch = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchTerm) params.append('q', searchTerm);
      if (statusFilter) params.append('status', statusFilter);
      if (environmentFilter) params.append('environment', environmentFilter);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (limit) params.append('limit', limit);

      const response = await fetch(`/api/deployments/search?${params}`);
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.data || []);
      setTotalCount(data.data?.length || 0);
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setEnvironmentFilter('');
    setFromDate('');
    setToDate('');
    setLimit('20');
    // No need to call performSearch - the useEffect will handle it automatically
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
    case 'success':
      return <CheckmarkCircle24Filled style={{ color: tokens.colorPaletteGreenForeground3 }} />;
    case 'failed':
    case 'error':
      return <ErrorCircle24Filled style={{ color: tokens.colorPaletteRedForeground3 }} />;
    case 'rolled-back':
      return <ArrowUndo24Regular style={{ color: tokens.colorPaletteDarkOrangeForeground3 }} />;
    default:
    return <Warning24Filled style={{ color: tokens.colorPaletteYellowForeground3 }} />;
    }
  };

  const getEnvironmentColor = (envName: string) => {
    // Use actual environment colors from our configuration
    switch (envName) {
      case 'dev-princess':
        return tokens.colorPaletteBlueForeground2;
      case 'test-princess':
        return tokens.colorPaletteYellowForeground2;
      case 'prod-princess':
        return tokens.colorPaletteRedForeground2;
      default:
        return tokens.colorNeutralForeground2;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSummaryText = (summary: string | object) => {
    if (typeof summary === 'string') return summary;
    if (typeof summary === 'object' && summary !== null) {
      const obj = summary as any;
      if (obj.totalEntities) {
        return `${obj.totalEntities} entities, ${obj.totalRelationships || 0} relationships`;
      }
    }
    return 'Deployment completed';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Search24Filled />
          <Title1>Enhanced Search</Title1>
        </div>
        <Badge appearance="outline">{totalCount} deployments found</Badge>
      </div>

      <Card className={styles.searchCard}>
        <Title2>Search & Filter Deployments</Title2>
        
        <div className={styles.searchRow}>
          <Field label="Search" className={styles.searchField}>
            <SearchBox
              placeholder="Search deployments, environments, or descriptions..."
              value={searchTerm}
              onChange={(_, data) => setSearchTerm(data.value)}
              disabled={loading}
            />
          </Field>

          <Field label="Status" className={styles.filterField}>
            <Dropdown
              placeholder="Any status"
              value={statusFilter}
              selectedOptions={statusFilter ? [statusFilter] : []}
              onOptionSelect={(_, data) => setStatusFilter(data.optionValue || '')}
            >
              {statusOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Dropdown>
          </Field>

          <Field label="Environment" className={styles.filterField}>
            <Dropdown
              placeholder="Select environment"
              value={environmentFilter}
              onOptionSelect={(_, data) => setEnvironmentFilter(data.optionValue || '')}
            >
              {environmentOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Dropdown>
          </Field>

          <Field label="From Date" className={styles.filterField}>
            <Input
              type="date"
              value={fromDate}
              onChange={(_, data) => setFromDate(data.value)}
            />
          </Field>

          <Field label="To Date" className={styles.filterField}>
            <Input
              type="date"
              value={toDate}
              onChange={(_, data) => setToDate(data.value)}
            />
          </Field>

          <Field label="Limit" className={styles.filterField}>
            <Dropdown
              value={limit}
              selectedOptions={[limit]}
              onOptionSelect={(_, data) => setLimit(data.optionValue || '20')}
            >
              {limitOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Dropdown>
          </Field>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <Button 
              appearance="outline" 
              icon={<Filter24Regular />} 
              onClick={clearFilters}
              style={{ minWidth: 'auto' }}
            >
              Clear Filters
            </Button>
            <Text size={200} style={{ 
              color: tokens.colorNeutralForeground3,
              fontSize: '12px',
              alignSelf: 'center'
            }}>
              Results update automatically as you type and filter
            </Text>
          </div>
        </div>
      </Card>

      <Card className={styles.resultsCard}>
        <div className={styles.resultsHeader}>
          <Title2>Search Results</Title2>
          <Text>{results.length} of {totalCount} deployments</Text>
        </div>

        {error && (
          <MessageBar intent="error">
            {error}
          </MessageBar>
        )}

        {loading && (
          <div className={styles.loadingContainer}>
            <Spinner size="large" />
            <Text>Searching deployments...</Text>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div className={styles.emptyState}>
            <Search24Filled fontSize={48} />
            <Text weight="semibold">No deployments found</Text>
            <Text>Try adjusting your search criteria or filters</Text>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className={styles.tableContainer}>
            <Table sortable>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Deployment ID</TableHeaderCell>
                  <TableHeaderCell>Environment</TableHeaderCell>
                  <TableHeaderCell>Summary</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((deployment) => (
                  <TableRow key={deployment.deploymentId}>
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getStatusIcon(deployment.status)}
                        <Text>{deployment.status}</Text>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Text weight="semibold">{deployment.deploymentId.slice(-8)}</Text>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={styles.environmentBadge}
                        style={{ backgroundColor: getEnvironmentColor(deployment.environmentName) + '20' }}
                      >
                        {deployment.environmentName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Text>{getSummaryText(deployment.summary)}</Text>
                    </TableCell>
                    <TableCell>
                      <Text>{formatDate(deployment.timestamp)}</Text>
                    </TableCell>
                    <TableCell>
                      <Menu>
                        <MenuTrigger disableButtonEnhancement>
                          <Button
                            appearance="subtle"
                            icon={<MoreHorizontal24Regular />}
                            className={styles.actionButton}
                          />
                        </MenuTrigger>
                        <MenuPopover>
                          <MenuList>
                            <MenuItem icon={<Eye24Regular />}>
                              View Details
                            </MenuItem>
                            <MenuItem icon={<ArrowUndo24Regular />}>
                              Rollback
                            </MenuItem>
                          </MenuList>
                        </MenuPopover>
                      </Menu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};