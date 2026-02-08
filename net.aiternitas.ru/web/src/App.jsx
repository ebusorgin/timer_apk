import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SiteLanding from './pages/SiteLanding';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';

function AppGate() {
  const { isAuth } = useAuth();
  return isAuth ? <Dashboard /> : <Landing />;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<SiteLanding />} />
          <Route path="/app" element={<AppGate />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
