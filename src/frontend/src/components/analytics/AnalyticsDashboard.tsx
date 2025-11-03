import React, { useState, useEffect } from 'react';
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
} from '@fluentui/react-icons';

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
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          borderColor: tokens.colorBrandForeground1,
          backgroundColor: tokens.colorBrandBackground2,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: tokens.colorBrandForeground1,
          pointBorderColor: tokens.colorNeutralBackground1,
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
            tokens.colorPaletteGreenBackground3,
            tokens.colorPaletteRedBackground3,
          ],
          borderColor: [
            tokens.colorPaletteGreenBorder2,
            tokens.colorPaletteRedBorder2,
          ],
          borderWidth: 2,
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
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: tokens.colorNeutralStroke2,
        },
        ticks: {
          color: tokens.colorNeutralForeground2,
        },
      },
      x: {
        grid: {
          color: tokens.colorNeutralStroke2,
        },
        ticks: {
          color: tokens.colorNeutralForeground2,
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
    <div className={styles.container}>
      <div className={styles.header}>
        <DataTrending24Regular className={styles.icon} />
        <Title1>Analytics Dashboard</Title1>
      </div>

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
  );
};

export default AnalyticsDashboard;