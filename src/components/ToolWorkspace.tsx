import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Users, 
  Dices, 
  Award, 
  Sparkles, 
  Check, 
  Plus, 
  Minus, 
  UserCheck, 
  UserX, 
  Clock, 
  Shuffle, 
  Send,
  MessageSquare,
  HelpCircle
} from 'lucide-react';
import { ToolItem, ActiveTab } from '../types';

interface ToolWorkspaceProps {
  tool: ToolItem;
  currentClass: string;
  onBackToDashboard: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onUpdateToolTitle: (toolId: string, newTitle: string) => void;
}

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({
  tool,
  currentClass,
  onBackToDashboard,
  onSelectTab,
  onUpdateToolTitle,
}) => {
  const [customTitle, setCustomTitle] = useState(tool.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Interactive demo states for the custom workspace
  const [sampleStudents, setSampleStudents] = useState([
    { id: 1, name: '01 號同學', status: 'present', points: 3 },
    { id: 2, name: '02 號同學', status: 'present', points: 5 },
    { id: 3, name: '03 號同學', status: 'leave', points: 2 },
    { id: 4, name: '04 號同學', status: 'late', points: 4 },
    { id: 5, name: '05 max', status: 'present', points: 1 },
    { id: 6, name: '06 號同學', status: 'present', points: 6 },
    { id: 7, name: '07 號同學', status: 'present', points: 2 },
    { id: 8, name: '08 號同學', status: 'present', points: 4 },
  ]);

  const [selectedGroupCount, setSelectedGroupCount] = useState(4);

  const toggleStudentStatus = (id: number) => {
    setSampleStudents((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const nextStatus = s.status === 'present' ? 'late' : s.status === 'late' ? 'leave' : 'present';
        return { ...s, status: nextStatus };
      })
    );
  };

  const adjustPoints = (id: number, delta: number) => {
    setSampleStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, points: Math.max(0, s.points + delta) } : s))
    );
  };

  const handleSaveTitle = () => {
    if (customTitle.trim()) {
      onUpdateToolTitle(tool.id, customTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const getToolIcon = () => {
    switch (tool.slotNumber) {
      case 1:
        return <Users className="w-6 h-6 text-indigo-600" />;
      case 2:
        return <Dices className="w-6 h-6 text-emerald-600" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />;
    }
  };

  return (
    <div id={`tool-workspace-${tool.id}`} className="space-y-6 pb-12">
      
      {/* Top Bar with Navigation & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            id="back-to-dashboard-btn"
            onClick={onBackToDashboard}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首頁
          </button>
          
          <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>

          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
              {getToolIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  功能 {tool.slotNumber}
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                  {currentClass}
                </span>
              </div>
              
              {isEditingTitle ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="text-base font-bold text-slate-900 border-b border-indigo-500 focus:outline-hidden px-1"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-md"
                  >
                    儲存
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900">{tool.title}</h1>
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="text-[11px] text-slate-400 hover:text-indigo-600 underline"
                  >
                    自訂名稱
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Tab Switchers in Header */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => onSelectTab('tool-1')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              tool.slotNumber === 1 ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            功能一
          </button>
          <button
            onClick={() => onSelectTab('tool-2')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              tool.slotNumber === 2 ? 'bg-white text-emerald-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            功能二
          </button>
          <button
            onClick={() => onSelectTab('tool-3')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              tool.slotNumber === 3 ? 'bg-white text-amber-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            功能三
          </button>
        </div>
      </div>

      {/* Guidance Alert */}
      <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-5 flex items-start gap-3.5">
        <MessageSquare className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-950 space-y-1">
          <p className="font-bold text-sm">功能 {tool.slotNumber} 待建置提示</p>
          <p className="leading-relaxed text-indigo-800">
            首頁與切換架構已建置完成。請直接在下一次對話中說明您對「功能 {tool.slotNumber}」的確切功能需求（例如需要哪些欄位、操作方式、特殊規則等），我將即刻為您量身打造！
          </p>
        </div>
      </div>

      {/* Interactive Feature Sandbox (Demonstrating Fast UI Switching) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">預覽工作區：{tool.title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{tool.description}</p>
        </div>

        {/* Dynamic Sandbox Content depending on Slot */}
        {tool.slotNumber === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
              <span className="font-medium text-slate-700">學生出缺席點名範例 (點擊卡片可切換狀態)</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>出席
                </span>
                <span className="flex items-center gap-1 text-amber-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>遲到
                </span>
                <span className="flex items-center gap-1 text-red-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>請假
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {sampleStudents.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleStudentStatus(s.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    s.status === 'present'
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : s.status === 'late'
                      ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                      : 'bg-red-50/60 border-red-200 text-red-950'
                  }`}
                >
                  <div className="font-semibold text-xs">{s.name}</div>
                  <div className="text-[11px] mt-1 font-medium">
                    {s.status === 'present' ? '✓ 出席' : s.status === 'late' ? '⏱ 遲到' : '✕ 請假'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tool.slotNumber === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
              <span className="font-medium text-slate-700">課堂隨機抽籤與分組器範例</span>
              <span className="text-slate-500">快速建立 4 組小組</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((g) => (
                <div key={g} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">第 {g} 小組</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">
                      2 位成員
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="bg-white p-1.5 rounded-md border border-slate-200/60">
                      {sampleStudents[g * 2 - 2]?.name || `組員 A`}
                    </div>
                    <div className="bg-white p-1.5 rounded-md border border-slate-200/60">
                      {sampleStudents[g * 2 - 1]?.name || `組員 B`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tool.slotNumber === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
              <span className="font-medium text-slate-700">課堂積分排行榜與加扣分範例</span>
              <span className="text-slate-500">點擊 +/- 調整學生積分</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sampleStudents.slice(0, 4).map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                  <span className="text-xs font-semibold text-slate-800">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustPoints(s.id, -1)}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-amber-600 font-mono">
                      {s.points} 分
                    </span>
                    <button
                      onClick={() => adjustPoints(s.id, 1)}
                      className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            隨時點擊右上角「登入」以模擬 Firebase 帳號連線，或告訴我下個功能的細節！
          </p>
          <button
            onClick={onBackToDashboard}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 self-start sm:self-auto cursor-pointer"
          >
            ← 返回儀表板首頁
          </button>
        </div>
      </div>

    </div>
  );
};
