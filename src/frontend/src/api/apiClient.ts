import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalInstance } from '../auth/AuthProvider';
import { loginRequest } from '../auth/authConfig';

/**
 * API Client with automatic authentication token injection
 * 
 * This client automatically:
 * 1. Acquires access tokens from MSAL
 * 2. Adds Bearer tokens to all API requests
 * 3. Handles token expiration and renewal
 * 4. Retries failed requests after token refresh
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Create authenticated Axios instance
 */
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 180000, // 180 seconds (3 minutes) - increased for long-running operations like rollback (deleting 3 entities takes ~128s)
  });

  /**
   * Request interceptor - Add authentication token to every request
   */
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        // Get the active account
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length === 0) {
          console.warn('[API Client] No authenticated account found');
          return config;
        }

        // Try to acquire token silently
        const response = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });

        // Use ID token for SPA authentication (not access token)
        // ID tokens are validated by the backend JWT middleware
        if (response.idToken) {
          config.headers.Authorization = `Bearer ${response.idToken}`;
          console.log('[API Client] Token attached to request');
        }
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          // Token expired or interaction required - redirect to login
          console.warn('[API Client] Token expired, redirecting to login');
          await msalInstance.acquireTokenRedirect(loginRequest);
        } else {
          console.error('[API Client] Token acquisition failed:', error);
        }
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  /**
   * Response interceptor - Handle common errors
   */
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // Handle 401 Unauthorized - token may be expired
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // Try to acquire a new token
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            const response = await msalInstance.acquireTokenSilent({
              ...loginRequest,
              account: accounts[0],
              forceRefresh: true, // Force token refresh
            });

            // Update the authorization header with ID token
            originalRequest.headers.Authorization = `Bearer ${response.idToken}`;

            // Retry the original request
            return client(originalRequest);
          }
        } catch (refreshError) {
          // Token refresh failed - redirect to login
          console.error('[API Client] Token refresh failed:', refreshError);
          await msalInstance.acquireTokenRedirect(loginRequest);
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
};

/**
 * Singleton API client instance
 */
const apiClient = createApiClient();

/**
 * Type-safe API methods
 */
export const api = {
  /**
   * GET request
   */
  get: <T = any>(url: string, config?: AxiosRequestConfig) => {
    return apiClient.get<T>(url, config);
  },

  /**
   * POST request
   */
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return apiClient.post<T>(url, data, config);
  },

  /**
   * PUT request
   */
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return apiClient.put<T>(url, data, config);
  },

  /**
   * PATCH request
   */
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return apiClient.patch<T>(url, data, config);
  },

  /**
   * DELETE request
   */
  delete: <T = any>(url: string, config?: AxiosRequestConfig) => {
    return apiClient.delete<T>(url, config);
  },
};

/**
 * Export axios instance for advanced usage
 */
export { apiClient };
export default apiClient;
