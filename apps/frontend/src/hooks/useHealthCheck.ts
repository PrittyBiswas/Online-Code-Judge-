import { useEffect, useState } from 'react';
import { fetchApiHealth } from '../services/apiClient';
import type { HealthStatusResponse } from '../types';

interface HealthCheckState {
  status: 'loading' | 'online' | 'offline';
  data: HealthStatusResponse | null;
}

export function useHealthCheck(): HealthCheckState {
  const [state, setState] = useState<HealthCheckState>({
    status: 'loading',
    data: null,
  });

  useEffect(() => {
    let active = true;

    fetchApiHealth()
      .then((data) => {
        if (active) {
          setState({ status: 'online', data });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'offline', data: null });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
