import React, { createContext, useContext, useState, useCallback } from 'react';
import * as api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [userId, setUserId] = useState(() => localStorage.getItem('userId'));
  const [boxPublicKey, setBoxPublicKey] = useState(() => localStorage.getItem('boxPublicKey'));

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setToken(data.token);
    setUserId(data.userId);
    setBoxPublicKey(data.boxPublicKey);
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('boxPublicKey', data.boxPublicKey);
  }, []);

  const register = useCallback(async (username, password) => {
    const data = await api.register(username, password);
    setToken(data.token);
    setUserId(data.userId);
    setBoxPublicKey(data.boxPublicKey);
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('boxPublicKey', data.boxPublicKey);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUserId(null);
    setBoxPublicKey(null);
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('boxPublicKey');
  }, []);

  const value = {
    token,
    userId,
    boxPublicKey,
    isAuth: !!token,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
