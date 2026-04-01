import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon, Users, Check, X, ChevronLeft, ChevronRight,
  Clock, Plus, Search, Filter, CheckSquare, AlertTriangle, Info,
  PieChart, UploadCloud, TrendingUp, User, Heart, MessageSquare,
  Trash2, ShieldCheck, Settings, Sliders, Edit, CalendarClock,
  UserPlus, Briefcase, Paperclip, Bell, Download, Mail, Lock, CheckCircle
} from 'lucide-react';

// --- Configuration & Mock Data ---
const NAMES = [
  "Alice Johnson", "Bob Smith", "Charlie Davis", "Diana Prince",
  "Evan Wright", "Fiona Gallagher", "George Miller", "Hannah Abbott",
  "Ian Malcolm", "Julia Roberts", "Kevin Hart", "Luna Lovegood",
  "Michael Scott", "Nina Dobrev", "Oscar Martinez", "Pam Beesly",
  "Quinn Fabray", "Rachel Green", "Steve Harrington", "Tina Fey"
];

const ROLES = ['Engineering', 'Design', 'Marketing', 'Sales', 'HR', 'Product'];
const CURRENT_USER_ID = 3;

// --- TypeScript Interfaces & Types ---
type LeaveTypeKey = 'PL' | 'CL' | 'SL' | 'COMP' | 'LOP' | 'MAT';

interface LeaveBalance {
  PL: { broughtForward: number; used: number; adjustment: number };
  CL_SL: { used: number; adjustment: number };
  COMP: { total: number; used: number };
}

interface Employee {
  id: number;
  name: string;
  role: string;
  balances: LeaveBalance;
}

interface LeaveRequest {
  id: number;
  empId: number;
  name: string;
  startDate: string;
  endDate: string;
  type: LeaveTypeKey;
  days: number;
  isHalfDay: boolean;
  halfType: 'First Half' | 'Second Half' | null;
  reason: string;
  document: string | null;
  stage: string;
}

interface ApprovedLeave {
  id: number;
  empId: number;
  name: string;
  dateStr: string;
  type: LeaveTypeKey;
  days: number;
  reason: string;
  isHalfDay?: boolean;
  halfType?: 'First Half' | 'Second Half' | null;
}

interface CompRequest {
  id: number;
  empId: number;
  name: string;
  dateStr: string;
  days: number;
  reason: string;
}

interface Holiday {
  dateStr: string;
  name: string;
}

interface SystemConfig {
  sandwichRule: boolean;
  plAccrualDaysWorkedRate: number;
  clslTotalPerYear: number;
  maxCarryForward: number;
  multiLevelApproval: boolean;
  autoApproveSickLeave: boolean;
  allowCompLeave: boolean;
}

interface EmpBalancesResult {
  ytdWorked: number;
  eoyWorked: number;
  PL: { broughtForward: number; accrued: number; used: number; net: number; eoyAccrued: number };
  CL_SL: { accrued: number; used: number; net: number };
  COMP: { accrued: number; used: number; net: number };
}

const LEAVE_TYPES = {
  PL: { label: 'Privilege Leave (PL)', color: 'bg-blue-100 text-blue-800' },
  CL: { label: 'Casual Leave (CL)', color: 'bg-green-100 text-green-800' },
  SL: { label: 'Sick Leave (SL)', color: 'bg-orange-100 text-orange-800' },
  COMP: { label: 'Compensatory (COMP)', color: 'bg-teal-100 text-teal-800' },
  LOP: { label: 'Loss of Pay (LOP)', color: 'bg-red-100 text-red-800' },
  MAT: { label: 'Maternity/Paternity', color: 'bg-purple-100 text-purple-800' }
};

const PUBLIC_HOLIDAYS = [
  { dateStr: '2026-03-03', name: 'Holi' },
  { dateStr: '2026-03-19', name: 'Gudi Padwa' },
  { dateStr: '2026-04-03', name: 'Good Friday' },
];

const INITIAL_EMPLOYEES = NAMES.map((name, index) => ({
  id: index + 1,
  name,
  role: ROLES[index % ROLES.length],
  balances: {
    PL: { broughtForward: Math.floor(Math.random() * 10), used: Math.floor(Math.random() * 5), adjustment: 0 },
    CL_SL: { used: Math.floor(Math.random() * 6), adjustment: 0 },
    COMP: { total: Math.floor(Math.random() * 3), used: 0 }
  }
}));

const INITIAL_REQUESTS = [
  { id: 101, empId: 3, name: 'Charlie Davis', startDate: '2026-03-27', endDate: '2026-03-27', type: 'PL', days: 1, isHalfDay: false, halfType: null, reason: 'Family function', stage: 'Manager Review', document: null },
  { id: 102, empId: 8, name: 'Hannah Abbott', startDate: '2026-04-02', endDate: '2026-04-03', type: 'CL', days: 2, isHalfDay: false, halfType: null, reason: 'Personal Errands', stage: 'HR Review', document: null },
];

const INITIAL_APPROVED_LEAVES = [
  { id: 201, empId: 1, name: 'Alice Johnson', dateStr: '2026-03-16', type: 'PL', days: 1, reason: 'Personal work' },
  { id: 203, empId: 5, name: 'Evan Wright', dateStr: '2026-03-25', type: 'SL', days: 1, reason: 'Not feeling well' },
];

