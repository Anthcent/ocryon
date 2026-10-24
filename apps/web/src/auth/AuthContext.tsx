import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, UNAUTHORIZED_EVENT } from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  pending: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, room: string) => Promise<void>;
  setupAdmin: (name: string, email: string, password: string, setupToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    Promise.all([api.auth.me().then((r) => setUser(r.user)).catch(() => setUser(null)),
      api.auth.setupStatus().then((r) => setNeedsSetup(r.needsSetup)).catch(() => {})])
      .finally(() => setLoading(false));

    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser((await api.auth.login(email, password)).user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, room: string) => {
    await api.auth.register(name, email, password, room);
    setPending(true);
  }, []);

  const setupAdmin = useCallback(async (name: string, email: string, password: string, setupToken: string) => {
    setUser((await api.auth.setupAdmin(name, email, password, setupToken)).user);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, needsSetup, pending, login, register, setupAdmin, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
