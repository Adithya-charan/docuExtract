
import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle, AlertCircle, Layers, 
  ChevronRight, ChevronDown, Activity, Download, Eye, 
  Code, Sun, Moon, Languages, Search, Shield, Zap, Layout,
  Clock, Trash2, ExternalLink, Dna, Brain, AlertTriangle,
  BookOpen, Gavel, List, Info, GraduationCap, MessageSquare,
  Send, X, User, Lock, Mail, Phone, Image as ImageIcon, Network, 
  LogOut, Home, CreditCard, ArrowRight, Cpu, Globe, Server, RefreshCw,
  Twitter, Github, Linkedin, Check, ChevronLeft, RotateCcw,
  BarChart3, TrendingUp, Users, DollarSign, Calendar, History
} from 'lucide-react';
import { GoogleGenAI, Chat } from "@google/genai";
import { TRANSLATIONS, SYSTEM_INSTRUCTION } from './constants';
import { AnalysisResult, HierarchyNode, ViewMode, AppState, ComplexityLevel, SectionIntent, User as UserType } from './types';

// Access PDFJS from window (loaded via CDN)
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// --- DB SERVICE (HYBRID: API + LOCALSTORAGE FALLBACK) ---
const API_BASE = 'http://localhost:3001/api';

const DBService = {
  isApiAvailable: async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { method: 'GET', signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  },

  login: async (email: string, pass: string): Promise<UserType | null> => {
    // 1. Try API
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("Backend unreachable, switching to Offline Mode.");
    }

    // 2. Fallback to LocalStorage
    const stored = localStorage.getItem('db_users');
    let users = stored ? JSON.parse(stored) : [];
    
    // Admin Backdoor (Offline)
    if (email === 'admin@docubrain.ai' && pass === 'admin123') {
       return { id: 'admin', name: 'System Admin', email, password: pass, phone: '', plan: 'enterprise', joinedAt: 0 };
    }
    
    // Seed dummy users if empty for Demo
    if (users.length === 0) {
       users = seedDummyUsers();
       localStorage.setItem('db_users', JSON.stringify(users));
    }
    return users.find((u: UserType) => u.email === email && u.password === pass) || null;
  },

  signup: async (userData: UserType): Promise<void> => {
    // 1. Try API
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      if (res.ok) return;
    } catch (e) {
      console.warn("Backend unreachable, saving locally.");
    }

    // 2. Fallback
    const stored = localStorage.getItem('db_users');
    const users = stored ? JSON.parse(stored) : [];
    if (users.find((u: UserType) => u.email === userData.email)) throw new Error("Email already exists");
    users.push({ ...userData, joinedAt: Date.now(), plan: 'free' });
    localStorage.setItem('db_users', JSON.stringify(users));
  },

  checkEmailExists: async (email: string): Promise<boolean> => {
    // Ideally API check, but for now we rely on signup failure or local check
    const stored = localStorage.getItem('db_users');
    const users = stored ? JSON.parse(stored) : [];
    return !!users.find((u: UserType) => u.email === email);
  },

  getStats: async () => {
    // 1. Try API
    try {
      const res = await fetch(`${API_BASE}/admin/stats`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("Backend unreachable, generating local stats.");
    }

    // 2. Fallback
    const stored = localStorage.getItem('db_users');
    let users = stored ? JSON.parse(stored) : [];
    if (users.length === 0) { users = seedDummyUsers(); localStorage.setItem('db_users', JSON.stringify(users)); }
    
    const proUsers = users.filter((u: any) => u.plan === 'pro').length;
    const entUsers = users.filter((u: any) => u.plan === 'enterprise').length;
    const revenue = (proUsers * 29) + (entUsers * 99); 
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    
    return {
       totalUsers: users.length,
       totalLogs: Math.floor(users.length * 12.5),
       subscriptions: proUsers + entUsers,
       monthlyIncome: revenue,
       revenueHistory: months.map((m, i) => ({ label: m, value: revenue * (0.8 + (i * 0.1)) + Math.random() * 500 })),
       userGrowth: [12, 19, 35, 52, 68, users.length],
       recentUsers: users.slice(-5).reverse()
    };
  },

  saveAnalysis: async (analysis: AnalysisResult, userId?: string) => {
    // 1. Try API
    try {
        await fetch(`${API_BASE}/analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...analysis, userId })
        });
    } catch (e) {} // Fail silently if offline

    // 2. Fallback (Local History)
    const saved = localStorage.getItem('docubrain_history');
    let history = saved ? JSON.parse(saved) : [];
    history = [analysis, ...history.filter((h: any) => h.id !== analysis.id)].slice(0, 10);
    localStorage.setItem('docubrain_history', JSON.stringify(history));
  },

  getHistory: async (userId?: string): Promise<AnalysisResult[]> => {
      // 1. Try API
      try {
          const res = await fetch(`${API_BASE}/analysis/history?userId=${userId}`);
          if (res.ok) return await res.json();
      } catch (e) {}

      // 2. Fallback
      const saved = localStorage.getItem('docubrain_history');
      return saved ? JSON.parse(saved) : [];
  }
};

// Helper for seeding data if LocalStorage is empty
const seedDummyUsers = () => {
    return Array.from({length: 24}, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i+1}`,
        email: `user${i+1}@example.com`,
        password: 'password',
        phone: '1234567890',
        plan: (i % 3 === 0 ? 'pro' : i % 5 === 0 ? 'enterprise' : 'free') as 'pro' | 'enterprise' | 'free',
        joinedAt: Date.now() - Math.floor(Math.random() * 10000000000)
    }));
};

// --- HELPER FOR TRANSLATIONS ---
const getText = (lang: string, key: string) => {
  const dict = (TRANSLATIONS as any)[lang] || (TRANSLATIONS as any)['en'];
  return dict[key] || (TRANSLATIONS as any)['en'][key] || key;
};

// --- CHART COMPONENTS (SVG) ---
const AreaChart = ({ data, color = "#3b82f6" }: { data: number[], color?: string }) => {
   const max = Math.max(...data);
   const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d / max) * 100;
      return `${x},${y}`;
   }).join(' ');

   return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
         <defs>
            <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
               <stop offset="0%" stopColor={color} stopOpacity={0.2} />
               <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
         </defs>
         <path d={`M0,100 ${points.split(' ').map(p => 'L' + p).join(' ')} L100,100 Z`} fill={`url(#grad-${color})`} />
         <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
         {data.map((d, i) => (
            <circle key={i} cx={(i / (data.length - 1)) * 100} cy={100 - (d / max) * 100} r="1.5" fill="white" stroke={color} strokeWidth="1" />
         ))}
      </svg>
   );
};

