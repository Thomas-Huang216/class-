import React, { useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, Bell, Timer, Volume2 } from 'lucide-react';

interface ClassroomTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClassroomTimerModal: React.FC<ClassroomTimerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [secondsLeft, setSecondsLeft] = useState<number>(300); // default 5 mins
  const [initialDuration, setInitialDuration] = useState<number>(300);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning) {
      interval = setInterval(() => {
        if (mode === 'countdown') {
          setSecondsLeft((prev) => {
            if (prev <= 1) {
              setIsRunning(false);
              return 0;
            }
            return prev - 1;
          });
        } else {
          setSecondsLeft((prev) => prev + 1);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, mode]);

  if (!isOpen) return null;

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSetQuickTime = (secs: number) => {
    setIsRunning(false);
    setMode('countdown');
    setInitialDuration(secs);
    setSecondsLeft(secs);
  };

  const handleReset = () => {
    setIsRunning(false);
    if (mode === 'countdown') {
      setSecondsLeft(initialDuration);
    } else {
      setSecondsLeft(0);
    }
  };

  return (
    <div id="timer-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="timer-modal-container" 
        className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">課堂隨身計時器</h3>
          </div>
          <button 
            id="close-timer-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-6">
          {/* Mode Switcher */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            <button
              id="timer-mode-countdown"
              onClick={() => {
                setIsRunning(false);
                setMode('countdown');
                setSecondsLeft(300);
                setInitialDuration(300);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                mode === 'countdown' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600'
              }`}
            >
              倒數計時
            </button>
            <button
              id="timer-mode-stopwatch"
              onClick={() => {
                setIsRunning(false);
                setMode('stopwatch');
                setSecondsLeft(0);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                mode === 'stopwatch' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600'
              }`}
            >
              正數碼錶
            </button>
          </div>

          {/* Time Display */}
          <div className="py-2">
            <div className={`font-mono text-5xl font-bold tracking-tight ${secondsLeft === 0 && mode === 'countdown' ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>
              {formatTime(secondsLeft)}
            </div>
            {secondsLeft === 0 && mode === 'countdown' && (
              <p className="text-xs text-red-600 font-semibold mt-2 flex items-center justify-center gap-1">
                <Bell className="w-3.5 h-3.5" /> 時間到！
              </p>
            )}
          </div>

          {/* Quick Presets for Countdown */}
          {mode === 'countdown' && (
            <div className="flex justify-center gap-1.5 flex-wrap">
              {[60, 180, 300, 600, 900].map((s) => (
                <button
                  key={s}
                  id={`preset-${s / 60}m`}
                  onClick={() => handleSetQuickTime(s)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    initialDuration === s && !isRunning
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {s / 60} 分鐘
                </button>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-center items-center gap-3 pt-2">
            <button
              id="timer-reset-btn"
              onClick={handleReset}
              className="p-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              title="重設"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              id="timer-toggle-btn"
              onClick={() => setIsRunning(!isRunning)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-xs text-white shadow-sm transition-all ${
                isRunning
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" /> 暫停計時
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> 開始計時
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
