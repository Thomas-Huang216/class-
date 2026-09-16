import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Users, 
  Plus, 
  Minus, 
  History, 
  ShieldAlert, 
  ShieldCheck, 
  Award, 
  UserCheck, 
  XCircle, 
  AlertCircle, 
  Search, 
  UserPlus, 
  Edit2, 
  Trash2, 
  ArrowLeft, 
  Save, 
  Filter, 
  FileSpreadsheet, 
  Sparkles, 
  ChevronRight, 
  Eye, 
  Lock,
  Mail,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Flame
} from 'lucide-react';
import { 
  ClassInfo, 
  TeacherProfile, 
  StudentRecord, 
  AttendanceRecord, 
  AttendanceStatus, 
  PointLog, 
  UserAccount, 
  UserRole 
} from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp,
  deleteDoc 
} from 'firebase/firestore';

interface AttendanceManagerProps {
  currentClass: ClassInfo;
  teacherProfile: TeacherProfile;
  onBackToDashboard: () => void;
  onSelectClass?: (classId: string) => void;
  onOpenAuthModal?: () => void;
  students?: StudentRecord[];
  onUpdateStudents?: (students: StudentRecord[]) => void;
}

const DEFAULT_REASONS_POS = [
  { label: '課堂主動發言', delta: 1 },
  { label: '小組合作優良', delta: 2 },
  { label: '作業全對/優良', delta: 2 },
  { label: '熱心服務班級', delta: 3 },
  { label: '課堂競賽第一名', delta: 5 },
];

const DEFAULT_REASONS_NEG = [
  { label: '未帶課堂學用品', delta: -1 },
  { label: '課堂遲到', delta: -1 },
  { label: '課堂分心/聊天', delta: -2 },
  { label: '未按時繳交作業', delta: -2 },
  { label: '違反課堂常規', delta: -3 },
];

