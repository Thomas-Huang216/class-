import React, { useState, useEffect } from 'react';
import { 
  X, 
  Flame, 
  LogIn, 
  LogOut, 
  ShieldCheck, 
  KeyRound, 
  Mail, 
  CheckCircle2, 
  Cloud,
  AlertCircle,
  UserPlus,
  Loader2,
  GraduationCap,
  Users,
  Eye,
  Lock
} from 'lucide-react';
import { 
  auth, 
  googleProvider, 
  firebaseConfig,
  db
} from '../firebase';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { TeacherProfile, UserRole, ClassInfo } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherProfile: TeacherProfile;
  onLoginSuccess: (user: { 
    name: string; 
    email: string; 
    uid: string; 
    role?: UserRole; 
    isApprovedTeacher?: boolean; 
    isSuperAdmin?: boolean;
    studentPoints?: number;
    seatNumber?: number;
    classId?: string;
  }) => void;
  onLogout: () => void;
  classList?: ClassInfo[];
  currentClass?: ClassInfo;
}

const SUPER_ADMIN_EMAIL = 'stu410018@shsh.tw';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  teacherProfile,
  onLoginSuccess,
  onLogout,
  classList,
  currentClass,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [selectedRole, setSelectedRole] = useState<'teacher' | 'student'>('teacher');
  const [studentClassId, setStudentClassId] = useState<string>(currentClass?.id || 'c-101');
  const [studentSeatNumber, setStudentSeatNumber] = useState<number | ''>('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Process user profile in Firestore
  const processUserAccount = async (
    user: User, 
    customName?: string, 
    intendedRole: 'teacher' | 'student' = 'student',
    intendedClassId?: string,
    intendedSeatNumber?: number
  ) => {
    const isMaster = user.email === SUPER_ADMIN_EMAIL;
    const userDocRef = doc(db, 'users', user.uid);
    let role: UserRole = isMaster ? 'admin' : (intendedRole === 'teacher' ? 'pending_teacher' : 'student');
    let isApproved = isMaster;

    let studentPoints: number | undefined;
    let seatNumber: number | undefined = intendedSeatNumber;
    let classId: string | undefined = intendedClassId;

    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        isApproved = isMaster || Boolean(data.isApprovedTeacher);
        if (isMaster) {
          role = 'admin';
        } else if (isApproved) {
          role = 'teacher';
        } else if (data.role === 'pending_teacher' || data.role === 'teacher') {
          role = 'pending_teacher';
        } else {
          role = data.role || 'student';
        }
        if (data.seatNumber) seatNumber = data.seatNumber;
        if (data.classId) {
          classId = data.classId;
        } else if (role === 'student') {
          // If existing student doesn't have classId set yet, assign current or intended
          classId = intendedClassId || currentClass?.id || 'c-101';
          await setDoc(userDocRef, { classId }, { merge: true }).catch(console.warn);
        }
      } else {
        // Create initial user doc
        const assignedClass = role === 'student' ? (intendedClassId || currentClass?.id || 'c-101') : undefined;
        classId = assignedClass;
        await setDoc(userDocRef, {
          userId: user.uid,
          email: user.email,
          name: customName || user.displayName || user.email?.split('@')[0] || (role === 'student' ? '同學' : '使用者'),
          role,
          classId: assignedClass,
          seatNumber: role === 'student' && intendedSeatNumber ? intendedSeatNumber : undefined,
          isApprovedTeacher: isApproved,
          approvedBy: isMaster ? SUPER_ADMIN_EMAIL : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Also sync to students collection for real-time roster representation
        if (role === 'student' && intendedSeatNumber && assignedClass) {
          const studentDocId = `${assignedClass}-s-${intendedSeatNumber}`;
          const studentName = customName || user.displayName || user.email?.split('@')[0] || (intendedSeatNumber === 5 ? 'max' : `${intendedSeatNumber} 號`);
          await setDoc(doc(db, 'students', studentDocId), {
            id: studentDocId,
            seatNumber: intendedSeatNumber,
            name: studentName,
            email: user.email,
            uid: user.uid,
            classId: assignedClass,
            grade: '一年級',
            points: 100,
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(console.warn);
        }
      }
    } catch (e) {
      console.warn('User profile sync notice:', e);
    }

    const finalProfile = {
      name: customName || user.displayName || user.email?.split('@')[0] || (isMaster ? '系統管理者' : isApproved ? '老師' : role === 'pending_teacher' ? '待審核教師' : '同學'),
      email: user.email || '',
      uid: user.uid,
      role,
      isApprovedTeacher: isApproved,
      isSuperAdmin: isMaster,
      studentPoints,
      seatNumber,
      classId,
    };

    onLoginSuccess(finalProfile);
    return finalProfile;
  };

  // Google Login via Firebase Popup
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      await processUserAccount(
        user, 
        undefined, 
        selectedRole,
        selectedRole === 'student' ? studentClassId : undefined,
        selectedRole === 'student' && studentSeatNumber ? Number(studentSeatNumber) : undefined
      );
      setSuccessMsg('Google 帳號登入成功！已連線至 Firebase');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error('Google Sign-in error:', err);
      if (error.code === 'auth/popup-closed-by-user') {
        setErrorMsg('登入視窗已關閉');
      } else if (error.code === 'auth/unauthorized-domain') {
        setErrorMsg('此網域尚未加入 Firebase 授權網域清單，請至 Firebase Console 新增授權網域。');
      } else {
        setErrorMsg(error.message || '登入失敗，請檢查網路連線或 Firebase 設定');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Email/Password Login or Register
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) {
      setErrorMsg('請輸入電子信箱與密碼');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      let user: User;
      if (isRegisterMode) {
        const res = await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
        user = res.user;
        await processUserAccount(
          user, 
          nameInput.trim(), 
          selectedRole,
          selectedRole === 'student' ? studentClassId : undefined,
          selectedRole === 'student' && studentSeatNumber ? Number(studentSeatNumber) : undefined
        );
        setSuccessMsg(
          user.email === SUPER_ADMIN_EMAIL
            ? '最高管理者註冊成功！'
            : selectedRole === 'teacher'
            ? '教師帳號註冊成功！待系統最高管理者審核後即可啟用所有功能。'
            : '學生帳號註冊成功！已鎖定專屬班級，可查閱個人出缺席與平常成績。'
        );
      } else {
        const res = await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
        user = res.user;
        await processUserAccount(user, undefined, selectedRole);
        setSuccessMsg('登入成功！');
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error('Email auth error:', err);
      if (error.code === 'auth/operation-not-allowed') {
        setErrorMsg('Firebase 後台尚未啟用「電子郵件/密碼 (Email/Password)」登入方式。請至 Firebase 控制台 > Authentication > Sign-in method 將 Email/Password 開啟啟用。');
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setErrorMsg('信箱或密碼錯誤，若首次使用請切換至「註冊帳號」');
      } else if (error.code === 'auth/email-already-in-use') {
        setErrorMsg('此信箱已被註冊，請直接點擊登入');
      } else if (error.code === 'auth/weak-password') {
        setErrorMsg('密碼強度不足，請輸入至少 6 位字元');
      } else if (error.code === 'auth/invalid-email') {
        setErrorMsg('無效的電子信箱格式');
      } else {
        setErrorMsg(error.message || '驗證失敗，請檢查 Firebase 設定');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onLogout();
      setSuccessMsg('已安全登出 Firebase 帳號');
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  return (
    <div 
      id="auth-modal-backdrop" 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div 
        id="auth-modal-container" 
        className="bg-white rounded-2xl max-w-md w-full max-h-[calc(100dvh-2rem)] flex flex-col shadow-2xl border border-slate-100 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header (Fixed, not scrolling) */}
        <div className="bg-slate-900 px-5 py-4 text-white relative shrink-0">
          <button
            id="close-auth-modal-btn"
            type="button"
            onClick={onClose}
            aria-label="按 X 退出登入視窗"
            title="按 X 退出 (或按鍵盤 Esc 鍵)"
            className="absolute top-3.5 right-3.5 text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 active:bg-slate-600 px-2.5 py-1.5 rounded-xl border border-slate-700/80 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-xs group"
          >
            <X className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
            <span>關閉退出</span>
          </button>
          
          <div className="flex items-center gap-3 pr-24">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white shrink-0">
              <Flame className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">Firebase 身分驗證與權限</h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.2 rounded font-mono">
                  已連線
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                教師審核權限由最高管理者審核核發
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body (Scrollable if height exceeds screen) */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {teacherProfile.isLoggedIn ? (
            /* Logged In State */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                  {teacherProfile.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">{teacherProfile.name}</p>
                    <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 已連線
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{teacherProfile.email || '已登入'}</p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-400">目前帳號身份</span>
                  <span className="font-bold text-slate-900">
                    {teacherProfile.isSuperAdmin
                      ? '👑 系統最高管理者'
                      : teacherProfile.isApprovedTeacher
                      ? '🧑‍🏫 合格授權教師'
                      : teacherProfile.role === 'pending_teacher'
                      ? '⏳ 待審核教師 (等候管理者核准)'
                      : '🎓 學生 (唯讀個人資料與成績)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-400">專案名稱</span>
                  <span className="font-mono font-medium text-slate-800">{firebaseConfig.projectId}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">點名與加扣分權限</span>
                  <span className={`font-semibold ${teacherProfile.isApprovedTeacher || teacherProfile.isSuperAdmin ? 'text-emerald-600' : teacherProfile.role === 'pending_teacher' ? 'text-amber-600' : 'text-slate-500'}`}>
                    {teacherProfile.isApprovedTeacher || teacherProfile.isSuperAdmin ? '可點名 / 可看資料 / 可加扣分' : teacherProfile.role === 'pending_teacher' ? '待管理者核發權限後啟用' : '僅可查閱自己資料與分數'}
                  </span>
                </div>
                {teacherProfile.role === 'student' && (
                  <div className="flex justify-between py-1 border-t border-slate-200/60 items-center">
                    <span className="text-slate-400">專屬綁定班級</span>
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>{classList?.find((c) => c.id === teacherProfile.currentClassId)?.fullName || '一年1班'}</span>
                      {teacherProfile.seatNumber ? (
                        <span className="text-slate-600 font-medium">({teacherProfile.seatNumber}號)</span>
                      ) : null}
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-normal">
                        無法跨班
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  id="logout-btn"
                  onClick={handleSignOut}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  登出帳號
                </button>
                <button
                  id="close-profile-btn"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  返回系統
                </button>
              </div>
            </div>
          ) : (
            /* Login & Register Form */
            <div className="space-y-4">
              
              {/* Role Selection Tabs for registration */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSelectedRole('teacher')}
                  className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedRole === 'teacher'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 text-slate-700" />
                  教師身份
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRole('student')}
                  className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedRole === 'student'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4 text-slate-700" />
                  學生身份
                </button>
              </div>

              {/* Notice for Teacher Registration */}
              {selectedRole === 'teacher' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    教師帳號需由最高管理者審核發放權限，通過後可納管學生、點名與加扣分。
                  </span>
                </div>
              )}

              {/* Google One-Click Login */}
              <button
                id="google-signin-btn"
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>使用 Google 帳號一鍵登入</span>
              </button>

              <div className="flex items-center my-3">
                <div className="flex-1 border-t border-slate-200"></div>
                <span className="px-3 text-[10px] text-slate-400 uppercase font-semibold">或使用信箱密碼</span>
                <div className="flex-1 border-t border-slate-200"></div>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                {isRegisterMode && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      姓名 / 暱稱
                    </label>
                    <input
                      type="text"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder={selectedRole === 'teacher' ? '例如：林老師' : '例如：王同學 (或 max)'}
                      className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    電子信箱 (Email)
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="input-teacher-email"
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="account@shsh.tw"
                      className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    密碼
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="input-teacher-password"
                      type="password"
                      required
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="至少 6 位字元密碼"
                      className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Student specific registration details (Locked class assignment) */}
                {isRegisterMode && selectedRole === 'student' && (
                  <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                        <span>所屬專屬班級</span>
                        <span className="text-[10px] text-amber-700 font-normal flex items-center gap-1">
                          <Lock className="w-3 h-3" /> 註冊後綁定，不可任意跨班
                        </span>
                      </label>
                      <select
                        id="student-register-class-select"
                        value={studentClassId}
                        onChange={(e) => setStudentClassId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium text-slate-800 focus:outline-hidden"
                      >
                        {classList && classList.length > 0 ? (
                          classList.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.fullName} ({cls.totalStudents}人)
                            </option>
                          ))
                        ) : (
                          <option value="c-101">一年1班</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        班級座號 <span className="text-slate-400 font-normal">（選填，1~99 號）</span>
                      </label>
                      <input
                        id="student-register-seat-input"
                        type="number"
                        min={1}
                        max={99}
                        value={studentSeatNumber}
                        onChange={(e) => setStudentSeatNumber(e.target.value ? Number(e.target.value) : '')}
                        placeholder="例如：15"
                        className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    id="submit-email-auth-btn"
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : isRegisterMode ? (
                      <UserPlus className="w-3.5 h-3.5" />
                    ) : (
                      <LogIn className="w-3.5 h-3.5" />
                    )}
                    <span>{isRegisterMode ? '註冊 Firebase 新帳號' : '登入帳號'}</span>
                  </button>
                </div>
              </form>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setErrorMsg(null);
                  }}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  {isRegisterMode ? '已有帳號？點此登入' : '第一次使用？點此註冊新帳號'}
                </button>
              </div>

              {/* Bottom Close Action */}
              <div className="pt-2 text-center border-t border-slate-100">
                <button
                  type="button"
                  id="footer-close-auth-modal-btn"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 py-1.5 px-3 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>暫不登入，按此退出</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
