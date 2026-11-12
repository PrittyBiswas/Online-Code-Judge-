import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  type LoginRequestPayload,
  type RegisterRequestPayload,
} from '../services/authApi';
import { getApiErrorMessage, registerUnauthorizedHandler } from '../services/apiClient';
import type { AuthUserDto } from '../types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface LogoutResult {
  serverConfirmed: boolean;
  errorMessage?: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUserDto | null;
  bootstrapError: string | null;
  sessionExpiredMessage: string | null;
  refreshAuth: () => Promise<void>;
  login: (payload: LoginRequestPayload) => Promise<AuthUserDto>;
  register: (payload: RegisterRequestPayload) => Promise<AuthUserDto>;
  logout: () => Promise<LogoutResult>;
  clearSessionMessage: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  const clearUserSpecificCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['auth'] });
    queryClient.removeQueries({ queryKey: ['user'] });
    queryClient.removeQueries({ queryKey: ['submissions'] });
  }, [queryClient]);

  const refreshAuth = useCallback(async () => {
    setStatus('loading');
    setBootstrapError(null);
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setStatus('authenticated');
      setSessionExpiredMessage(null);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setUser(null);
        setStatus('unauthenticated');
      } else {
        // Temporary network or 5xx failure must NOT treat the user as definitively logged out
        setBootstrapError(
          getApiErrorMessage(err, 'Unable to verify authentication status right now.')
        );
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null);
      setStatus('unauthenticated');
      setSessionExpiredMessage('Your session has expired. Please sign in again.');
      clearUserSpecificCache();
    });
    return () => registerUnauthorizedHandler(null);
  }, [clearUserSpecificCache]);

  const login = useCallback(async (payload: LoginRequestPayload): Promise<AuthUserDto> => {
    const loggedInUser = await loginUser(payload);
    setUser(loggedInUser);
    setStatus('authenticated');
    setBootstrapError(null);
    setSessionExpiredMessage(null);
    return loggedInUser;
  }, []);

  const register = useCallback(async (payload: RegisterRequestPayload): Promise<AuthUserDto> => {
    const registeredUser = await registerUser(payload);
    setUser(registeredUser);
    setStatus('authenticated');
    setBootstrapError(null);
    setSessionExpiredMessage(null);
    return registeredUser;
  }, []);

  const logout = useCallback(async (): Promise<LogoutResult> => {
    let serverConfirmed = false;
    let errorMessage: string | undefined;

    try {
      await logoutUser();
      serverConfirmed = true;
    } catch (err) {
      errorMessage = getApiErrorMessage(
        err,
        'Could not confirm server logout due to a network error.'
      );
    } finally {
      setUser(null);
      setStatus('unauthenticated');
      setSessionExpiredMessage(null);
      clearUserSpecificCache();
    }

    return { serverConfirmed, errorMessage };
  }, [clearUserSpecificCache]);

  const clearSessionMessage = useCallback(() => {
    setSessionExpiredMessage(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        bootstrapError,
        sessionExpiredMessage,
        refreshAuth,
        login,
        register,
        logout,
        clearSessionMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
