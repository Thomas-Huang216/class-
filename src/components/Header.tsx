import React, { useState, useEffect } from 'react';
import { 
  LogIn, 
  UserCheck, 
  Clock, 
  Timer, 
  ChevronDown, 
  Sparkles,
  LayoutGrid,
  Layers,
  Users,
  Edit2,
  Check,
  Compass,
  Instagram,
  PlusSquare,
  Heart,
  Lock,
  GraduationCap
} from 'lucide-react';
import { TeacherProfile, ActiveTab, ClassInfo, GradeLevel } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  teacherProfile: TeacherProfile;
  onOpenAuthModal: () => void;
  onOpenTimerModal: () => void;
  classList: ClassInfo[];
  currentClass: ClassInfo;
  onSelectClass: (classId: string) => void;
  onUpdateTotalStudents: (classId: string, count: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  teacherProfile,
  onOpenAuthModal,
  onOpenTimerModal,
  classList,
  currentClass,
  onSelectClass,
  onUpdateTotalStudents,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [activeGradeTab, setActiveGradeTab] = useState<GradeLevel>(currentClass.grade);
  const [isEditingCount, setIsEditingCount] = useState(false);
  const [studentCountInput, setStudentCountInput] = useState<number>(currentClass.totalStudents);

  useEffect(() => {
    setActiveGradeTab(currentClass.grade);
    setStudentCountInput(currentClass.totalStudents);
  }, [currentClass]);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { 
        month: 'numeric', 
        day: 'numeric', 
        weekday: 'short' 
      };
      setDateStr(now.toLocaleDateString('zh-TW', options));
      setTimeStr(now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
    };

    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const isLoggedIn = Boolean(teacherProfile.isLoggedIn);
  const isApprovedTeacher = isLoggedIn && (teacherProfile.isSuperAdmin || Boolean(teacherProfile.isApprovedTeacher) || teacherProfile.email === 'stu410018@shsh.tw');
  const isStudent = isLoggedIn && teacherProfile.role === 'student';

  const handleSaveStudentCount = () => {
    if (!isApprovedTeacher) {
      setIsEditingCount(false);
      return;
    }
    const parsed = Math.max(1, Math.min(99, Number(studentCountInput) || 30));
    onUpdateTotalStudents(currentClass.id, parsed);
    setIsEditingCount(false);
  };

  const grades: GradeLevel[] = ['一年級', '二年級', '三年級'];

  return (
    <header id="main-header" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-15 gap-4">
          
          {/* Clean Logo & Typography */}
          <div className="flex items-center gap-3">
            <button
              id="nav-logo-btn"
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2 group text-left focus:outline-hidden cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white transition-transform group-hover:scale-105 shadow-xs">
                <GraduationCap className="w-4.5 h-4.5 text-white" />
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-lg sm:text-xl font-serif italic">
                  class management
                </span>
              </div>
            </button>

            {/* Quick Navigation Tabs (Instagram style) */}
            <nav className="hidden md:flex items-center gap-1.5 ml-6 pl-4 border-l border-slate-200">
              <button
                id="tab-btn-dashboard"
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                動態總覽
              </button>

              <button
                id="tab-btn-tool-1"
                onClick={() => setActiveTab('tool-1')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'tool-1'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                功能一: 隨機抽號
              </button>

              <button
                id="tab-btn-tool-2"
                onClick={() => setActiveTab('tool-2')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'tool-2'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                功能二: 點名系統
              </button>

              <button
                id="tab-btn-tool-3"
                onClick={() => setActiveTab('tool-3')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'tool-3'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                功能三: 值日生系統
              </button>
            </nav>
          </div>

          {/* Right Area: Grade & Class Selector, Student Count, Clock/Timer, and Login Button */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            
            {/* Grade & Class Selector / Student Locked Badge / Guest Hidden Badge */}
            {!isLoggedIn ? (
              <div 
                id="guest-class-locked-badge"
                className="flex items-center gap-1.5 bg-slate-100/90 text-slate-500 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 select-none shadow-2xs"
                title="訪客模式：為維護學生與班級隱私，年段、班級與人數資訊需登入後解鎖"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>班級資訊（需登入）</span>
              </div>
            ) : isStudent ? (
              <div 
                id="student-class-locked-badge"
                className="flex items-center gap-1.5 bg-slate-100/90 text-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 select-none shadow-2xs"
                title={`學生帳號專屬綁定班級【${currentClass.fullName}】，依系統規定無法切換至其他班級`}
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-bold text-slate-900">{currentClass.fullName}</span>
                {teacherProfile.seatNumber ? (
                  <span className="text-[11px] text-slate-600 font-medium">
                    {teacherProfile.seatNumber}號
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 font-normal">
                    ({currentClass.totalStudents}人)
                  </span>
                )}
                <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                  專屬班級
                </span>
              </div>
            ) : (
              <div className="relative">
                <button
                  id="class-selector-btn"
                  onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                  className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer border border-slate-200"
                  title="選擇一至三年級與班級"
                >
                  <span className="font-bold">{currentClass.fullName}</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    ({currentClass.totalStudents}人)
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {isClassDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsClassDropdownOpen(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-3.5 z-20 animate-in fade-in zoom-in-95 duration-150">
                      
                      {/* Grade Level Tabs */}
                      <div className="mb-2.5 pb-2 border-b border-slate-100">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                          年段切換
                        </div>
                        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                          {grades.map((grade) => (
                            <button
                              key={grade}
                              onClick={() => setActiveGradeTab(grade)}
                              className={`py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                activeGradeTab === grade
                                  ? 'bg-white text-slate-900 shadow-xs'
                                  : 'text-slate-500 hover:text-slate-900'
                              }`}
                            >
                              {grade}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Classes in selected grade */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                          {activeGradeTab} 班級
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pt-1">
                          {classList
                            .filter((c) => c.grade === activeGradeTab)
                            .map((cls) => (
                              <button
                                key={cls.id}
                                id={`select-class-${cls.id}`}
                                onClick={() => {
                                  onSelectClass(cls.id);
                                  setIsClassDropdownOpen(false);
                                }}
                                className={`text-left px-3 py-2 rounded-xl text-xs flex flex-col justify-between transition-all cursor-pointer border ${
                                  currentClass.id === cls.id
                                    ? 'bg-slate-900 border-slate-900 text-white font-bold'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span>{cls.className}</span>
                                  {currentClass.id === cls.id && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                  )}
                                </div>
                                <span className={`text-[10px] font-normal ${currentClass.id === cls.id ? 'text-slate-300' : 'text-slate-400'}`}>
                                  {cls.totalStudents} 人
                                </span>
                              </button>
                            ))}
                        </div>
                      </div>

                      {/* Quick Student Count Editor */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Users className="w-3.5 h-3.5 text-slate-700" />
                          <span className="font-medium">{currentClass.fullName}:</span>
                        </div>
                        
                        {isApprovedTeacher ? (
                          isEditingCount ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={studentCountInput}
                                onChange={(e) => setStudentCountInput(Number(e.target.value))}
                                className="w-12 px-1 py-0.5 text-xs text-center border border-slate-400 rounded bg-white font-bold"
                                autoFocus
                              />
                              <button
                                onClick={handleSaveStudentCount}
                                className="p-1 bg-slate-900 text-white rounded hover:bg-slate-800 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setIsEditingCount(true)}
                              className="flex items-center gap-1 font-bold text-slate-900 hover:text-slate-700 cursor-pointer"
                              title="點擊修改學生總數"
                            >
                              <span>{currentClass.totalStudents} 人</span>
                              <Edit2 className="w-3 h-3 text-slate-400" />
                            </button>
                          )
                        ) : (
                          <div className="flex items-center gap-1.5 font-bold text-slate-700" title="未登入訪客模式不可修改班級人數">
                            <span>{currentClass.totalStudents} 人</span>
                            <span className="text-[10px] text-slate-400 font-normal bg-slate-200/60 px-1.5 py-0.5 rounded">
                              唯讀
                            </span>
                          </div>
                        )}
                      </div>

                    </div>
                  </>
                )}
              </div>
            )}

            {/* Quick Timer Tool Trigger */}
            <button
              id="header-timer-btn"
              onClick={onOpenTimerModal}
              className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              title="課堂隨身計時鐘"
            >
              <Timer className="w-4 h-4" />
            </button>

            {/* Date and Time badge (Desktop) */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-mono font-medium text-slate-600">{timeStr}</span>
            </div>

            {/* Firebase User Avatar / Login Button */}
            <button
              id="top-login-btn"
              onClick={onOpenAuthModal}
              className="cursor-pointer group flex items-center"
            >
              {teacherProfile.isLoggedIn ? (
                <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center border border-slate-200">
                  {teacherProfile.name.slice(0, 1)}
                </div>
              ) : (
                <div className="px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all">
                  登入
                </div>
              )}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
