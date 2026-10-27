import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setOwnerUnauthorizedHandler, tokens } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokens.getOwner()));
  const [sessionMessage, setSessionMessage] = useState('');

  const logout = useCallback((message = '') => {
    tokens.clearOwner();
    setUser(null);
    setSessionMessage(message);
  }, []);

  // Refresh the profile (status, countdown, settings) from /api/auth/me.
  const refreshUser = useCallback(async () => {
    const me = await api.me();
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    setOwnerUnauthorizedHandler((msg) => logout(msg || 'Your session has ended. Please log in again.'));
  }, [logout]);

  // Restore an existing session on page load.
  useEffect(() => {
    if (!tokens.getOwner()) return;
    refreshUser()
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [refreshUser, logout]);

  const startSession = async (token) => {
    tokens.setOwner(token);
    setSessionMessage('');
    return refreshUser();
  };

  const login = async (email, password) => {
    const res = await api.login(email, password);
    return startSession(res.token);
  };

  const register = async (data) => {
    const res = await api.register(data);
    return startSession(res.token);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionMessage, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
