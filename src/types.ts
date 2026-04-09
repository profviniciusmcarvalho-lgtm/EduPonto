export type UserRole = 'admin' | 'professor' | 'staff' | 'superadmin';

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
  /** Disciplines taught by the professor, each with weekly period count */
  disciplinasMinistradas?: Array<{ disciplinaId: string; disciplinaNome: string; numeroAulas: number }>;
  /** Employee registration number used for kiosk punch terminal */
  matricula?: string;
  /** CPF stored as digits only (e.g., "12345678901") used for kiosk lookup */
  cpf?: string;
  createdAt: string;
  permissions?: UserPermissions;
  fcmTokens?: string[];
  photoUrl?: string;
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

export type NivelEnsino =
  | 'educacao_infantil'
  | 'educacao_basica'
  | 'fundamental_1'
  | 'fundamental_2'
  | 'medio_normal'
  | 'medio_profissionalizante';

export interface Turma {
  id?: string;
  nome: string;         // e.g., "1ºA", "2ºB"
  serie: string;        // e.g., "1º Ano", "9º Ano"
  turno: 'matutino' | 'vespertino' | 'noturno' | 'integral';
  nivel?: NivelEnsino;  // educational level grouping
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
  /** Sala/local da aula */
  room?: string;
  /** Aula cancelada */
  cancelled?: boolean;
  cancelReason?: string;
  /** Professor substituto */
  substituteTeacherId?: string;
  substituteTeacherNome?: string;
}

/** A single period time slot for a given school shift */
export interface HorarioAula {
  id?: string;
  turno: 'matutino' | 'vespertino' | 'noturno' | 'integral';
  numero: number;         // 1, 2, 3, ...
  horarioInicio: string;  // HH:MM
  horarioFim: string;     // HH:MM
  schoolId: string;
  createdAt: string;
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

export type AusenciaStatus = 'pendente' | 'justificada' | 'injustificada';
export type AusenciaTipo = 'falta' | 'atestado' | 'licenca' | 'suspensao' | 'outro';

export interface Ausencia {
  id?: string;
  userId: string;
  userName: string;
  schoolId: string;
  data: string;           // ISO date YYYY-MM-DD
  tipo: AusenciaTipo;
  motivo?: string;
  status: AusenciaStatus;
  documentUrl?: string;   // URL of uploaded justification document
  substitutoId?: string;
  substitutoNome?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;      // admin uid who registered
}

export interface SystemNotification {
  id?: string;
  schoolId: string;
  title: string;
  message: string;
  type: 'late_punch' | 'absence' | 'info';
  read: boolean;
  targetUserId?: string;  // admin uid to show to (or empty = all admins)
  relatedUserId?: string; // the employee involved
  relatedUserName?: string;
  createdAt: string;
}

export type EventoTipo = 'feriado' | 'recesso' | 'evento' | 'reuniao';

export interface EventoEscolar {
  id?: string;
  schoolId: string;
  nome: string;
  data: string;       // YYYY-MM-DD
  dataFim?: string;   // YYYY-MM-DD (optional, for multi-day events)
  tipo: EventoTipo;
  bloqueiaRegistro: boolean;
  descricao?: string;
  createdAt: string;
  createdBy: string;
}

export interface Network {
  id?: string;
  name: string;
  adminUids: string[];
  schoolIds: string[];
  createdAt: string;
}
