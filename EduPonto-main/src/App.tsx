import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/src/hooks/useAuth';
import { ThemeProvider } from '@/src/hooks/useTheme';
import { ProtectedRoute } from '@/src/components/ProtectedRoute';
import { Layout } from '@/src/components/Layout';
import { Login } from '@/src/pages/Login';
import { Dashboard } from '@/src/pages/Dashboard';
import { TimeClock } from '@/src/pages/TimeClock';
import { UserLogs } from '@/src/pages/UserLogs';
import { AdminUsers } from '@/src/pages/AdminUsers';
import { AdminReports } from '@/src/pages/AdminReports';
import { AdminSchools } from '@/src/pages/AdminSchools';
import { AdminSchedules } from '@/src/pages/AdminSchedules';
import { Unauthorized } from '@/src/pages/Unauthorized';
import ErrorBoundary from '@/src/components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/ponto" element={
              <ProtectedRoute>
                <Layout>
                  <TimeClock />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/meus-registros" element={
              <ProtectedRoute>
                <Layout>
                  <UserLogs />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/usuarios" element={
              <ProtectedRoute allowedRoles={['admin']} requiredPermission="manageUsers">
                <Layout>
                  <AdminUsers />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/relatorios" element={
              <ProtectedRoute allowedRoles={['admin']} requiredPermission="viewReports">
                <Layout>
                  <AdminReports />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/escolas" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminSchools />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/quadros" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminSchedules />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
}
