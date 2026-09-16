import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  RotateCcw, 
  Calendar, 
  Users, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Settings2, 
  AlertTriangle, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  Maximize2, 
  Minimize2, 
  Flame, 
  Lock, 
  Eye, 
  UserCheck, 
  Trash2, 
  Plus, 
  Check, 
  X, 
  HelpCircle, 
  RefreshCw, 
  FileText, 
  Share2, 
  Award, 
  Info,
  CalendarCheck,
  Repeat
} from 'lucide-react';
import { 
  ClassInfo, 
  TeacherProfile, 
  StudentRecord, 
  DutyStudent, 
  DutyRecord, 
  DutySettings 
} from '../types';
import { db } from '../firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc 
} from 'firebase/firestore';

interface DutyScheduleManagerProps {
  currentClass: ClassInfo;
  teacherProfile: TeacherProfile;
  onBackToDashboard: () => void;
  onSelectClass?: (classId: string) => void;
  onOpenAuthModal?: () => void;
  students?: StudentRecord[];
  onUpdateStudents?: (students: StudentRecord[]) => void;
}

const DEFAULT_DUTY_TASKS = [
  '早自習與每節下課擦拭乾淨黑板及白板',
  '清理板擦溝粉筆灰與拍打板擦',
  '整理講桌、擺正粉筆盒與講義麥克風',
  '放學巡視各排桌椅對齊與地面垃圾',
  '放學確實關閉教室門窗、電燈與冷氣電源',
  '協助將班級垃圾與資源回收桶送至回收場',
];

const PRESET_EXEMPT_ROLES = [
  { label: '班長', defaultReason: '班長公務繁忙免值日' },
  { label: '副班長', defaultReason: '副班長輔助校務免值日' },
  { label: '風紀股長', defaultReason: '風紀股長維持秩序免值日' },
  { label: '衛生股長', defaultReason: '衛生股長督導整潔免值日' },
  { label: '體育股長', defaultReason: '體育股長借還器材免值日' },
  { label: '特殊/傷病', defaultReason: '受傷或身體特殊狀況免除' },
];

const REDO_REASONS = [
  '黑板及板擦溝未擦拭乾淨',
  '放學未確實關閉冷氣、電燈或門窗',
  '講桌凌亂、粉筆與麥克風未歸位',
  '教室垃圾與回收未倒、整潔不合格',
  '值日生擅離職守或遲到未完成勤務',
  '其他生活常規表現欠佳需加做一日',
];

// Clean initial student roster generator without fabricated names
const generateDefaultDutyRoster = (classId: string, count: number): StudentRecord[] => {
  return Array.from({ length: count }, (_, i) => {
    const seatNumber = i + 1;
    return {
      id: `${classId}-s-${seatNumber}`,
      seatNumber,
      name: seatNumber === 5 ? 'max' : `${seatNumber} 號`,
      classId,
      grade: '一年級',
      points: 100,
    };
  });
};

