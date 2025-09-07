import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  Card,
  CardHeader,
  Text,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ErrorCircle24Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  errorContainer: {
    maxWidth: '600px',
    margin: '32px auto',
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderColor: tokens.colorPaletteRedBorder1,
  },
  errorIcon: {
    color: tokens.colorPaletteRedForeground1,
    marginBottom: '16px',
  },
  errorDetails: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
    fontFamily: 'monospace',
    fontSize: '12px',
    textAlign: 'left',
    overflow: 'auto',
    maxHeight: '200px',
  },
});

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}

interface FallbackProps {
  error?: Error;
  errorInfo?: ErrorInfo;
  onReload: () => void;
}

const ErrorBoundaryFallback: React.FC<FallbackProps> = ({ error, errorInfo, onReload }) => {
  const styles = useStyles();

  return (
    <div className={styles.errorContainer}>
      <Card className={styles.errorCard}>
        <CardHeader
          header={
            <div>
              <ErrorCircle24Regular className={styles.errorIcon} />
              <Text weight="semibold" size={500}>Something went wrong</Text>
            </div>
          }
          description="An unexpected error occurred. Please try reloading the page."
        />
        
        <Button appearance="primary" onClick={onReload}>
          Reload Page
        </Button>

        {(error || errorInfo) && (
          <details>
            <summary>Error Details</summary>
            <div className={styles.errorDetails}>
              {error && (
                <div>
                  <strong>Error:</strong> {error.message}
                  <br />
                  <strong>Stack:</strong>
                  <pre>{error.stack}</pre>
                </div>
              )}
              {errorInfo && (
                <div>
                  <strong>Component Stack:</strong>
                  <pre>{errorInfo.componentStack}</pre>
                </div>
              )}
            </div>
          </details>
        )}
      </Card>
    </div>
  );
};