export default function App() {
  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [captcha, setCaptcha] = useState<{ a: number; b: number; input: string }>({ a: 4, b: 7, input: '' });
  const [loginError, setLoginError] = useState('');

  // Main App State
  const [activeTab, setActiveTab] = useState('my-portal');
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [requests, setRequests] = useState<LeaveRequest[]>(INITIAL_REQUESTS as LeaveRequest[]);
  const [approvedLeaves, setApprovedLeaves] = useState<ApprovedLeave[]>(INITIAL_APPROVED_LEAVES as ApprovedLeave[]);
  const [compRequests, setCompRequests] = useState<CompRequest[]>([
    { id: 301, empId: 8, name: 'Hannah Abbott', dateStr: '2026-03-08', days: 1, reason: 'Weekend production deployment' }
  ]);

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [calendarFilter, setCalendarFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [reportTab, setReportTab] = useState('PL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [editBalanceModalOpen, setEditBalanceModalOpen] = useState(false);
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // System & Admin State
  const [systemDateStr, setSystemDateStr] = useState('2026-03-01');
  const [activeLeaveYear, setActiveLeaveYear] = useState(2026);
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 2, 1));

  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    sandwichRule: true,
    plAccrualDaysWorkedRate: 20, // 1 PL per 20 days worked
    clslTotalPerYear: 14,
    maxCarryForward: 30,
    multiLevelApproval: true,
    autoApproveSickLeave: true,
    allowCompLeave: true
  });
  const [managedHolidays, setManagedHolidays] = useState(PUBLIC_HOLIDAYS);

  // Form State
  const [newRequest, setNewRequest] = useState<{ 
    empId: number; type: LeaveTypeKey; startDate: string; endDate: string; isHalfDay: boolean; halfType: 'First Half' | 'Second Half'; reason: string; document: string | null 
  }>({ 
    empId: CURRENT_USER_ID, type: 'PL', startDate: '', endDate: '', isHalfDay: false, halfType: 'First Half', reason: '', document: null
  });
  const [newCompRequest, setNewCompRequest] = useState<{ empId: number; dateStr: string; days: number | string; reason: string }>({ 
    empId: CURRENT_USER_ID, dateStr: '', days: 1, reason: '' 
  });
  const [newEmployeeForm, setNewEmployeeForm] = useState({ name: '', role: ROLES[0] });
  const [newHoliday, setNewHoliday] = useState<Holiday>({ name: '', dateStr: '' });

  // --- Authentication ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(captcha.input) === (captcha.a + captcha.b)) {
      setIsLoggedIn(true);
    } else {
      setLoginError('Incorrect Captcha. Please try again.');
      setCaptcha({ a: Math.floor(Math.random() * 10), b: Math.floor(Math.random() * 10), input: '' });
    }
  };

  // --- Dynamic Balance Engine (Based on Exact Days Worked) ---
  const getEmpBalances = (emp: Employee, sysDateStr: string, config: SystemConfig): EmpBalancesResult => {
    const sysD = new Date(sysDateStr);
    const endOfYearStr = `${ activeLeaveYear } - 12 - 31`;
    const calcEndStr = sysDateStr > endOfYearStr ? endOfYearStr : sysDateStr;
    const startStr = `${ activeLeaveYear }-01-01`;

    // Map all employee leaves for quick lookup
    const empLeaves = new Map<string, number>();
    const addLeavesToMap = (list: (ApprovedLeave | LeaveRequest)[]) => {
      list.filter(l => l.empId === emp.id && (l as LeaveRequest).stage !== 'Rejected').forEach(l => {
        let curr = new Date((l as LeaveRequest).startDate || (l as ApprovedLeave).dateStr);
        const end = new Date((l as LeaveRequest).endDate || (l as ApprovedLeave).dateStr || (l as LeaveRequest).startDate);
        const val = l.isHalfDay ? 0.5 : 1;
        while (curr <= end) {
          empLeaves.set(curr.toISOString().split('T')[0], val);
          curr.setDate(curr.getDate() + 1);
        }
      });
    };
    addLeavesToMap(approvedLeaves);
    addLeavesToMap(requests);

    const holidaySet = new Set(managedHolidays.map(h => h.dateStr));

    // Calculate YTD and EOY Projected Days Worked
    let ytdWorked = 0;
    let eoyWorked = 0;
    
    let curr = new Date(startStr);
    const endLimit = new Date(endOfYearStr);
    const sysLimit = new Date(calcEndStr);

    while (curr <= endLimit) {
      const dStr = curr.toISOString().split('T')[0];
      const isWeekend = curr.getDay() === 0 || curr.getDay() === 6;
      
      let dayWorkedVal = 0;
      // If it's not a weekend, not a holiday, and not fully on leave, count it
      if (!isWeekend && !holidaySet.has(dStr)) {
        dayWorkedVal = 1 - (empLeaves.get(dStr) || 0);
      }

      if (curr <= sysLimit) ytdWorked += dayWorkedVal;
      eoyWorked += dayWorkedVal;
      
      curr.setDate(curr.getDate() + 1);
    }

    // Accruals
    const accPL = (ytdWorked / config.plAccrualDaysWorkedRate) + (emp.balances.PL.adjustment || 0);
    const eoyAccPL = (eoyWorked / config.plAccrualDaysWorkedRate) + (emp.balances.PL.adjustment || 0);
    
    const month = isNaN(sysD.getTime()) ? 1 : Math.min(12, sysD.getMonth() + 1);
    const accCLSL = (month * (config.clslTotalPerYear / 12)) + (emp.balances.CL_SL.adjustment || 0); 

    // Net Balances
    const plNet = (emp.balances.PL.broughtForward || 0) + accPL - emp.balances.PL.used;
    const clslNet = accCLSL - emp.balances.CL_SL.used;
    const compNet = emp.balances.COMP.total - emp.balances.COMP.used;

    return {
        ytdWorked,
        eoyWorked,
        PL: { broughtForward: emp.balances.PL.broughtForward || 0, accrued: accPL, used: emp.balances.PL.used, net: plNet, eoyAccrued: eoyAccPL },
        CL_SL: { accrued: accCLSL, used: emp.balances.CL_SL.used, net: clslNet },
        COMP: { accrued: emp.balances.COMP.total, used: emp.balances.COMP.used, net: compNet }
    };
  };

  // --- System Date ---
  const handleSystemDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDateStr = e.target.value;
    setSystemDateStr(newDateStr);
    const newDate = new Date(newDateStr);
    if (!isNaN(newDate.getTime())) {
      setCalendarDate(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
    }
  };

  // --- Manual Year End Closure ---
  const handleYearEndClosure = () => {
    if (window.confirm(`WARNING: This will perform the closure for the year ${ activeLeaveYear }.\n\n - Leave applications for ${ activeLeaveYear } will be frozen.\n - PL balances will be carried forward(up to ${ systemConfig.maxCarryForward } days).\n - CL / SL balances will be reset.\n\nAre you sure you want to proceed ? `)) {
      
      setEmployees(prev => prev.map(emp => {
        const endOfYearBals = getEmpBalances(emp, `${ activeLeaveYear } -12 - 31`, systemConfig);
        const carriedPL = Math.min(systemConfig.maxCarryForward, Math.max(0, endOfYearBals.PL.net));
        
        return {
           ...emp,
           balances: {
              ...emp.balances,
              PL: { broughtForward: carriedPL, used: 0, adjustment: 0 },
              CL_SL: { used: 0, adjustment: 0 }, 
           }
        };
      }));

      setActiveLeaveYear(prev => prev + 1);
      alert(`Year ${ activeLeaveYear } closed successfully!\n\nBalances carried forward.The system is now accepting leave entries for ${ activeLeaveYear + 1} only.`);
    }
  };

  // --- Dynamic Leave Calculation (Excludes Holidays & evaluates Sandwich for CL) ---
  const calculateLeaveDays = (start: string, end: string | null, type: LeaveTypeKey, isHalf: boolean) => {
    if (!start) return 0;
    if (isHalf) return 0.5;
    if (!end) end = start;

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate > endDate) return 0;

    let days = 0;
    let current = new Date(startDate);
    const applySandwich = type === 'CL' && systemConfig.sandwichRule; 

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = managedHolidays.some(h => h.dateStr === dateStr);

      if (isHoliday) {
        // Exclude holidays always
      } else if (isWeekend && !applySandwich) {
        // Exclude weekends unless it's CL and Sandwich is ON
      } else {
        days += 1;
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const calculatedDays = useMemo(() => {
    return calculateLeaveDays(newRequest.startDate, newRequest.endDate, newRequest.type, newRequest.isHalfDay);
  }, [newRequest.startDate, newRequest.endDate, newRequest.type, newRequest.isHalfDay, systemConfig.sandwichRule, managedHolidays]);


  // --- Actions ---
  const handleApprove = (request: LeaveRequest) => {
    setRequests(prev => prev.filter(req => req.id !== request.id));
    
    setEmployees(prev => prev.map(emp => {
      if (emp.id === request.empId) {
        const bal = { ...emp.balances };
        if (request.type === 'PL') bal.PL.used += request.days;
        else if (['CL', 'SL'].includes(request.type)) bal.CL_SL.used += request.days;
        else if (request.type === 'COMP') bal.COMP.used += request.days;
        return { ...emp, balances: bal };
      }
      return emp;
    }));

    let current = new Date(request.startDate);
    const end = new Date(request.endDate || request.startDate);
    const newLeaves: ApprovedLeave[] = [];
    const applySandwich = request.type === 'CL' && systemConfig.sandwichRule;

    while(current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      const isHoliday = managedHolidays.some(h => h.dateStr === dateStr);

      if (!isHoliday && (!isWeekend || applySandwich)) {
        newLeaves.push({
          id: Date.now() + Math.random(),
          empId: request.empId,
          name: request.name,
          dateStr: dateStr,
          type: request.type,
          isHalfDay: request.isHalfDay,
          halfType: request.halfType,
          days: request.isHalfDay ? 0.5 : 1,
          reason: request.reason
        });
      }
      current.setDate(current.getDate() + 1);
    }
    setApprovedLeaves(prev => [...prev, ...newLeaves]);
  };

  const handleBulkApprove = () => {
    const toApprove = requests.filter(req => typeFilter === 'All' ? true : req.type === typeFilter);
    toApprove.forEach(req => handleApprove(req));
  };

  const handleReject = (id: number) => setRequests(prev => prev.filter(req => req.id !== id));
  const handleCancelRequest = (id: number) => setRequests(prev => prev.filter(req => req.id !== id));
  const handleSendReminder = (id: number) => alert("Reminder notification successfully sent to the Manager/HR.");

  // --- Comp Off Management ---
  const handleSubmitCompRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const reqYear = new Date(newCompRequest.dateStr).getFullYear();
    if (reqYear < activeLeaveYear) {
       alert(`Cannot log Extra Work for closed years.Active year is ${ activeLeaveYear }.`);
       return;
    }

    const emp = employees.find(e => e.id === Number(newCompRequest.empId));
    if (!emp || !newCompRequest.dateStr) return;

    setCompRequests([...compRequests, { 
      id: Date.now(), 
      empId: emp.id, 
      name: emp.name, 
      dateStr: newCompRequest.dateStr,
      days: Number(newCompRequest.days),
      reason: newCompRequest.reason
    }]);
    setIsCompModalOpen(false);
    setNewCompRequest({ empId: CURRENT_USER_ID, dateStr: '', days: 1, reason: '' });
  };

  const handleApproveComp = (req: CompRequest) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === req.empId) {
        return { ...emp, balances: { ...emp.balances, COMP: { ...emp.balances.COMP, total: emp.balances.COMP.total + req.days } } };
      }
      return emp;
    }));
    setCompRequests(prev => prev.filter(r => r.id !== req.id));
  };

  const handleRejectComp = (id: number) => setCompRequests(prev => prev.filter(req => req.id !== id));

  // --- Leave Request Handling ---
  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enforce Year Freeze logic
    const reqYear = new Date(newRequest.startDate).getFullYear();
    if (reqYear < activeLeaveYear) {
       alert(`Leave applications for years before ${ activeLeaveYear } are frozen.`);
       return;
    }

    const emp = employees.find(e => e.id === Number(newRequest.empId));
    if (!emp || !newRequest.startDate || calculatedDays === 0) return;

    const requestToAdd: LeaveRequest = {
      id: Date.now(), empId: emp.id, name: emp.name,
      startDate: newRequest.startDate,
      endDate: newRequest.isHalfDay || newRequest.type === 'COMP' ? newRequest.startDate : (newRequest.endDate || newRequest.startDate),
      type: newRequest.type,
      days: calculatedDays,
      isHalfDay: newRequest.isHalfDay,
      halfType: newRequest.isHalfDay ? newRequest.halfType : null,
      reason: newRequest.reason,
      document: newRequest.document,
      stage: 'Manager Review' 
    };

    if (requestToAdd.type === 'SL' && systemConfig.autoApproveSickLeave && requestToAdd.days <= 2) {
       handleApprove(requestToAdd);
       alert('Sick leave automatically approved per company policy.');
    } else {
       setRequests([...requests, requestToAdd]);
    }
    
    setIsModalOpen(false);
    setNewRequest({ empId: CURRENT_USER_ID, type: 'PL', startDate: '', endDate: '', isHalfDay: false, halfType: 'First Half', reason: '', document: null });
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if(newHoliday.name && newHoliday.dateStr) {
      const updatedHolidays = [...managedHolidays, newHoliday].sort((a,b) => a.dateStr.localeCompare(b.dateStr));
      setManagedHolidays(updatedHolidays);
      setNewHoliday({name: '', dateStr: ''});
    }
  };

  const handleRemoveHoliday = (dateStr: string) => setManagedHolidays(managedHolidays.filter(h => h.dateStr !== dateStr));

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeForm.name.trim()) return;
    const newId = Math.max(0, ...employees.map(emp => emp.id)) + 1;
    const empToAdd: Employee = {
      id: newId, name: newEmployeeForm.name, role: newEmployeeForm.role,
      balances: {
        PL: { broughtForward: 0, used: 0, adjustment: 0 },
        CL_SL: { used: 0, adjustment: 0 },
        COMP: { total: 0, used: 0 }
      }
    };
    setEmployees([...employees, empToAdd]);
    setIsAddEmployeeModalOpen(false);
    setNewEmployeeForm({ name: '', role: ROLES[0] });
  };

  const handleRemoveEmployee = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to remove ${ name }?`)) {
      setEmployees(prev => prev.filter(emp => emp.id !== id));
      setRequests(prev => prev.filter(req => req.empId !== id));
      setApprovedLeaves(prev => prev.filter(leave => leave.empId !== id));
    }
  };

  const saveEmployeeBalance = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEmployee) {
      setEmployees(prev => prev.map(emp => emp.id === editingEmployee.id ? editingEmployee : emp));
      setEditBalanceModalOpen(false);
    }
  };

  // --- Helpers ---
  const nextMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  const prevMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const selectedEmpRole = useMemo(() => employees.find(e => e.id === Number(newRequest.empId))?.role, [newRequest.empId, employees]);

  const hasOverlap = useMemo(() => {
    if (!newRequest.startDate) return false;
    const end = newRequest.endDate || newRequest.startDate;
    return approvedLeaves.some(l => l.empId === Number(newRequest.empId) && l.dateStr >= newRequest.startDate && l.dateStr <= end);
  }, [newRequest.startDate, newRequest.endDate, newRequest.empId, approvedLeaves]);

  const isSandwichRisk = useMemo(() => {
    if (!newRequest.startDate) return false;
    const d = new Date(newRequest.startDate);
    const endD = new Date(newRequest.endDate || newRequest.startDate);
    return (d.getDay() === 1 || d.getDay() === 5 || endD.getDay() === 1 || endD.getDay() === 5) && newRequest.type === 'CL';
  }, [newRequest.startDate, newRequest.endDate, newRequest.type]);

  const getBalanceImpact = () => {
    const emp = employees.find(e => e.id === Number(newRequest.empId));
    if (!emp || !['PL', 'CL', 'SL', 'COMP'].includes(newRequest.type)) return null;
    
    const bals = getEmpBalances(emp, systemDateStr, systemConfig);
    let before = 0;
    let poolName: string = newRequest.type;
    
    if (newRequest.type === 'PL') { before = bals.PL.net; }
    else if (newRequest.type === 'CL' || newRequest.type === 'SL') { before = bals.CL_SL.net; poolName = 'CL/SL'; }
    else if (newRequest.type === 'COMP') { before = bals.COMP.net; }

    return { before: before, after: before - calculatedDays, poolName: poolName };
  };

  const filteredEmployees = employees.filter(emp => emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || emp.role.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredRequests = requests.filter(req => typeFilter === 'All' ? true : req.type === typeFilter);
  const impact = getBalanceImpact();
  const currentUser = employees.find(e => e.id === CURRENT_USER_ID);

  // --- Authentication Screen ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm">
          <div className="flex justify-center mb-6">
             <div className="p-4 bg-blue-50 text-blue-600 rounded-full"><Lock size={32} /></div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Leave Portal</h2>
          <p className="text-center text-gray-500 mb-8 text-sm">Please sign in to access your dashboard.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Username</label>
              <input type="text" defaultValue="admin" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 outline-none" readOnly />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
              <input type="password" defaultValue="password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 outline-none" readOnly />
            </div>
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-sm font-bold text-gray-700 mb-1">Security Captcha: <span className="text-blue-600">{captcha.a} + {captcha.b} = ?</span></label>
              <input 
                type="number" required autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={captcha.input} onChange={e => setCaptcha({...captcha, input: e.target.value})} placeholder="Enter answer"
              />
            </div>
            {loginError && <p className="text-xs text-red-500 font-semibold">{loginError}</p>}
            <button type="submit" className="w-full mt-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-md">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  // --- Renderers ---
  const renderMyPortal = () => {
    if (!currentUser) return null;
    const myPending = requests.filter(r => r.empId === CURRENT_USER_ID);
    const myApproved = approvedLeaves.filter(r => r.empId === CURRENT_USER_ID);
    const bals = getEmpBalances(currentUser, systemDateStr, systemConfig);
    
    const totalLeavesAllowed = bals.PL.broughtForward + bals.PL.accrued + bals.CL_SL.accrued;
    const totalLeavesUsed = bals.PL.used + bals.CL_SL.used;
    const usageRatio = totalLeavesAllowed > 0 ? totalLeavesUsed / totalLeavesAllowed : 0;
    
    let wellnessScore = 80;
    if (usageRatio === 0) wellnessScore = 60; 
    if (usageRatio > 0.1 && usageRatio < 0.8) wellnessScore = 95; 
    if (usageRatio >= 0.8) wellnessScore = 70; 

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-2xl text-white shadow-lg">
          <div>
            <h2 className="text-3xl font-bold mb-1">Welcome back, {currentUser.name.split(' ')[0]}!</h2>
            <p className="text-blue-100 opacity-90">Ready to plan your next break?</p>
          </div>
          <div className="hidden md:flex flex-col items-center bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20">
            <div className="flex items-center gap-2 mb-1">
              <Heart size={20} className={wellnessScore > 80 ? 'text-pink-300' : 'text-yellow-300'} />
              <span className="font-semibold text-sm tracking-wide uppercase text-blue-50">Wellness Score</span>
            </div>
            <div className="text-3xl font-bold">{wellnessScore}<span className="text-lg opacity-70">/100</span></div>
            <p className="text-[10px] text-blue-100 mt-1">{wellnessScore > 80 ? 'Great balance!' : 'Consider taking a break.'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">Privilege Leave (PL)</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">Accrued based on {bals.ytdWorked} days worked</p>
              </div>
              <span className={`px - 2.5 py - 1 rounded - md text - xs font - bold ${ bals.PL.net <= 2 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700' } `}>
                {bals.PL.net.toFixed(1)} Left
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${ Math.min(100, (bals.PL.used / (bals.PL.broughtForward + bals.PL.accrued)) * 100 || 0) }% ` }}></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 font-medium">
              <span>Used: {bals.PL.used.toFixed(1)}</span>
              <span>Total: {(bals.PL.broughtForward + bals.PL.accrued).toFixed(1)}</span>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-gray-800">Casual / Sick (CL/SL)</h3>
              <span className={`px - 2.5 py - 1 rounded - md text - xs font - bold ${ bals.CL_SL.net <= 2 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700' } `}>
                {bals.CL_SL.net.toFixed(1)} Left
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${ Math.min(100, (bals.CL_SL.used / bals.CL_SL.accrued) * 100 || 0) }% ` }}></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 font-medium">
              <span>Used: {bals.CL_SL.used.toFixed(1)}</span>
              <span>Total: {bals.CL_SL.accrued.toFixed(1)}</span>
            </div>
          </div>

          <div className={`bg - white p - 6 rounded - xl shadow - sm border border - gray - 100 ${ !systemConfig.allowCompLeave ? 'opacity-50' : '' } `}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-gray-800">Compensatory (COMP)</h3>
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-teal-100 text-teal-700">
                {bals.COMP.net.toFixed(1)} Left
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${ bals.COMP.accrued > 0 ? (bals.COMP.used / bals.COMP.accrued) * 100 : 0 }% ` }}></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 font-medium">
              <span>Used: {bals.COMP.used.toFixed(1)}</span>
              <span>Total: {bals.COMP.accrued.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-lg font-bold text-gray-800">My Leave History & Requests</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {myPending.length === 0 && myApproved.length === 0 && (
              <div className="p-8 text-center text-gray-500">No leave history found.</div>
            )}
            
            {myPending.map(req => (
              <div key={req.id} className="p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg shrink-0"><Clock size={20} /></div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text - xs font - bold px - 2 py - 0.5 rounded ${ LEAVE_TYPES[req.type as LeaveTypeKey]?.color || 'bg-gray-100' } `}>{req.type}</span>
                      <span className="font-semibold text-gray-900">{req.startDate} {req.endDate && req.startDate !== req.endDate ? `to ${ req.endDate } ` : ''}</span>
                      <span className="text-sm text-gray-500">({req.isHalfDay ? req.halfType : `${ req.days } Day(s)`})</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{req.reason}</p>
                    {req.document && <p className="text-xs flex items-center gap-1 text-blue-600 font-medium mb-1"><Paperclip size={12}/> {req.document}</p>}
                    <p className="text-xs font-medium text-yellow-600 bg-yellow-100 w-fit px-2 py-0.5 rounded">Status: Pending ({req.stage})</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleSendReminder(req.id)} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 bg-white">
                    <Bell size={16} /> Remind Admin
                  </button>
                  <button onClick={() => handleCancelRequest(req.id)} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 bg-white">
                    <Trash2 size={16} /> Cancel Request
                  </button>
                </div>
              </div>
            ))}

            {myApproved.map(req => (
              <div key={req.id} className="p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:bg-gray-50 transition-colors opacity-75">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-green-50 text-green-600 rounded-lg shrink-0"><CheckSquare size={20} /></div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text - xs font - bold px - 2 py - 0.5 rounded ${ LEAVE_TYPES[req.type as LeaveTypeKey]?.color || 'bg-gray-100' } `}>{req.type}</span>
                      <span className="font-semibold text-gray-900">{req.dateStr}</span>
                      <span className="text-sm text-gray-500">({req.isHalfDay ? req.halfType : `${ req.days } Day(s)`})</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{req.reason}</p>
                    <p className="text-xs font-medium text-green-700 bg-green-100 w-fit px-2 py-0.5 rounded flex items-center gap-1"><ShieldCheck size={12}/> Approved</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Total Team</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{employees.length}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Pending Actions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{requests.length}</p>
          </div>
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg"><Clock size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Leaves Taken</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {approvedLeaves.reduce((acc, curr) => acc + (curr.days || 1), 0)}
            </p>
          </div>
          <div className="p-3 bg-green-50 text-green-600 rounded-lg"><CheckSquare size={20} /></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setActiveTab('reports')}>
          <div>
            <p className="text-sm font-medium text-blue-600">View Analytics</p>
            <p className="text-xs text-gray-500 mt-1">Trends & Liability</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><PieChart size={20} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          
          {compRequests.length > 0 && systemConfig.allowCompLeave && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 px-1 mb-3 flex items-center gap-2"><Briefcase size={18} className="text-teal-600"/> Needs Attention (Comp Off)</h2>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
                {compRequests.map(req => (
                  <div key={req.id} className="p-4 hover:bg-gray-50 transition-colors border-l-4 border-teal-500">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{req.name}</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">Worked on: {req.dateStr} • {req.days} Day(s) Extra</p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-teal-100 text-teal-800">+ Accrual</span>
                    </div>
                    <div className="bg-gray-50/80 p-2 rounded-md border border-gray-100 mb-3 mt-2">
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                         <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />
                         <span className="italic">"{req.reason}"</span>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full mt-2">
                      <button onClick={() => handleRejectComp(req.id)} className="flex-1 inline-flex justify-center items-center px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium shadow-sm"><X size={16} className="mr-1" /> Reject</button>
                      <button onClick={() => handleApproveComp(req)} className="flex-1 inline-flex justify-center items-center px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium shadow-sm"><Check size={16} className="mr-1" /> Approve Accrual</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center px-1">
            <h2 className="text-lg font-semibold text-gray-800">Needs Attention (Leaves)</h2>
            <div className="flex gap-2">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-xs border-gray-300 border rounded-md py-1 px-2 text-gray-700 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option value="All">All Types</option>
                {Object.keys(LEAVE_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {filteredRequests.length > 1 && (
              <div className="bg-gray-50 p-2 border-b border-gray-100 flex justify-end">
                <button onClick={handleBulkApprove} className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"><CheckSquare size={14} /> Approve All Filtered</button>
              </div>
            )}
            {filteredRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Check className="mx-auto h-8 w-8 text-green-400 mb-2" />
                <p>All caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredRequests.map(req => {
                  const typeConfig = LEAVE_TYPES[req.type as LeaveTypeKey];
                  return (
                    <div key={req.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-gray-900">{req.name}</p>
                          <p className="text-xs text-gray-500 font-medium mt-0.5">
                            {req.startDate} {req.endDate && req.startDate !== req.endDate ? `to ${ req.endDate } ` : ''} • {req.isHalfDay ? `Half Day(${ req.halfType })` : `${ req.days } Day(s)`}
                          </p>
                        </div>
                        <span className={`inline - flex items - center px - 2 py - 0.5 rounded text - xs font - bold ${ typeConfig?.color } `}>{req.type}</span>
                      </div>
                      
                      <div className="bg-gray-50/80 p-2 rounded-md border border-gray-100 mb-3 mt-2">
                        <div className="flex items-start gap-1.5 text-xs text-gray-600">
                           <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />
                           <span className="italic">"{req.reason || 'No reason provided.'}"</span>
                        </div>
                        {req.document && (
                           <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium mt-1.5 pt-1.5 border-t border-gray-200"><Paperclip size={12}/> Attached: {req.document}</div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-3 uppercase tracking-wider font-bold bg-gray-100 w-fit px-2 py-1 rounded-full">
                        <span className={req.stage === 'Manager Review' ? 'text-blue-600' : ''}>L1 Manager</span>
                        <ChevronRight size={10} />
                        <span className={req.stage === 'HR Review' ? 'text-blue-600' : ''}>HR Review</span>
                      </div>

                      <div className="flex gap-2 w-full mt-2">
                        <button onClick={() => handleReject(req.id)} className="flex-1 inline-flex justify-center items-center px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium shadow-sm"><X size={16} className="mr-1" /> Reject</button>
                        <button onClick={() => handleApprove(req)} className="flex-1 inline-flex justify-center items-center px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"><Check size={16} className="mr-1" /> Approve</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-1 gap-2">
            <h2 className="text-lg font-semibold text-gray-800">Team Directory & Balances</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search team..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64" />
              </div>
              <button onClick={() => setIsAddEmployeeModalOpen(true)} className="p-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm flex items-center justify-center" title="Add New Employee"><UserPlus size={18} /></button>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 sticky top-0 border-b border-gray-100 z-10">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700">Employee</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-center">PL</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-center">CL/SL</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-center">COMP</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEmployees.map(emp => {
                    const bals = getEmpBalances(emp, systemDateStr, systemConfig);
                    return (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">{emp.name}</p>
                        <p className="text-xs text-gray-500">{emp.role}</p>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`inline - flex items - center justify - center px - 2 py - 0.5 rounded text - xs font - semibold ${ bals.PL.net <= 3 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700' } `}>{bals.PL.net.toFixed(1)} left</span>
                          <span className="text-[10px] text-gray-400 mt-1 font-medium">{bals.PL.used.toFixed(1)} / {(bals.PL.broughtForward + bals.PL.accrued).toFixed(1)} used</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`inline - flex items - center justify - center px - 2 py - 0.5 rounded text - xs font - semibold ${ bals.CL_SL.net <= 1 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700' } `}>{bals.CL_SL.net.toFixed(1)} left</span>
                          <span className="text-[10px] text-gray-400 mt-1 font-medium">{bals.CL_SL.used.toFixed(1)} / {bals.CL_SL.accrued.toFixed(1)} used</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-teal-50 text-teal-700">{bals.COMP.net.toFixed(1)} left</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                         <div className="flex items-center justify-center gap-2">
                           <button onClick={() => { setEditingEmployee({...emp}); setEditBalanceModalOpen(true); }} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Edit Balances"><Edit size={16} /></button>
                           <button onClick={() => handleRemoveEmployee(emp.id, emp.name)} className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Remove Employee"><Trash2 size={16} /></button>
                         </div>
                      </td>
                    </tr>
                  )})}
                  {filteredEmployees.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No employees found matching "{searchQuery}"</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const filteredCalendarLeaves = approvedLeaves.filter(leave => {
      if (calendarFilter === 'All') return true;
      const employee = employees.find(e => e.id === leave.empId);
      return employee && employee.role === calendarFilter;
    });

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-300">
        <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-800 w-40">{monthNames[month]} {year}</h2>
            <div className="flex gap-1">
              <button onClick={prevMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-600"><ChevronLeft size={20} /></button>
              <button onClick={nextMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-600"><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select value={calendarFilter} onChange={(e) => setCalendarFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 shadow-sm rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="All">All Departments</option>
              {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
        </div>
        
        <div className="p-4 md:p-6 overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 gap-2 md:gap-4 mb-4">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2 md:gap-3">
              {blanks.map(blank => (
                <div key={`blank - ${ blank } `} className="min-h-[100px] md:min-h-[120px] rounded-xl bg-gray-50/50 border border-transparent"></div>
              ))}
              {days.map(day => {
                const dateStr = `${ year } -${ String(month + 1).padStart(2, '0') } -${ String(day).padStart(2, '0') } `;
                const dayLeaves = filteredCalendarLeaves.filter(leave => leave.dateStr === dateStr);
                const holiday = managedHolidays.find(h => h.dateStr === dateStr);
                const isToday = systemDateStr === dateStr;

                return (
                  <div key={day} className={`min - h - [100px] md: min - h - [120px] p - 2 md: p - 3 rounded - xl border transition - all ${ holiday ? 'bg-red-50/30 border-red-100' : isToday ? 'border-blue-400 bg-blue-50/10 shadow-sm' : 'border-gray-200 hover:border-blue-300 hover:shadow-sm' } `}>
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text - sm font - semibold ${ isToday ? 'text-blue-600' : holiday ? 'text-red-500' : 'text-gray-700' } `}>{day}</span>
                      {holiday && <span className="text-[10px] font-bold text-red-500 truncate ml-1">{holiday.name}</span>}
                    </div>
                    <div className="space-y-1.5">
                      {dayLeaves.map((leave, idx) => {
                        const typeConfig = LEAVE_TYPES[leave.type as LeaveTypeKey] || { color: 'bg-gray-100 text-gray-800' };
                        return (
                          <div key={idx} className={`text - xs px - 2 py - 1 rounded - md truncate font - medium flex justify - between items - center ${ typeConfig.color } `} title={`${ leave.name } (${ LEAVE_TYPES[leave.type]?.label }) \nReason: ${ leave.reason || 'N/A' } `}>
                            <span>{leave.name.split(' ')[0]}</span>
                            {leave.isHalfDay && <span className="opacity-75 text-[10px]" title={leave.halfType || undefined}>½</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderReports = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
           <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-500"/> Dynamic Balance & Accrual Ledger
           </h3>
           <div className="flex gap-2">
             <button onClick={() => alert("CSV Export Triggered")} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"><Download size={14}/> CSV</button>
             <button onClick={() => alert("XLS Export Triggered")} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"><Download size={14}/> XLS</button>
             <button onClick={() => alert("Emailing Report...")} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"><Mail size={14}/> Email</button>
           </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-6">
           <div className="flex bg-gray-100 p-1 rounded-lg w-fit mb-6">
             <button onClick={() => setReportTab('PL')} className={`px - 5 py - 2 text - sm font - bold rounded - md transition - all ${ reportTab === 'PL' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600 hover:text-gray-900' } `}>
               Privilege Leave (PL)
             </button>
             <button onClick={() => setReportTab('CL_SL')} className={`px - 5 py - 2 text - sm font - bold rounded - md transition - all ${ reportTab === 'CL_SL' ? 'bg-white shadow-sm text-green-700' : 'text-gray-600 hover:text-gray-900' } `}>
               Casual / Sick (CL/SL)
             </button>
           </div>

           <div className="overflow-x-auto border border-gray-200 rounded-lg">
              {reportTab === 'PL' && (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Employee 
                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded">1 PL per {systemConfig.plAccrualDaysWorkedRate} Days Worked</span>
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-center border-l border-gray-200">Brought Fwd</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-center">Accrued (YTD)</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-center">Used</th>
                      <th className="px-4 py-3 font-semibold text-gray-900 text-center bg-gray-100">Net Balance</th>
                      <th className="px-4 py-3 font-semibold text-red-600 text-center border-l border-gray-200">Lapsing (EOY)</th>
                      <th className="px-4 py-3 font-semibold text-teal-600 text-center border-l border-gray-200">Future Applied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employees.map(emp => {
                      const bals = getEmpBalances(emp, systemDateStr, systemConfig);
                      
                      const futurePL = 
                        approvedLeaves.filter(l => l.empId === emp.id && l.type === 'PL' && l.dateStr > systemDateStr).reduce((sum, l) => sum + l.days, 0) +
                        requests.filter(r => r.empId === emp.id && r.type === 'PL' && r.startDate > systemDateStr).reduce((sum, r) => sum + r.days, 0);

                      const eoyTotalPLAllocated = (emp.balances.PL.broughtForward || 0) + bals.PL.eoyAccrued;
                      const eoyProjectedNetPL = eoyTotalPLAllocated - emp.balances.PL.used;
                      const finalProjectedBalance = eoyProjectedNetPL - futurePL;
                      const lapsingPL = Math.max(0, finalProjectedBalance - systemConfig.maxCarryForward);

                      return (
                        <tr key={emp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-gray-900">{emp.name}</td>
                          <td className="px-4 py-3 text-center text-gray-500 border-l border-gray-100">{bals.PL.broughtForward.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center text-blue-700 font-semibold">
                            {bals.PL.accrued.toFixed(1)}
                            <div className="text-[9px] text-gray-400 font-normal mt-0.5">{bals.ytdWorked} days worked</div>
                          </td>
                          <td className="px-4 py-3 text-center text-orange-600">{bals.PL.used.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center font-bold text-gray-900 bg-gray-50/50">{bals.PL.net.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center text-red-600 font-medium border-l border-gray-100">{lapsingPL.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center text-teal-600 font-medium border-l border-gray-100">{futurePL.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {reportTab === 'CL_SL' && (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">Employee</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-center border-l border-gray-200">Accrued (YTD)</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-center">Used</th>
                      <th className="px-4 py-3 font-semibold text-gray-900 text-center bg-gray-100">Net Balance</th>
                      <th className="px-4 py-3 font-semibold text-teal-600 text-center border-l border-gray-200">Future Applied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employees.map(emp => {
                      const bals = getEmpBalances(emp, systemDateStr, systemConfig);
                      
                      const futureCLSL = 
                        approvedLeaves.filter(l => l.empId === emp.id && ['CL', 'SL'].includes(l.type) && l.dateStr > systemDateStr).reduce((sum, l) => sum + l.days, 0) +
                        requests.filter(r => r.empId === emp.id && ['CL', 'SL'].includes(r.type) && r.startDate > systemDateStr).reduce((sum, r) => sum + r.days, 0);

                      return (
                        <tr key={emp.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-gray-900">{emp.name}</td>
                          <td className="px-4 py-3 text-center text-green-700 font-semibold border-l border-gray-100">{bals.CL_SL.accrued.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center text-orange-600">{bals.CL_SL.used.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center font-bold text-gray-900 bg-gray-50/50">{bals.CL_SL.net.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center text-teal-600 font-medium border-l border-gray-100">{futureCLSL.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
           </div>
        </div>
      </div>
    );
  };

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`w - 11 h - 6 rounded - full transition - colors relative ${ checked ? 'bg-blue-600' : 'bg-gray-200' } `}>
        <div className={`absolute top - [2px] left - [2px] bg - white border rounded - full h - 5 w - 5 transition - transform ${ checked ? 'translate-x-5 border-blue-600' : 'border-gray-300' } `}></div>
      </div>
    </label>
  );

  const renderAdminSettings = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center bg-gray-900 p-8 rounded-2xl text-white shadow-lg">
          <div>
            <h2 className="text-3xl font-bold mb-1 flex items-center gap-3">
              <Settings size={28}/> Admin Configuration
            </h2>
            <p className="text-gray-400 opacity-90">Manage leave policies, workflows, and configure system rules.</p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-100 p-6 rounded-xl shadow-sm">
           <h3 className="text-lg font-bold text-red-800 mb-2 flex items-center gap-2">
             <AlertTriangle size={20} /> Year-End Closure ({activeLeaveYear})
           </h3>
           <p className="text-sm text-red-700 mb-4">
             Perform the year-end process to freeze leave applications for <strong>{activeLeaveYear}</strong>, carry forward Privilege Leaves (up to the {systemConfig.maxCarryForward} day limit), and reset CL/SL balances. 
           </p>
           <button 
             onClick={handleYearEndClosure}
             className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors shadow-sm text-sm flex items-center gap-2"
           >
             <CheckCircle size={18} /> Execute Closure & Start {activeLeaveYear + 1}
           </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2"><Sliders size={20} className="text-blue-500"/> Leave Policy Engine</h3>
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                <div>
                  <p className="font-bold text-gray-800 text-sm">PL Accrual Rate (Days Worked)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Working days required to earn 1 PL</p>
                </div>
                <input type="number" step="1" className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-center focus:ring-2 focus:ring-blue-500 outline-none" value={systemConfig.plAccrualDaysWorkedRate} onChange={e => setSystemConfig({...systemConfig, plAccrualDaysWorkedRate: parseInt(e.target.value) || 20})} />
              </div>
              <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                <div>
                  <p className="font-bold text-gray-800 text-sm">Max Carry Forward (PL)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Maximum PL carried to next year</p>
                </div>
                <input type="number" className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-center focus:ring-2 focus:ring-blue-500 outline-none" value={systemConfig.maxCarryForward} onChange={e => setSystemConfig({...systemConfig, maxCarryForward: parseInt(e.target.value)})} />
              </div>
              <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                <div>
                  <p className="font-bold text-gray-800 text-sm">Enable Sandwich Rule (CL Only)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Count weekends if CL falls on both sides</p>
                </div>
                <ToggleSwitch checked={systemConfig.sandwichRule} onChange={e => setSystemConfig({...systemConfig, sandwichRule: e.target.checked})} />
              </div>
              <div className="flex justify-between items-center pb-2">
                <div>
                  <p className="font-bold text-gray-800 text-sm">Allow Compensatory Leave (COMP)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Employees can log extra hours for comp off</p>
                </div>
                <ToggleSwitch checked={systemConfig.allowCompLeave} onChange={e => setSystemConfig({...systemConfig, allowCompLeave: e.target.checked})} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2"><ShieldCheck size={20} className="text-green-500"/> Approval Workflow</h3>
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                <div>
                  <p className="font-bold text-gray-800 text-sm">Multi-Level Approval</p>
                  <p className="text-xs text-gray-500 mt-0.5">Require Manager AND HR approval</p>
                </div>
                <ToggleSwitch checked={systemConfig.multiLevelApproval} onChange={e => setSystemConfig({...systemConfig, multiLevelApproval: e.target.checked})} />
              </div>
              <div className="flex justify-between items-center pb-2">
                <div>
                  <p className="font-bold text-gray-800 text-sm">Auto-Approve Sick Leave</p>
                  <p className="text-xs text-gray-500 mt-0.5">Automatically approve SL if ≤ 2 days</p>
                </div>
                <ToggleSwitch checked={systemConfig.autoApproveSickLeave} onChange={e => setSystemConfig({...systemConfig, autoApproveSickLeave: e.target.checked})} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2"><CalendarIcon size={20} className="text-purple-500"/> Holiday Calendar</h3>
            <form onSubmit={handleAddHoliday} className="flex gap-2 mb-4 border-b border-gray-100 pb-4">
              <input type="text" placeholder="Holiday Name" required className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={newHoliday.name} onChange={e => setNewHoliday({...newHoliday, name: e.target.value})} />
              <input type="date" required className="w-36 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={newHoliday.dateStr} onChange={e => setNewHoliday({...newHoliday, dateStr: e.target.value})} />
              <button type="submit" className="px-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 text-sm">Add</button>
            </form>
            <div className="space-y-2.5 max-h-64 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {managedHolidays.map((h, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100 transition-colors">
                  <span className="text-sm font-bold text-gray-800">{h.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-md">{h.dateStr}</span>
                    <button onClick={() => handleRemoveHoliday(h.dateStr)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans pb-24">
      {/* Top Utility Bar - System Date Simulator */}
      <div className="bg-gray-900 text-white px-4 md:px-8 py-2 flex justify-between items-center gap-3 shadow-md relative z-10">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Active Year: {activeLeaveYear}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
             <CalendarClock size={14}/> System Date Simulator
          </span>
          <input 
            type="date" 
            value={systemDateStr}
            onChange={handleSystemDateChange}
            className="bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
          />
          <button onClick={() => setIsLoggedIn(false)} className="ml-4 text-xs font-bold text-red-400 hover:text-red-300">Sign Out</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-8">
        
        {/* Header & Navigation */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Leave Management</h1>
            <p className="text-gray-500 mt-1.5 flex items-center gap-2">
               India-compliant time-off tracking and approvals.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex bg-white shadow-sm border border-gray-200 p-1.5 rounded-xl overflow-x-auto max-w-[90vw]">
              <button onClick={() => setActiveTab('my-portal')} className={`whitespace - nowrap flex items - center gap - 2 px - 4 py - 2 text - sm font - semibold rounded - lg transition - all ${ activeTab === 'my-portal' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' } `}>
                <User size={16} /> My Portal
              </button>
              <div className="w-px bg-gray-200 mx-1 shrink-0"></div>
              <button onClick={() => setActiveTab('dashboard')} className={`whitespace - nowrap flex items - center gap - 2 px - 4 py - 2 text - sm font - semibold rounded - lg transition - all ${ activeTab === 'dashboard' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' } `}>
                <Users size={16} /> Admin
              </button>
              <button onClick={() => setActiveTab('calendar')} className={`whitespace - nowrap flex items - center gap - 2 px - 4 py - 2 text - sm font - semibold rounded - lg transition - all ${ activeTab === 'calendar' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' } `}>
                <CalendarIcon size={16} /> Calendar
              </button>
              <button onClick={() => setActiveTab('reports')} className={`whitespace - nowrap flex items - center gap - 2 px - 4 py - 2 text - sm font - semibold rounded - lg transition - all ${ activeTab === 'reports' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' } `}>
                <PieChart size={16} /> Reports
              </button>
              <div className="w-px bg-gray-200 mx-1 shrink-0"></div>
              <button onClick={() => setActiveTab('settings')} className={`whitespace - nowrap flex items - center gap - 2 px - 4 py - 2 text - sm font - semibold rounded - lg transition - all ${ activeTab === 'settings' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' } `}>
                <Settings size={16} /> Settings
              </button>
            </div>
            
            <div className="flex gap-2">
              {systemConfig.allowCompLeave && (
                <button onClick={() => setIsCompModalOpen(true)} className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-800 text-sm font-bold rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                  <Briefcase size={18} className="text-teal-600"/> Log Comp Off
                </button>
              )}
              <button onClick={() => setIsModalOpen(true)} className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
                <Plus size={18} /> Request Leave
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Content */}
        {activeTab === 'my-portal' && renderMyPortal()}
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'calendar' && renderCalendar()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'settings' && renderAdminSettings()}
        
      </div>

      {/* Advanced Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Submit Request</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmitRequest} className="p-6 space-y-4">
              
              {hasOverlap && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3 text-red-800 text-sm shadow-sm">
                  <X className="shrink-0 mt-0.5" size={16} />
                  <div><span className="font-semibold">Overlap Detected: </span>This employee already has an approved leave on these dates.</div>
                </div>
              )}

              {isSandwichRisk && !hasOverlap && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex gap-3 text-purple-800 text-sm shadow-sm">
                  <Info className="shrink-0 mt-0.5" size={16} />
                  <div><span className="font-semibold">Sandwich Rule (CL): </span>Applying for CL near a weekend will result in weekend days being counted as leave.</div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Employee</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white shadow-sm"
                  value={newRequest.empId} onChange={e => setNewRequest({...newRequest, empId: Number(e.target.value)})} required
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Leave Type</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white shadow-sm"
                  value={newRequest.type} onChange={e => setNewRequest({...newRequest, type: e.target.value as LeaveTypeKey})}
                >
                  {Object.entries(LEAVE_TYPES).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Start Date</label>
                  <input 
                    type="date" 
                    min={`${ activeLeaveYear }-01-01`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
                    value={newRequest.startDate} onChange={e => setNewRequest({...newRequest, startDate: e.target.value})} required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">End Date</label>
                  <input 
                    type="date" disabled={newRequest.isHalfDay || newRequest.type === 'COMP'}
                    min={`${ activeLeaveYear }-01-01`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-400"
                    value={newRequest.isHalfDay || newRequest.type === 'COMP' ? newRequest.startDate : newRequest.endDate} 
                    onChange={e => setNewRequest({...newRequest, endDate: e.target.value})} required={!newRequest.isHalfDay && newRequest.type !== 'COMP'}
                  />
                </div>
              </div>

              {newRequest.type !== 'COMP' && (
                <div className="bg-gray-50/80 p-3 rounded-lg border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                      <input 
                        type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                        checked={newRequest.isHalfDay}
                        onChange={e => setNewRequest({...newRequest, isHalfDay: e.target.checked})}
                      />
                      Half Day Leave
                    </label>
                    <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                       {calculatedDays} Days Taken
                    </span>
                  </div>

                  {newRequest.isHalfDay && (
                    <div className="flex gap-4 pt-2 border-t border-gray-200">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                        <input type="radio" name="halfType" value="First Half" checked={newRequest.halfType === 'First Half'} onChange={e => setNewRequest({...newRequest, halfType: e.target.value as 'First Half' | 'Second Half'})} /> First Half
                      </label>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                        <input type="radio" name="halfType" value="Second Half" checked={newRequest.halfType === 'Second Half'} onChange={e => setNewRequest({...newRequest, halfType: e.target.value as 'First Half' | 'Second Half'})} /> Second Half
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Reason / Comment</label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm resize-none"
                  rows={2} placeholder="Provide a brief reason for your leave..."
                  value={newRequest.reason} onChange={e => setNewRequest({...newRequest, reason: e.target.value})} required
                />
              </div>
              
              {/* SL Differential Treatment & Doc Upload */}
              {newRequest.type === 'SL' && (
                <div className={`border border - dashed p - 4 rounded - lg flex flex - col items - center text - center ${ calculatedDays > 2 ? 'border-orange-300 bg-orange-50/50' : 'border-gray-300 bg-gray-50/50' } `}>
                  <UploadCloud size={24} className={calculatedDays > 2 ? "text-orange-400 mb-2" : "text-gray-400 mb-2"} />
                  {calculatedDays > 2 && <p className="text-sm font-bold text-orange-800">Medical Certificate Required (&gt;2 days)</p>}
                  <label className="cursor-pointer bg-white border border-gray-200 px-3 py-1.5 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 mt-2 shadow-sm">
                    {newRequest.document ? newRequest.document : 'Choose File to Attach'}
                    <input type="file" className="hidden" onChange={e => setNewRequest({...newRequest, document: e.target.files ? e.target.files[0]?.name : null})} />
                  </label>
                </div>
              )}

              {impact && (
                 <div className="text-xs bg-blue-50 border border-blue-100 text-blue-800 p-2.5 rounded-lg flex justify-between items-center font-medium">
                   <span>{impact.poolName} Balance Impact:</span>
                   <span className="font-mono bg-white px-2 py-1 rounded shadow-sm">
                     {impact.before.toFixed(1)} &rarr; <b className={impact.after < 0 ? 'text-red-600' : 'text-blue-700'}>{impact.after.toFixed(1)} days</b>
                   </span>
                 </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
                  Cancel
                </button>
                <button 
                  type="submit" disabled={!!(hasOverlap || calculatedDays === 0 || (impact && impact.after < 0 && newRequest.type !== 'COMP'))}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {newRequest.type === 'SL' && calculatedDays <= 2 ? 'Auto-Approve' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Comp Off Request Modal */}
      {isCompModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-teal-50">
              <h3 className="text-lg font-bold text-teal-900 flex items-center gap-2"><Briefcase size={20}/> Log Extra Work (Comp Off)</h3>
              <button onClick={() => setIsCompModalOpen(false)} className="text-teal-700 hover:text-teal-900">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmitCompRequest} className="p-6 space-y-4">
              <div className="bg-teal-50/50 border border-teal-100 p-3 rounded-lg text-sm text-teal-800 mb-4">
                <Info size={16} className="inline mb-0.5 mr-1" />
                Submit dates where you worked on a weekend or company holiday. Upon approval, your Compensatory Leave (COMP) balance will increase.
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Employee</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white shadow-sm"
                  value={newCompRequest.empId} onChange={e => setNewCompRequest({...newCompRequest, empId: Number(e.target.value)})} required
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Date Worked</label>
                  <input 
                    type="date" 
                    min={`${ activeLeaveYear }-01-01`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white shadow-sm"
                    value={newCompRequest.dateStr} onChange={e => setNewCompRequest({...newCompRequest, dateStr: e.target.value})} required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Days to Accrue</label>
                  <input 
                    type="number" min="0.5" step="0.5"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white shadow-sm"
                    value={newCompRequest.days} onChange={e => setNewCompRequest({...newCompRequest, days: Number(e.target.value)})} required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Reason / Justification</label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white shadow-sm resize-none"
                  rows={2} placeholder="e.g. Worked Sunday for production server migration..."
                  value={newCompRequest.reason} onChange={e => setNewCompRequest({...newCompRequest, reason: e.target.value})} required
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsCompModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors shadow-sm"
                >
                  Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Opening Balances / Mid-Year Joiner Modal */}
      {editBalanceModalOpen && editingEmployee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Manage Leave Balances</h3>
                <p className="text-xs text-gray-500">Updating balances for {editingEmployee.name}</p>
              </div>
              <button onClick={() => setEditBalanceModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={saveEmployeeBalance} className="p-6 space-y-6">
              
              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                 <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                   <Clock size={16} /> Mid-Year Joiner Proration
                 </h4>
                 <div className="flex gap-3 items-end">
                   <div className="flex-1">
                     <label className="block text-xs font-bold text-gray-600 mb-1">Joining Month</label>
                     <select className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm outline-none" id="joinMonth">
                       {Array.from({length: 12}, (_, i) => (<option key={i+1} value={i+1}>Month {i+1}</option>))}
                     </select>
                   </div>
                   <button 
                     type="button" 
                     onClick={() => {
                       const selectEl = document.getElementById('joinMonth') as HTMLSelectElement | null;
                       if (!selectEl || !editingEmployee) return;
                       const month = parseInt(selectEl.value);
                       const monthsRemaining = 12 - month + 1; 
                       
                       // A simplified approximation for PL for mid-year joiner if we don't have exact days worked history
                       const approxDaysWorked = monthsRemaining * 22; 
                       const proratedPL = approxDaysWorked / systemConfig.plAccrualDaysWorkedRate;
                       const proratedCLSL = (systemConfig.clslTotalPerYear / 12) * monthsRemaining;
                       
                       setEditingEmployee({
                         ...editingEmployee,
                         balances: {
                           ...editingEmployee.balances,
                           PL: { ...editingEmployee.balances.PL, adjustment: proratedPL, broughtForward: 0 },
                           CL_SL: { ...editingEmployee.balances.CL_SL, adjustment: proratedCLSL }
                         }
                       });
                     }}
                     className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm"
                   >
                     Auto-Adjust Proration
                   </button>
                 </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4 border-b border-gray-100 pb-3">
                  <div className="w-24"><span className={`text - xs font - bold px - 2 py - 1 rounded ${ LEAVE_TYPES['PL'].color } `}>PL</span></div>
                  <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 mb-1 uppercase">Manual Adj.</label>
                      <input 
                        type="number" step="0.5" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                        value={editingEmployee.balances.PL.adjustment || 0}
                        onChange={e => setEditingEmployee({...editingEmployee, balances: {...editingEmployee.balances, PL: {...editingEmployee.balances.PL, adjustment: parseFloat(e.target.value) || 0}}})}
                      />
                  </div>
                  <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 mb-1 uppercase">Brought Fwd</label>
                      <input 
                        type="number" step="0.5" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                        value={editingEmployee.balances.PL.broughtForward}
                        onChange={e => setEditingEmployee({...editingEmployee, balances: {...editingEmployee.balances, PL: {...editingEmployee.balances.PL, broughtForward: parseFloat(e.target.value) || 0}}})}
                      />
                  </div>
                  <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 mb-1 uppercase">Used</label>
                      <input 
                        type="number" step="0.5" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-gray-50"
                        value={editingEmployee.balances.PL.used}
                        onChange={e => setEditingEmployee({...editingEmployee, balances: {...editingEmployee.balances, PL: {...editingEmployee.balances.PL, used: parseFloat(e.target.value) || 0}}})}
                      />
                  </div>
                </div>

                <div className="flex items-center gap-4 border-b border-gray-100 pb-3">
                  <div className="w-24"><span className={`text - xs font - bold px - 2 py - 1 rounded bg - green - 100 text - green - 800`}>CL / SL</span></div>
                  <div className="flex-[2]">
                      <label className="block text-[10px] text-gray-500 mb-1 uppercase">Manual Adj.</label>
                      <input 
                        type="number" step="0.5" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                        value={editingEmployee.balances.CL_SL.adjustment || 0}
                        onChange={e => setEditingEmployee({...editingEmployee, balances: {...editingEmployee.balances, CL_SL: {...editingEmployee.balances.CL_SL, adjustment: parseFloat(e.target.value) || 0}}})}
                      />
                  </div>
                  <div className="flex-[1]">
                      <label className="block text-[10px] text-gray-500 mb-1 uppercase">Used So Far</label>
                      <input 
                        type="number" step="0.5" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-gray-50"
                        value={editingEmployee.balances.CL_SL.used}
                        onChange={e => setEditingEmployee({...editingEmployee, balances: {...editingEmployee.balances, CL_SL: {...editingEmployee.balances.CL_SL, used: parseFloat(e.target.value) || 0}}})}
                      />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-24"><span className={`text - xs font - bold px - 2 py - 1 rounded bg - teal - 100 text - teal - 800`}>COMP</span></div>
                  <div className="flex-[2]">
                      <label className="block text-[10px] text-gray-500 mb-1 uppercase">Total Accrued</label>
                      <input 
                        type="number" step="0.5" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                        value={editingEmployee.balances.COMP.total}
                        onChange={e => setEditingEmployee({...editingEmployee, balances: {...editingEmployee.balances, COMP: {...editingEmployee.balances.COMP, total: parseFloat(e.target.value) || 0}}})}
                      />
                  </div>
                  <div className="flex-[1]">
                      <label className="block text-[10px] text-gray-500 mb-1 uppercase">Used So Far</label>
                      <input 
                        type="number" step="0.5" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-gray-50"
                        value={editingEmployee.balances.COMP.used}
                        onChange={e => setEditingEmployee({...editingEmployee, balances: {...editingEmployee.balances, COMP: {...editingEmployee.balances.COMP, used: parseFloat(e.target.value) || 0}}})}
                      />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3 border-t border-gray-100">
                <button type="button" onClick={() => setEditBalanceModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 shadow-sm">
                  Save Balances
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {isAddEmployeeModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Add New Employee</h3>
              <button onClick={() => setIsAddEmployeeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddEmployee} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Employee Name</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
                  placeholder="e.g. John Doe"
                  value={newEmployeeForm.name} 
                  onChange={e => setNewEmployeeForm({...newEmployeeForm, name: e.target.value})} 
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Department / Role</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
                  value={newEmployeeForm.role} 
                  onChange={e => setNewEmployeeForm({...newEmployeeForm, role: e.target.value})}
                >
                  {ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800 mt-2">
                <Info size={16} className="inline mb-0.5 mr-1" />
                Default dynamic accruals will be applied. You can use the "Edit" button in the directory to add a manual adjustment or prorate leaves for mid-year joiners.
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsAddEmployeeModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
                  Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm">
                  Add Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}