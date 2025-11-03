import React, { useState, useEffect } from 'react';
import {
  makeStyles,
  shorthands,
  tokens,
  Card,
  Text,
  Title1,
  Title2,
  SearchBox,
  Button,
  Dropdown,
  Option,
  Field,
  Input,
  Badge,
  Spinner,
  MessageBar,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Tooltip,
} from '@fluentui/react-components';
import {
  Search24Regular,
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
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('24px'),
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.gap('12px'),
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
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('4px'),
  },
  environmentBadge: {
    fontSize: '12px',
    fontWeight: '500',
  },
  deploymentId: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
  },
  actionButton: {
    minWidth: '32px',
  },
  loading: {
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

  const performSearch = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (environmentFilter) params.append('environment', environmentFilter);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (limit) params.append('limit', limit);

      const response = await fetch(`/api/deployments/search?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch deployments');
      }

      const data = await response.json();
      setResults(data.data || []);
      setTotalCount(data.count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    performSearch();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setEnvironmentFilter('');
    setFromDate('');
    setToDate('');
    setLimit('20');
    performSearch();
  };

  const getStatusIcon = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes('success') || normalizedStatus.includes('completed')) {
      return <CheckmarkCircle24Filled style={{ color: tokens.colorPaletteGreenForeground3 }} />;
    }
    if (normalizedStatus.includes('failed') || normalizedStatus.includes('error')) {
      return <ErrorCircle24Filled style={{ color: tokens.colorPaletteRedForeground3 }} />;
    }
    if (normalizedStatus.includes('rolled') || normalizedStatus.includes('rollback')) {
      return <ArrowUndo24Regular style={{ color: tokens.colorPaletteDarkOrangeForeground3 }} />;
    }
    return <Warning24Filled style={{ color: tokens.colorPaletteYellowForeground3 }} />;
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

  const filteredResults = results.filter(result => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      result.deploymentId.toLowerCase().includes(search) ||
      result.environmentName.toLowerCase().includes(search) ||
      getSummaryText(result.summary).toLowerCase().includes(search)
    );
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Search24Regular />
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
            />
          </Field>

          <Field label="Status" className={styles.filterField}>
            <Dropdown
              placeholder="Any status"
              value={statusFilter}
              selectedOptions={statusFilter ? [statusFilter] : []}
              onOptionSelect={(_, data) => setStatusFilter(data.optionValue || '')}
            >
              {statusOptions.map(option => (
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

          <Button appearance="primary" icon={<Filter24Regular />} onClick={handleSearch}>
            Search
          </Button>

          <Button appearance="outline" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      </Card>

      <Card className={styles.resultsCard}>
        <div className={styles.resultsHeader}>
          <Title2>Search Results</Title2>
          <Text>{filteredResults.length} of {totalCount} deployments</Text>
        </div>

        {loading && (
          <div className={styles.loading}>
            <Spinner size="large" />
            <Text>Searching deployments...</Text>
          </div>
        )}

        {error && (
          <MessageBar intent="error">
            <Text>Error: {error}</Text>
          </MessageBar>
        )}

        {!loading && !error && filteredResults.length === 0 && (
          <div className={styles.emptyState}>
            <Search24Regular style={{ fontSize: '48px' }} />
            <Text>No deployments found</Text>
            <Text>Try adjusting your search criteria</Text>
          </div>
        )}

        {!loading && !error && filteredResults.length > 0 && (
          <div className={styles.tableContainer}>
            <Table arial-label="Deployment search results">
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
                {filteredResults.map((deployment) => (
                  <TableRow key={deployment.deploymentId}>
                    <TableCell>
                      <div className={styles.statusBadge}>
                        {getStatusIcon(deployment.status)}
                        <Badge
                          appearance={deployment.status.toLowerCase().includes('success') ? 'filled' : 'outline'}
                          color={deployment.status.toLowerCase().includes('success') ? 'success' : 'important'}
                        >
                          {deployment.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip content={deployment.deploymentId} relationship="description">
                        <Text className={styles.deploymentId}>
                          {deployment.deploymentId.substring(0, 12)}...
                        </Text>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Badge
                        appearance="tint"
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

export default EnhancedSearch;