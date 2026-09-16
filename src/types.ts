export type ActiveTab = 'dashboard' | 'tool-1' | 'tool-2' | 'tool-3';

export type GradeLevel = '一年級' | '二年級' | '三年級';

export type UserRole = 'admin' | 'teacher' | 'student' | 'pending_teacher' | 'guest';

export type AttendanceStatus = 'present' | 'late' | 'leave' | 'absent';

export interface ClassInfo {
  id: string;
  grade: GradeLevel;
  className: string; // e.g. "1班", "2班", "甲班"
  fullName: string;  // e.g. "一年1班", "三年2班"
  totalStudents: number;
  teacherUid?: string;
  teacherName?: string;
}

export interface StudentRecord {
  id: string; // student document id or seat-key
  seatNumber: number;
  name: string;
  email?: string;
  uid?: string; // linked Firebase Auth UID if student registered
  classId: string;
  grade: GradeLevel;
  points: number;
  gender?: 'M' | 'F';
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  period: string; // e.g. "第一節", "早自習", "整日"
  teacherUid: string;
  teacherName: string;
  records: Record<string, AttendanceStatus>; // key: studentId, value: status
  note?: string;
  timestamp: string;
}

export interface PointLog {
  id: string;
  studentId: string;
  studentName: string;
  seatNumber: number;
  classId: string;
  delta: number; // e.g. +2 or -1
  reason: string;
  teacherUid: string;
  teacherName: string;
  timestamp: string;
}

export interface UserAccount {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  isApprovedTeacher: boolean;
  classId?: string;
  seatNumber?: number;
  studentId?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ToolItem {
  id: 'tool-1' | 'tool-2' | 'tool-3';
  slotNumber: 1 | 2 | 3;
  title: string;
  defaultTitle: string;
  category: string;
  description: string;
  badge: string;
  colorScheme: 'indigo' | 'emerald' | 'amber';
  status: 'ready' | 'customizing' | 'active';
  features: string[];
}

export interface TeacherProfile {
  name: string;
  title: string;
  school: string;
  currentClassId: string;
  isLoggedIn: boolean;
  email?: string;
  uid?: string;
  role?: UserRole;
  isSuperAdmin?: boolean;
  isApprovedTeacher?: boolean;
  avatarUrl?: string;
  seatNumber?: number;
  studentPoints?: number;
  className?: string;
}

export interface DutyStudent {
  seatNumber: number;
  name: string;
  isRedo?: boolean;
  redoReason?: string;
  isSubstitute?: boolean;
  originalSeatNumber?: number;
}

export interface DutyRecord {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  students: DutyStudent[];
  isRedoDay?: boolean;
  redoReason?: string;
  exemptSeats: number[];
  tasksStatus?: Record<string, boolean>;
  note?: string;
  completedAt: string;
  teacherUid?: string;
  teacherName?: string;
}

export interface DutySettings {
  classId: string;
  currentPointer: number; // index in the eligible sequence
  exemptSeatNumbers: number[];
  exemptReasons?: Record<number, string>; // e.g. { 1: '班長', 2: '風紀股長' }
  pendingRedoStudents: {
    seatNumber: number;
    name: string;
    reason: string;
    assignedAt: string;
  }[];
  customTasks: string[];
}

