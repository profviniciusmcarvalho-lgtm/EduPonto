export type UserRole = 'admin' | 'professor' | 'staff';

export interface UserPermissions {
  viewLogs: boolean;
  editLogs: boolean;
  manageUsers: boolean;
  viewReports: boolean;
  exportReports: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  schoolId: string;
  workload: number; // Monthly hours
  startTime?: string; // e.g., "08:00"
  endTime?: string; // e.g., "17:00"
  createdAt: string;
  permissions?: UserPermissions;
  fcmTokens?: string[];
}

export interface TimeLog {
  id?: string;
  userId: string;
  userName: string;
  schoolId: string;
  type: 'in' | 'out';
  timestamp: string; // ISO 8601
  location?: {
    latitude: number;
    longitude: number;
  };
  device: string;
  edited?: boolean;
  editedBy?: string;
  originalTimestamp?: string;
}

export interface School {
  id: string;
  name: string;
  address: string;
  defaultStartTime?: string; // e.g., "08:00"
  defaultEndTime?: string; // e.g., "17:00"
}