// Clean initial roster without fabricated names - seat 5 defaults to max, others to seat number
const generateDefaultRoster = (classId: string, count: number, grade: any): StudentRecord[] => {
  return Array.from({ length: count }, (_, i) => {
    const seatNumber = i + 1;
    return {
      id: `${classId}-s-${seatNumber}`,
      seatNumber,
      name: seatNumber === 5 ? 'max' : `${seatNumber} 號`,
      email: `student${seatNumber}@shsh.tw`,
      classId,
      grade: grade || '一年級',
      points: 100, // 初始基準分數 100 分
      gender: i % 2 === 0 ? 'M' : 'F',
      createdAt: new Date().toISOString(),
    };
  });
};

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({
  currentClass,
  teacherProfile,
  onBackToDashboard,
  onOpenAuthModal,
  students: studentsProp,
  onUpdateStudents,
}) => {
  // Master Admin & Role definition
  const SUPER_ADMIN_EMAIL = 'stu410018@shsh.tw';
  const isLoggedIn = Boolean(teacherProfile.isLoggedIn);
  const isSuperAdmin = isLoggedIn && (teacherProfile.email === SUPER_ADMIN_EMAIL || Boolean(teacherProfile.isSuperAdmin));
  const isApprovedTeacher = isLoggedIn && (isSuperAdmin || Boolean(teacherProfile.isApprovedTeacher));
  const isTeacher = isApprovedTeacher;
  const isPendingTeacher = isLoggedIn && !isApprovedTeacher && (teacherProfile.role === 'pending_teacher' || teacherProfile.role === 'teacher');
  const isStudent = isLoggedIn && !isApprovedTeacher && !isPendingTeacher;
  const isGuest = !isLoggedIn;

  // Navigation sub-tabs within Feature 2
  const [subTab, setSubTab] = useState<'attendance' | 'points' | 'roster' | 'admin-panel' | 'my-student-view'>(
    isStudent ? 'my-student-view' : 'attendance'
  );

  useEffect(() => {
    if (isStudent) {
      setSubTab('my-student-view');
    }
  }, [isStudent]);

  // Attendance Date & Session
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [selectedPeriod, setSelectedPeriod] = useState<string>('第一節');

  // Students in current class
  const [students, setStudents] = useState<StudentRecord[]>(() => {
    if (studentsProp && studentsProp.length > 0) return studentsProp;
    const cachedKey = `classgram_roster_${currentClass.id}`;
    const cached = typeof window !== 'undefined' ? localStorage.getItem(cachedKey) : null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.warn('Cached roster error:', e);
      }
    }
    return generateDefaultRoster(currentClass.id, currentClass.totalStudents, currentClass.grade);
  });

  // Sync when studentsProp changes
  useEffect(() => {
    if (studentsProp && studentsProp.length > 0) {
      setStudents(studentsProp);
    }
  }, [studentsProp]);
  const [attendanceState, setAttendanceState] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [pointLogs, setPointLogs] = useState<PointLog[]>([]);
  const [allUserAccounts, setAllUserAccounts] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');

  // Point Adjustment Modal / State
  const [selectedStudentForPoint, setSelectedStudentForPoint] = useState<StudentRecord | null>(null);
  const [customDelta, setCustomDelta] = useState<number>(1);
  const [pointReason, setPointReason] = useState<string>('課堂主動發言');
  const [isCustomReason, setIsCustomReason] = useState<boolean>(false);

  // Student Roster Editor Modal State
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [newStudentSeat, setNewStudentSeat] = useState<number>(1);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentEmail, setNewStudentEmail] = useState<string>('');
  const [newStudentPoints, setNewStudentPoints] = useState<number>(100);

  // Grant Teacher permission modal state (for Super Admin)
  const [newTeacherEmailInput, setNewTeacherEmailInput] = useState('');

  // 1. Initial Data Loading & Firestore Realtime Sync
  useEffect(() => {
    let unsubscribeStudents: (() => void) | undefined;
    let unsubscribePointLogs: (() => void) | undefined;
    let unsubscribeAttendance: (() => void) | undefined;

    const loadData = async () => {
      setIsLoading(true);

      // Load Students
      try {
        const studentsQuery = query(
          collection(db, 'students'),
          where('classId', '==', currentClass.id)
        );

        unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
          const baseRoster = generateDefaultRoster(
            currentClass.id, 
            currentClass.totalStudents, 
            currentClass.grade
          );
          const map = new Map<number, StudentRecord>();
          baseRoster.forEach((s) => map.set(s.seatNumber, s));

          if (!snapshot.empty) {
            snapshot.forEach((d) => {
              const data = d.data() as StudentRecord;
              if (data.seatNumber) {
                map.set(data.seatNumber, { ...map.get(data.seatNumber)!, ...data, id: d.id });
              }
            });
          }
          const list = Array.from(map.values()).sort((a, b) => a.seatNumber - b.seatNumber);
          setStudents(list);
          localStorage.setItem(`classgram_roster_${currentClass.id}`, JSON.stringify(list));
          if (onUpdateStudents) onUpdateStudents(list);
          setIsLoading(false);
        }, (error) => {
          console.warn('Students Firestore onSnapshot warning:', error);
          const localRoster = generateDefaultRoster(
            currentClass.id, 
            currentClass.totalStudents, 
            currentClass.grade
          );
          setStudents(localRoster);
          setIsLoading(false);
        });
      } catch (err) {
        console.warn('Students fetch error:', err);
        setStudents(generateDefaultRoster(currentClass.id, currentClass.totalStudents, currentClass.grade));
        setIsLoading(false);
      }

      // Load Attendance records for current class
      try {
        const attQuery = query(
          collection(db, 'attendance'),
          where('classId', '==', currentClass.id)
        );
        unsubscribeAttendance = onSnapshot(attQuery, (snap) => {
          const records: AttendanceRecord[] = [];
          snap.forEach((d) => {
            records.push({ id: d.id, ...d.data() } as AttendanceRecord);
          });
          records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setAttendanceHistory(records);

          // Find today's record if present
          const todayRec = records.find((r) => r.date === selectedDate && r.period === selectedPeriod);
          if (todayRec) {
            setAttendanceState(todayRec.records);
          }
        }, (err) => {
          console.warn('Attendance sync warn:', err);
        });
      } catch (e) {
        console.warn('Attendance load error:', e);
      }

      // Load Point Logs
      try {
        const logsQuery = query(
          collection(db, 'point_logs'),
          where('classId', '==', currentClass.id)
        );
        unsubscribePointLogs = onSnapshot(logsQuery, (snap) => {
          const logs: PointLog[] = [];
          snap.forEach((d) => {
            logs.push({ id: d.id, ...d.data() } as PointLog);
          });
          logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setPointLogs(logs);
        }, (err) => {
          console.warn('Point logs error:', err);
        });
      } catch (e) {
        console.warn('Logs err:', e);
      }

      // Load User Accounts for Super Admin
      if (isSuperAdmin) {
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          const accounts: UserAccount[] = [];
          usersSnap.forEach((d) => {
            accounts.push({ uid: d.id, ...d.data() } as UserAccount);
          });
          setAllUserAccounts(accounts);
        } catch (e) {
          console.warn('Admin users load note:', e);
        }
      }
    };

    loadData();

    return () => {
      if (unsubscribeStudents) unsubscribeStudents();
      if (unsubscribePointLogs) unsubscribePointLogs();
      if (unsubscribeAttendance) unsubscribeAttendance();
    };
  }, [currentClass.id, selectedDate, selectedPeriod, isSuperAdmin]);

  // Synchronize attendance state with students
  useEffect(() => {
    if (students.length > 0) {
      setAttendanceState((prev) => {
        const updated = { ...prev };
        students.forEach((s) => {
          if (!updated[s.id]) {
            updated[s.id] = 'present'; // Default to present
          }
        });
        return updated;
      });
    }
  }, [students]);

  // Calculations & Statistics
  const attendanceStats = useMemo(() => {
    const total = students.length;
    let presentCount = 0;
    let lateCount = 0;
    let leaveCount = 0;
    let absentCount = 0;

    students.forEach((s) => {
      const st = attendanceState[s.id] || 'present';
      if (st === 'present') presentCount++;
      else if (st === 'late') lateCount++;
      else if (st === 'leave') leaveCount++;
      else if (st === 'absent') absentCount++;
    });

    const rate = total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 100;

    return {
      total,
      presentCount,
      lateCount,
      leaveCount,
      absentCount,
      rate,
    };
  }, [students, attendanceState]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchSearch = s.name.includes(searchTerm) || s.seatNumber.toString().includes(searchTerm);
      const st = attendanceState[s.id] || 'present';
      const matchStatus = statusFilter === 'all' || st === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [students, searchTerm, statusFilter, attendanceState]);

  // Handle setting individual attendance status
  const handleSetStatus = (studentId: string, status: AttendanceStatus) => {
    if (!isTeacher) return;
    setAttendanceState((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // Quick Action: Set all to present
  const handleSetAllPresent = () => {
    if (!isTeacher) return;
    const newState: Record<string, AttendanceStatus> = {};
    students.forEach((s) => {
      newState[s.id] = 'present';
    });
    setAttendanceState(newState);
    showBanner('已將全班設定為「全員出席」');
  };

  // Save Attendance to Firestore
  const handleSaveAttendance = async () => {
    if (!isTeacher) return;
    const recordId = `att-${currentClass.id}-${selectedDate}-${selectedPeriod}`;
    const recordPayload: AttendanceRecord = {
      id: recordId,
      classId: currentClass.id,
      date: selectedDate,
      period: selectedPeriod,
      teacherUid: teacherProfile.uid || 'teacher-local',
      teacherName: teacherProfile.name,
      records: attendanceState,
      timestamp: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'attendance', recordId), recordPayload);
      showBanner(`【${currentClass.fullName}】${selectedDate} ${selectedPeriod} 點名紀錄儲存成功！`);
    } catch (err) {
      console.warn('Firestore save notice:', err);
      // Fallback local update
      setAttendanceHistory((prev) => [recordPayload, ...prev.filter((r) => r.id !== recordId)]);
      showBanner(`點名紀錄已儲存（本機/雲端連線狀態）`);
    }
  };

  // Point Adjustment (Add / Deduct Points)
  const handleApplyPointChange = async () => {
    if (!selectedStudentForPoint || !isTeacher) return;
    const finalReason = isCustomReason ? pointReason.trim() : pointReason;
    if (!finalReason) return;

    const student = selectedStudentForPoint;
    // Score clamped strictly between 0 and 100
    const newPoints = Math.max(0, Math.min(100, student.points + customDelta));
    const logId = `pt-${Date.now()}-${student.id}`;

    const newLog: PointLog = {
      id: logId,
      studentId: student.id,
      studentName: student.name,
      seatNumber: student.seatNumber,
      classId: currentClass.id,
      delta: customDelta,
      reason: finalReason,
      teacherUid: teacherProfile.uid || 'teacher-admin',
      teacherName: teacherProfile.name,
      timestamp: new Date().toISOString(),
    };

    try {
      // 1. Update student document in Firestore
      const studentDocRef = doc(db, 'students', student.id);
      await setDoc(studentDocRef, {
        ...student,
        points: newPoints,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // 2. Add log entry in Firestore
      await setDoc(doc(db, 'point_logs', logId), newLog);

      // Local update
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, points: newPoints } : s))
      );
      setPointLogs((prev) => [newLog, ...prev]);

      showBanner(`已為【${student.seatNumber}號 ${student.name}】評分：${customDelta > 0 ? `+${customDelta}` : customDelta} 分（目前總分 ${newPoints} 分，範圍 0~100）`);
      setSelectedStudentForPoint(null);
    } catch (err) {
      console.warn('Point log save fallback:', err);
      // Local fallback
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, points: newPoints } : s))
      );
      setPointLogs((prev) => [newLog, ...prev]);
      showBanner(`已更新【${student.name}】分數：${customDelta > 0 ? `+${customDelta}` : customDelta} 分（目前總分 ${newPoints} 分）`);
      setSelectedStudentForPoint(null);
    }
  };

  // Save / Add Student to Roster
  const handleSaveStudentToRoster = async () => {
    if (!isTeacher || !newStudentName.trim()) return;

    // Score strictly clamped between 0 and 100
    const clampedPoints = Math.max(0, Math.min(100, Number(newStudentPoints) || 100));

    const studentId = editingStudent ? editingStudent.id : `${currentClass.id}-s-${newStudentSeat}-${Date.now()}`;
    const studentData: StudentRecord = {
      id: studentId,
      seatNumber: Number(newStudentSeat),
      name: newStudentName.trim(),
      email: newStudentEmail.trim() || undefined,
      classId: currentClass.id,
      grade: currentClass.grade,
      points: clampedPoints,
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'students', studentId), studentData);
      setStudents((prev) => {
        const filtered = prev.filter((s) => s.id !== studentId && s.seatNumber !== studentData.seatNumber);
        const nextList = [...filtered, studentData];
        nextList.sort((a, b) => a.seatNumber - b.seatNumber);
        localStorage.setItem(`classgram_roster_${currentClass.id}`, JSON.stringify(nextList));
        if (onUpdateStudents) onUpdateStudents(nextList);
        return nextList;
      });
      showBanner(editingStudent ? '學生資料修改成功' : `已將【${newStudentName}】納入旗下名單！`);
      setIsAddStudentOpen(false);
      setEditingStudent(null);
      setNewStudentName('');
      setNewStudentEmail('');
    } catch (err) {
      console.warn('Student save note:', err);
      setStudents((prev) => {
        const filtered = prev.filter((s) => s.id !== studentId && s.seatNumber !== studentData.seatNumber);
        const nextList = [...filtered, studentData];
        nextList.sort((a, b) => a.seatNumber - b.seatNumber);
        localStorage.setItem(`classgram_roster_${currentClass.id}`, JSON.stringify(nextList));
        if (onUpdateStudents) onUpdateStudents(nextList);
        return nextList;
      });
      setIsAddStudentOpen(false);
      showBanner('學生名單已更新！');
    }
  };

  // Delete student from roster
  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!isTeacher) return;
    if (!window.confirm(`確定要將【${studentName}】從本班旗下名單移除嗎？`)) return;

    try {
      await deleteDoc(doc(db, 'students', studentId));
      setStudents((prev) => {
        const nextList = prev.filter((s) => s.id !== studentId);
        localStorage.setItem(`classgram_roster_${currentClass.id}`, JSON.stringify(nextList));
        if (onUpdateStudents) onUpdateStudents(nextList);
        return nextList;
      });
      showBanner(`已將學生【${studentName}】移除`);
    } catch (err) {
      console.warn('Delete error:', err);
      setStudents((prev) => {
        const nextList = prev.filter((s) => s.id !== studentId);
        localStorage.setItem(`classgram_roster_${currentClass.id}`, JSON.stringify(nextList));
        if (onUpdateStudents) onUpdateStudents(nextList);
        return nextList;
      });
      showBanner(`已從本機名單移除【${studentName}】`);
    }
  };

  // Super Admin: Grant / Revoke Teacher Permission
  const handleToggleTeacherRole = async (targetUser: UserAccount, grant: boolean) => {
    if (!isSuperAdmin) return;
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await setDoc(userRef, {
        ...targetUser,
        role: grant ? 'teacher' : 'student',
        isApprovedTeacher: grant,
        approvedBy: SUPER_ADMIN_EMAIL,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      setAllUserAccounts((prev) =>
        prev.map((u) =>
          u.uid === targetUser.uid
            ? { ...u, role: grant ? 'teacher' : 'student', isApprovedTeacher: grant, approvedBy: SUPER_ADMIN_EMAIL }
            : u
        )
      );

      showBanner(`已${grant ? '核准並授予' : '取消'}【${targetUser.email || targetUser.name}】的教師權限！`);
    } catch (err) {
      console.warn('Role toggle error:', err);
      showBanner(`權限設定已更新`);
    }
  };

  // Super Admin: Add new teacher by email
  const handleAddTeacherByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !newTeacherEmailInput.trim()) return;

    const email = newTeacherEmailInput.trim().toLowerCase();
    const fakeUid = `uid-teacher-${Date.now()}`;
    const newTeacherAcc: UserAccount = {
      uid: fakeUid,
      email,
      name: email.split('@')[0] + ' 老師',
      role: 'teacher',
      isApprovedTeacher: true,
      approvedBy: SUPER_ADMIN_EMAIL,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', fakeUid), newTeacherAcc);
      setAllUserAccounts((prev) => [newTeacherAcc, ...prev]);
      setNewTeacherEmailInput('');
      showBanner(`已成功授權【${email}】為合格教師！`);
    } catch (err) {
      console.warn('Teacher create notice:', err);
      setAllUserAccounts((prev) => [newTeacherAcc, ...prev]);
      setNewTeacherEmailInput('');
      showBanner(`已將【${email}】登記為合格教師！`);
    }
  };

  const showBanner = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 3500);
  };

  // Student's personal view data (if logged in as student)
  const currentStudentRecord = useMemo(() => {
    if (!isStudent || !teacherProfile.email) return null;
    const found = students.find((s) => 
      s.email === teacherProfile.email || 
      s.uid === teacherProfile.uid || 
      (teacherProfile.seatNumber && s.seatNumber === teacherProfile.seatNumber)
    );
    if (found) {
      if (teacherProfile.studentPoints !== undefined) {
        return { ...found, points: teacherProfile.studentPoints };
      }
      return found;
    }
    // Dynamic fallback if student is registered in Auth/Users collection
    return {
      id: teacherProfile.uid || `st-${teacherProfile.seatNumber || 'custom'}`,
      seatNumber: teacherProfile.seatNumber || 0,
      name: teacherProfile.name || '學生',
      email: teacherProfile.email || 'student@shsh.tw',
      classId: currentClass.id,
      grade: currentClass.grade,
      points: teacherProfile.studentPoints !== undefined ? teacherProfile.studentPoints : 100,
      createdAt: new Date().toISOString(),
    } as StudentRecord;
  }, [students, teacherProfile, isStudent, currentClass]);

  const studentPointHistory = useMemo(() => {
    if (!currentStudentRecord && !isStudent) return [];
    const targetEmail = teacherProfile.email;
    const targetSeat = teacherProfile.seatNumber || currentStudentRecord?.seatNumber;
    const targetId = currentStudentRecord?.id;
    return pointLogs.filter((l) => 
      (targetId && l.studentId === targetId) || 
      (targetEmail && (l as any).studentEmail === targetEmail) ||
      (targetSeat && (l as any).studentSeatNumber === targetSeat)
    );
  }, [pointLogs, currentStudentRecord, teacherProfile, isStudent]);

  return (
    <div id="attendance-manager-root" className="space-y-6 pb-12">
      
      {/* Top Banner / Success Toast */}
      {saveSuccessMsg && (
        <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button onClick={() => setSaveSuccessMsg(null)} className="text-slate-400 hover:text-white">
            關閉
          </button>
        </div>
      )}

      {/* Header & Role Navigation Bar */}
      <section id="attendance-header-card" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <button
              id="back-to-dashboard-btn"
              onClick={onBackToDashboard}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="返回總儀表板"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0 shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  功能二
                </span>
                {!isGuest ? (
                  <>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold border border-slate-200">
                      {currentClass.fullName}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                      旗下學生：{students.length} 人
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold border border-slate-200">
                    班級資訊（登入後解鎖）
                  </span>
                )}
                
                {/* Role Badge */}
                {isSuperAdmin ? (
                  <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-amber-700" />
                    系統最高權限管理者
                  </span>
                ) : isTeacher ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                    合格授權教師（具點名與加扣分權限）
                  </span>
                ) : isPendingTeacher ? (
                  <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-700" />
                    待審核教師（等候最高管理者核發權限）
                  </span>
                ) : isStudent ? (
                  <span className="text-[10px] bg-sky-100 text-sky-900 border border-sky-300 px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1">
                    <Eye className="w-3 h-3 text-sky-700" />
                    學生檢視模式（不可改分或點名）
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-700" />
                    訪客身分（未登入）
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold font-serif text-slate-900 tracking-tight mt-0.5">
                課堂點名與學生管理系統
              </h1>
            </div>
          </div>

          {/* Sub Navigation Tabs or Guest Action */}
          {isGuest ? (
            <div className="flex items-center gap-2 self-start md:self-auto">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>未登入無法使用</span>
              </div>
              {onOpenAuthModal && (
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>登入帳號</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start md:self-auto overflow-x-auto max-w-full">
              {isTeacher ? (
                <>
                  <button
                    onClick={() => setSubTab('attendance')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      subTab === 'attendance'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    即時點名
                  </button>
                  <button
                    onClick={() => setSubTab('points')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      subTab === 'points'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    加扣分與歷程
                  </button>
                  <button
                    onClick={() => setSubTab('roster')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      subTab === 'roster'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    旗下學生名冊 ({students.length})
                  </button>
                  {isSuperAdmin && (
                    <button
                      onClick={() => setSubTab('admin-panel')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        subTab === 'admin-panel'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-amber-800 hover:text-amber-900 bg-amber-100/60'
                      }`}
                    >
                      👑 授權教師管理
                    </button>
                  )}
                </>
              ) : isPendingTeacher ? (
                <div className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200">
                  ⏳ 待審核狀態 (唯讀)
                </div>
              ) : isStudent ? (
                <button
                  onClick={() => setSubTab('my-student-view')}
                  className="bg-white text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
                >
                  我的個人出缺席與成績單
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Permission Notice Banner for Pending Teachers */}
        {isPendingTeacher && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950">教師身分待審核通知</p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                您的帳號已成功註冊，但教師權限目前為【待審核】。為確保班級學生個資與評分安全，需由系統最高管理者（<span className="font-mono font-semibold">stu410018@shsh.tw</span>）於管理後台核發教師權限後，方可使用點名與加扣分功能。
              </p>
            </div>
          </div>
        )}

        {/* Permission Notice Banner for Logged-In Student */}
        {isStudent && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-600">
            <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">學生權限檢視模式</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                依系統安全架構，學生僅能查閱個人出缺席紀錄與加扣分明細，點名與分數調整功能已安全鎖定。教師帳號權限由系統最高管理者審核發放。
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* GUEST ACCESS LOCK (未登入訪客專用畫面 - 需登入使用)                         */}
      {/* ========================================================================= */}
      {isGuest && (
        <section id="attendance-guest-lock" className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xs space-y-6 my-6 animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider bg-amber-100/80 px-3 py-1 rounded-full border border-amber-200">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
              未登入訪客
            </span>
            <h2 className="text-2xl font-bold font-serif text-slate-900 pt-2">
              目前為訪客身分，無法使用
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              課堂點名與學生管理系統包含即時點名記錄、學生加扣分歷史及個人成績單。為維護班級學生個資與評分安全，本功能不開放未登入訪客存取，請先登入帳號。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {onOpenAuthModal && (
              <button
                id="guest-login-btn"
                type="button"
                onClick={onOpenAuthModal}
                className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer hover:shadow-sm"
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span>立即登入帳號</span>
              </button>
            )}
            <button
              id="guest-back-btn"
              type="button"
              onClick={onBackToDashboard}
              className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors cursor-pointer"
            >
              返回總儀表板
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 1. SUB-TAB: ATTENDANCE (即時點名)                                          */}
      {/* ========================================================================= */}
      {subTab === 'attendance' && isTeacher && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Controls & Quick Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              
              {/* Date & Period Picker */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="早自習">早自習</option>
                    <option value="第一節">第一節</option>
                    <option value="第二節">第二節</option>
                    <option value="第三節">第三節</option>
                    <option value="第四節">第四節</option>
                    <option value="午休">午休</option>
                    <option value="第五節">第五節</option>
                    <option value="第六節">第六節</option>
                    <option value="第七節">第七節</option>
                    <option value="全日">全日出缺席</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  id="set-all-present-btn"
                  onClick={handleSetAllPresent}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  全班皆到
                </button>
                <button
                  id="save-attendance-btn"
                  onClick={handleSaveAttendance}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  儲存點名紀錄
                </button>
              </div>
            </div>

            {/* Attendance Live Stats Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] text-slate-500 font-medium block">應到人數</span>
                <span className="text-base font-bold text-slate-900">{attendanceStats.total} 人</span>
              </div>
              <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 text-center">
                <span className="text-[10px] text-emerald-600 font-medium block">實到人數</span>
                <span className="text-base font-bold text-emerald-700">{attendanceStats.presentCount} 人</span>
              </div>
              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100 text-center">
                <span className="text-[10px] text-amber-600 font-medium block">遲到</span>
                <span className="text-base font-bold text-amber-700">{attendanceStats.lateCount} 人</span>
              </div>
              <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100 text-center">
                <span className="text-[10px] text-blue-600 font-medium block">請假</span>
                <span className="text-base font-bold text-blue-700">{attendanceStats.leaveCount} 人</span>
              </div>
              <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100 text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] text-rose-600 font-medium block">缺席</span>
                <span className="text-base font-bold text-rose-700">{attendanceStats.absentCount} 人</span>
              </div>
            </div>
          </div>

          {/* Student Grid / List for Attendance Marking */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="搜尋座號或姓名..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl w-44 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                {/* Filter Dropdown */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-white border border-slate-200 text-xs px-2.5 py-1.5 rounded-xl font-medium text-slate-700 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">全部狀態</option>
                  <option value="present">僅看 出席</option>
                  <option value="late">僅看 遲到</option>
                  <option value="leave">僅看 請假</option>
                  <option value="absent">僅看 缺席</option>
                </select>
              </div>

              <span className="text-xs text-slate-400 font-medium">
                顯示 {filteredStudents.length} / {students.length} 位學生
              </span>
            </div>

            {/* Attendance Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredStudents.map((student) => {
                const currentStatus = attendanceState[student.id] || 'present';
                return (
                  <div
                    key={student.id}
                    className={`bg-white border rounded-2xl p-3.5 shadow-2xs transition-all flex flex-col justify-between gap-3 ${
                      currentStatus === 'present'
                        ? 'border-slate-200'
                        : currentStatus === 'late'
                        ? 'border-amber-200 bg-amber-50/20'
                        : currentStatus === 'leave'
                        ? 'border-blue-200 bg-blue-50/20'
                        : 'border-rose-200 bg-rose-50/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                          {student.seatNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900">{student.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({student.points}分)</span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate max-w-[140px] block">
                            {student.email || '未綁定帳號'}
                          </span>
                        </div>
                      </div>

                      {/* Quick Point Adjust Button */}
                      <button
                        onClick={() => setSelectedStudentForPoint(student)}
                        className="text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                        title="給予此學生加扣分"
                      >
                        評分
                      </button>
                    </div>

                    {/* 4 Attendance Status Selector Buttons */}
                    <div className="grid grid-cols-4 gap-1 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'present')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'present'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        出席
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'late')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'late'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        遲到
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'leave')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'leave'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        請假
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(student.id, 'absent')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'absent'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        缺席
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUB-TAB: POINTS & HISTORY (加扣分與歷程)                                */}
      {/* ========================================================================= */}
      {subTab === 'points' && isTeacher && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Top Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <span className="text-xs text-slate-400 font-medium">全班總平均分數</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold font-serif text-slate-900">
                  {students.length > 0
                    ? Math.round(students.reduce((acc, s) => acc + s.points, 0) / students.length)
                    : 100}
                </span>
                <span className="text-xs text-slate-500 font-medium">分（基準 100 分）</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <span className="text-xs text-slate-400 font-medium">最高分同學</span>
              <div className="flex items-baseline gap-2 mt-1">
                {(() => {
                  const sorted = [...students].sort((a, b) => b.points - a.points);
                  const top = sorted[0];
                  return (
                    <>
                      <span className="text-xl font-bold text-slate-900">
                        {top ? `${top.seatNumber}號 ${top.name}` : '-'}
                      </span>
                      <span className="text-xs font-bold text-emerald-600">
                        {top ? `${top.points} 分` : ''}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
              <span className="text-xs text-slate-400 font-medium">本學期累計評分紀錄</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold font-serif text-slate-900">{pointLogs.length}</span>
                <span className="text-xs text-slate-500 font-medium">筆記錄</span>
              </div>
            </div>
          </div>

          {/* Student Points Management Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">學生日常表現評分表</h3>
                <p className="text-xs text-slate-500">點擊「加分 / 扣分」即可快速調整學生平常成績並留下 audit 紀錄</p>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="搜尋學生..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl w-48 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="py-3 px-4">座號</th>
                    <th className="py-3 px-4">姓名</th>
                    <th className="py-3 px-4">目前平時分數</th>
                    <th className="py-3 px-4">最近評分變動</th>
                    <th className="py-3 px-4 text-right">評分操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((student) => {
                    const studentLogs = pointLogs.filter((l) => l.studentId === student.id);
                    const latestLog = studentLogs[0];

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{student.seatNumber}</td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          <div>
                            <span className="font-bold">{student.name}</span>
                            <span className="text-[10px] text-slate-400 block">{student.email || '未設定 Email'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-xs ${
                            student.points >= 100
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : student.points >= 80
                              ? 'bg-slate-100 text-slate-800 border border-slate-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {student.points} 分
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {latestLog ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold ${latestLog.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {latestLog.delta > 0 ? `+${latestLog.delta}` : latestLog.delta}
                              </span>
                              <span className="text-[11px] text-slate-600 truncate max-w-[160px]">
                                ({latestLog.reason})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">尚無評分異動</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedStudentForPoint(student);
                                setCustomDelta(1);
                                setPointReason('課堂主動發言');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 transition-colors cursor-pointer"
                            >
                              +1 發言
                            </button>
                            <button
                              onClick={() => {
                                setSelectedStudentForPoint(student);
                                setCustomDelta(-1);
                                setPointReason('未帶課堂學用品');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition-colors cursor-pointer"
                            >
                              -1 違規
                            </button>
                            <button
                              onClick={() => setSelectedStudentForPoint(student)}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors cursor-pointer"
                            >
                              自訂評分
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Audit Logs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              評分變動記錄 (Audit Logs)
            </h3>
            {pointLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">目前尚無評分紀錄</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {pointLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        log.delta > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {log.delta > 0 ? `+${log.delta}` : log.delta}
                      </span>
                      <div>
                        <span className="font-bold text-slate-900">{log.seatNumber}號 {log.studentName}</span>
                        <span className="text-slate-500 ml-2">原因：{log.reason}</span>
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-slate-400">
                      <span>評分者：{log.teacherName}</span>
                      <span className="block">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUB-TAB: ROSTER (旗下學生名冊管理)                                       */}
      {/* ========================================================================= */}
      {subTab === 'roster' && isTeacher && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                【{currentClass.fullName}】旗下學生名冊
              </h3>
              <p className="text-xs text-slate-500">
                老師可在此將學生帳號納入旗下、編輯座號、設定綁定信箱或更新名單
              </p>
            </div>

            <button
              id="add-student-btn"
              onClick={() => {
                setEditingStudent(null);
                setNewStudentSeat(students.length + 1);
                setNewStudentName('');
                setNewStudentEmail('');
                setNewStudentPoints(100);
                setIsAddStudentOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4" />
              新增學生到旗下
            </button>
          </div>

          {/* Students Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {students.map((student) => (
              <div
                key={student.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center">
                    {student.seatNumber}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{student.name}</h4>
                    <p className="text-[11px] text-slate-400 truncate max-w-[150px]">
                      {student.email || '尚未設定帳號 Email'}
                    </p>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 mt-1 inline-block">
                      目前分數: {student.points} 分
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingStudent(student);
                      setNewStudentSeat(student.seatNumber);
                      setNewStudentName(student.name);
                      setNewStudentEmail(student.email || '');
                      setNewStudentPoints(student.points);
                      setIsAddStudentOpen(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="編輯資料"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteStudent(student.id, student.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="從旗下移除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SUB-TAB: SUPER ADMIN PANEL (授權教師管理 - stu410018@shsh.tw)             */}
      {/* ========================================================================= */}
      {subTab === 'admin-panel' && isSuperAdmin && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">
                  Super Admin Management
                </span>
                <h2 className="text-xl font-bold font-serif mt-1">教師權限審核中心</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  教師帳號權限由最高管理者審核與發出。獲准之教師方可執行點名、旗下學生納管與成績加扣分。
                </p>
              </div>
              <ShieldCheck className="w-10 h-10 text-amber-400 shrink-0" />
            </div>

            {/* Grant New Teacher Form */}
            <form onSubmit={handleAddTeacherByEmail} className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-2.5">
              <input
                type="email"
                required
                placeholder="輸入要授權的教師信箱 (如 teacher@school.edu.tw)..."
                value={newTeacherEmailInput}
                onChange={(e) => setNewTeacherEmailInput(e.target.value)}
                className="flex-1 w-full bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
              />
              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-xs transition-all shadow-xs cursor-pointer whitespace-nowrap"
              >
                + 直接授予教師資格
              </button>
            </form>
          </div>

          {/* Registered Users List */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">系統註冊用戶與權限清單</h3>
              <p className="text-xs text-slate-500">可一鍵開通或停用各帳號之教師身份</p>
            </div>

            <div className="divide-y divide-slate-100">
              {allUserAccounts.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">尚未有其他註冊用戶</p>
              ) : (
                allUserAccounts.map((user) => {
                  const isMaster = user.email === SUPER_ADMIN_EMAIL;
                  const isApproved = isMaster || Boolean(user.isApprovedTeacher);
                  const isPending = !isApproved && (user.role === 'pending_teacher' || user.role === 'teacher');

                  return (
                    <div key={user.uid} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white ${
                          isMaster ? 'bg-amber-500' : isApproved ? 'bg-emerald-600' : isPending ? 'bg-amber-600' : 'bg-slate-700'
                        }`}>
                          {user.name ? user.name.slice(0, 1) : 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{user.name || '使用者'}</span>
                            {isMaster && (
                              <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                                👑 系統最高管理者
                              </span>
                            )}
                            {isApproved && !isMaster && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full font-bold border border-emerald-300">
                                🧑‍🏫 合格授權教師
                              </span>
                            )}
                            {isPending && !isMaster && (
                              <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                                ⏳ 待審核教師
                              </span>
                            )}
                            {!isApproved && !isPending && !isMaster && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border border-slate-200">
                                <Lock className="w-2.5 h-2.5 text-slate-500" />
                                <span>🎓 學生帳號</span>
                                {user.classId && (
                                  <span className="font-semibold text-slate-900">
                                    • {user.classId === 'c-101' ? '一年1班' : user.classId === 'c-102' ? '一年2班' : user.classId === 'c-103' ? '一年3班' : user.classId}
                                    {user.seatNumber ? ` (${user.seatNumber}號)` : ''}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-mono">{user.email}</span>
                        </div>
                      </div>

                      {!isMaster && (
                        <div>
                          {isApproved ? (
                            <button
                              onClick={() => handleToggleTeacherRole(user, false)}
                              className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              撤銷教師權限
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleTeacherRole(user, true)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              核發教師權限
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SUB-TAB: STUDENT PERSONAL VIEW (學生專屬個人查閱畫面)                     */}
      {/* ========================================================================= */}
      {(isStudent || (isTeacher && subTab === 'my-student-view')) && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Student Profile Overview Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-xl shadow-xs">
                  {isStudent ? (teacherProfile.seatNumber || currentStudentRecord?.seatNumber || '學') : '訪'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold font-serif text-slate-900">
                      {isStudent ? (teacherProfile.name || currentStudentRecord?.name || '學生') : '訪客身分 (未登入)'}
                    </h2>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200">
                      {currentClass.fullName} • {isStudent ? (teacherProfile.seatNumber || currentStudentRecord?.seatNumber ? `座號 ${teacherProfile.seatNumber || currentStudentRecord?.seatNumber}` : '學生身分') : '未登入訪客'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isStudent ? (
                      <>學生專屬帳號: <span className="font-mono text-slate-700 font-medium">{teacherProfile.email}</span></>
                    ) : (
                      <span>目前身分: <strong className="text-slate-700 font-medium">未登入訪客</strong>（登入學生帳號可查閱真實個人成績）</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Total Points Badge */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center self-start sm:self-auto min-w-[140px]">
                <span className="text-[11px] text-slate-500 font-medium block">
                  {isStudent ? '我的平時總分數' : '標準基準分數'}
                </span>
                <span className="text-2xl sm:text-3xl font-bold font-serif text-slate-900">
                  {isStudent ? (teacherProfile.studentPoints !== undefined ? teacherProfile.studentPoints : (currentStudentRecord?.points || 100)) : 100}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {isStudent ? '不可自行修改（後台即時同步）' : '未登入訪客（登入讀取實分）'}
                </span>
              </div>
            </div>
          </div>

          {/* Student Point History Logs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-slate-500" />
              個人加扣分明細紀錄
            </h3>

            {!isStudent ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-600 font-medium">您目前為訪客身分</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                  請點擊右上角「登入」切換為您的學生帳號，系統將自動連線 Firebase 資料庫讀取您在【{currentClass.fullName}】的專屬座號、平時分數與教師評語紀錄。
                </p>
              </div>
            ) : studentPointHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">尚無加扣分異動紀錄</p>
            ) : (
              <div className="space-y-2">
                {studentPointHistory.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        log.delta > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {log.delta > 0 ? `+${log.delta}` : log.delta}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{log.reason}</p>
                        <p className="text-[11px] text-slate-400">評分老師：{log.teacherName}</p>
                      </div>
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(log.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: POINT ADJUSTMENT MODAL (加扣分彈出視窗)                                */}
      {/* ========================================================================= */}
      {selectedStudentForPoint && isTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  學生評分
                </span>
                <h3 className="text-base font-bold">
                  【{selectedStudentForPoint.seatNumber}號 {selectedStudentForPoint.name}】平常表現評分
                </h3>
              </div>
              <button
                onClick={() => setSelectedStudentForPoint(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              
              {/* Preset Positive Reasons */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  常見加分項目
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_REASONS_POS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setPointReason(preset.label);
                        setCustomDelta(preset.delta);
                        setIsCustomReason(false);
                      }}
                      className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                        pointReason === preset.label && customDelta === preset.delta
                          ? 'bg-emerald-600 border-emerald-600 text-white font-bold'
                          : 'bg-emerald-50/60 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      +{preset.delta} {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preset Negative Reasons */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  常見扣分項目
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_REASONS_NEG.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setPointReason(preset.label);
                        setCustomDelta(preset.delta);
                        setIsCustomReason(false);
                      }}
                      className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                        pointReason === preset.label && customDelta === preset.delta
                          ? 'bg-rose-600 border-rose-600 text-white font-bold'
                          : 'bg-rose-50/60 border-rose-200 text-rose-800 hover:bg-rose-100'
                      }`}
                    >
                      {preset.delta} {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      變動點數 (+/-)
                    </label>
                    <input
                      type="number"
                      value={customDelta}
                      onChange={(e) => setCustomDelta(Number(e.target.value))}
                      className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      評分後總分 (限0~100分)
                    </label>
                    <div className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800">
                      {Math.max(0, Math.min(100, selectedStudentForPoint.points + customDelta))} 分
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    評分事由 / 說明
                  </label>
                  <input
                    type="text"
                    value={pointReason}
                    onChange={(e) => {
                      setPointReason(e.target.value);
                      setIsCustomReason(true);
                    }}
                    placeholder="請輸入評分事由..."
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedStudentForPoint(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleApplyPointChange}
                  className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
                >
                  確認儲存評分
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT STUDENT MODAL (新增/編輯旗下學生)                           */}
      {/* ========================================================================= */}
      {isAddStudentOpen && isTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  名冊管理
                </span>
                <h3 className="text-base font-bold">
                  {editingStudent ? '編輯學生資料' : '新增學生至旗下'}
                </h3>
              </div>
              <button
                onClick={() => setIsAddStudentOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">班級座號</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={newStudentSeat}
                    onChange={(e) => setNewStudentSeat(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">基準分數 (0~100分)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={newStudentPoints}
                    onChange={(e) => setNewStudentPoints(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">學生姓名</label>
                <input
                  type="text"
                  required
                  placeholder="例如：王同學 (或 max)"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  綁定學生帳號 Email (選填)
                </label>
                <input
                  type="email"
                  placeholder="例如：student1@shsh.tw"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  若填寫此信箱，當該學生以此 Google/Firebase 帳號登入時，將自動連動至此座號並僅能查閱個人分數。
                </p>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveStudentToRoster}
                  className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
                >
                  確認儲存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