const BarChart = ({ data }: { data: { label: string, value: number }[] }) => {
   if (!data || data.length === 0) return null;
   const max = Math.max(...data.map(d => d.value));
   return (
      <div className="flex items-end justify-between h-full w-full gap-2">
         {data.map((d, i) => (
            <div key={i} className="flex flex-col items-center flex-1 h-full justify-end group cursor-pointer">
               <div className="w-full bg-blue-100 dark:bg-blue-900/30 rounded-t-sm relative transition-all hover:bg-blue-200 dark:hover:bg-blue-800" style={{ height: `${(d.value / max) * 100}%` }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                     ${d.value.toFixed(0)}
                  </div>
               </div>
               <span className="text-[10px] mt-2 opacity-50">{d.label}</span>
            </div>
         ))}
      </div>
   );
};

// --- CAPTCHA COMPONENT ---
const Captcha = ({ onValidate }: { onValidate: (isValid: boolean) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [captchaText, setCaptchaText] = useState('');
  const [userInput, setUserInput] = useState('');

  const generateCaptcha = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let text = '';
    for (let i = 0; i < 6; i++) text += chars[Math.floor(Math.random() * chars.length)];
    setCaptchaText(text);
    drawCaptcha(text);
    setUserInput('');
    onValidate(false);
  };

  const drawCaptcha = (text: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 50; i++) {
      ctx.strokeStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},0.5)`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.stroke();
    }

    ctx.font = '30px Courier New';
    ctx.fillStyle = '#374151';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.4);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  useEffect(() => { generateCaptcha(); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUserInput(val);
    if (val.toUpperCase() === captchaText) onValidate(true);
    else onValidate(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <canvas ref={canvasRef} width={160} height={60} className="rounded border bg-gray-100 cursor-pointer" onClick={generateCaptcha} title="Click to refresh" />
        <button type="button" onClick={generateCaptcha} className="p-2 text-gray-500 hover:text-blue-500"><Activity className="w-5 h-5"/></button>
      </div>
      <input 
        type="text" 
        value={userInput} 
        onChange={handleChange} 
        placeholder="Enter Captcha" 
        className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
      />
    </div>
  );
};

// --- WHITE THEME COMPONENTS ---

const Navbar = ({ onNavigate, onOpenModal, lang, setLang }: { onNavigate?: (p: string) => void, onOpenModal?: (m: string) => void, lang: string, setLang: (l: string) => void }) => (
  <nav className="w-full bg-white/95 border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md shadow-sm">
    <div 
      className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => onNavigate && onNavigate('home')}
    >
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
        <Layers className="text-white w-5 h-5" />
      </div>
      <span className="text-xl font-bold text-slate-900 tracking-tight">Docu<span className="text-blue-600">Extract</span></span>
    </div>

    <div className="hidden md:flex items-center space-x-8">
      <button onClick={() => onNavigate && onNavigate('features')} className="text-slate-600 hover:text-blue-600 text-sm font-medium transition-colors">{getText(lang, 'navFeatures')}</button>
      <button onClick={() => onNavigate && onNavigate('security')} className="text-slate-600 hover:text-blue-600 text-sm font-medium transition-colors">{getText(lang, 'navSecurity')}</button>
      <button onClick={() => onOpenModal && onOpenModal('pricing')} className="text-slate-600 hover:text-blue-600 text-sm font-medium transition-colors">{getText(lang, 'navPricing')}</button>
      <button onClick={() => onOpenModal && onOpenModal('about')} className="text-slate-600 hover:text-blue-600 text-sm font-medium transition-colors">{getText(lang, 'navAbout')}</button>
    </div>
    <div className="flex items-center space-x-4">
      {/* Language Selector */}
      <div className="flex items-center border border-slate-200 rounded-lg px-2 bg-slate-50">
         <Globe className="w-4 h-4 mr-1 text-slate-500"/>
         <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-transparent text-sm py-1 outline-none text-slate-600 cursor-pointer">
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="zh">中文</option>
            <option value="ko">한국어</option>
            <option value="te">తెలుగు</option>
            <option value="ta">தமிழ்</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
         </select>
      </div>

      <button onClick={() => onOpenModal && onOpenModal('login')} className="text-slate-600 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors hidden sm:block">{getText(lang, 'navLogin')}</button>
      <button onClick={() => onOpenModal && onOpenModal('signup')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95">{getText(lang, 'navSignup')}</button>
    </div>
  </nav>
);

const Footer = ({ onNavigate, lang }: { onNavigate?: (p: string) => void, lang: string }) => (
  <footer className="bg-slate-50 border-t border-slate-200 pt-16 pb-8 text-slate-500 text-sm">
    <div className="container mx-auto px-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
        <div className="col-span-2 lg:col-span-2">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Layers className="text-white w-4 h-4" />
            </div>
            <span className="text-lg font-bold text-slate-900">Docu<span className="text-blue-600">Extract</span></span>
          </div>
          <p className="mb-6 max-w-sm leading-relaxed text-slate-500">
            {getText(lang, 'footerDesc')}
          </p>
          <div className="flex space-x-4">
            <a href="#" className="p-2 bg-white border border-slate-200 rounded-full hover:bg-blue-50 hover:border-blue-200 transition-colors"><Twitter className="w-4 h-4 text-blue-500" /></a>
            <a href="#" className="p-2 bg-white border border-slate-200 rounded-full hover:bg-blue-50 hover:border-blue-200 transition-colors"><Github className="w-4 h-4 text-blue-500" /></a>
            <a href="#" className="p-2 bg-white border border-slate-200 rounded-full hover:bg-blue-50 hover:border-blue-200 transition-colors"><Linkedin className="w-4 h-4 text-blue-500" /></a>
          </div>
        </div>
        
        <div>
          <h4 className="font-bold text-slate-900 mb-4">{getText(lang, 'prod')}</h4>
          <ul className="space-y-2">
            <li><button onClick={() => onNavigate && onNavigate('features')} className="hover:text-blue-600 transition-colors">{getText(lang, 'navFeatures')}</button></li>
            <li><button className="hover:text-blue-600 transition-colors">Integrations</button></li>
            <li><button onClick={() => onNavigate && onNavigate('security')} className="hover:text-blue-600 transition-colors">{getText(lang, 'navSecurity')}</button></li>
          </ul>
        </div>

        <div>
           <h4 className="font-bold text-slate-900 mb-4">{getText(lang, 'res')}</h4>
           <ul className="space-y-2">
              <li><button className="hover:text-blue-600 transition-colors">Documentation</button></li>
              <li><button className="hover:text-blue-600 transition-colors">API Reference</button></li>
           </ul>
        </div>

        <div>
           <h4 className="font-bold text-slate-900 mb-4">{getText(lang, 'legal')}</h4>
           <ul className="space-y-2">
              <li><button className="hover:text-blue-600 transition-colors">Privacy</button></li>
              <li><button className="hover:text-blue-600 transition-colors">Terms</button></li>
           </ul>
        </div>
      </div>
      
      <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row justify-between items-center">
        <p>&copy; 2024 DocuExtract Inc.</p>
        <div className="flex items-center space-x-6 mt-4 md:mt-0">
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
            <span className="text-emerald-600 font-medium">{getText(lang, 'sysOp')}</span>
          </div>
        </div>
      </div>
    </div>
  </footer>
);

const LandingPage = ({ onNavigate, onOpenModal, onStart, lang, setLang }: { onNavigate: (page: string) => void, onOpenModal: (modal: string) => void, onStart: () => void, lang: string, setLang: (l: string) => void }) => {
  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-900 font-sans w-full overflow-y-auto">
      <Navbar onNavigate={onNavigate} onOpenModal={onOpenModal} lang={lang} setLang={setLang} />
      <main className="flex-grow">
        {/* Hero Section */}
        <div id="hero" className="flex flex-col items-center justify-center py-24 px-4 text-center bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative">
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
          <div className="relative z-10 max-w-5xl mx-auto">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-medium mb-8 animate-in slide-in-from-top-4 duration-700 shadow-sm">
              <span className="flex w-2 h-2 bg-blue-600 rounded-full mr-2 animate-pulse"></span>
              {getText(lang, 'heroBadge')}
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-slate-900 mb-8 leading-tight tracking-tight animate-in slide-in-from-bottom-4 duration-700 delay-100">
              {getText(lang, 'heroTitle1')}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-600">{getText(lang, 'heroTitle2')}</span>
            </h1>
            <p className="text-slate-600 text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed animate-in slide-in-from-bottom-4 duration-700 delay-200">
              {getText(lang, 'heroDesc')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 animate-in slide-in-from-bottom-4 duration-700 delay-300">
              <button 
                onClick={onStart}
                className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg transition-all transform hover:scale-105 shadow-xl shadow-blue-500/30 flex items-center justify-center"
              >
                {getText(lang, 'btnStart')} <ArrowRight className="ml-2 w-5 h-5" />
              </button>
              <button 
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg font-bold text-lg transition-all shadow-md flex items-center justify-center"
              >
                <Code className="mr-2 w-5 h-5 text-slate-500" /> {getText(lang, 'btnApi')}
              </button>
            </div>
          </div>
        </div>

        <div className="py-10 bg-slate-50 border-y border-slate-200 overflow-hidden">
           <div className="container mx-auto px-4">
              <p className="text-center text-slate-400 text-sm font-semibold uppercase tracking-wider mb-8">{getText(lang, 'trustedBy')}</p>
              <div className="flex flex-wrap justify-center gap-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
                 {['Acme Corp', 'GlobalBank', 'HealthPlus', 'LegalTech', 'AuditAI'].map((company) => (
                    <div key={company} className="flex items-center space-x-2 text-xl font-bold text-slate-800">
                       <div className="w-6 h-6 bg-slate-400 rounded-full"></div>
                       <span>{company}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        <div id="features" className="py-24 bg-white">
           <div className="container mx-auto px-6">
              <div className="text-center mb-16">
                 <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">{getText(lang, 'whyTitle')}</h2>
                 <p className="text-slate-600 max-w-2xl mx-auto">{getText(lang, 'whyDesc')}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 {[
                    { icon: Layers, title: getText(lang, 'featHierarchy'), desc: getText(lang, 'featHierarchyDesc') },
                    { icon: Cpu, title: getText(lang, 'featLayout'), desc: getText(lang, 'featLayoutDesc') },
                    { icon: Code, title: getText(lang, 'featJson'), desc: getText(lang, 'featJsonDesc') },
                    { icon: Globe, title: "Multi-Language", desc: "Support for over 40 languages including CJK characters and right-to-left scripts." },
                    { icon: Server, title: "On-Premise Capable", desc: "Deploy via Docker containers in your own VPC for complete data sovereignty." },
                    { icon: RefreshCw, title: "Real-time Sync", desc: "Process documents synchronously via API or asynchronously via webhooks for high-volume pipelines." }
                 ].map((feature, idx) => (
                    <div key={idx} className="p-8 rounded-2xl bg-white border border-slate-200 hover:border-blue-500 hover:shadow-lg transition-all group">
                       <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors duration-300">
                          <feature.icon className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                       </div>
                       <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                       <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        <div id="security" className="py-24 bg-slate-50 relative overflow-hidden">
           <div className="container mx-auto px-6 relative z-10">
              <div className="flex flex-col lg:flex-row items-center gap-16">
                 <div className="lg:w-1/2">
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mb-6">
                       <Shield className="w-3 h-3 mr-2" /> {getText(lang, 'secBadge')}
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">{getText(lang, 'secTitle')}</h2>
                    <p className="text-slate-600 text-lg mb-8 leading-relaxed">{getText(lang, 'secDesc')}</p>
                    <ul className="space-y-4">
                       {[getText(lang, 'secItem1'), getText(lang, 'secItem2'), getText(lang, 'secItem3')].map((item, i) => (
                          <li key={i} className="flex items-center text-slate-700">
                             <Check className="w-5 h-5 text-emerald-500 mr-3" />
                             {item}
                          </li>
                       ))}
                    </ul>
                 </div>
                 <div className="lg:w-1/2">
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xl">
                       <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
                          <h4 className="font-mono text-sm text-slate-500">Security Audit Log</h4>
                          <div className="flex space-x-2">
                             <div className="w-3 h-3 rounded-full bg-red-400"></div>
                             <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                             <div className="w-3 h-3 rounded-full bg-green-400"></div>
                          </div>
                       </div>
                       <div className="space-y-4 font-mono text-xs">
                          <div className="flex justify-between text-emerald-600">
                             <span>GET /v1/extract/health</span>
                             <span>200 OK</span>
                          </div>
                          <div className="flex justify-between text-blue-600">
                             <span>POST /v1/extract (TLS 1.3)</span>
                             <span>Processing...</span>
                          </div>
                          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded text-emerald-700">
                             Encryption check passed. Data isolated in ephemeral container.
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="py-24 bg-blue-600 text-center px-4">
           <h2 className="text-3xl md:text-5xl font-bold text-white mb-8">{getText(lang, 'ctaTitle')}</h2>
           <p className="text-blue-100 text-lg max-w-2xl mx-auto mb-10">{getText(lang, 'ctaDesc')}</p>
           <button 
              onClick={onStart}
              className="px-10 py-4 bg-white text-blue-600 hover:bg-blue-50 rounded-lg font-bold text-lg transition-colors shadow-xl"
           >
              {getText(lang, 'ctaBtn')}
           </button>
           <p className="mt-6 text-blue-200 text-sm">{getText(lang, 'ctaNote')}</p>
        </div>

      </main>
      <Footer onNavigate={onNavigate} lang={lang} />
    </div>
  );
};

// --- ADMIN DASHBOARD ---
const AdminDashboard = ({ onLogout }: { onLogout: () => void }) => {
   const [stats, setStats] = useState<any>(null);

   useEffect(() => {
     const fetchStats = async () => {
        const data = await DBService.getStats();
        setStats(data);
     };
     fetchStats();
     const interval = setInterval(fetchStats, 5000);
     return () => clearInterval(interval);
   }, []);

   if (!stats) return <div className="flex h-screen items-center justify-center bg-slate-50">Loading Admin Stats...</div>;

   return (
     <div className="min-h-screen bg-slate-50 p-8 w-full overflow-y-auto">
        <div className="max-w-7xl mx-auto">
           {/* Header */}
           <div className="flex justify-between items-center mb-8">
              <div>
                 <h1 className="text-3xl font-bold text-slate-900">Admin Console</h1>
                 <p className="text-slate-500">Real-time system overview (Connected to {stats.recentUsers.some((u: any) => u.id.startsWith('user-')) ? 'Mock DB' : 'MongoDB'})</p>
              </div>
              <button onClick={onLogout} className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-red-500 font-medium shadow-sm transition-colors">
                 <LogOut className="w-4 h-4 mr-2" /> Logout
              </button>
           </div>

           {/* KPI Cards */}
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[
                { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Total Logs", value: stats.totalLogs, icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
                { label: "Active Subs", value: stats.subscriptions, icon: CreditCard, color: "text-green-600", bg: "bg-green-50" },
                { label: "Monthly Revenue", value: `$${stats.monthlyIncome}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" }
              ].map((card, i) => (
                <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                   <div className="flex items-center justify-between mb-4">
                      <div className={`p-3 rounded-lg ${card.bg}`}>
                         <card.icon className={`w-6 h-6 ${card.color}`} />
                      </div>
                   </div>
                   <h3 className="text-3xl font-bold text-slate-900 mb-1">{card.value}</h3>
                   <p className="text-sm text-slate-500">{card.label}</p>
                </div>
              ))}
           </div>

           {/* Charts Section */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Revenue Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                 <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-slate-900">Revenue Overview</h3>
                 </div>
                 <div className="h-64">
                    <BarChart data={stats.revenueHistory} />
                 </div>
              </div>

              {/* User Growth Chart */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                 <h3 className="font-bold text-lg mb-6 text-slate-900">User Growth</h3>
                 <div className="h-48 mb-4">
                    <AreaChart data={stats.userGrowth} color="#8b5cf6" />
                 </div>
              </div>
           </div>

           {/* Recent Users Table */}
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                 <h3 className="font-bold text-lg text-slate-900">Recent Registrations</h3>
              </div>
              <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                       <th className="p-4 font-medium">User</th>
                       <th className="p-4 font-medium">Plan</th>
                       <th className="p-4 font-medium">Status</th>
                    </tr>
                 </thead>
                 <tbody className="text-sm divide-y divide-slate-100">
                    {stats.recentUsers.map((user: UserType) => (
                       <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                             <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                                   {user.name.charAt(0)}
                                </div>
                                <div>
                                   <div className="font-bold text-slate-900">{user.name}</div>
                                   <div className="text-xs text-slate-500">{user.email}</div>
                                </div>
                             </div>
                          </td>
                          <td className="p-4">
                             <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                user.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                                user.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-600'
                             }`}>
                                {user.plan || 'Free'}
                             </span>
                          </td>
                          <td className="p-4">
                             <span className="flex items-center text-green-600 text-xs font-bold">
                                <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></div> Active
                             </span>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
     </div>
   );
};

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState('en');
  const [user, setUser] = useState<UserType | null>(null);
  const [appState, setAppState] = useState<AppState>('landing');
  
  // Auth Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  
  const [signupData, setSignupData] = useState({ name: '', email: '', phone: '', password: '' });
  const [signupStep, setSignupStep] = useState<'details' | 'otp'>('details');
  const [otpInput, setOtpInput] = useState('');
  const [demoOtp, setDemoOtp] = useState('');

  const [captchaValid, setCaptchaValid] = useState(false);
  
  // Analysis State
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  
  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);

  // Initial Load
  useEffect(() => {
    const init = async () => {
        const savedUser = localStorage.getItem('docubrain_user');
        if (savedUser) {
          const u = JSON.parse(savedUser);
          setUser(u);
          if (u.id === 'admin') setAppState('admin');
          else {
              setAppState('upload');
              // Fetch history from DB
              const hist = await DBService.getHistory(u.id);
              setHistory(hist);
          }
        }
    };
    init();
  }, []);

  // Update Chat System Instruction when Language Changes
  useEffect(() => {
    if (chatSession && currentAnalysis) {
       const langName = getLanguageName(language);
       chatSession.sendMessage({ message: `[SYSTEM UPDATE] The user has switched the interface language to ${langName}. Please respond to all future messages in ${langName}.` })
       .catch(e => console.error("Failed to update chat language", e));
    }
  }, [language]);

  const t = (key: string) => getText(language, key);
  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  
  const getLanguageName = (code: string) => {
    switch(code) {
      case 'hi': return "Hindi";
      case 'zh': return "Chinese (Simplified)";
      case 'ko': return "Korean";
      case 'te': return "Telugu";
      case 'ta': return "Tamil";
      case 'de': return "German";
      case 'ja': return "Japanese";
      default: return "English";
    }
  }

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  const loadHistoryItem = (item: AnalysisResult) => {
    setCurrentAnalysis(item);
    if(item.hierarchy.length > 0) setSelectedNode(item.hierarchy[0]);
    setAppState('dashboard');
  }

  const downloadJson = () => {
     if(!currentAnalysis) return;
     const blob = new Blob([JSON.stringify(currentAnalysis, null, 2)], {type: 'application/json'});
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${currentAnalysis.fileName}.json`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
  }

  // --- AUTH ACTIONS ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaValid) { alert("Invalid Captcha"); return; }
    
    // Check for Admin
    if (loginEmail === 'admin@docubrain.ai' && loginPass === 'admin123') {
       const adminUser: UserType = { id: 'admin', name: 'System Admin', email: loginEmail, password: '', phone: '', plan: 'enterprise' };
       setUser(adminUser);
       localStorage.setItem('docubrain_user', JSON.stringify(adminUser));
       setAppState('admin');
       return;
    }

    const validUser = await DBService.login(loginEmail, loginPass);
    if (validUser) {
      setUser(validUser);
      localStorage.setItem('docubrain_user', JSON.stringify(validUser));
      setAppState('upload');
      // Load history
      const hist = await DBService.getHistory(validUser.id);
      setHistory(hist);
    } else {
      alert("Invalid credentials. Try: user1@example.com / password");
    }
  };

  const initiateSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaValid) { alert("Invalid Captcha"); return; }
    
    if (signupData.email.toLowerCase() === 'admin@docubrain.ai') {
       alert("Cannot register as Admin. Please use the demo credentials.");
       return;
    }

    const exists = await DBService.checkEmailExists(signupData.email);
    if (exists) {
       alert("Email already exists");
       return;
    }
    
    // Generate Demo OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setDemoOtp(code);
    setSignupStep('otp');
  };

  const finalizeSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpInput !== demoOtp) {
       alert("Invalid OTP");
       return;
    }
    try {
      const newUser = { id: crypto.randomUUID(), ...signupData, plan: 'free' };
      await DBService.signup(newUser as any);
      alert("Account created successfully! Please login.");
      setAppState('login');
      setSignupStep('details');
      setSignupData({ name: '', email: '', phone: '', password: '' });
      setOtpInput('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('docubrain_user');
    setAppState('landing');
    setCurrentAnalysis(null);
  };

  const handleSendResetLink = (e: React.FormEvent) => {
    e.preventDefault();
    if(forgotEmail) {
      alert(`If an account exists for ${forgotEmail}, a password reset link has been sent.`);
      setAppState('login');
    }
  };

  // --- ANALYSIS LOGIC ---
  const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise as string, mimeType: file.type },
    };
  };

  const startProcessing = async () => {
    if (!file) return;
    
    // RESET STATE
    setCurrentAnalysis(null);
    setSelectedNode(null);
    setChatSession(null);
    setChatMessages([]);
    setAppState('processing');
    setProgress(0);
    setLogs([]);
    addLog('Initializing NeuroCore Engine...');

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY is not configured. Please check your .env file.');
      }
      const ai = new GoogleGenAI({ apiKey });
      let promptContent: any = "";
      
      if (file.type === 'application/pdf') {
         // PDF Processing
         const arrayBuffer = await file.arrayBuffer();
         const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
         let fullText = '';
         for (let i = 1; i <= pdf.numPages; i++) {
            setProgress(Math.round((i / pdf.numPages) * 30));
            addLog(`Scanning page ${i}/${pdf.numPages}...`);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `\n--- Page ${i} ---\n${pageText}`;
         }
         promptContent = fullText;
      } else if (file.type.startsWith('image/')) {
         addLog('Processing Image Data...');
         setProgress(20);
         promptContent = [
            { text: "Analyze this image and extract the document structure." },
            await fileToGenerativePart(file)
         ];
      }

      addLog('Connecting to NeuroCore AI...');
      setProgress(50);
      
      const targetLanguage = getLanguageName(language);
      const refinedSystemInstruction = SYSTEM_INSTRUCTION.replace("{{LANGUAGE}}", targetLanguage).replace("{{LANGUAGE}}", targetLanguage);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptContent,
        config: {
          systemInstruction: refinedSystemInstruction,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      addLog('Decoding DNA Structure...');
      setProgress(80);
      
      let jsonResponse;
      try {
        let cleanedText = response.text.trim();
        // Strip Markdown JSON formatting if present (```json { ... } ```)
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        // Also handle plain ``` markers
        cleanedText = cleanedText.replace(/^```\s*/i, '').replace(/\s*```$/, '');
        jsonResponse = JSON.parse(cleanedText);
      } catch (e) {
        const errorMsg = `Failed to parse AI response: ${e instanceof Error ? e.message : 'Unknown error'}. Raw response: ${response.text.substring(0, 200)}`;
        addLog(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const newAnalysis: AnalysisResult = {
        id: crypto.randomUUID(),
        fileName: file.name,
        timestamp: Date.now(),
        hierarchy: jsonResponse.hierarchy || [],
        summary: jsonResponse.summary || "No summary available.",
        qualityScore: jsonResponse.qualityScore || 85,
        issues: jsonResponse.issues || [],
        metadata: {
          confidence: jsonResponse.metadata?.confidence || 0.8,
          language: language,
          pages: 1,
          processingTime: 0,
          tablesDetected: 0,
          dnaSequence: "DNA-" + crypto.randomUUID().substring(0,8),
          fileType: file.type.includes('pdf') ? 'pdf' : 'image'
        }
      };

      // INIT CHAT SESSION WITH LANGUAGE CONTEXT
      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { 
          systemInstruction: `You are a helpful assistant analyzing a document. 
          The user's preferred language is ${targetLanguage}. 
          ALWAYS answer in ${targetLanguage}.
          Use the provided document context to answer questions.` 
        }
      });
      const contextMsg = typeof promptContent === 'string' ? promptContent : "Image context loaded.";
      await chat.sendMessage({ message: `Document Context:\n${contextMsg.substring(0, 30000)}` });
      
      setChatSession(chat);
      setCurrentAnalysis(newAnalysis);
      
      // SAVE TO DB (Async)
      if (user) await DBService.saveAnalysis(newAnalysis, user.id);
      const hist = await DBService.getHistory(user?.id);
      setHistory(hist);
      
      if (newAnalysis.hierarchy.length > 0) setSelectedNode(newAnalysis.hierarchy[0]);

      setProgress(100);
      setTimeout(() => setAppState('dashboard'), 500);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Analysis Error:', error);
      addLog(`❌ Analysis Failed: ${errorMsg}`);
      alert(`Analysis failed: ${errorMsg}\n\nPlease check your API key, file format, or network connection.`);
      setAppState('upload');
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !chatSession) return;
    const msg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setIsChatLoading(true);
    try {
      const result = await chatSession.sendMessage({ message: msg });
      setChatMessages(prev => [...prev, { role: 'model', text: result.text || "I couldn't generate a response." }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'model', text: "Error communicating with AI." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // --- NOTEBOOK STYLE MIND MAP ---
  const MindMap = ({ nodes }: { nodes: HierarchyNode[] }) => {
    return (
      <div className="flex flex-col items-center justify-start p-10 min-w-[800px] bg-slate-50 min-h-full">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 mb-12 max-w-2xl w-full text-center relative z-10">
           <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white p-2 rounded-full shadow-md">
             <BookOpen className="w-5 h-5"/>
           </div>
           <h2 className="text-2xl font-bold mb-2 text-slate-900">{currentAnalysis?.fileName}</h2>
           <p className="text-sm opacity-60 text-slate-500">{t('docRoot')} • {nodes.length} {t('primarySections')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
          {nodes.map(node => (
            <div key={node.id} className={`
               group relative bg-white p-5 rounded-lg border border-slate-200 
               hover:shadow-xl hover:border-blue-400 transition-all duration-300 cursor-pointer
               flex flex-col h-full
               ${selectedNode?.id === node.id ? 'ring-2 ring-blue-500' : ''}
            `} onClick={() => setSelectedNode(node)}>
               <div className="flex items-start justify-between mb-3">
                 <div className="bg-blue-50 text-blue-600 p-1.5 rounded text-xs font-bold uppercase tracking-wider">
                    {node.intent || t('section')}
                 </div>
                 {node.complexity && (
                   <div className={`w-2 h-2 rounded-full ${
                     node.complexity === 'high' ? 'bg-red-500' : node.complexity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                   }`} title={`Complexity: ${node.complexity}`} />
                 )}
               </div>
               
               <h3 className="font-bold text-lg mb-2 leading-tight group-hover:text-blue-600 text-slate-900">{node.heading}</h3>
               <p className="text-sm opacity-60 line-clamp-3 mb-4 flex-1 text-slate-600">{node.nodeSummary || node.content}</p>
               
               {node.children && node.children.length > 0 && (
                 <div className="mt-auto pt-3 border-t border-slate-100">
                    <div className="text-xs font-medium text-slate-400 mb-2 flex items-center">
                       <Network className="w-3 h-3 mr-1"/> {node.children.length} {t('subPoints')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                       {node.children.slice(0, 3).map(child => (
                          <span key={child.id} className="text-[10px] px-2 py-1 bg-slate-100 rounded-full truncate max-w-[100px] text-slate-600">
                            {child.heading}
                          </span>
                       ))}
                       {node.children.length > 3 && <span className="text-[10px] px-2 py-1 bg-slate-100 rounded-full text-slate-600">+{node.children.length - 3}</span>}
                    </div>
                 </div>
               )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- CONDITIONAL NAVBAR FOR INTERNAL APP ---
  const renderNavbar = () => {
    if (appState === 'landing' || appState === 'admin') return null; 
    
    return (
      <header className={`h-16 border-b flex items-center justify-between px-6 shadow-sm z-30 sticky top-0 bg-white border-gray-200`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setAppState('landing')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
             <Layers className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight hidden md:block text-slate-900">Docu<span className="text-blue-600">Extract</span></span>
        </div>
        
        {appState === 'dashboard' && (
           <div className="hidden md:flex items-center">
             <button onClick={() => setAppState('upload')} className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors text-sm">
                <RotateCcw className="w-4 h-4" /> {t('newScan')}
             </button>
           </div>
        )}
        
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
             <button onClick={() => setAppState('upload')} className="hover:text-blue-600">{t('navHome')}</button>
             <button onClick={() => setAppState('pricing')} className="hover:text-blue-600">{t('navPricing')}</button>
          </nav>

          <div className="flex items-center gap-3">
             <div className="flex items-center border border-slate-200 rounded-lg px-2 bg-slate-50">
                 <Languages className="w-4 h-4 mr-1 opacity-50 text-slate-500"/>
                 <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-transparent text-xs py-1 outline-none text-slate-600">
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="zh">Chinese</option>
                    <option value="ko">Korean</option>
                    <option value="te">Telugu</option>
                    <option value="ta">Tamil</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                 </select>
             </div>
             
             {/* Hidden Dark Mode Toggle for "Simple White" requirement, logic kept if needed later */}
             {/* <button onClick={toggleTheme} ... /> */}

             {user ? (
               <div className="flex items-center gap-3 ml-2">
                 <div className="text-right hidden sm:block">
                   <p className="text-xs font-bold text-slate-900">{user.name}</p>
                   <p className="text-[10px] opacity-60 text-slate-500">Pro Plan</p>
                 </div>
                 <button onClick={handleLogout} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100" title={t('navLogout')}>
                    <LogOut className="w-4 h-4" />
                 </button>
               </div>
             ) : (
               <div className="flex gap-2 ml-2">
                 <button onClick={() => setAppState('login')} className="px-4 py-2 text-sm font-medium hover:bg-slate-100 rounded-lg text-slate-700">{t('navLogin')}</button>
                 <button onClick={() => setAppState('signup')} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t('navSignup')}</button>
               </div>
             )}
          </div>
        </div>
      </header>
    );
  };

  return (
    <div className={`h-screen w-full flex flex-col font-sans transition-colors duration-300 bg-slate-50 text-slate-900`}>
      
      {renderNavbar()}

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden relative">

        {/* ADMIN DASHBOARD */}
        {appState === 'admin' && <AdminDashboard onLogout={handleLogout} />}
        
        {/* LANDING PAGE */}
        {appState === 'landing' && (
           <LandingPage 
             onNavigate={(page) => { if(page === 'features') document.getElementById('features')?.scrollIntoView({behavior: 'smooth'}) }} 
             onOpenModal={(modal) => setAppState(modal as AppState)}
             onStart={() => setAppState('signup')}
             lang={language}
             setLang={setLanguage}
           />
        )}

        {/* PRICING PAGE */}
        {appState === 'pricing' && (
           <div className="w-full overflow-y-auto p-10 flex flex-col items-center bg-white">
              <h2 className="text-3xl font-bold mb-10 text-slate-900">{t('navPricing')}</h2>
              <div className="grid md:grid-cols-3 gap-8 max-w-6xl w-full">
                 {[
                   { title: "Starter", price: "$0", features: ["5 Docs/mo", "Basic Analysis", "PDF Only"] },
                   { title: "Pro", price: "$29", features: ["Unlimited Docs", "Image Support", "Mind Maps", "Chat AI"], highlight: true },
                   { title: "Enterprise", price: "Custom", features: ["API Access", "Team Seats", "SSO"] }
                 ].map((plan, i) => (
                    <div key={i} className={`p-8 rounded-2xl border flex flex-col ${plan.highlight ? 'border-blue-500 ring-2 ring-blue-500/20 relative bg-white' : 'bg-white border-slate-200'}`}>
                       {plan.highlight && <span className="absolute top-0 right-0 bg-blue-500 text-white text-xs px-3 py-1 rounded-bl-lg rounded-tr-lg font-bold">POPULAR</span>}
                       <h3 className="text-xl font-bold mb-2 text-slate-900">{plan.title}</h3>
                       <div className="text-4xl font-extrabold mb-6 text-slate-900">{plan.price}</div>
                       <ul className="flex-1 space-y-3 mb-8">
                          {plan.features.map(f => <li key={f} className="flex gap-2 text-sm text-slate-600"><CheckCircle className="w-4 h-4 text-green-500"/> {f}</li>)}
                       </ul>
                       <button className={`w-full py-2 rounded-lg font-bold ${plan.highlight ? 'bg-blue-600 text-white' : 'border border-gray-300 text-slate-700'}`}>Choose Plan</button>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* FORGOT PASSWORD PAGE */}
        {appState === 'forgot-password' && (
           <div className="w-full flex items-center justify-center p-4 bg-slate-50">
             <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl border relative bg-white border-gray-100`}>
                <button onClick={() => setAppState('login')} className="absolute top-4 left-4 text-gray-400 hover:text-gray-900">
                   <ChevronLeft className="w-6 h-6"/>
                </button>
                <h2 className="text-2xl font-bold mb-2 text-center text-slate-900">{t('forgotTitle')}</h2>
                <p className="text-center text-sm opacity-60 mb-6 text-slate-500">{t('forgotDesc')}</p>
                <form onSubmit={handleSendResetLink} className="space-y-4">
                   <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">{t('labelEmail')}</label>
                      <div className="flex items-center border rounded-lg px-3 py-2 bg-transparent border-slate-200">
                         <Mail className="w-4 h-4 opacity-50 mr-2 text-slate-500"/>
                         <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required className="flex-1 bg-transparent outline-none text-slate-900" placeholder="name@example.com"/>
                      </div>
                   </div>
                   <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition">{t('btnSendLink')}</button>
                </form>
                <button onClick={() => setAppState('login')} className="w-full mt-4 text-sm text-center text-blue-600 hover:underline">{t('btnBackLogin')}</button>
             </div>
           </div>
        )}

        {/* LOGIN PAGE */}
        {appState === 'login' && (
          <div className="w-full flex items-center justify-center p-4 bg-slate-50">
             <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl border bg-white border-gray-100`}>
                <h2 className="text-2xl font-bold mb-6 text-center text-slate-900">{t('loginTitle')}</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                   <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">{t('labelEmail')}</label>
                      <div className="flex items-center border rounded-lg px-3 py-2 bg-transparent border-slate-200">
                         <Mail className="w-4 h-4 opacity-50 mr-2 text-slate-500"/>
                         <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required className="flex-1 bg-transparent outline-none text-slate-900" placeholder="name@example.com"/>
                      </div>
                   </div>
                   <div className="space-y-2">
                      <div className="flex justify-between items-center">
                         <label className="text-sm font-medium text-slate-700">{t('labelPass')}</label>
                         <button type="button" onClick={() => setAppState('forgot-password')} className="text-xs text-blue-600 hover:underline">{t('forgotPass')}</button>
                      </div>
                      <div className="flex items-center border rounded-lg px-3 py-2 bg-transparent border-slate-200">
                         <Lock className="w-4 h-4 opacity-50 mr-2 text-slate-500"/>
                         <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} required className="flex-1 bg-transparent outline-none text-slate-900" placeholder="••••••••"/>
                      </div>
                   </div>
                   <div className="pt-2">
                      <label className="text-sm font-medium mb-1 block text-slate-700">{t('secCheck')}</label>
                      <Captcha onValidate={setCaptchaValid} />
                   </div>
                   <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition">{t('btnSignIn')}</button>
                </form>
                <p className="text-center mt-4 text-sm opacity-70 text-slate-500">{t('noAcc')} <button onClick={() => setAppState('signup')} className="text-blue-600 font-bold hover:underline">{t('navSignup')}</button></p>
                
                {/* DEMO CREDENTIALS HINT */}
                <div className="mt-8 p-4 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200">
                  <p className="font-bold mb-2">Demo Credentials (Offline):</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="font-semibold block text-blue-600 mb-1">User View:</span>
                      user1@example.com<br/>password
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="font-semibold block text-purple-600 mb-1">Admin View:</span>
                      admin@docubrain.ai<br/>admin123
                    </div>
                  </div>
                </div>

             </div>
          </div>
        )}

        {/* SIGNUP PAGE */}
        {appState === 'signup' && (
          <div className="w-full flex items-center justify-center p-4 overflow-y-auto bg-slate-50">
             <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl border my-auto bg-white border-gray-100`}>
                {signupStep === 'details' ? (
                   <>
                      <h2 className="text-2xl font-bold mb-6 text-center text-slate-900">{t('signupTitle')}</h2>
                      <form onSubmit={initiateSignup} className="space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">{t('labelName')}</label>
                              <div className="flex items-center border rounded-lg px-3 py-2 bg-transparent border-slate-200">
                                 <User className="w-4 h-4 opacity-50 mr-2 text-slate-500"/>
                                 <input type="text" value={signupData.name} onChange={e => setSignupData({...signupData, name: e.target.value})} required className="flex-1 bg-transparent outline-none text-slate-900"/>
                              </div>
                           </div>
                           <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">{t('labelPhone')}</label>
                              <div className="flex items-center border rounded-lg px-3 py-2 bg-transparent border-slate-200">
                                 <Phone className="w-4 h-4 opacity-50 mr-2 text-slate-500"/>
                                 <input type="tel" value={signupData.phone} onChange={e => setSignupData({...signupData, phone: e.target.value})} required className="flex-1 bg-transparent outline-none text-slate-900"/>
                              </div>
                           </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">{t('labelEmail')}</label>
                            <div className="flex items-center border rounded-lg px-3 py-2 bg-transparent border-slate-200">
                               <Mail className="w-4 h-4 opacity-50 mr-2 text-slate-500"/>
                               <input type="email" value={signupData.email} onChange={e => setSignupData({...signupData, email: e.target.value})} required className="flex-1 bg-transparent outline-none text-slate-900"/>
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">{t('labelPass')}</label>
                            <div className="flex items-center border rounded-lg px-3 py-2 bg-transparent border-slate-200">
                               <Lock className="w-4 h-4 opacity-50 mr-2 text-slate-500"/>
                               <input type="password" value={signupData.password} onChange={e => setSignupData({...signupData, password: e.target.value})} required className="flex-1 bg-transparent outline-none text-slate-900"/>
                            </div>
                         </div>
                         <div className="pt-2">
                            <label className="text-sm font-medium mb-1 block text-slate-700">{t('secCheck')}</label>
                            <Captcha onValidate={setCaptchaValid} />
                         </div>
                         <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition">{t('btnNext')}</button>
                      </form>
                      <p className="text-center mt-4 text-sm opacity-70 text-slate-500">{t('haveAcc')} <button onClick={() => setAppState('login')} className="text-blue-600 font-bold hover:underline">{t('navLogin')}</button></p>
                   </>
                ) : (
                   <>
                      <button onClick={() => setSignupStep('details')} className="mb-4 text-gray-500 hover:text-blue-600 flex items-center text-sm">
                         <ChevronLeft className="w-4 h-4 mr-1"/> Back
                      </button>
                      <h2 className="text-2xl font-bold mb-2 text-center text-slate-900">{t('labelOtp')}</h2>
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6 text-center text-blue-800">
                         <p className="text-sm mb-1">{t('otpSent')}</p>
                         <p className="text-3xl font-mono font-bold tracking-widest">{demoOtp}</p>
                      </div>
                      <form onSubmit={finalizeSignup} className="space-y-6">
                         <div className="space-y-2">
                            <input 
                              type="text" 
                              value={otpInput} 
                              onChange={e => setOtpInput(e.target.value)} 
                              required 
                              placeholder="Enter 6-digit code"
                              className="w-full text-center text-2xl tracking-widest py-3 border rounded-lg bg-transparent outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                            />
                         </div>
                         <button type="submit" className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition flex items-center justify-center">
                            <Check className="w-5 h-5 mr-2"/> {t('btnVerify')}
                         </button>
                      </form>
                   </>
                )}
             </div>
          </div>
        )}

        {/* UPLOAD PAGE */}
        {appState === 'upload' && (
           <div className="w-full h-full flex flex-col items-center justify-center p-8 relative bg-slate-50">
              <div className="text-center mb-10 max-w-2xl">
                 <h2 className="text-3xl font-bold mb-4 text-slate-900">{t('uploadTitle')}</h2>
                 <p className="opacity-70 text-slate-600">Supports PDF, PNG, JPG. Max file size 10MB.</p>
              </div>
              <div className={`w-full max-w-2xl h-80 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center relative hover:scale-[1.01] transition border-gray-300 bg-white shadow-xl`}>
                 <Upload className="w-12 h-12 text-blue-600 mb-4" />
                 <p className="mb-6 opacity-60 text-slate-600">{t('dragDrop')}</p>
                 <label className="px-8 py-3 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 font-bold shadow-lg">
                    {t('browse')}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="application/pdf,image/png,image/jpeg,image/jpg" 
                      onChange={(e) => setFile(e.target.files?.[0] || null)} 
                    />
                 </label>
              </div>
              {file && (
                <div className={`mt-6 flex items-center gap-4 p-4 rounded-xl border w-full max-w-2xl bg-white border-slate-200 shadow-sm`}>
                   <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                      {file.type.includes('pdf') ? <FileText/> : <ImageIcon/>}
                   </div>
                   <div className="flex-1">
                      <p className="font-bold text-slate-900">{file.name}</p>
                      <p className="text-xs opacity-50 text-slate-500">{(file.size/1024/1024).toFixed(2)} MB</p>
                   </div>
                   <button onClick={startProcessing} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold">{t('start')}</button>
                </div>
              )}
              {history.length > 0 && (
                <div className="absolute bottom-8 left-0 w-full flex justify-center">
                   <div className={`flex gap-2 p-2 rounded-lg border shadow-sm bg-white border-slate-200`}>
                      {history.slice(0,3).map(h => (
                         <button key={h.id} onClick={() => loadHistoryItem(h)} className="px-4 py-2 text-xs rounded hover:bg-slate-100 flex items-center gap-2 text-slate-600">
                            <Clock className="w-3 h-3"/> {h.fileName}
                         </button>
                      ))}
                   </div>
                </div>
              )}
           </div>
        )}

        {/* PROCESSING PAGE */}
        {appState === 'processing' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-50">
             <div className="w-full max-w-xl text-center">
                <div className="mb-6 inline-block p-4 rounded-full bg-blue-50 animate-bounce">
                   <Brain className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold mb-2 text-slate-900">{t('processing')}</h2>
                <p className="opacity-60 mb-8 text-slate-600">{t('processingDesc')}</p>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden mb-8">
                   <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
                <div className={`h-48 overflow-y-auto text-left font-mono text-sm p-4 rounded-lg border bg-white border-slate-200 text-slate-600`}>
                   {logs.map((log, i) => <div key={i}>{log}</div>)}
                </div>
             </div>
          </div>
        )}

        {/* DASHBOARD PAGE */}
        {appState === 'dashboard' && currentAnalysis && (
          <div className="flex w-full h-full bg-slate-50">
             {/* SIDEBAR */}
             <aside className={`w-72 border-r flex flex-col overflow-hidden bg-white border-slate-200`}>
                
                {/* Structure Tree Section */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="p-4 border-b border-slate-100 opacity-70 text-xs font-bold tracking-wider flex items-center text-slate-500">
                     <Layers className="w-3 h-3 mr-2"/> {t('structureTree')}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                     {currentAnalysis.hierarchy.map(node => (
                        <div key={node.id} onClick={() => setSelectedNode(node)} className={`
                           p-2 mb-1 rounded cursor-pointer text-sm truncate hover:bg-slate-100 transition-colors
                           ${selectedNode?.id === node.id ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-700'}
                        `}>
                           {node.heading}
                        </div>
                     ))}
                  </div>
                </div>

                {/* History Section */}
                <div className={`border-t border-slate-200 max-h-40 overflow-y-auto bg-slate-50`}>
                   <div className="p-3 text-xs font-bold tracking-wider flex items-center text-slate-500 uppercase sticky top-0 bg-slate-50 z-10">
                     <History className="w-3 h-3 mr-2"/> {t('history')}
                   </div>
                   <div className="px-2 pb-2 space-y-1">
                      {history.map(item => (
                         <div key={item.id} onClick={() => loadHistoryItem(item)} className="p-2 text-xs rounded hover:bg-slate-200 cursor-pointer truncate flex items-center text-slate-600">
                            <FileText className="w-3 h-3 mr-2 opacity-50"/> {item.fileName}
                         </div>
                      ))}
                   </div>
                </div>

                {/* Document Health Section */}
                <div className={`border-t border-slate-200 p-4 bg-slate-50`}>
                   <div className="text-xs font-bold tracking-wider mb-3 flex items-center text-slate-500 uppercase">
                     <Activity className="w-3 h-3 mr-2"/> {t('healthReport')}
                   </div>
                   
                   {/* Score */}
                   <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-slate-700">{t('score')}</span>
                      <span className={`text-lg font-bold ${
                         currentAnalysis.qualityScore > 80 ? 'text-green-600' : 
                         currentAnalysis.qualityScore > 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                         {currentAnalysis.qualityScore}%
                      </span>
                   </div>
                   <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-4">
                      <div className={`h-full ${
                         currentAnalysis.qualityScore > 80 ? 'bg-green-500' : 
                         currentAnalysis.qualityScore > 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`} style={{ width: `${currentAnalysis.qualityScore}%` }}></div>
                   </div>

                   {/* Issues */}
                   {currentAnalysis.issues && currentAnalysis.issues.length > 0 && (
                     <div className="space-y-2">
                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('issuesFound')}</p>
                        <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                           {currentAnalysis.issues.map((issue, idx) => (
                              <div key={idx} className="flex items-start text-xs text-red-600">
                                 <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0"/>
                                 <span>{issue}</span>
                              </div>
                           ))}
                        </div>
                     </div>
                   )}
                </div>
             </aside>

             {/* MAIN VIEW */}
             <div className="flex-1 flex flex-col bg-slate-50">
                <div className={`h-14 border-b flex items-center justify-between px-6 bg-white border-slate-200`}>
                   <div className="flex gap-4 h-full">
                      {[
                        {id: 'visual', icon: Eye, label: t('visualPreview')},
                        {id: 'mindmap', icon: Network, label: t('mindmap')},
                        {id: 'chat', icon: MessageSquare, label: t('chat')},
                        {id: 'json', icon: Code, label: t('rawJson')}
                      ].map(tab => (
                        <button key={tab.id} onClick={() => setViewMode(tab.id as ViewMode)} className={`
                           flex items-center gap-2 h-full border-b-2 px-2 text-sm font-medium transition
                           ${viewMode === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}
                        `}>
                           <tab.icon className="w-4 h-4"/> {tab.label}
                        </button>
                      ))}
                   </div>
                   {viewMode === 'json' && (
                      <button onClick={downloadJson} className="flex items-center text-xs font-medium bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 transition">
                         <Download className="w-3 h-3 mr-2"/> {t('download')}
                      </button>
                   )}
                </div>

                <div className={`flex-1 overflow-auto flex justify-center bg-slate-50`}>
                   {viewMode === 'visual' && (
                      <div className={`max-w-3xl w-full p-10 shadow-lg rounded-sm min-h-[800px] my-8 bg-white border border-slate-200`}>
                         <h1 className="text-3xl font-bold mb-4 text-slate-900">{currentAnalysis.fileName}</h1>
                         <div className="p-4 bg-blue-50 border-l-4 border-blue-500 mb-8 rounded-r">
                            <p className="text-sm leading-relaxed text-slate-700">{currentAnalysis.summary}</p>
                         </div>
                         {currentAnalysis.hierarchy.map(node => (
                            <div key={node.id} className="mb-6">
                               <h2 className={`font-bold mb-2 text-slate-800 ${node.level === 1 ? 'text-xl' : 'text-lg opacity-80'}`}>{node.heading}</h2>
                               <p className="text-slate-600 leading-relaxed text-sm">{node.content}</p>
                            </div>
                         ))}
                      </div>
                   )}
                   
                   {viewMode === 'mindmap' && (
                      <div className="w-full h-full overflow-auto flex items-start justify-center pt-8">
                         <MindMap nodes={currentAnalysis.hierarchy} />
                      </div>
                   )}

                   {viewMode === 'chat' && (
                      <div className="w-full max-w-2xl flex flex-col h-[calc(100vh-100px)] my-4 rounded-xl border overflow-hidden bg-white shadow-xl border-slate-200">
                         <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2 text-slate-800">
                               <MessageSquare className="w-4 h-4 text-blue-600"/> 
                               {t('chat')}
                            </h3>
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                               {getLanguageName(language)} Mode
                            </span>
                         </div>
                         <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
                            {chatMessages.length === 0 && (
                              <div className="text-center opacity-40 mt-10 text-slate-500">
                                <Brain className="w-12 h-12 mx-auto mb-2"/>
                                <p>{t('askAbout')} {getLanguageName(language)}.</p>
                              </div>
                            )}
                            {chatMessages.map((m, i) => (
                               <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 shadow-sm rounded-bl-none'}`}>
                                     {m.text}
                                  </div>
                               </div>
                            ))}
                            {isChatLoading && (
                              <div className="flex items-center gap-2 text-xs opacity-50 ml-2">
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-150"></div>
                              </div>
                            )}
                         </div>
                         <div className="p-3 border-t bg-white flex gap-2">
                            <input 
                              className="flex-1 bg-transparent outline-none px-2 text-slate-800" 
                              placeholder={`${t('askAbout')} ${getLanguageName(language)}...`} 
                              value={chatInput} 
                              onChange={e => setChatInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            />
                            <button onClick={handleSendMessage} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={isChatLoading}><Send className="w-4 h-4"/></button>
                         </div>
                      </div>
                   )}

                   {viewMode === 'json' && (
                      <pre className="w-full max-w-4xl p-4 bg-slate-900 text-green-400 rounded-lg overflow-auto text-xs m-8 shadow-2xl">
                         {JSON.stringify(currentAnalysis, null, 2)}
                      </pre>
                   )}
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
