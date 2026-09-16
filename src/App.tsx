import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DashboardHome } from './components/DashboardHome';
import { ToolWorkspace } from './components/ToolWorkspace';
import { RandomNumberPicker } from './components/RandomNumberPicker';
import { AttendanceManager } from './components/AttendanceManager';
import { DutyScheduleManager } from './components/DutyScheduleManager';
import { AuthModal } from './components/AuthModal';
import { ClassroomTimerModal } from './components/ClassroomTimerModal';
import { ActiveTab, TeacherProfile, ToolItem, ClassInfo, UserRole, StudentRecord } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';

const SUPER_ADMIN_EMAIL = 'stu410018@shsh.tw';

// Default classes organized by Grade 1 to 3
const INITIAL_CLASSES: ClassInfo[] = [
  // 一年級
  { id: 'c-101', grade: '一年級', className: '1班', fullName: '一年1班', totalStudents: 32 },
  { id: 'c-102', grade: '一年級', className: '2班', fullName: '一年2班', totalStudents: 30 },
  { id: 'c-103', grade: '一年級', className: '3班', fullName: '一年3班', totalStudents: 34 },
  { id: 'c-104', grade: '一年級', className: '4班', fullName: '一年4班', totalStudents: 31 },
  { id: 'c-105', grade: '一年級', className: '5班', fullName: '一年5班', totalStudents: 28 },

  // 二年級
  { id: 'c-201', grade: '二年級', className: '1班', fullName: '二年1班', totalStudents: 33 },
  { id: 'c-202', grade: '二年級', className: '2班', fullName: '二年2班', totalStudents: 35 },
  { id: 'c-203', grade: '二年級', className: '3班', fullName: '二年3班', totalStudents: 29 },
  { id: 'c-204', grade: '二年級', className: '4班', fullName: '二年4班', totalStudents: 32 },
  { id: 'c-205', grade: '二年級', className: '5班', fullName: '二年5班', totalStudents: 30 },

  // 三年級
  { id: 'c-301', grade: '三年級', className: '1班', fullName: '三年1班', totalStudents: 30 },
  { id: 'c-302', grade: '三年級', className: '2班', fullName: '三年2班', totalStudents: 31 },
  { id: 'c-303', grade: '三年級', className: '3班', fullName: '三年3班', totalStudents: 33 },
  { id: 'c-304', grade: '三年級', className: '4班', fullName: '三年4班', totalStudents: 28 },
  { id: 'c-305', grade: '三年級', className: '5班', fullName: '三年5班', totalStudents: 36 },
];

