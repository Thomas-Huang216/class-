import React, { useState, useEffect, useRef } from 'react';
import { 
  Dices, 
  RotateCcw, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  History, 
  Sliders, 
  Eye, 
  EyeOff, 
  ArrowLeft,
  Users,
  Edit3,
  Check,
  AlertCircle,
  Layers,
  Lock
} from 'lucide-react';
import { ClassInfo, TeacherProfile } from '../types';

interface RandomNumberPickerProps {
  currentClass: ClassInfo;
  teacherProfile?: TeacherProfile;
  onUpdateTotalStudents: (classId: string, count: number) => void;
  onBackToDashboard?: () => void;
}

export const RandomNumberPicker: React.FC<RandomNumberPickerProps> = ({
  currentClass,
  teacherProfile,
  onUpdateTotalStudents,
  onBackToDashboard,
}) => {
  const isGuest = !teacherProfile?.isLoggedIn;
  const demoUpperLimit = 30;

  const isApprovedTeacher = Boolean(
    teacherProfile?.isLoggedIn && 
    (teacherProfile.isSuperAdmin || teacherProfile.isApprovedTeacher || teacherProfile.email === 'stu410018@shsh.tw')
  );

  // Student total & Range configuration
  const [totalStudents, setTotalStudents] = useState<number>(currentClass.totalStudents);
  const [isEditingTotal, setIsEditingTotal] = useState<boolean>(false);
  const [tempTotalInput, setTempTotalInput] = useState<number>(currentClass.totalStudents);

  const activeUpperLimit = isGuest ? demoUpperLimit : totalStudents;

  const [minNum, setMinNum] = useState<number>(1);
  const [maxNum, setMaxNum] = useState<number>(isGuest ? demoUpperLimit : currentClass.totalStudents);
  const [drawCount, setDrawCount] = useState<number>(1); // Number of picks at once
  const [allowDuplicate, setAllowDuplicate] = useState<boolean>(false);
  const [excludedInput, setExcludedInput] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showPoolGrid, setShowPoolGrid] = useState<boolean>(true);

  // Drawing state
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<number[]>([]);
  const [rollingDisplay, setRollingDisplay] = useState<number[]>([]);
  const [history, setHistory] = useState<{ round: number; numbers: number[]; time: string }[]>([]);
  const [drawnPool, setDrawnPool] = useState<Set<number>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Sync when currentClass changes or total changes
  useEffect(() => {
    setTotalStudents(currentClass.totalStudents);
    setTempTotalInput(currentClass.totalStudents);
    const upper = isGuest ? demoUpperLimit : currentClass.totalStudents;
    setMaxNum((prev) => Math.min(prev, upper) || upper);
  }, [currentClass, isGuest]);

  // Handle saving new total student count (1-99 limit)
  const handleSaveTotalStudents = () => {
    if (!isApprovedTeacher) {
      setIsEditingTotal(false);
      return;
    }
    const validCount = Math.max(1, Math.min(99, Number(tempTotalInput) || 30));
    setTotalStudents(validCount);
    onUpdateTotalStudents(currentClass.id, validCount);
    if (maxNum > validCount) {
      setMaxNum(validCount);
    }
    if (minNum > validCount) {
      setMinNum(1);
    }
    setIsEditingTotal(false);
    // Reset pool since total student count changed
    handleResetPool();
  };

  // Synthesize sound effects
  const playSound = (type: 'tick' | 'win' | 'reset') => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      if (type === 'tick') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400 + Math.random() * 200, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      } else if (type === 'win') {
        const freqs = [523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.4);
        });
      } else if (type === 'reset') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {
      // Audio fallback
    }
  };

  // Parse excluded numbers (cannot exceed activeUpperLimit)
  const getExcludedNumbers = (): Set<number> => {
    const set = new Set<number>();
    if (!excludedInput.trim()) return set;
    const parts = excludedInput.split(/[,，\s]+/);
    parts.forEach((p) => {
      const num = parseInt(p.trim(), 10);
      if (!isNaN(num) && num >= 1 && num <= activeUpperLimit) {
        set.add(num);
      }
    });
    return set;
  };

  // Calculate available numbers within [min, max] and bounded by activeUpperLimit
  const effectiveMin = Math.max(1, Math.min(minNum, activeUpperLimit));
  const effectiveMax = Math.max(effectiveMin, Math.min(maxNum, activeUpperLimit));

  const getAvailableNumbers = (): number[] => {
    const excluded = getExcludedNumbers();
    const available: number[] = [];

    for (let i = effectiveMin; i <= effectiveMax; i++) {
      if (!excluded.has(i)) {
        if (allowDuplicate || !drawnPool.has(i)) {
          available.push(i);
        }
      }
    }
    return available;
  };

  // Handle Draw
  const handleDraw = () => {
    if (isRolling) return;
    const available = getAvailableNumbers();
    
    if (available.length === 0) {
      alert(`在 1 ~ ${effectiveMax} 號範圍內的號碼皆已抽出或被排除！請點擊「重設號碼池」重新開始。`);
      return;
    }

    const countToPick = Math.min(drawCount, available.length);
    setIsRolling(true);

    const poolCopy = [...available];
    const pickedFinal: number[] = [];
    for (let i = 0; i < countToPick; i++) {
      const randomIndex = Math.floor(Math.random() * poolCopy.length);
      pickedFinal.push(poolCopy[randomIndex]);
      if (!allowDuplicate) {
        poolCopy.splice(randomIndex, 1);
      }
    }

    let ticks = 0;
    const maxTicks = 18;

    const rollTimer = setInterval(() => {
      ticks++;
      const tempDisplay = Array.from({ length: countToPick }, () => 
        Math.floor(Math.random() * (effectiveMax - effectiveMin + 1)) + effectiveMin
      );
      setRollingDisplay(tempDisplay);
      playSound('tick');

      if (ticks >= maxTicks) {
        clearInterval(rollTimer);
        setIsRolling(false);
        setCurrentResult(pickedFinal);
        setRollingDisplay(pickedFinal);
        playSound('win');

        setDrawnPool((prev) => {
          const next = new Set(prev);
          pickedFinal.forEach((n) => next.add(n));
          return next;
        });

        const now = new Date();
        const timeStr = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setHistory((prev) => [
          {
            round: prev.length + 1,
            numbers: pickedFinal,
            time: timeStr,
          },
          ...prev,
        ]);
      }
    }, 65);
  };

  const handleResetPool = () => {
    playSound('reset');
    setDrawnPool(new Set());
    setCurrentResult([]);
    setRollingDisplay([]);
  };

  const handleClearHistory = () => {
    playSound('reset');
    setHistory([]);
  };

  const availableList = getAvailableNumbers();
  const excludedSet = getExcludedNumbers();
  const totalRangeCount = effectiveMax - effectiveMin + 1;

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div 
      ref={containerRef}
      id="random-number-picker-tool" 
      className={`space-y-6 transition-all ${
        isFullscreen 
          ? 'fixed inset-0 z-50 bg-slate-900 text-white p-6 sm:p-10 overflow-y-auto flex flex-col justify-between' 
          : 'pb-12'
      }`}
    >
      {/* Tool Header & Navigation Bar */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border shadow-2xs transition-colors ${
        isFullscreen 
          ? 'bg-slate-800/90 border-slate-700 text-white' 
          : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          {onBackToDashboard && !isFullscreen && (
            <button
              id="back-to-dash-btn"
              onClick={onBackToDashboard}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <Dices className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  功能一
                </span>
                {!isGuest ? (
                  <>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold border border-slate-200">
                      {currentClass.fullName}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                      上限: {totalStudents} 人
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold border border-slate-200">
                      訪客體驗模式
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                      體驗上限: 30 號
                    </span>
                  </>
                )}
              </div>
              <h1 className={`text-base sm:text-lg font-bold tracking-tight ${isFullscreen ? 'text-white' : 'text-slate-900'}`}>
                課堂隨機抽號
              </h1>
            </div>
          </div>
        </div>

        {/* Quick Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            id="sound-toggle-btn"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              soundEnabled
                ? isFullscreen ? 'bg-indigo-900/50 border-indigo-500 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : isFullscreen ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
            title={soundEnabled ? '音效已開啟' : '音效已靜音'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? '音效開' : '靜音'}</span>
          </button>

          {/* Fullscreen / Projector Mode Toggle */}
          <button
            id="fullscreen-toggle-btn"
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFullscreen
                ? 'bg-amber-500 text-slate-900 border-amber-400 font-bold'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
            title={isFullscreen ? '離開投影全螢幕' : '黑板/投影機全螢幕模式'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span>{isFullscreen ? '退出全螢幕' : '投影展示'}</span>
          </button>
        </div>
      </div>

      {/* Main Drawing Stage (Hero Area) */}
      <div className={`rounded-3xl border p-6 sm:p-10 flex flex-col items-center justify-center relative overflow-hidden transition-all shadow-sm ${
        isFullscreen
          ? 'bg-gradient-to-b from-slate-800 via-indigo-950/40 to-slate-900 border-slate-700 my-auto py-12'
          : 'bg-gradient-to-b from-indigo-50/50 via-white to-slate-50 border-indigo-100/90'
      }`}>
        
        {/* Current Pick Status */}
        <div className="text-center space-y-2 mb-4">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-indigo-100/80 text-indigo-800 border border-indigo-200 flex-wrap justify-center">
            <Sparkles className="w-3.5 h-3.5" />
            <span>抽號範圍：{effectiveMin} 號 ~ {effectiveMax} 號</span>
            <span className="text-indigo-400">|</span>
            <span>{!isGuest ? `學生總人數上限：${totalStudents} 人` : '抽號上限：30 號 (登入連動班級)'}</span>
            {!allowDuplicate && (
              <>
                <span className="text-indigo-400">|</span>
                <span>剩餘未抽：{availableList.length} 號</span>
              </>
            )}
          </div>
        </div>

        {/* Number Reveal Area */}
        <div className="my-4 sm:my-6 flex items-center justify-center gap-4 flex-wrap min-h-[140px] sm:min-h-[180px]">
          {isRolling ? (
            rollingDisplay.map((num, idx) => (
              <div
                key={idx}
                className="w-28 h-28 sm:w-44 sm:h-44 rounded-3xl bg-indigo-600 text-white flex flex-col items-center justify-center font-mono font-black text-5xl sm:text-7xl shadow-xl shadow-indigo-300/40 animate-pulse border-4 border-indigo-400"
              >
                <span>{num.toString().padStart(2, '0')}</span>
                <span className="text-[10px] sm:text-xs font-sans font-normal text-indigo-200 mt-1">
                  抽選中...
                </span>
              </div>
            ))
          ) : currentResult.length > 0 ? (
            currentResult.map((num, idx) => (
              <div
                key={idx}
                className={`w-28 h-28 sm:w-44 sm:h-44 rounded-3xl flex flex-col items-center justify-center font-mono font-black text-5xl sm:text-7xl shadow-2xl border-4 transition-transform hover:scale-105 ${
                  isFullscreen
                    ? 'bg-indigo-600 text-white border-indigo-300 shadow-indigo-500/30'
                    : 'bg-white text-indigo-600 border-indigo-500 shadow-indigo-100'
                }`}
              >
                <span>{num.toString().padStart(2, '0')}</span>
                <span className="text-[10px] sm:text-xs font-sans font-semibold text-slate-400 mt-1">
                  幸運座號
                </span>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-24 h-24 sm:w-36 sm:h-36 rounded-3xl border-2 border-dashed border-slate-300 flex items-center justify-center mb-3">
                <Dices className="w-12 h-12 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">準備好後，點擊下方「隨機抽號」按鈕！</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {!isGuest 
                  ? `抽取範圍自動限制在學生總數 (1~${totalStudents} 號) 內` 
                  : '訪客體驗模式提供 1~30 號抽號體驗，登入後自動連動班級學生人數'}
              </p>
            </div>
          )}
        </div>

        {/* Big Action Draw Button */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 z-10 w-full sm:w-auto">
          <button
            id="main-roll-button"
            onClick={handleDraw}
            disabled={isRolling || availableList.length === 0}
            className={`w-full sm:w-auto flex items-center justify-center gap-3 px-8 sm:px-12 py-4 rounded-2xl font-bold text-base sm:text-lg text-white transition-all transform active:scale-95 shadow-lg cursor-pointer ${
              isRolling || availableList.length === 0
                ? 'bg-slate-400 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-indigo-300 hover:shadow-xl hover:-translate-y-0.5'
            }`}
          >
            <Dices className="w-6 h-6" />
            <span>{isRolling ? '抽號中...' : `🎲 隨機抽出 ${drawCount} 個號碼`}</span>
          </button>

          {!allowDuplicate && drawnPool.size > 0 && (
            <button
              id="reset-pool-button"
              onClick={handleResetPool}
              disabled={isRolling}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-4 rounded-2xl font-semibold text-xs border transition-colors cursor-pointer ${
                isFullscreen
                  ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-slate-400" />
              <span>重設已抽名單 ({drawnPool.size})</span>
            </button>
          )}
        </div>

        {/* Progress status bar */}
        {!allowDuplicate && (
          <div className="w-full max-w-md mt-6">
            <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-1.5">
              <span>已抽進度：{drawnPool.size} / {totalRangeCount - excludedSet.size}</span>
              <span>剩餘 {availableList.length} 人</span>
            </div>
            <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                style={{ 
                  width: `${((drawnPool.size) / Math.max(1, totalRangeCount - excludedSet.size)) * 100}%` 
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Control Settings & History Grid */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${isFullscreen ? 'hidden' : 'block'}`}>
        
        {/* Left 2 Cols: Student Count & Range Configuration Panel */}
        <div id="range-config-card" className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 shadow-xs lg:col-span-2">
          
          {/* Section 1: Teacher Student Count Customization */}
          <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600 text-white">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    {!isGuest ? `${currentClass.fullName} 學生總數設定` : '班級與學生總數（需登入解鎖）'}
                  </h4>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-semibold">
                    {!isGuest ? '抽號上限' : '訪客模式'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isGuest
                    ? '為維護學生與班級隱私，訪客模式無法檢視年段、班級名稱與實際人數（預設提供 1~30 號進行抽號體驗）。登入後將自動連動所屬班級。'
                    : isApprovedTeacher
                    ? '老師可隨時更改全班人數 (1~99)，抽號最大值將自動限制在此總數內。'
                    : '未登入訪客僅供檢視，抽號範圍將自動限制在此總數內。'}
                </p>
              </div>
            </div>

            {/* Editable Student Count Box / Guest Lock Box */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {isGuest ? (
                <div 
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500 shadow-2xs"
                  title="訪客模式：登入後即可檢視與設定所屬班級人數"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>需登入解鎖</span>
                </div>
              ) : isApprovedTeacher ? (
                isEditingTotal ? (
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-indigo-300 shadow-xs">
                    <input
                      id="input-total-students"
                      type="number"
                      min={1}
                      max={99}
                      value={tempTotalInput}
                      onChange={(e) => setTempTotalInput(Number(e.target.value))}
                      className="w-16 px-2 py-1 text-sm font-bold text-center border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button
                      id="save-total-students-btn"
                      onClick={handleSaveTotalStudents}
                      className="flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      儲存
                    </button>
                  </div>
                ) : (
                  <button
                    id="edit-total-students-btn"
                    onClick={() => setIsEditingTotal(true)}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 rounded-xl text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-black text-indigo-600">{totalStudents}</span>
                    <span>人 (點擊更改)</span>
                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                )
              ) : (
                <div 
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs"
                  title="唯讀身分不可修改班級人數"
                >
                  <span className="text-sm font-black text-slate-800">{totalStudents}</span>
                  <span>人</span>
                  <span className="text-[10px] text-slate-400 font-normal bg-slate-200/60 px-1.5 py-0.5 rounded">
                    唯讀
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Range Sliders and Inputs (Bounded by activeUpperLimit) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900">抽號數字範圍設定</h3>
              </div>

              {/* Quick Preset Buttons Bounded by activeUpperLimit */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[11px] text-slate-400 mr-1">快捷區間:</span>
                <button
                  onClick={() => { setMinNum(1); setMaxNum(activeUpperLimit); }}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                    minNum === 1 && maxNum === activeUpperLimit
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {!isGuest ? `全班 (1~${totalStudents})` : `體驗 (1~${activeUpperLimit})`}
                </button>
                {activeUpperLimit >= 20 && (
                  <button
                    onClick={() => { setMinNum(1); setMaxNum(Math.floor(activeUpperLimit / 2)); }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    前半段 (1~{Math.floor(activeUpperLimit / 2)})
                  </button>
                )}
                {activeUpperLimit >= 20 && (
                  <button
                    onClick={() => { setMinNum(Math.floor(activeUpperLimit / 2) + 1); setMaxNum(activeUpperLimit); }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    後半段 ({Math.floor(activeUpperLimit / 2) + 1}~{activeUpperLimit})
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Min Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  起始號碼 (最小 1)
                </label>
                <input
                  id="input-min-num"
                  type="number"
                  min={1}
                  max={maxNum}
                  value={minNum}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(maxNum, parseInt(e.target.value, 10) || 1));
                    setMinNum(val);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-semibold border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Max Input (Strictly <= activeUpperLimit) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    結束號碼 (最大 ≤ {activeUpperLimit})
                  </label>
                </div>
                <input
                  id="input-max-num"
                  type="number"
                  min={minNum}
                  max={activeUpperLimit}
                  value={maxNum}
                  onChange={(e) => {
                    const inputVal = parseInt(e.target.value, 10) || 1;
                    const clamped = Math.max(minNum, Math.min(activeUpperLimit, inputVal));
                    setMaxNum(clamped);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-semibold border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {maxNum >= activeUpperLimit && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">
                    {!isGuest 
                      ? `✓ 已鎖定至學生總數上限 (${totalStudents} 號)`
                      : `✓ 已鎖定至體驗上限 (${activeUpperLimit} 號)`}
                  </p>
                )}
              </div>

              {/* Pick Count Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  單次抽取人數
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 5].map((cnt) => (
                    <button
                      key={cnt}
                      id={`pick-count-${cnt}`}
                      onClick={() => setDrawCount(cnt)}
                      className={`flex-1 py-2 text-xs rounded-xl border font-semibold transition-all cursor-pointer ${
                        drawCount === cnt
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {cnt} 個
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Duplicate Rule & Exclude Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div>
                  <div className="text-xs font-bold text-slate-900">不重複抽號 (排除已抽)</div>
                  <div className="text-[11px] text-slate-500">已抽出的號碼不會再次被抽中</div>
                </div>
                <button
                  id="toggle-duplicate-rule"
                  onClick={() => setAllowDuplicate(!allowDuplicate)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    !allowDuplicate ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      !allowDuplicate ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  {!isGuest ? `手動排除特定號碼 (如請假座號 ≤ ${totalStudents})` : `手動排除特定號碼 (座號 ≤ ${activeUpperLimit})`}
                </label>
                <input
                  id="input-excluded-numbers"
                  type="text"
                  value={excludedInput}
                  onChange={(e) => setExcludedInput(e.target.value)}
                  placeholder={!isGuest ? `例如：3, 15, ${Math.min(28, totalStudents)}` : '例如：3, 15, 28'}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Visual Number Pool Grid */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <button
                  id="toggle-pool-grid-btn"
                  onClick={() => setShowPoolGrid(!showPoolGrid)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-indigo-600 cursor-pointer"
                >
                  {showPoolGrid ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{!isGuest ? `全班號碼池狀態 (1 ~ ${totalStudents} 號)` : `號碼池即時狀態 (1 ~ ${activeUpperLimit} 號)`}</span>
                </button>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-50 border border-indigo-300" /> 未抽出
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 line-through" /> 已抽出
                  </span>
                  {excludedSet.size > 0 && (
                    <span className="flex items-center gap-1 text-red-500">
                      <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300" /> 已排除
                    </span>
                  )}
                </div>
              </div>

              {showPoolGrid && (
                <div className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl max-h-44 overflow-y-auto">
                  <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
                    {Array.from({ length: activeUpperLimit }, (_, i) => i + 1).map((num) => {
                      const inRange = num >= effectiveMin && num <= effectiveMax;
                      const isDrawn = drawnPool.has(num);
                      const isExcluded = excludedSet.has(num);
                      const isCurrent = currentResult.includes(num);

                      return (
                        <div
                          key={num}
                          className={`text-center py-1.5 px-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                            !inRange
                              ? 'bg-slate-100 text-slate-300 opacity-60 border border-dashed border-slate-200'
                              : isCurrent
                              ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-400'
                              : isExcluded
                              ? 'bg-red-50 text-red-400 border border-red-200 line-through'
                              : isDrawn
                              ? 'bg-slate-200/80 text-slate-400 line-through'
                              : 'bg-white text-slate-700 border border-slate-200/70 hover:border-indigo-400'
                          }`}
                          title={!inRange ? `號碼超出目前設定範圍 (${effectiveMin}~${effectiveMax})` : undefined}
                        >
                          {num.toString().padStart(2, '0')}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right 1 Col: Draw History */}
        <div id="draw-history-card" className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">抽號紀錄</h3>
              </div>
              {history.length > 0 && (
                <button
                  id="clear-history-btn"
                  onClick={handleClearHistory}
                  className="text-[11px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                >
                  清除紀錄
                </button>
              )}
            </div>

            {/* History List */}
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-1">
                <Dices className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs">尚無抽號紀錄</p>
                <p className="text-[11px]">每次抽出的號碼將記錄於此</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item.round}
                    className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between hover:bg-indigo-50/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-bold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-md">
                        #{item.round}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.numbers.map((n) => (
                          <span
                            key={n}
                            className="font-mono font-bold text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-md shadow-2xs"
                          >
                            {n.toString().padStart(2, '0')} 號
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>累計抽出 {history.reduce((acc, h) => acc + h.numbers.length, 0)} 次</span>
            {!isGuest ? (
              <span className="text-indigo-600 font-medium">{currentClass.fullName} (共{totalStudents}人)</span>
            ) : (
              <span className="text-slate-400 font-medium">訪客體驗模式 (登入後連動班級)</span>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
