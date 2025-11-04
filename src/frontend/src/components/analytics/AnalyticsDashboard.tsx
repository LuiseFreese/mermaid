import React, { useState, useEffect, useMemo } from 'react';
import {
  makeStyles,
  shorthands,
  tokens,
  Card,
  Text,
  Title1,
  Title2,
  Title3,
  Spinner,
  MessageBar,
  Button,
} from '@fluentui/react-components';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  DataTrending24Regular,
  CheckmarkCircle24Regular,
  ArrowUndo24Regular,
  ArrowLeftRegular,
} from '@fluentui/react-icons';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../common/ThemeToggle';
import { useTheme } from '../../context/ThemeContext';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('12px'),
    ...shorthands.margin('0', '0', '24px', '0'),
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    ...shorthands.gap('16px'),
    ...shorthands.margin('0', '0', '24px', '0'),
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    ...shorthands.gap('24px'),
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.padding('20px'),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    transition: 'all 0.2s ease-in-out',
    ':hover': {
      boxShadow: tokens.shadow8,
      transform: 'translateY(-2px)',
    },
  },
  statHeader: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('8px'),
    ...shorthands.margin('0', '0', '12px', '0'),
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '600',
    color: tokens.colorBrandForeground1,
    lineHeight: '1.2',
  },
  statSubtext: {
    color: tokens.colorNeutralForeground2,
    fontSize: '14px',
    ...shorthands.margin('4px', '0', '0', '0'),
  },
  chartCard: {
    ...shorthands.padding('24px'),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },
  chartContainer: {
    position: 'relative',
    height: '300px',
    ...shorthands.margin('16px', '0', '0', '0'),
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '200px',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
  },
  icon: {
    fontSize: '20px',
  },
});

interface AnalyticsData {
  deploymentTrends: { date: string; deployments: number }[];
  successRates: { total: number; success: number; successRate: number };
  rollbackFrequency: { total: number; rollbacks: number; rollbackRate: number };
}

