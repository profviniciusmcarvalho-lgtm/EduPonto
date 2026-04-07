import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { UserRole, UserPermissions } from '@/src/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermission?: keyof UserPermissions;
}

export function ProtectedRoute({ children, allowedRoles, requiredPermission }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-950 transition-colors duration-300">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile) {
    // Admins and superadmins have access to everything
    if (profile.role === 'admin' || profile.role === 'superadmin') return <>{children}</>;

    // Check if user has the required permission
    if (requiredPermission && profile.permissions && profile.permissions[requiredPermission]) {
      return <>{children}</>;
    }

    // Check if user role is in allowed roles
    if (allowedRoles && allowedRoles.includes(profile.role)) {
      return <>{children}</>;
    }

    // If neither, redirect to unauthorized
    if (allowedRoles || requiredPermission) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
}
