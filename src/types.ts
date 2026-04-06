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
  turno?: 'matutino' | 'vespertino' | 'noturno' | 'integral'; // Named shift
  startTime?: string; // e.g., "07:00"
  endTime?: string;   // e.g., "17:00"
  /** Weekly class periods (professors only) */
  numeroAulas?: number;
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
  /** School's GPS coordinates for geofencing */
  location?: {
    latitude: number;
    longitude: number;
  };
  /** Allowed radius in metres (default 500 m) */
  geoRadius?: number;
}

export type DiaSemana = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';

export interface Turma {
  id?: string;
  nome: string;         // e.g., "1ºA", "2ºB"
  serie: string;        // e.g., "1º Ano", "9º Ano"
  turno: 'matutino' | 'vespertino' | 'noturno' | 'integral';
  schoolId: string;
  createdAt: string;
}

export interface Disciplina {
  id?: string;
  nome: string;         // e.g., "Matemática"
  abreviacao?: string;  // e.g., "MAT"
  schoolId: string;
  createdAt: string;
}

/** Each period slot inside a schedule entry (50 minutes each) */
export interface PeriodoAula {
  numero: number;       // 1, 2, 3, ...
  horarioInicio: string;  // HH:MM
  horarioFim: string;     // HH:MM (início + 50 min)
  disciplinaId: string;
  disciplinaNome: string;
  professorId: string;
  professorNome: string;
}

/** One row in the quadro de horários: a turma on a given day of the week */
export interface QuadroHorario {
  id?: string;
  turmaId: string;
  turmaNome: string;
  diaSemana: DiaSemana;
  periodos: PeriodoAula[];
  schoolId: string;
  createdAt: string;
}