export const AnalyticsDashboard: React.FC = () => {
  const styles = useStyles();
  const { effectiveTheme } = useTheme();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get theme colors dynamically
  const themeColors = useMemo(() => {
    const computedStyle = getComputedStyle(document.documentElement);
    
    // Define theme-appropriate color schemes
    let colorScheme;
    switch (effectiveTheme) {
      case 'dark':
        colorScheme = {
          primary: '#4A9EFF', // Brighter blue for dark mode
          secondary: '#7B68EE', // Purple-blue
          success: '#54B054',
          error: '#FF6B6B',
        };
        break;
      case 'pink':
        colorScheme = {
          primary: '#E91E63', // Pink primary
          secondary: '#F06292', // Lighter pink
          success: '#E91E63', // Pink for success in pink theme
          error: '#AD1457', // Darker pink for contrast
        };
        break;
      case 'neon':
        colorScheme = {
          primary: '#00FFFF', // Cyan neon
          secondary: '#FF00FF', // Magenta neon
          success: '#00FFFF', // Cyan for success in neon theme
          error: '#FF007F', // Bright pink for contrast
        };
        break;
      default: // light
        colorScheme = {
          primary: '#0078D4', // Standard blue
          secondary: '#5C2D91', // Purple
          success: '#107C10',
          error: '#D13438',
        };
        break;
    }
    
    return {
      ...colorScheme,
      background: computedStyle.getPropertyValue('--color-background').trim(),
      textPrimary: computedStyle.getPropertyValue('--color-text-primary').trim(),
      textSecondary: computedStyle.getPropertyValue('--color-text-secondary').trim(),
      border: computedStyle.getPropertyValue('--color-border').trim(),
    };
  }, [effectiveTheme]); // Recalculate when theme changes

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [trendsRes, successRes, rollbackRes] = await Promise.all([
        fetch('/api/analytics/deployment-trends'),
        fetch('/api/analytics/success-rates'),
        fetch('/api/analytics/rollback-frequency'),
      ]);

      if (!trendsRes.ok || !successRes.ok || !rollbackRes.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const [trends, success, rollback] = await Promise.all([
        trendsRes.json(),
        successRes.json(),
        rollbackRes.json(),
      ]);

      setData({
        deploymentTrends: trends.data,
        successRates: success.data,
        rollbackFrequency: rollback.data,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  const getTrendChartData = () => {
    if (!data?.deploymentTrends) return null;

    const last7Days = data.deploymentTrends.slice(-7);
    
    return {
      labels: last7Days.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [
        {
          label: 'Deployments',
          data: last7Days.map(d => d.deployments),
          borderColor: themeColors.primary,
          backgroundColor: themeColors.primary + '20', // Add transparency
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: themeColors.primary,
          pointBorderColor: themeColors.background,
          pointBorderWidth: 2,
          pointRadius: 6,
        },
      ],
    };
  };

  const getSuccessRateChartData = () => {
    if (!data?.successRates) return null;

    const { total, success } = data.successRates;
    const failed = total - success;

    return {
      labels: ['Successful', 'Failed'],
      datasets: [
        {
          data: [success, failed],
          backgroundColor: [
            themeColors.primary,     // Use primary theme color for successful
            themeColors.secondary,   // Use secondary theme color for failed
          ],
          borderColor: [
            themeColors.primary,
            themeColors.secondary,
          ],
          borderWidth: 2,
          hoverBackgroundColor: [
            themeColors.primary + 'CC', // Add slight transparency on hover
            themeColors.secondary + 'CC',
          ],
          hoverBorderColor: [
            themeColors.primary,
            themeColors.secondary,
          ],
          hoverBorderWidth: 3,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
          },
          color: themeColors.textPrimary,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: themeColors.border,
        },
        ticks: {
          color: themeColors.textSecondary,
        },
      },
      x: {
        grid: {
          color: themeColors.border,
        },
        ticks: {
          color: themeColors.textSecondary,
        },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
          },
          color: themeColors.textPrimary,
        },
      },
    },
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="large" />
          <Text>Loading analytics data...</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <MessageBar intent="error">
          <Text>Error loading analytics: {error}</Text>
        </MessageBar>
      </div>
    );
  }

  if (!data) return null;

  const totalDeployments = data.deploymentTrends.reduce((sum, d) => sum + d.deployments, 0);
  const weeklyDeployments = data.deploymentTrends.slice(-7).reduce((sum, d) => sum + d.deployments, 0);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--color-background)',
      color: 'var(--color-text-primary)',
    }}>
      {/* Header Section with flat background like wizard page */}
      <header style={{
        backgroundColor: 'var(--color-banner-background)',
        color: 'var(--color-banner-text)',
        padding: '32px 24px',
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Back button and Theme Toggle in top-right corner */}
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '24px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button 
              appearance="subtle"
              icon={<ArrowLeftRegular />}
              style={{ 
                color: 'var(--color-banner-text)',
                border: `1px solid ${tokens.colorNeutralStroke2}`,
              }}
            >
              Back to Menu
            </Button>
          </Link>
          <ThemeToggle />
        </div>
        
        <div style={{
          maxWidth: '1000px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <Title1 style={{ 
            color: 'var(--color-banner-text)'
          }}>
            Analytics Dashboard
          </Title1>
          <Text size={400} style={{ 
            color: 'var(--color-banner-text-secondary)'
          }}>
            Visualize deployment trends, success rates, and performance metrics
          </Text>
        </div>
      </header>

      <main style={{
        maxWidth: '1000px',
        margin: '0 auto',
        paddingLeft: '24px',
        paddingRight: '24px',
        paddingTop: '32px',
        paddingBottom: '40px'
      }}>
        <div className={styles.container}>

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <div className={styles.statHeader}>
            <DataTrending24Regular className={styles.icon} />
            <Title3>Total Deployments</Title3>
          </div>
          <Text className={styles.statValue}>{totalDeployments}</Text>
          <Text className={styles.statSubtext}>
            {weeklyDeployments} this week
          </Text>
        </Card>

        <Card className={styles.statCard}>
          <div className={styles.statHeader}>
            <CheckmarkCircle24Regular className={styles.icon} />
            <Title3>Success Rate</Title3>
          </div>
          <Text className={styles.statValue}>
            {formatPercentage(data.successRates.successRate)}
          </Text>
          <Text className={styles.statSubtext}>
            {data.successRates.success} of {data.successRates.total} deployments
          </Text>
        </Card>

        <Card className={styles.statCard}>
          <div className={styles.statHeader}>
            <ArrowUndo24Regular className={styles.icon} />
            <Title3>Rollback Rate</Title3>
          </div>
          <Text className={styles.statValue}>
            {formatPercentage(data.rollbackFrequency.rollbackRate)}
          </Text>
          <Text className={styles.statSubtext}>
            {data.rollbackFrequency.rollbacks} rollbacks total
          </Text>
        </Card>
      </div>

      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <Title2>Deployment Trends (Last 7 Days)</Title2>
          <div className={styles.chartContainer}>
            {getTrendChartData() && (
              <Line data={getTrendChartData()!} options={chartOptions} />
            )}
          </div>
        </Card>

        <Card className={styles.chartCard}>
          <Title2>Success vs Failed Deployments</Title2>
          <div className={styles.chartContainer}>
            {getSuccessRateChartData() && (
              <Doughnut data={getSuccessRateChartData()!} options={doughnutOptions} />
            )}
          </div>
        </Card>
      </div>
        </div>
      </main>
    </div>
  );
};

export default AnalyticsDashboard;