const INITIAL_TOOLS: ToolItem[] = [
  {
    id: 'tool-1',
    slotNumber: 1,
    title: '功能一：隨機抽號工具',
    defaultTitle: '功能一：隨機抽號工具',
    category: '課堂互動',
    description: '最大抽號範圍嚴格限制於學生總數（可自訂 1~99人），具備不重複排除、歷程記錄與投影模式。',
    badge: '已連動總數',
    colorScheme: 'indigo',
    status: 'active',
    features: ['上限不能超過學生總數', '老師可隨時更改總人數', '一至三年段班級切換', '不重複與投影全螢幕'],
  },
  {
    id: 'tool-2',
    slotNumber: 2,
    title: '功能二：課堂點名與學生管理系統',
    defaultTitle: '功能二：課堂點名與學生管理系統',
    category: '出缺席與評分',
    description: 'Firebase 雲端後端；區分教師與學生權限。教師可點名、納入旗下學生、看資料、加扣分（限制於0~100分）；學生唯讀個人資料與分數。教師帳號權限由最高管理者審核發出。',
    badge: 'Firebase 已連線',
    colorScheme: 'emerald',
    status: 'active',
    features: ['區分教師與學生權限', '教師可點名與加扣分 (0-100分)', '旗下學生帳號納管', '學生唯讀不可改分', '由最高管理者核發權限'],
  },
  {
    id: 'tool-3',
    slotNumber: 3,
    title: '功能三：值日生輪值系統',
    defaultTitle: '功能三：值日生輪值系統',
    category: '生活常規',
    description: '每日兩位值日生依號碼順序輪流；可設定免值日號碼（自動跳過幹部），支援重做一天與黑板投影模式。',
    badge: '每日雙人輪值',
    colorScheme: 'amber',
    status: 'active',
    features: ['每日兩位依號碼順序輪流', '可設定免值日號碼 (自動略過)', '支援重做一天 (可標記原因)', '未來 10 天排程與黑板投影模式'],
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [classList, setClassList] = useState<ClassInfo[]>(INITIAL_CLASSES);
  const [currentClassId, setCurrentClassId] = useState<string>('c-101');
  const [tools] = useState<ToolItem[]>(INITIAL_TOOLS);
  
  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);

  // Teacher / Student Profile state
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile>({
    name: '未登入訪客',
    title: '訪客',
    school: '示範高級中學',
    currentClassId: 'c-101',
    isLoggedIn: false,
    role: 'guest',
    isApprovedTeacher: false,
    isSuperAdmin: false,
    seatNumber: undefined,
  });

  // Listen to Firebase Auth state & Sync User Document
  useEffect(() => {
    let unsubscribeStudentSnap: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user: User | null) => {
      if (unsubscribeStudentSnap) {
        unsubscribeStudentSnap();
        unsubscribeStudentSnap = undefined;
      }

      if (user) {
        const isMaster = user.email === SUPER_ADMIN_EMAIL;
        let userRole: UserRole = isMaster ? 'admin' : 'student';
        let isApproved = isMaster;
        let userName = user.displayName || user.email?.split('@')[0] || (isMaster ? '系統管理者' : '同學');
        let userClassId = currentClassId;
        let userSeatNumber: number | undefined;
        let userStudentPoints: number | undefined;

        try {
          // 1. Fetch User doc from Firestore
          const userDocRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            isApproved = isMaster || Boolean(data.isApprovedTeacher);
            if (isMaster) {
              userRole = 'admin';
            } else if (isApproved) {
              userRole = (data.role === 'admin' ? 'teacher' : data.role) || 'teacher';
            } else if (data.role === 'pending_teacher' || data.role === 'teacher') {
              userRole = 'pending_teacher';
            } else {
              userRole = data.role || 'student';
            }
            if (data.name) userName = data.name;
            if (data.classId) userClassId = data.classId;
            if (data.seatNumber) userSeatNumber = data.seatNumber;
          } else {
            // New user registration / first login: Default to student (or admin if master)
            userRole = isMaster ? 'admin' : 'student';
            isApproved = isMaster;
            await setDoc(userDocRef, {
              userId: user.uid,
              email: user.email,
              name: userName,
              role: userRole,
              isApprovedTeacher: isApproved,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }

          // 2. Query students collection for linked student record
          const studentQuery = query(
            collection(db, 'students'),
            where('email', '==', user.email)
          );
          const studentSnaps = await getDocs(studentQuery);
          if (!studentSnaps.empty) {
            const stDoc = studentSnaps.docs[0];
            const stData = stDoc.data() as StudentRecord;
            userSeatNumber = stData.seatNumber;
            userStudentPoints = stData.points;
            if (stData.classId) {
              userClassId = stData.classId;
              setCurrentClassId(stData.classId);
            }
            if (stData.name) userName = stData.name;

            // Listen to student points in real-time
            unsubscribeStudentSnap = onSnapshot(doc(db, 'students', stDoc.id), (sSnap) => {
              if (sSnap.exists()) {
                const updated = sSnap.data() as StudentRecord;
                setTeacherProfile((prev) => ({
                  ...prev,
                  studentPoints: updated.points,
                  seatNumber: updated.seatNumber,
                  name: updated.name || prev.name,
                }));
              }
            });
          }
        } catch (e) {
          console.warn('Firestore user query note:', e);
        }

        setTeacherProfile((prev) => ({
          ...prev,
          name: userName,
          email: user.email || undefined,
          uid: user.uid,
          isLoggedIn: true,
          role: userRole,
          isApprovedTeacher: isApproved || isMaster,
          isSuperAdmin: isMaster,
          currentClassId: userClassId,
          seatNumber: userSeatNumber,
          studentPoints: userStudentPoints ?? (userRole === 'student' ? 100 : undefined),
        }));
      } else {
        setTeacherProfile((prev) => ({
          ...prev,
          name: '未登入訪客',
          title: '訪客',
          email: undefined,
          uid: undefined,
          isLoggedIn: false,
          role: 'guest',
          isApprovedTeacher: false,
          isSuperAdmin: false,
          studentPoints: undefined,
          seatNumber: undefined,
        }));
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeStudentSnap) unsubscribeStudentSnap();
    };
  }, []);

  // Enforce student class lock: If logged in as student, strictly lock currentClassId to assigned class
  useEffect(() => {
    if (teacherProfile.isLoggedIn && teacherProfile.role === 'student' && teacherProfile.currentClassId) {
      if (currentClassId !== teacherProfile.currentClassId) {
        setCurrentClassId(teacherProfile.currentClassId);
      }
    }
  }, [teacherProfile.isLoggedIn, teacherProfile.role, teacherProfile.currentClassId, currentClassId]);

  const currentClass = classList.find((c) => c.id === currentClassId) || classList[0];

  // Update total students for a specific class (1-99)
  const handleUpdateTotalStudents = async (classId: string, newCount: number) => {
    const isApproved = Boolean(
      teacherProfile.isLoggedIn && 
      (teacherProfile.isSuperAdmin || teacherProfile.isApprovedTeacher || teacherProfile.email === SUPER_ADMIN_EMAIL)
    );
    if (!isApproved) {
      console.warn('權限不足：僅授權教師可修改班級學生人數');
      return;
    }

    const validCount = Math.max(1, Math.min(99, newCount));
    setClassList((prev) =>
      prev.map((c) => (c.id === classId ? { ...c, totalStudents: validCount } : c))
    );

    // If logged in, optionally sync to Firestore
    if (auth.currentUser) {
      try {
        const classDocRef = doc(db, 'classes', classId);
        await setDoc(classDocRef, {
          classId,
          totalStudents: validCount,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.currentUser.uid,
        }, { merge: true });
      } catch (err) {
        console.warn('Firestore sync note:', err);
      }
    }
  };

  const handleSelectClass = (classId: string) => {
    if (teacherProfile.isLoggedIn && teacherProfile.role === 'student') {
      console.warn('學生帳號已鎖定專屬班級，依系統規範不可切換至其他班級');
      return;
    }
    setCurrentClassId(classId);
    setTeacherProfile((prev) => ({ ...prev, currentClassId: classId }));
  };

  const handleLoginSuccess = (user: { 
    name: string; 
    email: string; 
    uid: string; 
    role?: UserRole; 
    isApprovedTeacher?: boolean; 
    isSuperAdmin?: boolean;
    studentPoints?: number;
    seatNumber?: number;
    classId?: string;
  }) => {
    if (user.classId) {
      setCurrentClassId(user.classId);
    }
    setTeacherProfile((prev) => ({
      ...prev,
      name: user.name,
      email: user.email,
      uid: user.uid,
      isLoggedIn: true,
      role: user.role || (user.email === SUPER_ADMIN_EMAIL ? 'admin' : 'teacher'),
      isApprovedTeacher: user.isApprovedTeacher ?? (user.email === SUPER_ADMIN_EMAIL || true),
      isSuperAdmin: user.isSuperAdmin || user.email === SUPER_ADMIN_EMAIL,
      studentPoints: user.studentPoints,
      seatNumber: user.seatNumber,
      currentClassId: user.classId || prev.currentClassId,
    }));
  };

  const handleLogout = () => {
    setTeacherProfile((prev) => ({
      ...prev,
      name: '訪客身分',
      email: undefined,
      uid: undefined,
      isLoggedIn: false,
      role: 'guest',
      isApprovedTeacher: false,
      isSuperAdmin: false,
      studentPoints: undefined,
      seatNumber: undefined,
    }));
  };

  // Unified Class Roster for currentClassId (Zero hardcoded fake names!)
  // Seat #5 defaults to 'max', all other seats default to their seat number
  const [classStudents, setClassStudents] = useState<StudentRecord[]>(() => {
    const cur = INITIAL_CLASSES.find((c) => c.id === currentClassId) || INITIAL_CLASSES[0];
    const cachedKey = `classgram_roster_${currentClassId}`;
    const cached = typeof window !== 'undefined' ? localStorage.getItem(cachedKey) : null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.warn('Cached roster load note:', e);
      }
    }
    return Array.from({ length: cur.totalStudents }, (_, i) => ({
      id: `${cur.id}-s-${i + 1}`,
      seatNumber: i + 1,
      name: i + 1 === 5 ? 'max' : `${i + 1} 號`,
      classId: cur.id,
      grade: cur.grade,
      points: 100,
    }));
  });

  // Real-time synchronization of student roster across Firestore and User accounts
  useEffect(() => {
    const cur = classList.find((c) => c.id === currentClassId) || classList[0];
    const cachedKey = `classgram_roster_${currentClassId}`;
    const cached = localStorage.getItem(cachedKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClassStudents(parsed);
        }
      } catch (e) {
        console.warn('Cached roster error:', e);
      }
    }

    let unsubStudents: (() => void) | undefined;
    let unsubUsers: (() => void) | undefined;

    try {
      const q = query(
        collection(db, 'students'),
        where('classId', '==', currentClassId)
      );

      unsubStudents = onSnapshot(q, (snapshot) => {
        const map = new Map<number, StudentRecord>();
        for (let i = 1; i <= cur.totalStudents; i++) {
          map.set(i, {
            id: `${currentClassId}-s-${i}`,
            seatNumber: i,
            name: i === 5 ? 'max' : `${i} 號`,
            classId: currentClassId,
            grade: cur.grade,
            points: 100,
          });
        }

        if (!snapshot.empty) {
          snapshot.forEach((d) => {
            const data = d.data() as StudentRecord;
            if (data.seatNumber) {
              map.set(data.seatNumber, { ...map.get(data.seatNumber)!, ...data, id: d.id });
            }
          });
        }

        const merged = Array.from(map.values()).sort((a, b) => a.seatNumber - b.seatNumber);
        setClassStudents(merged);
        localStorage.setItem(cachedKey, JSON.stringify(merged));
      }, (err) => {
        console.warn('Students query sync notice:', err);
      });

      // Also listen to users collection for registered student accounts
      const qUsers = query(
        collection(db, 'users'),
        where('classId', '==', currentClassId),
        where('role', '==', 'student')
      );
      unsubUsers = onSnapshot(qUsers, (uSnap) => {
        if (!uSnap.empty) {
          setClassStudents((prev) => {
            const map = new Map<number, StudentRecord>(prev.map((s) => [s.seatNumber, s]));
            uSnap.forEach((uDoc) => {
              const uData = uDoc.data();
              if (uData.seatNumber && uData.name) {
                const current = map.get(uData.seatNumber);
                if (current) {
                  map.set(uData.seatNumber, { ...current, name: uData.name, uid: uDoc.id });
                }
              }
            });
            const updated = Array.from(map.values()).sort((a, b) => a.seatNumber - b.seatNumber);
            localStorage.setItem(cachedKey, JSON.stringify(updated));
            return updated;
          });
        }
      }, (uErr) => {
        console.warn('Users query notice:', uErr);
      });
    } catch (err) {
      console.warn('Roster sync setup error:', err);
    }

    return () => {
      if (unsubStudents) unsubStudents();
      if (unsubUsers) unsubUsers();
    };
  }, [currentClassId, classList]);

  const handleUpdateStudents = (updatedList: StudentRecord[]) => {
    setClassStudents(updatedList);
    localStorage.setItem(`classgram_roster_${currentClassId}`, JSON.stringify(updatedList));
  };

  const currentTool = tools.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased selection:bg-slate-900 selection:text-white">
      {/* Universal Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        teacherProfile={teacherProfile}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenTimerModal={() => setIsTimerModalOpen(true)}
        classList={classList}
        currentClass={currentClass}
        onSelectClass={handleSelectClass}
        onUpdateTotalStudents={handleUpdateTotalStudents}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6">
        {activeTab === 'dashboard' ? (
          <DashboardHome
            onSelectTab={setActiveTab}
            teacherProfile={teacherProfile}
            currentClass={currentClass}
            onUpdateTotalStudents={handleUpdateTotalStudents}
            tools={tools}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        ) : activeTab === 'tool-1' ? (
          <RandomNumberPicker
            currentClass={currentClass}
            teacherProfile={teacherProfile}
            onUpdateTotalStudents={handleUpdateTotalStudents}
            onBackToDashboard={() => setActiveTab('dashboard')}
          />
        ) : activeTab === 'tool-2' ? (
          <AttendanceManager
            currentClass={currentClass}
            teacherProfile={teacherProfile}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onSelectClass={handleSelectClass}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            students={classStudents}
            onUpdateStudents={handleUpdateStudents}
          />
        ) : activeTab === 'tool-3' ? (
          <DutyScheduleManager
            currentClass={currentClass}
            teacherProfile={teacherProfile}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onSelectClass={handleSelectClass}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            students={classStudents}
            onUpdateStudents={handleUpdateStudents}
          />
        ) : (
          currentTool && (
            <ToolWorkspace
              tool={currentTool}
              currentClass={currentClass.fullName}
              onBackToDashboard={() => setActiveTab('dashboard')}
            />
          )
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="bg-white border-t border-slate-100 py-6 text-center text-xs text-slate-400 mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-center gap-4">
          <span className="font-semibold text-slate-700 tracking-tight">class management</span>
          <span>&bull;</span>
          <span className="text-slate-400">© 2026</span>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        teacherProfile={teacherProfile}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        classList={classList}
        currentClass={currentClass}
      />

      <ClassroomTimerModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
      />
    </div>
  );
}

export default App;
