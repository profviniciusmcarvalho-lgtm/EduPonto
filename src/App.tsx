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
import { Unauthorized } from '@/src/pages/Unauthorized';
import { AdminTurmas } from '@/src/pages/AdminTurmas';
import { AdminDisciplinas } from '@/src/pages/AdminDisciplinas';
import { AdminQuadroHorarios } from '@/src/pages/AdminQuadroHorarios';
import { AdminFormacaoHorarios } from '@/src/pages/AdminFormacaoHorarios';
import { AdminEscolas } from '@/src/pages/AdminEscolas';
import { AdminHorarios } from '@/src/pages/AdminHorarios';
import { TerminalPonto } from '@/src/pages/TerminalPonto';
import { AdminAusencias } from '@/src/pages/AdminAusencias';
import { AdminCalendario } from '@/src/pages/AdminCalendario';
import { PerfilProfessor } from '@/src/pages/PerfilProfessor';
import { AdminRede } from '@/src/pages/AdminRede';
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
            
            <Route path="/turmas"element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminTurmas />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/disciplinas" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminDisciplinas />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/quadro-horarios" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminQuadroHorarios />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/formacao-horarios" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminFormacaoHorarios />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/escolas" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminEscolas />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/horarios" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminHorarios />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/terminal" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <TerminalPonto />
              </ProtectedRoute>
            } />

            <Route path="/ausencias" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminAusencias />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/calendario" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout>
                  <AdminCalendario />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/perfil/:uid" element={
              <ProtectedRoute>
                <Layout>
                  <PerfilProfessor />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/rede" element={
              <ProtectedRoute allowedRoles={['superadmin']}>
                <Layout>
                  <AdminRede />
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
