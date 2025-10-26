import React, { useState, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Button,
  Input,
  MessageBar,
  MessageBarBody,
  tokens,
  Badge,
} from '@fluentui/react-components';
import { 
  ArrowUndoRegular,
  HistoryRegular,
  WarningRegular,
  ArrowLeftRegular,
  ClockRegular
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';

export const RollbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [environmentSuffix, setEnvironmentSuffix] = useState('');

  const handleBackToMenu = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleViewHistory = useCallback(() => {
    // For now, just show a message. This will be enhanced with actual deployment history
    alert('Deployment history feature coming soon! This will show all previous deployments with rollback options.');
  }, []);

  return (
    <div style={{
      padding: '24px',
      maxWidth: '800px',
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: tokens.colorNeutralBackground1
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={handleBackToMenu}
          style={{ marginBottom: '16px' }}
        >
          Back to Menu
        </Button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <ArrowUndoRegular fontSize={28} style={{ color: tokens.colorPaletteDarkOrangeForeground1 }} />
          <Text size={700} weight="bold">Rollback Solution</Text>
          <Badge appearance="filled" color="warning" size="small">Enterprise</Badge>
        </div>
        
        <Text size={400} style={{ color: tokens.colorNeutralForeground2 }}>
          Safely rollback previously deployed solutions with automatic dependency checking
        </Text>
      </div>

      {/* Coming Soon Notice */}
      <Card style={{ marginBottom: '24px' }}>
        <CardHeader
          header={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClockRegular fontSize={20} />
              <Text weight="semibold">Feature Under Development</Text>
            </div>
          }
        />
        <CardPreview style={{ padding: '24px' }}>
          <MessageBar intent="info" style={{ marginBottom: '16px' }}>
            <MessageBarBody>
              <strong>Rollback functionality is currently under development!</strong>
              <br />
              This feature will provide deployment history tracking and safe rollback capabilities.
            </MessageBarBody>
          </MessageBar>

          <div style={{ marginBottom: '20px' }}>
            <Text weight="semibold" style={{ marginBottom: '12px', display: 'block' }}>
              Planned Features:
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HistoryRegular fontSize={16} style={{ color: tokens.colorBrandBackground }} />
                <Text size={300}>Deployment history with timestamps and change logs</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <WarningRegular fontSize={16} style={{ color: tokens.colorBrandBackground }} />
                <Text size={300}>Preview rollback changes before execution</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowUndoRegular fontSize={16} style={{ color: tokens.colorBrandBackground }} />
                <Text size={300}>Safe rollback with dependency analysis</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClockRegular fontSize={16} style={{ color: tokens.colorBrandBackground }} />
                <Text size={300}>Data preservation and backup verification</Text>
              </div>
            </div>
          </div>

          <Button
            appearance="primary"
            icon={<HistoryRegular />}
            onClick={handleViewHistory}
            disabled
          >
            View Deployment History (Coming Soon)
          </Button>
        </CardPreview>
      </Card>

      {/* Environment Input - Placeholder for future functionality */}
      <Card>
        <CardHeader
          header={<Text weight="semibold">Environment Configuration</Text>}
          description="Specify the environment you want to view rollback options for"
        />
        <CardPreview style={{ padding: '24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <Text weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
              Environment Suffix
            </Text>
            <Input
              placeholder="e.g., v2fixed, prod, test"
              value={environmentSuffix}
              onChange={(e) => setEnvironmentSuffix(e.target.value)}
              style={{ width: '100%' }}
              disabled
            />
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: '4px' }}>
              The suffix used when deploying your solution (e.g., "v2fixed" creates tables like "Event_v2fixed")
            </Text>
          </div>

          <MessageBar intent="warning">
            <MessageBarBody>
              <strong>Important:</strong> Rollback operations will be thoroughly tested before release to ensure data safety and referential integrity.
            </MessageBarBody>
          </MessageBar>
        </CardPreview>
      </Card>

      {/* Temporary Workaround Info */}
      <div style={{
        marginTop: '32px',
        padding: '16px',
        backgroundColor: tokens.colorNeutralBackground3,
        borderRadius: '6px'
      }}>
        <Text weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
          Temporary Workaround:
        </Text>
        <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
          While this feature is under development, you can manually remove deployed solutions through the 
          Power Platform admin center or by using Power Platform CLI commands. Always backup your data 
          before making changes to production environments.
        </Text>
      </div>
    </div>
  );
};