export const DutyScheduleManager: React.FC<DutyScheduleManagerProps> = ({
  currentClass,
  teacherProfile,
  onBackToDashboard,
  onOpenAuthModal,
  students: studentsProp,
  onUpdateStudents,
}) => {
  const SUPER_ADMIN_EMAIL = 'stu410018@shsh.tw';
  const isLoggedIn = Boolean(teacherProfile.isLoggedIn);
  const isSuperAdmin = isLoggedIn && (teacherProfile.email === SUPER_ADMIN_EMAIL || Boolean(teacherProfile.isSuperAdmin));
  const isApprovedTeacher = isLoggedIn && (isSuperAdmin || Boolean(teacherProfile.isApprovedTeacher));
  const isTeacher = isApprovedTeacher;
  const isStudent = isLoggedIn && !isApprovedTeacher;
  const isGuest = !isLoggedIn;

  // Selected seat for quick turn lookup
  const [selectedLookupSeat, setSelectedLookupSeat] = useState<number | null>(() => {
    return teacherProfile.seatNumber || null;
  });

  // Current view tab inside Feature 3
  const [activeSubTab, setActiveSubTab] = useState<'today' | 'preview' | 'exempt' | 'history'>('today');

  // Fullscreen / Projector Mode
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(false);

  // Student roster for this class
  const [internalStudents, setInternalStudents] = useState<StudentRecord[]>([]);
  const students = studentsProp && studentsProp.length > 0 ? studentsProp : internalStudents;
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(true);

  // Duty Settings state
  const [currentPointer, setCurrentPointer] = useState<number>(0);
  const [exemptSeatNumbers, setExemptSeatNumbers] = useState<number[]>([]);
  const [exemptReasons, setExemptReasons] = useState<Record<number, string>>({});
  const [pendingRedoStudents, setPendingRedoStudents] = useState<{
    seatNumber: number;
    name: string;
    reason: string;
    assignedAt: string;
  }[]>([]);
  const [scheduledNextRedo, setScheduledNextRedo] = useState<{
    seatNumber: number;
    name: string;
    reason: string;
    assignedAt: string;
  }[]>([]);
  const [customTasks, setCustomTasks] = useState<string[]>(DEFAULT_DUTY_TASKS);
  
  // History of duty days
  const [dutyHistory, setDutyHistory] = useState<DutyRecord[]>([]);

  // Today's checklist state
  const [todayTaskCheck, setTodayTaskCheck] = useState<Record<string, boolean>>({});

  // Modals / Dialogs
  const [isRedoModalOpen, setIsRedoModalOpen] = useState<boolean>(false);
  const [selectedRedoTarget, setSelectedRedoTarget] = useState<'both' | number>('both');
  const [selectedRedoReasons, setSelectedRedoReasons] = useState<string[]>([REDO_REASONS[0]]);
  const [customRedoReason, setCustomRedoReason] = useState<string>('');

  const toggleRedoReason = (reason: string) => {
    setSelectedRedoReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };
  
  const [isExemptModalOpen, setIsExemptModalOpen] = useState<boolean>(false);
  const [editingExemptSeat, setEditingExemptSeat] = useState<number | null>(null);
  const [exemptReasonInput, setExemptReasonInput] = useState<string>('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Fetch Students Roster (from Prop, Firestore, LocalStorage or Clean Fallback)
  useEffect(() => {
    if (studentsProp && studentsProp.length > 0) {
      setIsLoadingStudents(false);
      return;
    }

    if (isGuest) {
      setInternalStudents([]);
      setIsLoadingStudents(false);
      return;
    }

    // Try loading cached roster from localStorage first
    const cachedRosterKey = `classgram_roster_${currentClass.id}`;
    const cached = localStorage.getItem(cachedRosterKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setInternalStudents(parsed);
          setIsLoadingStudents(false);
        }
      } catch (e) {
        console.warn('Cached roster parse note:', e);
      }
    }

    setIsLoadingStudents(true);
    let unsubscribe: (() => void) | undefined;

    try {
      const q = query(
        collection(db, 'students'),
        where('classId', '==', currentClass.id)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const baseRoster = generateDefaultDutyRoster(currentClass.id, currentClass.totalStudents);
        const map = new Map<number, StudentRecord>();
        baseRoster.forEach((s) => map.set(s.seatNumber, s));

        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as StudentRecord;
            if (data.seatNumber) {
              map.set(data.seatNumber, { ...map.get(data.seatNumber)!, ...data, id: docSnap.id });
            }
          });
        }
        
        const list = Array.from(map.values()).sort((a, b) => a.seatNumber - b.seatNumber);
        setInternalStudents(list);
        localStorage.setItem(cachedRosterKey, JSON.stringify(list));
        setIsLoadingStudents(false);
      }, (err) => {
        console.warn('Students query fallback to clean roster:', err);
        const list = generateDefaultDutyRoster(currentClass.id, currentClass.totalStudents);
        setInternalStudents(list);
        setIsLoadingStudents(false);
      });
    } catch (e) {
      setInternalStudents(generateDefaultDutyRoster(currentClass.id, currentClass.totalStudents));
      setIsLoadingStudents(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentClass.id, currentClass.totalStudents, isGuest, studentsProp]);

  // 2. Load Duty Settings from Firestore / LocalStorage for this class
  useEffect(() => {
    const loadDutySettings = async () => {
      const localKey = `classgram_duty_${currentClass.id}`;
      try {
        const docRef = doc(db, 'classes_duty_settings', currentClass.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as DutySettings;
          setCurrentPointer(data.currentPointer || 0);
          setExemptSeatNumbers(data.exemptSeatNumbers || []);
          setExemptReasons(data.exemptReasons || {});
          setPendingRedoStudents(data.pendingRedoStudents || []);
          if (data.customTasks && data.customTasks.length > 0) {
            setCustomTasks(data.customTasks);
          }
          return;
        }
      } catch (err) {
        console.warn('Firestore duty settings fetch error, fallback to localStorage:', err);
      }

      // LocalStorage Fallback
      const saved = localStorage.getItem(localKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setCurrentPointer(parsed.currentPointer || 0);
          setExemptSeatNumbers(parsed.exemptSeatNumbers || []);
          setExemptReasons(parsed.exemptReasons || {});
          setPendingRedoStudents(parsed.pendingRedoStudents || []);
          if (parsed.customTasks) setCustomTasks(parsed.customTasks);
        } catch (e) {
          console.warn('Parse local duty setting failed', e);
        }
      } else {
        // Default initial settings for new class
        setCurrentPointer(0);
        setExemptSeatNumbers([]);
        setExemptReasons({});
        setPendingRedoStudents([]);
        setCustomTasks(DEFAULT_DUTY_TASKS);
      }
    };

    loadDutySettings();
  }, [currentClass.id]);

  // 3. Load Duty Records History for this class
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const q = query(
        collection(db, 'duty_records'),
        where('classId', '==', currentClass.id)
      );

      unsubscribe = onSnapshot(q, (snap) => {
        const records: DutyRecord[] = [];
        snap.forEach((d) => {
          records.push({ id: d.id, ...d.data() } as DutyRecord);
        });
        records.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
        setDutyHistory(records);
      }, (e) => {
        console.warn('Duty records onSnapshot error:', e);
        const localHist = localStorage.getItem(`classgram_duty_hist_${currentClass.id}`);
        if (localHist) {
          try {
            setDutyHistory(JSON.parse(localHist));
          } catch (_) {}
        }
      });
    } catch (e) {
      console.warn('Duty history fetch error:', e);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentClass.id]);

  // Save Settings helper
  const saveDutySettings = async (
    newPointer: number,
    newExempt: number[],
    newExemptReasons: Record<number, string>,
    newPendingRedo: { seatNumber: number; name: string; reason: string; assignedAt: string }[],
    newTasks?: string[]
  ) => {
    const updatedSettings: DutySettings = {
      classId: currentClass.id,
      currentPointer: newPointer,
      exemptSeatNumbers: newExempt,
      exemptReasons: newExemptReasons,
      pendingRedoStudents: newPendingRedo,
      customTasks: newTasks || customTasks,
    };

    // Save to LocalStorage
    localStorage.setItem(`classgram_duty_${currentClass.id}`, JSON.stringify(updatedSettings));

    // Save to Firestore if permitted/online
    try {
      await setDoc(doc(db, 'classes_duty_settings', currentClass.id), updatedSettings, { merge: true });
    } catch (e) {
      console.warn('Firestore duty settings save notice:', e);
    }
  };

  // Available / Eligible seats list for rotation (1 to totalStudents, excluding exempt)
  const totalCount = Math.max(1, currentClass.totalStudents || students.length || 30);
  
  const eligibleSeatNumbers = useMemo(() => {
    const list: number[] = [];
    for (let s = 1; s <= totalCount; s++) {
      if (!exemptSeatNumbers.includes(s)) {
        list.push(s);
      }
    }
    return list;
  }, [totalCount, exemptSeatNumbers]);

  // Helper to find student name by seat number - dynamically resolved, no fake names!
  const getStudentName = (seatNum: number): string => {
    const found = students.find((s) => s.seatNumber === seatNum);
    if (found && found.name && found.name.trim() !== '') {
      return found.name;
    }
    if (seatNum === 5) {
      return 'max';
    }
    return `${seatNum} 號`;
  };

  // Calculate Today's 2 Duty Students
  const todayDutyPair: DutyStudent[] = useMemo(() => {
    if (eligibleSeatNumbers.length === 0) {
      return [
        { seatNumber: 1, name: getStudentName(1) },
        { seatNumber: 2, name: getStudentName(2) },
      ];
    }

    // Check if there are pending redo students who must serve duty
    if (pendingRedoStudents.length >= 2) {
      return [
        {
          seatNumber: pendingRedoStudents[0].seatNumber,
          name: getStudentName(pendingRedoStudents[0].seatNumber),
          isRedo: true,
          redoReason: pendingRedoStudents[0].reason,
        },
        {
          seatNumber: pendingRedoStudents[1].seatNumber,
          name: getStudentName(pendingRedoStudents[1].seatNumber),
          isRedo: true,
          redoReason: pendingRedoStudents[1].reason,
        },
      ];
    } else if (pendingRedoStudents.length === 1) {
      const redoSt = pendingRedoStudents[0];
      const normalIdx = currentPointer % eligibleSeatNumbers.length;
      let normalSeat = eligibleSeatNumbers[normalIdx];

      // If normal seat by coincidence matches the redo seat, select the adjacent eligible seat
      if (normalSeat === redoSt.seatNumber && eligibleSeatNumbers.length > 1) {
        normalSeat = eligibleSeatNumbers[(normalIdx + 1) % eligibleSeatNumbers.length];
      }

      return [
        {
          seatNumber: redoSt.seatNumber,
          name: getStudentName(redoSt.seatNumber),
          isRedo: true,
          redoReason: redoSt.reason,
        },
        {
          seatNumber: normalSeat,
          name: getStudentName(normalSeat),
        },
      ];
    }

    // Normal 2-student rotation
    const idx1 = currentPointer % eligibleSeatNumbers.length;
    const seat1 = eligibleSeatNumbers[idx1];

    const idx2 = (currentPointer + 1) % eligibleSeatNumbers.length;
    const seat2 = eligibleSeatNumbers[idx2];

    return [
      { seatNumber: seat1, name: getStudentName(seat1) },
      { seatNumber: seat2, name: getStudentName(seat2) },
    ];
  }, [eligibleSeatNumbers, currentPointer, pendingRedoStudents, students]);

  // Advance to Next Shift (2 students)
  const handleAdvanceNextShift = async () => {
    if (eligibleSeatNumbers.length === 0) return;
    const len = eligibleSeatNumbers.length;

    // Count how many regular students served today so regular pointer only advances for regular slots
    const regularCount = todayDutyPair.filter((s) => !s.isRedo).length;
    const redoCount = todayDutyPair.filter((s) => s.isRedo).length;

    const nextPointer = (currentPointer + regularCount) % len;
    const nextPending = [
      ...pendingRedoStudents.slice(redoCount),
      ...scheduledNextRedo,
    ];

    // Save completed record to history
    const newRecord: DutyRecord = {
      id: `duty-${Date.now()}`,
      classId: currentClass.id,
      date: new Date().toISOString().split('T')[0],
      students: todayDutyPair,
      exemptSeats: exemptSeatNumbers,
      tasksStatus: todayTaskCheck,
      completedAt: new Date().toISOString(),
      teacherName: teacherProfile.name,
      teacherUid: teacherProfile.uid,
    };

    try {
      await addDoc(collection(db, 'duty_records'), newRecord);
    } catch (e) {
      console.warn('Duty record local fallback:', e);
      const updatedHist = [newRecord, ...dutyHistory];
      setDutyHistory(updatedHist);
      localStorage.setItem(`classgram_duty_hist_${currentClass.id}`, JSON.stringify(updatedHist));
    }

    // Reset today task checks and scheduled next redos
    setTodayTaskCheck({});
    setScheduledNextRedo([]);
    setCurrentPointer(nextPointer);
    setPendingRedoStudents(nextPending);
    saveDutySettings(nextPointer, exemptSeatNumbers, exemptReasons, nextPending);
    showToast('✅ 今日值日交接完成，已依排程輪值至下一組！');
  };

  // Revert to Previous Shift
  const handleRevertPrevShift = () => {
    if (eligibleSeatNumbers.length === 0) return;
    const len = eligibleSeatNumbers.length;
    const prevPointer = (currentPointer - 2 + len) % len;
    setCurrentPointer(prevPointer);
    setScheduledNextRedo([]);
    saveDutySettings(prevPointer, exemptSeatNumbers, exemptReasons, pendingRedoStudents);
    showToast('⏪ 已返回上一組值日生');
  };

  // Confirm Redo a Day for upcoming shift
  const handleConfirmRedoDay = () => {
    const combinedReasons = [...selectedRedoReasons];
    if (customRedoReason.trim()) {
      combinedReasons.push(customRedoReason.trim());
    }
    const finalReason = combinedReasons.length > 0 
      ? combinedReasons.join('、') 
      : '生活常規表現欠佳需加做一日';

    let updatedNextRedo = [...scheduledNextRedo];
    const todayStr = new Date().toLocaleDateString('zh-TW');

    if (selectedRedoTarget === 'both') {
      todayDutyPair.forEach((st) => {
        // Add if not already in scheduled redo
        if (!updatedNextRedo.some((p) => p.seatNumber === st.seatNumber)) {
          updatedNextRedo.push({
            seatNumber: st.seatNumber,
            name: getStudentName(st.seatNumber),
            reason: finalReason,
            assignedAt: todayStr,
          });
        }
      });
      showToast(`⚠️ 已登記今日 2 位值日生隔日重做一天（明日由這 2 位再次值日）！`);
    } else {
      const target = todayDutyPair.find((s) => s.seatNumber === selectedRedoTarget);
      if (target) {
        if (!updatedNextRedo.some((p) => p.seatNumber === target.seatNumber)) {
          updatedNextRedo.push({
            seatNumber: target.seatNumber,
            name: getStudentName(target.seatNumber),
            reason: finalReason,
            assignedAt: todayStr,
          });
        }
        // Calculate the paired next student
        const len = eligibleSeatNumbers.length;
        const regCount = todayDutyPair.filter(s => !s.isRedo).length;
        const nextRegIdx = (currentPointer + regCount) % len;
        const nextRegSeat = eligibleSeatNumbers[nextRegIdx];
        showToast(`⚠️ 已登記 ${target.seatNumber}號 重做一天！明日將搭配 ${nextRegSeat}號 共同值日。`);
      }
    }

    setScheduledNextRedo(updatedNextRedo);
    setIsRedoModalOpen(false);
    setCustomRedoReason('');
  };

  // Cancel a scheduled next-shift redo
  const handleCancelScheduledRedo = (seatNumber: number) => {
    setScheduledNextRedo(prev => prev.filter(p => p.seatNumber !== seatNumber));
    showToast(`已取消 ${seatNumber} 號的隔日重做登記`);
  };

  // Remove a pending redo student from queue
  const handleRemoveRedoStudent = (seatNumber: number) => {
    const filtered = pendingRedoStudents.filter((p) => p.seatNumber !== seatNumber);
    setPendingRedoStudents(filtered);
    saveDutySettings(currentPointer, exemptSeatNumbers, exemptReasons, filtered);
    showToast(`已解除 ${seatNumber} 號的重做標記`);
  };

  // Toggle Exempt Seat Number
  const handleToggleExemptSeat = (seatNum: number) => {
    let newExempt: number[];
    let newReasons = { ...exemptReasons };

    if (exemptSeatNumbers.includes(seatNum)) {
      newExempt = exemptSeatNumbers.filter((s) => s !== seatNum);
      delete newReasons[seatNum];
      showToast(`已恢復 ${seatNum} 號 ${getStudentName(seatNum)} 參與值日生輪值`);
    } else {
      newExempt = [...exemptSeatNumbers, seatNum].sort((a, b) => a - b);
      newReasons[seatNum] = newReasons[seatNum] || '幹部公務免值日';
      showToast(`已設定 ${seatNum} 號 ${getStudentName(seatNum)} 免值日`);
    }

    setExemptSeatNumbers(newExempt);
    setExemptReasons(newReasons);
    saveDutySettings(currentPointer, newExempt, newReasons, pendingRedoStudents);
  };

  // Save reason for exempt
  const handleSaveExemptReason = () => {
    if (editingExemptSeat === null) return;
    const newReasons = { ...exemptReasons, [editingExemptSeat]: exemptReasonInput.trim() || '幹部免值日' };
    setExemptReasons(newReasons);
    saveDutySettings(currentPointer, exemptSeatNumbers, newReasons, pendingRedoStudents);
    setIsExemptModalOpen(false);
    setEditingExemptSeat(null);
    showToast(`已更新 ${editingExemptSeat} 號免值日事由`);
  };

  // Generate Future 10 Shifts Schedule Preview
  const futureSchedule = useMemo(() => {
    if (eligibleSeatNumbers.length === 0) return [];
    const shifts: {
      dayIndex: number;
      dateStr: string;
      weekdayStr: string;
      students: DutyStudent[];
      isRedoShift: boolean;
    }[] = [];

    const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const len = eligibleSeatNumbers.length;

    // Start future preview from the state after today's shift completes
    const regularCount = todayDutyPair.filter((s) => !s.isRedo).length;
    const redoCount = todayDutyPair.filter((s) => s.isRedo).length;

    let tempPointer = (currentPointer + regularCount) % len;
    let tempPending = [...pendingRedoStudents.slice(redoCount), ...scheduledNextRedo];
    let currentDate = new Date();

    let daysCounted = 0;
    while (shifts.length < 10 && daysCounted < 30) {
      currentDate.setDate(currentDate.getDate() + 1);
      const dayOfWeek = currentDate.getDay();
      daysCounted++;

      // Skip weekend (0 = Sunday, 6 = Saturday)
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const dateStr = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
      const weekdayStr = weekdays[dayOfWeek];

      let pair: DutyStudent[] = [];
      let isRedo = false;

      if (tempPending.length >= 2) {
        pair = [
          { seatNumber: tempPending[0].seatNumber, name: getStudentName(tempPending[0].seatNumber), isRedo: true, redoReason: tempPending[0].reason },
          { seatNumber: tempPending[1].seatNumber, name: getStudentName(tempPending[1].seatNumber), isRedo: true, redoReason: tempPending[1].reason },
        ];
        tempPending.splice(0, 2);
        isRedo = true;
      } else if (tempPending.length === 1) {
        const s1 = tempPending[0];
        tempPending.splice(0, 1);
        const idx = tempPointer % len;
        let s2Seat = eligibleSeatNumbers[idx];
        if (s2Seat === s1.seatNumber && len > 1) {
          s2Seat = eligibleSeatNumbers[(idx + 1) % len];
          tempPointer = (tempPointer + 2) % len;
        } else {
          tempPointer = (tempPointer + 1) % len;
        }
        pair = [
          { seatNumber: s1.seatNumber, name: getStudentName(s1.seatNumber), isRedo: true, redoReason: s1.reason },
          { seatNumber: s2Seat, name: getStudentName(s2Seat) },
        ];
        isRedo = true;
      } else {
        const idx1 = tempPointer % len;
        const seat1 = eligibleSeatNumbers[idx1];
        const idx2 = (tempPointer + 1) % len;
        const seat2 = eligibleSeatNumbers[idx2];
        tempPointer = (tempPointer + 2) % len;
        pair = [
          { seatNumber: seat1, name: getStudentName(seat1) },
          { seatNumber: seat2, name: getStudentName(seat2) },
        ];
      }

      shifts.push({
        dayIndex: shifts.length + 1,
        dateStr,
        weekdayStr,
        students: pair,
        isRedoShift: isRedo,
      });
    }

    return shifts;
  }, [eligibleSeatNumbers, currentPointer, pendingRedoStudents, scheduledNextRedo, todayDutyPair, students]);

  // Student Personal Duty Status Calculation
  const activeStudentSeat = useMemo(() => {
    if (isGuest) return null;
    if (teacherProfile.seatNumber) return teacherProfile.seatNumber;
    if (selectedLookupSeat) return selectedLookupSeat;
    if (isApprovedTeacher && students.length > 0) return students[0].seatNumber;
    return null;
  }, [isGuest, teacherProfile.seatNumber, selectedLookupSeat, isApprovedTeacher, students]);

  const activeStudentName = activeStudentSeat ? getStudentName(activeStudentSeat) : '';

  const personalDutyInfo = useMemo(() => {
    if (!activeStudentSeat || isGuest) return null;
    const seat = activeStudentSeat;
    // 1. Is it today's duty?
    const isToday = todayDutyPair.some((s) => s.seatNumber === seat);
    if (isToday) {
      const self = todayDutyPair.find((s) => s.seatNumber === seat);
      const partner = todayDutyPair.find((s) => s.seatNumber !== seat);
      return {
        type: 'today' as const,
        title: '🌟 今日正是您的值日日！',
        description: self?.isRedo 
          ? `您今日為重做一天執勤（缺失事由：${self.redoReason || '未達標準'}），請落實各項值日檢查！` 
          : '請於各節下課及放學前落實黑板清潔、板擦清理與教室巡視。',
        partner: partner ? `${partner.seatNumber} 號 ${partner.name}` : undefined,
        isRedo: self?.isRedo,
      };
    }

    // 2. Is marked for redo?
    const redoPending = pendingRedoStudents.find((p) => p.seatNumber === seat) || scheduledNextRedo.find((p) => p.seatNumber === seat);
    if (redoPending) {
      return {
        type: 'redo' as const,
        title: '⚠️ 登記重做一天（即將優先輪值）',
        description: `缺失事由：${redoPending.reason}。您已被登記排入重做名單，將於下一次交接時優先輪值。`,
        partner: '隔日交接後將搭配下一位順序座號同學共同執勤',
        isRedo: true,
      };
    }

    // 3. Is exempt?
    if (exemptSeatNumbers.includes(seat)) {
      return {
        type: 'exempt' as const,
        title: '✨ 免值日生身分',
        description: `免除事由：${exemptReasons[seat] || '幹部公務免除'}。日常輪值會自動略過您的座號。`,
      };
    }

    // 4. In future 10 shifts?
    const nextShift = futureSchedule.find((shift) => shift.students.some((s) => s.seatNumber === seat));
    if (nextShift) {
      const partner = nextShift.students.find((s) => s.seatNumber !== seat);
      return {
        type: 'upcoming' as const,
        title: `📅 預計於 ${nextShift.dateStr} (${nextShift.weekdayStr}) 輪到您！`,
        description: `排程第 ${nextShift.dayIndex} 梯次，距今約 ${nextShift.dayIndex} 個上課日。`,
        partner: partner ? `${partner.seatNumber} 號 ${partner.name}` : undefined,
        shift: nextShift,
      };
    }

    // 5. Further away (beyond 10 shifts)
    return {
      type: 'far' as const,
      title: '⏳ 輪值順序預報：10 梯次之後',
      description: '目前排程較後方，暫時無須執勤。',
    };
  }, [activeStudentSeat, isGuest, todayDutyPair, pendingRedoStudents, scheduledNextRedo, exemptSeatNumbers, exemptReasons, futureSchedule]);

  // Fullscreen Projector Component
  if (isProjectorMode && !isGuest) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-12 overflow-y-auto animate-in fade-in duration-200">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <span className="bg-amber-500 text-slate-950 px-3 py-1 rounded-lg text-sm font-black uppercase tracking-wider">
              {currentClass.fullName}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif tracking-wide text-amber-200">
              今日課堂值日生
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-slate-400">
              {new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}
            </span>
            <button
              onClick={() => setIsProjectorMode(false)}
              className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-xl transition-all cursor-pointer"
              title="退出投影模式"
            >
              <Minimize2 className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Center: Giant 2 Students Highlight */}
        <div className="my-auto py-12 flex flex-col items-center justify-center text-center">
          <span className="text-xs uppercase tracking-widest text-amber-400 font-bold mb-3">
            TODAY'S DUTY STUDENTS
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl">
            {todayDutyPair.map((st, idx) => (
              <div 
                key={idx}
                className={`p-8 rounded-3xl border-2 flex flex-col items-center justify-center relative shadow-2xl ${
                  st.isRedo 
                    ? 'bg-rose-950/40 border-rose-500/80 text-rose-100' 
                    : 'bg-white/5 border-amber-400/40 text-white'
                }`}
              >
                {st.isRedo && (
                  <span className="absolute -top-3.5 bg-rose-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    重做一天 • {st.redoReason || '未達標準'}
                  </span>
                )}
                <span className="text-6xl sm:text-8xl font-black font-mono tracking-tight text-amber-300">
                  {st.seatNumber}
                  <span className="text-2xl sm:text-3xl ml-2 text-slate-300 font-normal">號</span>
                </span>
                <span className="text-3xl sm:text-4xl font-bold mt-3 text-white">
                  {st.name}
                </span>
              </div>
            ))}
          </div>

          {/* Quick Task Summary */}
          <div className="mt-12 bg-white/5 border border-white/10 rounded-2xl p-6 max-w-3xl w-full text-left">
            <h3 className="text-sm font-bold text-amber-300 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              值日生核心職責檢核
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-300">
              {customTasks.slice(0, 4).map((task, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>{task}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex items-center justify-between pt-6 border-t border-white/10 text-xs text-slate-400">
          <span>輪值模式：每日 2 位依座號順序循環 • 免值日號碼自動略過</span>
          <button
            onClick={() => setIsProjectorMode(false)}
            className="text-white hover:text-amber-300 underline font-semibold cursor-pointer"
          >
            點擊或按 ESC 退出投影
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="duty-schedule-manager" className="space-y-6 pb-16">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-in slide-in-from-top-2 duration-150">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              onClick={onBackToDashboard}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="返回動態總覽"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold font-serif text-slate-900">
                  功能三：值日生輪值系統
                </h1>
                <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                  <Repeat className="w-3 h-3 text-amber-700" />
                  每日雙人輪流
                </span>
                {!isGuest ? (
                  <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full font-semibold">
                    {currentClass.fullName}（全班 {totalCount} 人）
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-semibold">
                    班級資訊（登入後解鎖）
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                每日兩位值日生依座號順序輪流，自動跳過免值日號碼，並支援「重做一天」懲處複查與未來排程預覽。
              </p>
            </div>
          </div>

          {/* Action Tools: Sub Tabs & Projector button or Guest Lock Badge */}
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
            <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveSubTab('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeSubTab === 'today'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  今日值日
                </button>
                <button
                  onClick={() => setActiveSubTab('preview')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeSubTab === 'preview'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  未來排程
                </button>
                <button
                  onClick={() => setActiveSubTab('exempt')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeSubTab === 'exempt'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  免值日設定 ({exemptSeatNumbers.length})
                </button>
                <button
                  onClick={() => setActiveSubTab('history')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeSubTab === 'history'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  值日歷程 ({dutyHistory.length})
                </button>
              </div>

              <button
                onClick={() => setIsProjectorMode(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="切換黑板大字投影模式"
              >
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">黑板投影模式</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick status bar */}
        {!isGuest ? (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span>
                參與輪值有效人數：<strong className="text-slate-900">{eligibleSeatNumbers.length}</strong> 人
              </span>
              <span>&bull;</span>
              <span>
                已免除號碼：<strong className="text-slate-900">{exemptSeatNumbers.length}</strong> 人
              </span>
              {pendingRedoStudents.length > 0 && (
                <>
                  <span>&bull;</span>
                  <span className="text-rose-600 font-semibold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    待重做學生：{pendingRedoStudents.length} 人
                  </span>
                </>
              )}
            </div>

            <div className="text-[11px] text-slate-400">
              {new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-amber-800 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>為維護學生個人隱私與個資安全，班級座號與姓名名單僅開放登入後查閱。</span>
            </div>
            <div className="text-[11px] text-slate-400">
              {new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* GUEST ACCESS LOCK BARRIER (未登入訪客專用畫面 - 需登入使用，防止外流班級座號與姓名個資) */}
      {/* ========================================================================= */}
      {isGuest && (
        <section id="duty-guest-lock" className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xs space-y-6 my-6 animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider bg-amber-100/80 px-3 py-1 rounded-full border border-amber-200">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
              未登入訪客模式
            </span>
            <h2 className="text-2xl font-bold font-serif text-slate-900 pt-2">
              未登入無法檢視值日生資料
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              值日生輪值系統包含班級學生座號、姓名名冊、每日排程及執勤紀錄。為確保學生個資安全與隱私，本系統未登入狀態下不會顯示任何班級座號與姓名資訊，亦不預設為任何座號。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {onOpenAuthModal && (
              <button
                id="duty-guest-login-btn"
                type="button"
                onClick={onOpenAuthModal}
                className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer hover:shadow-sm"
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span>立即登入帳號</span>
              </button>
            )}
            <button
              id="duty-guest-back-btn"
              type="button"
              onClick={onBackToDashboard}
              className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors cursor-pointer"
            >
              返回總儀表板
            </button>
          </div>
        </section>
      )}

      {!isGuest && (
        <>

      {/* ========================================================================= */}
      {/* STUDENT PERSONAL DUTY TURN STATUS CARD (學生個人輪值狀態與何時輪到自己查詢)   */}
      {/* ========================================================================= */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <span>個人值日生輪值狀態查詢</span>
                {isStudent ? (
                  <span className="text-[10px] bg-sky-100 text-sky-900 font-bold px-2 py-0.5 rounded-full border border-sky-200">
                    學生專屬視圖（唯讀）
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                    快速輪值試算
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                即時掌握今日是否值日、何時輪到自己以及共同執勤夥伴。
              </p>
            </div>
          </div>

          {/* Seat Picker for Turn Lookup */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <label className="text-xs font-semibold text-slate-600 shrink-0">
              查詢座號：
            </label>
            <select
              value={activeStudentSeat || ''}
              onChange={(e) => setSelectedLookupSeat(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
            >
              {!activeStudentSeat && <option value="">請選擇座號...</option>}
              {Array.from({ length: totalCount }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>
                  {s} 號 {getStudentName(s)} {s === teacherProfile.seatNumber ? '(自己)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Personalized Result Box */}
        <div className="mt-4">
          {personalDutyInfo && activeStudentSeat ? (
            <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
              personalDutyInfo.type === 'today'
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 shadow-xs'
                : personalDutyInfo.type === 'redo'
                ? 'bg-rose-50/80 border-rose-300 text-rose-950 shadow-xs'
                : personalDutyInfo.type === 'exempt'
                ? 'bg-slate-50 border-slate-200 text-slate-800'
                : 'bg-sky-50/70 border-sky-200 text-sky-950'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold bg-white/80 px-2 py-0.5 rounded-md border border-black/10">
                      座號 {activeStudentSeat} 號 {activeStudentName}
                    </span>
                    <span className="text-sm font-bold">
                      {personalDutyInfo.title}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">
                    {personalDutyInfo.description}
                  </p>
                  {personalDutyInfo.partner && (
                    <p className="text-xs font-semibold mt-1">
                      👥 共同執勤夥伴：<span className="underline">{personalDutyInfo.partner}</span>
                    </p>
                  )}
                </div>

                {/* Status Badge */}
                <div className="shrink-0 flex items-center gap-2">
                  {personalDutyInfo.type === 'today' ? (
                    <span className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      今日執勤中
                    </span>
                  ) : personalDutyInfo.type === 'redo' ? (
                    <span className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      重做一天待值
                    </span>
                  ) : personalDutyInfo.type === 'exempt' ? (
                    <span className="px-3.5 py-1.5 rounded-xl bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4" />
                      免值日生
                    </span>
                  ) : (
                    <span className="px-3.5 py-1.5 rounded-xl bg-sky-600 text-white font-bold text-xs shadow-xs flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      排程等候中
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              請從上方選單選取欲查閱輪值狀態的學生座號
            </div>
          )}
        </div>

        {/* Student Permission Notice */}
        {isStudent && (
          <div className="mt-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
            <span className="font-semibold text-slate-700">🔒 學生帳號權限說明：</span>
            <span>您目前為學生帳號，僅可查閱今日值日生、未來排程與個人輪值時間；指定重做與交接設定僅限授權教師操作。</span>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 1. SUB-TAB: TODAY'S DUTY (今日值日生與即時操作)                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'today' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Main Duty Hero Pair Cards */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <span className="text-xs font-bold text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-md border border-amber-200 uppercase tracking-wide">
                  TODAY'S SHIFT
                </span>
                <h2 className="text-xl font-bold font-serif text-slate-900 mt-1">
                  今日執勤值日生（第 1 & 2 位）
                </h2>
              </div>

              {/* Shift Quick Controls */}
              <div className="flex items-center gap-2">
                {isApprovedTeacher ? (
                  <>
                    <button
                      type="button"
                      onClick={handleRevertPrevShift}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                      title="回到上一組"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>上一組</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAdvanceNextShift}
                      className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                      title="交接並輪值到下一組"
                    >
                      <span>今日交接完成 (輪至下一組)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl font-medium">
                    雙人順序輪流（由授權教師交接）
                  </span>
                )}
              </div>
            </div>

            {/* The 2 Student Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {todayDutyPair.map((st, idx) => {
                const isMarkedForNextRedo = scheduledNextRedo.find((r) => r.seatNumber === st.seatNumber);
                const isMe = st.seatNumber === activeStudentSeat;

                return (
                  <div 
                    key={idx}
                    className={`rounded-2xl p-6 border transition-all relative ${
                      isMe ? 'ring-2 ring-amber-400' : ''
                    } ${
                      st.isRedo 
                        ? 'bg-rose-50/70 border-rose-200 text-rose-950 shadow-xs' 
                        : isMarkedForNextRedo
                          ? 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-xs'
                          : 'bg-slate-50/80 border-slate-200 text-slate-900'
                    }`}
                  >
                    {/* Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          值日生 #{idx + 1}
                        </span>
                        {isMe && (
                          <span className="text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full shadow-xs">
                            這是您
                          </span>
                        )}
                      </div>
                      {st.isRedo ? (
                        <span className="text-xs bg-rose-600 text-white font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-xs">
                          <AlertTriangle className="w-3 h-3" />
                          重做一天
                        </span>
                      ) : isMarkedForNextRedo ? (
                        <span className="text-xs bg-amber-600 text-white font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-xs">
                          <AlertTriangle className="w-3 h-3" />
                          已登記隔日重做
                        </span>
                      ) : (
                        <span className="text-xs bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          正常順序輪值
                        </span>
                      )}
                    </div>

                    {/* Number & Name */}
                    <div className="flex items-baseline gap-3 my-2">
                      <span className="text-5xl sm:text-6xl font-black font-mono text-slate-900">
                        {st.seatNumber}
                      </span>
                      <span className="text-xl sm:text-2xl font-bold text-slate-800">
                        {st.name}
                      </span>
                    </div>

                    {/* Redo Reason Note */}
                    {st.isRedo && st.redoReason && (
                      <div className="mt-3 p-2.5 bg-rose-100/80 rounded-xl text-xs text-rose-900 border border-rose-200 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>重做原因：</strong>
                          <span>{st.redoReason}</span>
                        </div>
                      </div>
                    )}

                    {/* Scheduled Next Redo Note */}
                    {isMarkedForNextRedo && (
                      <div className="mt-3 p-2.5 bg-amber-100/80 rounded-xl text-xs text-amber-950 border border-amber-200 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <strong>隔日重做事由：</strong>
                          <span>{isMarkedForNextRedo.reason}</span>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            交接後將於隔日搭配下一位座號同學共同值日
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Quick Single Action */}
                    <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        座號 {st.seatNumber} 號
                      </span>
                      {isApprovedTeacher ? (
                        st.isRedo ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveRedoStudent(st.seatNumber)}
                            className="text-rose-700 hover:text-rose-900 font-semibold underline cursor-pointer"
                          >
                            取消重做標記
                          </button>
                        ) : isMarkedForNextRedo ? (
                          <button
                            type="button"
                            onClick={() => handleCancelScheduledRedo(st.seatNumber)}
                            className="text-amber-800 hover:text-amber-950 font-semibold underline cursor-pointer"
                          >
                            取消隔日重做登記
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRedoTarget(st.seatNumber);
                              setIsRedoModalOpen(true);
                            }}
                            className="text-slate-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>指定此號重做一天</span>
                          </button>
                        )
                      ) : (
                        <span className="text-slate-500 font-medium">
                          {st.isRedo ? '重做一天執勤中' : isMarkedForNextRedo ? '已登記隔日重做' : '正常輪值中'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Duty Tasks Checklist (Teachers only) & Pending Redo Queue */}
          {isApprovedTeacher ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* 2/3 Width: Checklist (Teachers only) */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">今日值日職責檢核清單</h3>
                      <span className="text-[10px] text-slate-400">供老師或風紀/衛生股長勾選確認</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const allChecked: Record<string, boolean> = {};
                      customTasks.forEach((t) => { allChecked[t] = true; });
                      setTodayTaskCheck(allChecked);
                      showToast('已全部勾選完成！');
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer underline"
                  >
                    全部完成
                  </button>
                </div>

                <div className="space-y-2.5">
                  {customTasks.map((task, i) => {
                    const isChecked = Boolean(todayTaskCheck[task]);
                    return (
                      <label
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          isChecked 
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' 
                            : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/60 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setTodayTaskCheck(prev => ({
                              ...prev,
                              [task]: !prev[task],
                            }));
                          }}
                          className="w-4 h-4 rounded-md border-slate-300 text-slate-900 focus:ring-slate-900 mt-0.5 cursor-pointer"
                        />
                        <span className={`text-xs leading-relaxed ${isChecked ? 'line-through text-slate-400' : ''}`}>
                          {task}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 1/3 Width: Pending Redo Queue */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">待重做學生名單</h3>
                        <span className="text-[10px] text-slate-400">優先排入隔日輪值</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                      {pendingRedoStudents.length + scheduledNextRedo.length} 人
                    </span>
                  </div>

                  {pendingRedoStudents.length === 0 && scheduledNextRedo.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                      <p>目前沒有待重做的學生</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">全班表現優良！</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 my-3 max-h-60 overflow-y-auto pr-1">
                      {/* Active Pending Redo in database */}
                      {pendingRedoStudents.map((redo, idx) => (
                        <div 
                          key={`pending-${idx}`}
                          className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-rose-950 flex items-center gap-1.5">
                              <span className="bg-rose-200 text-rose-900 text-[10px] px-1.5 py-0.5 rounded font-mono">排隊中</span>
                              <span>{redo.seatNumber} 號</span>
                              <span>{redo.name}</span>
                            </div>
                            <p className="text-[11px] text-rose-800 mt-0.5">{redo.reason}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveRedoStudent(redo.seatNumber)}
                            className="p-1 text-slate-400 hover:text-rose-700 transition-colors cursor-pointer"
                            title="取消重做"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {/* Scheduled For Tomorrow's Next Shift */}
                      {scheduledNextRedo.map((redo, idx) => (
                        <div 
                          key={`scheduled-${idx}`}
                          className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-amber-950 flex items-center gap-1.5">
                              <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-mono">明日交接生效</span>
                              <span>{redo.seatNumber} 號</span>
                              <span>{redo.name}</span>
                            </div>
                            <p className="text-[11px] text-amber-800 mt-0.5">{redo.reason}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCancelScheduledRedo(redo.seatNumber)}
                            className="p-1 text-slate-400 hover:text-amber-700 transition-colors cursor-pointer"
                            title="取消登記"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed space-y-1">
                  <p>💡 <strong>搭配規則：</strong> 重做學生將在隔日搭配下一位順序座號同學共同值日（例如：15 號重做、16 號免做，隔日為 15 號與 17 號）。</p>
                </div>
              </div>

            </div>
          ) : (
            /* Student View: Only show pending redo list if any exist or clean status */
            (pendingRedoStudents.length > 0 || scheduledNextRedo.length > 0) && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">待重做學生名單（優先排入隔日輪值）</h3>
                      <span className="text-[10px] text-slate-400">目前登記重做之座號名冊</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full">
                    {pendingRedoStudents.length + scheduledNextRedo.length} 人待值
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {pendingRedoStudents.map((redo, idx) => (
                    <div 
                      key={`pending-${idx}`}
                      className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-rose-950 flex items-center gap-1.5">
                          <span className="bg-rose-200 text-rose-900 text-[10px] px-1.5 py-0.5 rounded font-mono">排隊中</span>
                          <span>{redo.seatNumber} 號 {redo.name}</span>
                        </div>
                        <p className="text-[11px] text-rose-800 mt-0.5">{redo.reason}</p>
                      </div>
                    </div>
                  ))}

                  {scheduledNextRedo.map((redo, idx) => (
                    <div 
                      key={`scheduled-${idx}`}
                      className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-amber-950 flex items-center gap-1.5">
                          <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-mono">明日交接生效</span>
                          <span>{redo.seatNumber} 號 {redo.name}</span>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5">{redo.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUB-TAB: PREVIEW SCHEDULE (未來 10 梯次排程預覽)                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'preview' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold font-serif text-slate-900">
                  未來 10 天值日生預計輪值表
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  自動排除週末與已設定之免值日號碼；若有待重做學生將優先排入。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">
                  順序由座號 1 ~ {totalCount} 號循環
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {futureSchedule.map((shift, idx) => {
                const hasMe = shift.students.some((st) => st.seatNumber === activeStudentSeat);

                return (
                  <div 
                    key={idx}
                    className={`p-4 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      hasMe
                        ? 'ring-2 ring-amber-400 bg-amber-50/70 border-amber-300 shadow-xs'
                        : shift.isRedoShift 
                        ? 'bg-rose-50/50 border-rose-200' 
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl border flex flex-col items-center justify-center shrink-0 shadow-2xs font-mono ${
                        hasMe ? 'bg-amber-400 text-amber-950 border-amber-400' : 'bg-white border-slate-200'
                      }`}>
                        <span className={`text-[10px] leading-none ${hasMe ? 'text-amber-900 font-bold' : 'text-slate-400'}`}>{shift.weekdayStr}</span>
                        <span className={`text-xs font-bold ${hasMe ? 'text-amber-950' : 'text-slate-900'}`}>{shift.dateStr}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">
                            梯次 #{shift.dayIndex}
                          </span>
                          {hasMe && (
                            <span className="text-[10px] bg-amber-500 text-white font-bold px-1.5 py-0.2 rounded shadow-2xs">
                              ⭐ 您的輪值日
                            </span>
                          )}
                          {shift.isRedoShift && (
                            <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded border border-rose-200">
                              含重做生
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {shift.students.map((st, sIdx) => {
                            const isThisMe = st.seatNumber === activeStudentSeat;
                            return (
                              <span 
                                key={sIdx}
                                className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                                  isThisMe
                                    ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-300'
                                    : st.isRedo 
                                    ? 'bg-rose-600 text-white' 
                                    : 'bg-white border border-slate-200 text-slate-800'
                                }`}
                              >
                                {st.seatNumber}號 {st.name} {isThisMe ? '(您)' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      2 位值日生
                    </span>
                  </div>
                );
              })}
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUB-TAB: EXEMPT SEAT NUMBERS (免值日號碼設定)                            */}
      {/* ========================================================================= */}
      {activeSubTab === 'exempt' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold font-serif text-slate-900">
                  免值日號碼管理（班長、幹部與特殊免除）
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  點選座號可快速切換「免值日」狀態。被免除之號碼在輪值排班時會自動略過。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-amber-100 text-amber-900 px-3 py-1.5 rounded-xl border border-amber-300">
                  目前已免除：{exemptSeatNumbers.length} 位
                </span>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-700 block mb-2">
                常見幹部快速免除事由參考：
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_EXEMPT_ROLES.map((role, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg shadow-2xs flex items-center gap-1"
                  >
                    <UserCheck className="w-3 h-3 text-slate-400" />
                    <strong>{role.label}</strong>
                    <span className="text-[10px] text-slate-400">({role.defaultReason})</span>
                  </span>
                ))}
              </div>
            </div>

            {!isApprovedTeacher && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                <span className="font-bold text-slate-800">🔒 唯讀模式：</span>
                <span>學生帳號僅可檢視免值日名單，號碼切換與免除事由設定由任課教師統一管理。</span>
              </div>
            )}

            {/* Seat Numbers Interactive Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-900">
                  全班座號清單 {isApprovedTeacher ? '(點擊號碼直接切換免除 / 恢復)：' : '(目前免值日設定清單)：'}
                </span>
                <span className="text-[11px] text-slate-400">
                  紅色劃線標籤 = 免值日
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                {Array.from({ length: totalCount }, (_, i) => {
                  const seatNum = i + 1;
                  const isExempt = exemptSeatNumbers.includes(seatNum);
                  const reason = exemptReasons[seatNum];

                  return (
                    <button
                      key={seatNum}
                      type="button"
                      disabled={!isApprovedTeacher}
                      onClick={() => isApprovedTeacher && handleToggleExemptSeat(seatNum)}
                      className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between min-h-[72px] ${
                        !isApprovedTeacher ? 'cursor-default' : 'cursor-pointer group'
                      } ${
                        isExempt
                          ? 'bg-slate-100 border-slate-300 text-slate-400 opacity-90'
                          : isApprovedTeacher
                          ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900 shadow-2xs hover:border-slate-400'
                          : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-lg font-black font-mono ${isExempt ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {seatNum}
                        </span>
                        {isExempt ? (
                          <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded">
                            免
                          </span>
                        ) : isApprovedTeacher ? (
                          <span className="text-[10px] text-emerald-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            點擊免除
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1">
                        <span className="text-xs font-semibold block truncate">
                          {getStudentName(seatNum)}
                        </span>
                        {isExempt && reason && (
                          <span className="text-[10px] text-amber-800 truncate block">
                            {reason}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List of currently exempt students with editable reasons */}
            {exemptSeatNumbers.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-900 mb-3">
                  已免值日學生名單與備註事由：
                </h3>
                <div className="space-y-2">
                  {exemptSeatNumbers.map((seatNum) => (
                    <div 
                      key={seatNum}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-slate-200 font-bold font-mono text-slate-800 flex items-center justify-center shrink-0">
                          {seatNum}
                        </span>
                        <div>
                          <span className="font-bold text-slate-900">{getStudentName(seatNum)}</span>
                          <p className="text-[11px] text-slate-500">
                            事由：{exemptReasons[seatNum] || '幹部公務免值日'}
                          </p>
                        </div>
                      </div>

                      {isApprovedTeacher && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingExemptSeat(seatNum);
                              setExemptReasonInput(exemptReasons[seatNum] || '');
                              setIsExemptModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-xs cursor-pointer"
                          >
                            修改事由
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleExemptSeat(seatNum)}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs cursor-pointer"
                          >
                            恢復值日
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SUB-TAB: HISTORY LOGS (值日歷史記錄)                                    */}
      {/* ========================================================================= */}
      {activeSubTab === 'history' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold font-serif text-slate-900">
                  歷次值日生執勤紀錄
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  記錄每次交接完成的值日生名冊、執勤日期與備註。
                </p>
              </div>

              <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-xl">
                共 {dutyHistory.length} 筆記錄
              </span>
            </div>

            {dutyHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p>尚無歷史交接紀錄</p>
                <p className="text-[11px] text-slate-400 mt-0.5">點擊「今日交接完成」即可產生存檔紀錄。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dutyHistory.map((rec) => (
                  <div 
                    key={rec.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-mono">{rec.date}</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.2 rounded-full font-medium">
                          交接已完成
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-slate-500">執勤學生：</span>
                        {rec.students.map((st, i) => (
                          <span 
                            key={i}
                            className={`px-2 py-0.5 rounded-md font-bold ${
                              st.isRedo 
                                ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                                : 'bg-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            {st.seatNumber} 號 {st.name}
                            {st.isRedo && ' (重做)'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      紀錄時間：{new Date(rec.completedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MARK REDO A DAY (設定重做一天)                                      */}
      {/* ========================================================================= */}
      {isRedoModalOpen && isApprovedTeacher && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsRedoModalOpen(false);
          }}
        >
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150 my-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    標記值日生「重做一天」
                  </h3>
                  <p className="text-[11px] text-slate-400">可多選缺失原因並於隔日輪值</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsRedoModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="關閉視窗 (X)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-4">
              {/* Target selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  選擇重做對象：
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRedoTarget('both')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      selectedRedoTarget === 'both'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    整組 2 位重做
                  </button>
                  {todayDutyPair.map((st) => (
                    <button
                      key={st.seatNumber}
                      type="button"
                      onClick={() => setSelectedRedoTarget(st.seatNumber)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer truncate ${
                        selectedRedoTarget === st.seatNumber
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {st.seatNumber}號 {st.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi-select Reason Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    重做原因 / 缺失項目（支援多選）：
                  </label>
                  <span className="text-[11px] text-rose-600 font-medium">
                    已勾選 {selectedRedoReasons.length} 項
                  </span>
                </div>
                <div className="space-y-1.5">
                  {REDO_REASONS.map((r, i) => {
                    const isSelected = selectedRedoReasons.includes(r);
                    return (
                      <label
                        key={i}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-rose-50 border-rose-300 text-rose-950 font-semibold shadow-xs' 
                            : 'bg-slate-50/60 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRedoReason(r)}
                          className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                        />
                        <span className="flex-1 select-none">{r}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Custom Reason Input */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 font-medium">
                  或補充其他自訂重做原因：
                </label>
                <input
                  type="text"
                  value={customRedoReason}
                  onChange={(e) => setCustomRedoReason(e.target.value)}
                  placeholder="例如：黑板邊角未擦乾淨、板擦溝粉筆灰過多..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setIsRedoModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmRedoDay}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>確認標記重做</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT EXEMPT REASON (編輯免值工事由)                                  */}
      {/* ========================================================================= */}
      {isExemptModalOpen && editingExemptSeat !== null && isApprovedTeacher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                編輯 {editingExemptSeat} 號免值日事由
              </h3>
              <button onClick={() => setIsExemptModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-600 block">
                輸入事由或職稱：
              </label>
              <input
                type="text"
                value={exemptReasonInput}
                onChange={(e) => setExemptReasonInput(e.target.value)}
                placeholder="例如：班長、風紀股長、傷病免除..."
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsExemptModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveExemptReason}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white"
              >
                儲存事由
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}

    </div>
  );
};
