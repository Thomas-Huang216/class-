import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Dices, 
  Award, 
  ArrowRight, 
  CheckCircle, 
  Sparkles, 
  BookOpen, 
  Shuffle, 
  Edit3, 
  Check, 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  MoreHorizontal,
  ShieldCheck,
  GraduationCap,
  Eye,
  CalendarCheck,
  Repeat,
  Lock
} from 'lucide-react';
import { ActiveTab, TeacherProfile, ToolItem, ClassInfo } from '../types';

interface DashboardHomeProps {
  onSelectTab: (tab: ActiveTab) => void;
  teacherProfile: TeacherProfile;
  currentClass: ClassInfo;
  onUpdateTotalStudents: (classId: string, count: number) => void;
  tools: ToolItem[];
  onOpenAuthModal?: () => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  onSelectTab,
  teacherProfile,
  currentClass,
  onUpdateTotalStudents,
  tools,
  onOpenAuthModal,
}) => {
  const [quickPickNumber, setQuickPickNumber] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [isEditingStudents, setIsEditingStudents] = useState<boolean>(false);
  const [studentCountInput, setStudentCountInput] = useState<number>(currentClass.totalStudents);
  const [likedCard, setLikedCard] = useState<Record<string, boolean>>({});
  const [savedCard, setSavedCard] = useState<Record<string, boolean>>({});

  const isLoggedIn = Boolean(teacherProfile.isLoggedIn);
  const isSuperAdmin = isLoggedIn && (teacherProfile.isSuperAdmin || teacherProfile.email === 'stu410018@shsh.tw');
  const isApprovedTeacher = isLoggedIn && (isSuperAdmin || Boolean(teacherProfile.isApprovedTeacher));
  const isTeacher = isApprovedTeacher;
  const isPendingTeacher = isLoggedIn && !isApprovedTeacher && (teacherProfile.role === 'pending_teacher' || teacherProfile.role === 'teacher');
  const isStudent = isLoggedIn && !isApprovedTeacher && !isPendingTeacher;
  const isGuest = !isLoggedIn;

  const [memoNote, setMemoNote] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`class_memo_${currentClass.id}`);
      if (saved !== null) return saved;
    } catch {
      // ignore
    }
    return isStudent
      ? '1. 準時到校與繳交各科作業\n2. 上課積極發言與參與小組討論\n3. 課堂遵守常規以獲取良好平時表現成績'
      : '1. 下週二第一次段考數學\n2. 提醒衛生股長補充粉筆與板擦\n3. 第五節課進行分組討論';
  });

  // Load memo note when class changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`class_memo_${currentClass.id}`);
      if (saved !== null) {
        setMemoNote(saved);
      } else {
        setMemoNote(
          isStudent
            ? '1. 準時到校與繳交各科作業\n2. 上課積極發言與參與小組討論\n3. 課堂遵守常規以獲取良好平時表現成績'
            : '1. 下週二第一次段考數學\n2. 提醒衛生股長補充粉筆與板擦\n3. 第五節課進行分組討論'
        );
      }
    } catch {
      // ignore
    }
  }, [currentClass.id, isStudent]);

  // Guard memo edits strictly for logged-in users
  const handleMemoChange = (newVal: string) => {
    if (!isLoggedIn) {
      console.warn('未登入訪客模式無法修改隨堂筆記 & 課堂提醒');
      return;
    }
    setMemoNote(newVal);
    try {
      localStorage.setItem(`class_memo_${currentClass.id}`, newVal);
    } catch {
      // ignore
    }
  };

  const toggleLike = (cardId: string) => {
    setLikedCard(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const toggleSave = (cardId: string) => {
    setSavedCard(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const handleSaveStudents = () => {
    if (!isApprovedTeacher) {
      setIsEditingStudents(false);
      return;
    }
    const parsed = Math.max(1, Math.min(99, Number(studentCountInput) || 30));
    onUpdateTotalStudents(currentClass.id, parsed);
    setIsEditingStudents(false);
  };

  const handleQuickRoll = () => {
    setIsRolling(true);
    let count = 0;
    const maxRoll = isLoggedIn ? currentClass.totalStudents : 30;
    const interval = setInterval(() => {
      setQuickPickNumber(Math.floor(Math.random() * maxRoll) + 1);
      count++;
      if (count > 12) {
        clearInterval(interval);
        setIsRolling(false);
      }
    }, 60);
  };

  return (
    <div id="dashboard-home" className="space-y-6 pb-12">

      {/* Dynamic Profile Header Card based on Backend Data */}
      <section id="profile-summary-header" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full text-white font-bold text-xl flex items-center justify-center shrink-0 shadow-xs ${
              isStudent 
                ? 'bg-blue-600' 
                : isSuperAdmin 
                ? 'bg-amber-600' 
                : isPendingTeacher
                ? 'bg-amber-500'
                : isGuest
                ? 'bg-slate-700'
                : 'bg-slate-900'
            }`}>
              {isStudent ? (
                teacherProfile.seatNumber ? `${teacherProfile.seatNumber}` : '學'
              ) : isPendingTeacher ? (
                '審'
              ) : isGuest ? (
                '訪'
              ) : (
                teacherProfile.name ? teacherProfile.name.slice(0, 1) : '師'
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold text-slate-900">
                  {teacherProfile.name || (isStudent ? '學生帳號' : isPendingTeacher ? '教師帳號（審核中）' : isGuest ? '訪客身分（未登入）' : '教師帳號')}
                </h1>
                
                {/* Dynamic Role Pill */}
                {isSuperAdmin ? (
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full font-bold border border-amber-300 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-amber-700" />
                    系統最高管理者
                  </span>
                ) : isTeacher ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full font-bold border border-emerald-300 inline-flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-700" />
                    合格授權教師
                  </span>
                ) : isPendingTeacher ? (
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full font-bold border border-amber-300 inline-flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-amber-700 animate-spin" />
                    待審核教師 (等候授權)
                  </span>
                ) : isStudent ? (
                  <span className="text-[10px] bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-full font-bold border border-blue-300 inline-flex items-center gap-1">
                    <GraduationCap className="w-3 h-3 text-blue-700" />
                    學生專屬 (唯讀個人成績)
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                    未登入訪客
                  </span>
                )}

                {isLoggedIn && (
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold border border-slate-200">
                    {currentClass.fullName}
                    {isStudent && teacherProfile.seatNumber ? ` • 座號 ${teacherProfile.seatNumber} 號` : ''}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-1">
                {isStudent ? (
                  <span>
                    您的帳號已綁定 Firebase 雲端資料庫，可即時查看本班平常成績與點名紀錄。
                  </span>
                ) : isLoggedIn ? (
                  <span>
                    抽號範圍上限已自動連動全班 <strong className="text-slate-900 font-semibold">{currentClass.totalStudents}</strong> 人之內。
                  </span>
                ) : (
                  <span>
                    歡迎體驗課堂管理工具。為維護學生與班級隱私，訪客模式無法檢視年段、班級與人數，登入後即可解鎖。
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right Header Widget: Student Score Badge OR Teacher Student Count */}
          {isStudent ? (
            <div 
              onClick={() => onSelectTab('tool-2')}
              className="flex flex-col items-center justify-center bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-2xl self-start sm:self-auto cursor-pointer hover:bg-blue-100/70 transition-all"
              title="點擊查看我的成績明細"
            >
              <span className="text-[10px] font-semibold text-blue-700 block">我的平時總分數</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-serif text-blue-900">
                  {teacherProfile.studentPoints ?? 100}
                </span>
                <span className="text-[11px] font-medium text-blue-600">分 (基準100)</span>
              </div>
              <span className="text-[9px] text-blue-500 mt-0.5">即時從後端資料庫同步</span>
            </div>
          ) : !isLoggedIn ? (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl self-start sm:self-auto text-xs text-slate-500 shadow-2xs">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>班級人數：需登入檢視</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded-xl self-start sm:self-auto">
              <div className="text-xs text-slate-600">
                <span className="text-slate-400">班級人數：</span>
                {isApprovedTeacher ? (
                  isEditingStudents ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={studentCountInput}
                        onChange={(e) => setStudentCountInput(Number(e.target.value))}
                        className="w-12 px-1 py-0.5 text-xs text-center border border-slate-400 rounded-md font-bold bg-white"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveStudents}
                        className="p-1 bg-slate-900 text-white rounded hover:bg-slate-800 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setStudentCountInput(currentClass.totalStudents);
                        setIsEditingStudents(true);
                      }}
                      className="font-bold text-slate-900 hover:text-slate-700 cursor-pointer inline-flex items-center gap-1"
                      title="點擊修改班級人數"
                    >
                      <span>{currentClass.totalStudents} 人</span>
                      <Edit3 className="w-3 h-3 text-slate-400" />
                    </button>
                  )
                ) : (
                  <span className="font-bold text-slate-700 inline-flex items-center gap-1.5" title="權限不足，不可修改班級人數">
                    <span>{currentClass.totalStudents} 人</span>
                    <span className="text-[10px] text-slate-400 font-normal bg-slate-200/60 px-1.5 py-0.5 rounded">
                      唯讀
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Feed Style Function Cards */}
      <section id="feed-tool-cards" className="space-y-6">
        
        {/* Tool 1 Feed Post (Random Picker) */}
        <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          {/* Post Header */}
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center">
                <Dices className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">功能一：隨機抽號工具</span>
                  <span className="text-[10px] text-slate-400">&bull; 課堂互動</span>
                </div>
                {isLoggedIn && <span className="text-[10px] text-slate-400">{currentClass.fullName}</span>}
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Post Content / Visual Canvas */}
          <div 
            onClick={() => onSelectTab('tool-1')}
            className="bg-slate-900 p-8 text-white flex flex-col items-center justify-center cursor-pointer group relative min-h-[220px]"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Dices className="w-8 h-8 text-white" />
            </div>
            <span className="text-xl font-bold font-serif tracking-wide">
              課堂隨機抽號
            </span>
            <span className="text-xs text-slate-300 mt-1 bg-white/10 px-3 py-1 rounded-full border border-white/10">
              {isLoggedIn 
                ? `上限自動連動學生總數 (1 ~ ${currentClass.totalStudents} 號)`
                : '支援 1 ~ 99 自訂抽號範圍 (登入連動班級人數)'}
            </span>
            <div className="absolute bottom-4 right-4 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg group-hover:px-4 transition-all">
              <span>立即使用</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Post Action Bar */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => toggleLike('tool-1')}
                  className="hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <Heart className={`w-5 h-5 ${likedCard['tool-1'] ? 'fill-rose-500 text-rose-500' : 'text-slate-700'}`} />
                </button>
                <button 
                  onClick={() => onSelectTab('tool-1')}
                  className="text-slate-700 hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5" />
                </button>
                <button className="text-slate-700 hover:opacity-75 transition-opacity cursor-pointer">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
              <button 
                onClick={() => toggleSave('tool-1')}
                className="hover:opacity-75 transition-opacity cursor-pointer"
              >
                <Bookmark className={`w-5 h-5 ${savedCard['tool-1'] ? 'fill-slate-900 text-slate-900' : 'text-slate-700'}`} />
              </button>
            </div>

            <p className="text-xs text-slate-800 leading-relaxed">
              <span className="font-bold mr-1.5">功能一</span>
              抽號範圍嚴格限制於學生總數（可自訂 1~99 人），具備不重複排除、歷程記錄與黑板投影模式。
            </p>
          </div>
        </article>

        {/* Tool 2 Feed Post (Attendance & Point System) */}
        <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center ${isStudent ? 'bg-blue-600' : 'bg-slate-900'}`}>
                {isStudent ? <Award className="w-4 h-4 text-white" /> : <Users className="w-4 h-4 text-white" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">
                    {isStudent ? '功能二：我的課堂出缺席與成績明細' : '功能二：課堂點名與學生管理系統'}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    Firebase 雲端後端
                  </span>
                </div>
                {isLoggedIn && <span className="text-[10px] text-slate-400">{currentClass.fullName}</span>}
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div 
            onClick={() => onSelectTab('tool-2')}
            className={`p-8 text-white flex flex-col items-center justify-center cursor-pointer group relative min-h-[220px] ${
              isStudent ? 'bg-slate-900' : 'bg-slate-900'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              {isStudent ? <Award className="w-8 h-8 text-white" /> : <Users className="w-8 h-8 text-white" />}
            </div>
            <span className="text-xl font-bold font-serif tracking-wide text-center">
              {isStudent ? '查閱個人平常成績與出缺席' : '課堂點名 • 師生權限 • 學生加扣分'}
            </span>
            <span className="text-xs text-slate-300 mt-1 bg-white/10 px-3 py-1 rounded-full border border-white/10 text-center max-w-lg">
              {isStudent
                ? `依據後端資料庫即時同步您的成績（目前 ${teacherProfile.studentPoints ?? 100} 分）與出缺席紀錄，不可自行改分。`
                : '教師可納入學生、點名評分（0~100分）；學生唯讀個人成績；教師權限由最高管理者審核發出'}
            </span>
            <div className="absolute bottom-4 right-4 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg group-hover:px-4 transition-all">
              <span>{isStudent ? '查閱個人成績' : '進入點名系統'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => toggleLike('tool-2')}
                  className="hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <Heart className={`w-5 h-5 ${likedCard['tool-2'] ? 'fill-rose-500 text-rose-500' : 'text-slate-700'}`} />
                </button>
                <button 
                  onClick={() => onSelectTab('tool-2')}
                  className="text-slate-700 hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5" />
                </button>
                <button className="text-slate-700 hover:opacity-75 transition-opacity cursor-pointer">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
              <button 
                onClick={() => toggleSave('tool-2')}
                className="hover:opacity-75 transition-opacity cursor-pointer"
              >
                <Bookmark className={`w-5 h-5 ${savedCard['tool-2'] ? 'fill-slate-900 text-slate-900' : 'text-slate-700'}`} />
              </button>
            </div>

            <p className="text-xs text-slate-800 leading-relaxed">
              <span className="font-bold mr-1.5">功能二</span>
              {isStudent 
                ? '學生專屬檢視：成績與點名資料均由後台資料庫即時提供，詳細列出加分扣分原因與任課老師姓名。'
                : '完整支援出缺席紀錄（出席/遲到/請假/缺席）、教師旗下學生名冊、即時加扣分歷程 (Audit Logs)，並實作權限嚴格劃分（學生僅可看自己成績不可改分）。'}
            </p>
          </div>
        </article>

        {/* Tool 3 Feed Post (Duty Schedule Manager) */}
        <article className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center">
                <Repeat className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">
                    功能三：值日生輪值系統
                  </span>
                  <span className="text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    每日雙人輪流
                  </span>
                </div>
                {isLoggedIn && <span className="text-[10px] text-slate-400">{currentClass.fullName}</span>}
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div 
            onClick={() => onSelectTab('tool-3')}
            className="bg-slate-900 p-8 text-white flex flex-col items-center justify-center cursor-pointer group relative min-h-[220px]"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Repeat className="w-8 h-8 text-amber-300" />
            </div>
            <span className="text-xl font-bold font-serif tracking-wide text-center">
              班級值日生排班 • 依座號順序輪流
            </span>
            <span className="text-xs text-slate-300 mt-1 bg-white/10 px-3 py-1 rounded-full border border-white/10 text-center max-w-lg">
              每日 2 位依序輪值 • 自動跳過免值日號碼 • 支援懲處/缺失「重做一天」• 黑板投影模式
            </span>
            <div className="absolute bottom-4 right-4 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg group-hover:px-4 transition-all">
              <span>進入值日系統</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => toggleLike('tool-3')}
                  className="hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <Heart className={`w-5 h-5 ${likedCard['tool-3'] ? 'fill-rose-500 text-rose-500' : 'text-slate-700'}`} />
                </button>
                <button 
                  onClick={() => onSelectTab('tool-3')}
                  className="text-slate-700 hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5" />
                </button>
                <button className="text-slate-700 hover:opacity-75 transition-opacity cursor-pointer">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
              <button 
                onClick={() => toggleSave('tool-3')}
                className="hover:opacity-75 transition-opacity cursor-pointer"
              >
                <Bookmark className={`w-5 h-5 ${savedCard['tool-3'] ? 'fill-slate-900 text-slate-900' : 'text-slate-700'}`} />
              </button>
            </div>

            <p className="text-xs text-slate-800 leading-relaxed">
              <span className="font-bold mr-1.5">功能三</span>
              每日排定兩位值日生，依照學生座號順序循環。支援免值日號碼設定（如班長、風紀股長免值）、缺失「重做一天」標記（優先排入隔天或當日補做）、今日職責清單檢核及大螢幕黑板投影模式。
            </p>
          </div>
        </article>

        {/* Classroom Quick Interactive Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Helper 1: Quick Mini Picker */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center">
                    <Shuffle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      {isLoggedIn ? `隨堂快抽 (1 ~ ${currentClass.totalStudents}號)` : '隨堂快抽體驗 (1 ~ 30號)'}
                    </h3>
                    {isLoggedIn && <span className="text-[10px] text-slate-400">{currentClass.fullName}</span>}
                  </div>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  即時抽籤
                </span>
              </div>

              <div className="my-4 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-3xl font-black font-mono text-slate-900">
                  {quickPickNumber !== null ? `${quickPickNumber} 號` : '🎲'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {isRolling 
                    ? '抽籤中...' 
                    : quickPickNumber 
                    ? '已抽出幸運座號！' 
                    : isLoggedIn 
                    ? `最大不超過 ${currentClass.totalStudents} 人` 
                    : '訪客體驗隨機試抽 (1~30號)'}
                </p>
              </div>
            </div>

            <button
              id="roll-quick-student-btn"
              onClick={handleQuickRoll}
              disabled={isRolling}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isRolling ? '抽選中...' : isLoggedIn ? `抽一位學生 (1~${currentClass.totalStudents}號)` : '抽一個隨機號碼 (體驗模式)'}
            </button>
          </div>

          {/* Helper 2: Memo Note */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center">
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      {isStudent ? '我的課堂備忘 & 學習目標' : '隨堂筆記 & 課堂提醒'}
                    </h3>
                    {isLoggedIn && <span className="text-[10px] text-slate-400">{currentClass.fullName}</span>}
                  </div>
                </div>
                {!isLoggedIn ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80">
                    <Lock className="w-2.5 h-2.5 text-amber-600" />
                    未登入唯讀
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-600 font-medium">即時儲存</span>
                )}
              </div>

              <textarea
                id="teacher-quick-memo-input"
                value={memoNote}
                onChange={(e) => handleMemoChange(e.target.value)}
                readOnly={!isLoggedIn}
                rows={4}
                placeholder={
                  !isLoggedIn 
                    ? '未登入訪客模式僅供檢視，無法修改內容...' 
                    : isStudent 
                    ? '在此記錄待交作業、提問或學習重點...' 
                    : '在此輸入今日待辦、交辦事項或課堂提醒...'
                }
                className={`w-full p-3 text-xs leading-relaxed border rounded-xl transition-all ${
                  !isLoggedIn
                    ? 'bg-slate-100/80 text-slate-600 border-slate-200 cursor-not-allowed select-text focus:outline-hidden'
                    : 'bg-slate-50/50 text-slate-700 border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400'
                }`}
              />
            </div>

            {!isLoggedIn ? (
              <div className="pt-2 text-[11px] text-amber-800 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/70 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>未登入模式下不能修改，僅能閱讀。</span>
                </div>
                {onOpenAuthModal && (
                  <button
                    onClick={onOpenAuthModal}
                    className="text-amber-900 underline font-bold hover:text-amber-700 shrink-0 cursor-pointer text-[11px]"
                  >
                    登入帳號以修改
                  </button>
                )}
              </div>
            ) : (
              <div className="pt-2 text-[11px] text-slate-400">
                💡 {isStudent ? '保持良好的出缺席與課堂互動可提升平時成績。' : '切換班級時，人數上限將自動同步。'}
              </div>
            )}
          </div>

        </div>

      </section>

    </div>
  );
};
