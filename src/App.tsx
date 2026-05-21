import React, { useState, useEffect, FormEvent } from 'react';
import { 
  Server, 
  Shield, 
  Clock, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Copy, 
  ExternalLink, 
  Search, 
  Lock, 
  LogOut, 
  Trash2, 
  UserCheck, 
  AlertOctagon, 
  HelpCircle,
  Hash,
  ChevronDown,
  RefreshCw,
  Filter,
  Check,
  Code
} from 'lucide-react';
import { ClaimStatus, ClaimRequest, AdminLog, SystemStats } from './types';

// Helper to calculate a client-side device fingerprint
function getDeviceFingerprint(): string {
  try {
    const data = [
      navigator.userAgent,
      navigator.language,
      window.screen.width + 'x' + window.screen.height,
      window.screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.hardwareConcurrency || 'unknown'
    ].join('|');
    
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return 'FPR_' + Math.abs(hash).toString(36).toUpperCase();
  } catch (e) {
    return 'FPR_UNKNOWN_' + Math.floor(100000 + Math.random() * 900000);
  }
}

export default function App() {
  // Navigation & Page State
  const [view, setView] = useState<string>('home'); // home, claim, success, duplicate, terms, admin-login, admin-dashboard
  
  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // User Form & Fingerprint States
  const [form, setForm] = useState({ name: '', email: '', discordId: '' });
  const [fingerprint, setFingerprint] = useState('');
  const [eligibility, setEligibility] = useState<{
    eligible: boolean;
    blocked: boolean;
    existing?: boolean;
    claim?: ClaimRequest;
    reason?: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Completed Claim State
  const [claimResult, setClaimResult] = useState<ClaimRequest | null>(null);

  // Admin States
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState<string | null>(localStorage.getItem('hdx_admin_token'));
  const [adminStats, setAdminStats] = useState<SystemStats | null>(null);
  const [adminClaims, setAdminClaims] = useState<ClaimRequest[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null); // Detail view tracker
  const [adminLoading, setAdminLoading] = useState(false);

  // Accordion active index for FAQs
  const [faqIndex, setFaqIndex] = useState<number | null>(null);

  // Interactive self-lookup manual checker on Homepage or error views
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<ClaimRequest | null>(null);
  const [lookupError, setLookupError] = useState('');

  // Auto-detect fingerprint on mount and check eligibility
  useEffect(() => {
    const fPrint = getDeviceFingerprint();
    setFingerprint(fPrint);
    checkClientEligibility(fPrint);

    // Watch for simple URL hash router to ease admin access
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#admin') {
        const token = localStorage.getItem('hdx_admin_token');
        if (token) {
          setView('admin-dashboard');
          fetchAdminData(token);
        } else {
          setView('admin-login');
        }
      } else if (hash === '#terms') {
        setView('terms');
      } else if (hash === '#home') {
        setView('home');
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash(); // Initial run

    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Show customized modern alerts/toasts
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // Eligibility check API call
  const checkClientEligibility = async (fPrint: string) => {
    setIsChecking(true);
    try {
      const res = await fetch(`/api/claim-check?fingerprint=${fPrint}`);
      const data = await res.json();
      setEligibility(data);

      if (data.existing && data.claim) {
        setClaimResult(data.claim);
      }
    } catch (e) {
      console.error('Failed to check claim status from server.', e);
    } finally {
      setIsChecking(false);
    }
  };

  // Manual Check Trigger
  const triggerEligibilityRefresh = () => {
    if (fingerprint) {
      checkClientEligibility(fingerprint);
      showToast('Status refreshed against absolute server rules.', 'info');
    }
  };

  // Handle Free Claim Submission
  const handleClaimSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.discordId) {
      showToast('All fields are requested to generate a valid allocation.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/claim-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          fingerprint
        })
      });

      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Server rejected claim creation.', 'error');
        // Handle direct duplicate mapping
        if (data.claim) {
          setClaimResult(data.claim);
          setView('duplicate');
        }
        return;
      }

      setClaimResult(data.claim);
      showToast('Claim code generated and signed successfully!', 'success');
      setView('success');
      
      // Update local eligibility state so UI locks
      if (data.claim) {
        setEligibility({
          eligible: false,
          blocked: false,
          existing: true,
          claim: data.claim,
          reason: "You have already claimed a free server from this device or IP."
        });
      }
    } catch (err) {
      showToast('Connection difficulty. Please retry server request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin Authorization Checks and Data Fetch
  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Invalid credentials', 'error');
        return;
      }

      localStorage.setItem('hdx_admin_token', data.token);
      setAdminToken(data.token);
      showToast('Authorized access granted.', 'success');
      setView('admin-dashboard');
      fetchAdminData(data.token);
    } catch (err) {
      showToast('Admin server unreachable.', 'error');
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}` 
        }
      });
    } catch(e){}
    localStorage.removeItem('hdx_admin_token');
    setAdminToken(null);
    setView('home');
    showToast('Secure admin session terminated.', 'info');
  };

  // Fetch all operations in one call
  const fetchAdminData = async (token: string) => {
    setAdminLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [statsRes, claimsRes, logsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch(`/api/admin/claims?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`, { headers }),
        fetch('/api/admin/logs', { headers })
      ]);

      if (statsRes.status === 401 || claimsRes.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('hdx_admin_token');
        setAdminToken(null);
        setView('admin-login');
        showToast('Admin session expired. Please re-authenticate.', 'error');
        return;
      }

      const stats = await statsRes.json();
      const claims = await claimsRes.json();
      const logs = await logsRes.json();

      setAdminStats(stats);
      setAdminClaims(claims);
      setAdminLogs(logs);
    } catch (err) {
      showToast('Error syncing administrative data.', 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  // Run admin fetch when filters, searches or views alter
  useEffect(() => {
    if (adminToken && view === 'admin-dashboard') {
      fetchAdminData(adminToken);
    }
  }, [searchQuery, statusFilter, view]);

  // Handle specific admin action requests
  const runAdminAction = async (payload: {
    action: 'approve' | 'reject' | 'mark-used' | 'delete' | 'block-ip' | 'block-fingerprint';
    claimId?: string;
    blockIpValue?: string;
    blockFingerprintValue?: string;
  }) => {
    if (!adminToken) return;

    try {
      const response = await fetch('/api/admin/claim-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Operation failed', 'error');
        return;
      }

      showToast(data.message || 'Database update acknowledged successfully.', 'success');
      // Trigger update
      fetchAdminData(adminToken);
      if (payload.claimId && activeClaimId === payload.claimId) {
        // Update detail panel locally if action was on it
        const updated = adminClaims.find(c => c.id === payload.claimId);
        if (updated) {
          if (payload.action === 'delete') {
            setActiveClaimId(null);
          }
        }
      }
    } catch (err) {
      showToast('Network error during administration write.', 'error');
    }
  };

  // Standard interactive look up function
  const handleLookupSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLookupError('');
    setLookupResult(null);

    if (!lookupEmail.trim()) {
      setLookupError('Enter an email address to lookup claims.');
      return;
    }

    // Direct endpoint simulation or query locally via admin? No - security requires only matching current device or search
    // Since we want public lookups to be secure, let's fetch matching IP/fingerprint details or matching item
    // In our backend we have specific code validation, let's look at all claims that match current user's locally checked status.
    if (claimResult && claimResult.email.toLowerCase() === lookupEmail.toLowerCase().trim()) {
      setLookupResult(claimResult);
    } else {
      setLookupError('No matching active claim found for this device associated with that email.');
    }
  };

  // Copy code helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Code copied to clipboard!', 'success');
  };

  // Helper for status badge styling
  const getStatusBadge = (status: ClaimStatus | string) => {
    switch (status) {
      case ClaimStatus.APPROVED:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            <CheckCircle className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case ClaimStatus.REJECTED:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case ClaimStatus.USED:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
            <Server className="w-3.5 h-3.5" /> Server Claimed
          </span>
        );
      case ClaimStatus.PENDING:
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
            <Clock className="w-3.5 h-3.5" /> Pending Verification
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-slate-100 font-sans selection:bg-brand-blue/30 selection:text-white flex flex-col relative overflow-x-hidden">
      
      {/* Absolute Decorative Glow Stars */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand-blue/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Global Simple Toast */}
      {toast && (
        <div id="toast-notification" className="fixed bottom-6 right-6 z-50 animate-slide-in">
          <div className={`p-4 rounded-xl shadow-2xl flex items-center gap-3 border text-sm max-w-md ${
            toast.type === 'success' ? 'bg-slate-900 border-emerald-500/30 text-emerald-400' :
            toast.type === 'error' ? 'bg-slate-900 border-rose-500/30 text-rose-400' :
            'bg-slate-900 border-brand-blue/30 text-brand-blue'
          }`}>
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 shrink-0" />}
            {toast.type === 'error' && <AlertOctagon className="w-5 h-5 shrink-0" />}
            {toast.type === 'info' && <Shield className="w-5 h-5 shrink-0" />}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Modern High-End Top Navigation Rail */}
      <header id="main-header" className="sticky top-0 z-40 border-b border-white/5 bg-dark-bg/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div 
            id="brand-logo" 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setView('home')}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-blue to-brand-purple flex items-center justify-center font-bold text-white shadow-lg shadow-brand-blue/20 group-hover:scale-105 transition-transform">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <span className="font-display font-bold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                HDX <span className="text-brand-blue">Cloud</span>
              </span>
              <p className="text-[10px] text-slate-500 tracking-wider font-mono -mt-0.5">FREE HOSTINGCLAIM</p>
            </div>
          </div>

          {/* Nav Items */}
          <nav id="nav-navigation" className="hidden md:flex items-center gap-1">
            <button 
              id="nav-link-home"
              onClick={() => setView('home')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'home' ? 'text-brand-blue bg-white/5' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              Overview
            </button>
            <button 
              id="nav-link-terms"
              onClick={() => setView('terms')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'terms' ? 'text-brand-blue bg-white/5' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              Anti-Abuse Policy
            </button>
            
            {claimResult && (
              <button 
                id="nav-link-mycode"
                onClick={() => setView('success')}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-emerald-400 hover:bg-emerald-500/5 transition-colors flex items-center gap-1 text-emerald-400`}
              >
                <Check className="w-4 h-4" /> My Active Code
              </button>
            )}

            {/* Quick Diagnostic Checker on header */}
            <span className="h-4 w-px bg-white/10 mx-2"></span>

            {adminToken ? (
              <button 
                id="nav-link-admin-panel"
                onClick={() => setView('admin-dashboard')}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-purple/10 text-brand-purple border border-brand-purple/20 hover:bg-brand-purple/20 transition-colors flex items-center gap-1.5"
              >
                <Shield className="w-4 h-4" /> Admin Console
              </button>
            ) : (
              <button 
                id="nav-link-admin-login"
                onClick={() => setView('admin-login')}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Admin Area
              </button>
            )}
          </nav>

          {/* Quick info chip regarding device */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex flex-col items-end text-right">
              <span className="text-[10px] text-slate-500 font-mono">YOUR RECOGNIZED SIGNATURE</span>
              <span className="text-xs font-mono text-brand-blue font-semibold">{fingerprint || "Extracting..."}</span>
            </div>
            
            <button
              onClick={triggerEligibilityRefresh}
              className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-white/10 active:scale-95 transition-all text-slate-400 hover:text-white"
              title="Refresh security configuration"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin text-brand-blue' : ''}`} />
            </button>

            {/* Mobile Nav Menu Indicator */}
            <div className="md:hidden flex items-center">
              <button 
                onClick={() => setView(view === 'admin-dashboard' || view === 'admin-login' ? 'home' : 'admin-login')}
                className="p-2 rounded-lg bg-slate-800 text-xs text-brand-blue border border-brand-blue/20"
              >
                {adminToken ? 'Dashboard' : 'Admin'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-12 w-full flex flex-col justify-center">
        
        {/* VIEW 1: HOME PAGE */}
        {view === 'home' && (
          <div id="home-view" className="space-y-20 animate-fade-in">
            
            {/* HERO HERO BANNER */}
            <div className="text-center max-w-4xl mx-auto space-y-6 mt-6">
              
              {/* Highlight badge tag */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-xs uppercase font-semibold tracking-wider">
                <Shield className="w-3.5 h-3.5" /> High Performance Secure Sandbox Sandbox Environment
              </div>

              <h1 className="font-display font-extrabold text-4xl sm:text-6xl tracking-tight leading-tight text-white">
                Claim Your <span className="bg-gradient-to-r from-brand-blue to-brand-purple bg-clip-text text-transparent">Free Hosting Server</span> in Seconds
              </h1>

              <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto font-light leading-relaxed">
                Deploy cloud instance codes immediately. Verify your unique hardware allocation, generate your single claim code, and kickstart your sandboxed developer machine with HDX Cloud.
              </p>

              {/* Call-to-Action Grid Card block */}
              <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                
                {eligibility?.blocked ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 max-w-md text-sm text-left">
                    <p className="font-bold flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 shrink-0" /> Local Allocation Blacklisted
                    </p>
                    <p>{eligibility.reason}</p>
                  </div>
                ) : eligibility?.existing && eligibility?.claim ? (
                  <div className="space-y-4 max-w-md w-full">
                    <div className="p-5 rounded-2xl glass-effect border-brand-blue/20 text-left">
                      <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest block mb-1">CLAIM DETECTED</span>
                      <p className="text-sm text-slate-300 mb-3">You already have an existing code issued for this workstation.</p>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-white/5 font-mono text-brand-blue font-bold text-lg">
                        <span>{eligibility.claim.code}</span>
                        <button 
                          onClick={() => copyToClipboard(eligibility.claim!.code)}
                          className="p-1.5 rounded bg-slate-900 border border-white/10 hover:border-brand-blue/40 text-slate-400 hover:text-white"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Status:</span>
                        {getStatusBadge(eligibility.claim.status)}
                      </div>
                    </div>
                    <button 
                      onClick={() => setView('success')}
                      className="w-full h-14 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center gap-2 border border-white/10 transition-colors"
                    >
                      View Code Details & Launch Checklist <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button 
                    id="hero-cta-get-code"
                    onClick={() => setView('claim')}
                    disabled={isChecking}
                    className="h-16 px-10 rounded-xl bg-gradient-to-r from-brand-blue to-brand-purple text-white font-bold text-lg hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-brand-blue/25 hover:shadow-brand-purple/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    Get Free Server Code
                    <Server className="w-5 h-5 animate-pulse" />
                  </button>
                )}

                <button 
                  onClick={() => setView('terms')}
                  className="h-16 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-sm border border-white/5 transition-colors flex items-center justify-center"
                >
                  Analyze Policy Rules
                </button>
              </div>

              {/* Status information warning */}
              <div className="pt-2 text-xs text-slate-500 font-mono flex items-center justify-center gap-4">
                <span>SYSTEM REGISTRATION: <strong className="text-emerald-400">ONLINE</strong></span>
                <span>•</span>
                <span>FINGERPRINT VALUE: <strong className="text-brand-blue">{fingerprint || "CALCULATING"}</strong></span>
              </div>
            </div>

            {/* TRUST BADGES SECTION */}
            <div id="trust-badges" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="p-6 rounded-2xl glass-effect glass-glow-blue space-y-3 hover:translate-y-[-2px] transition-transform">
                <div className="w-12 h-12 rounded-xl bg-brand-blue/15 text-brand-blue flex items-center justify-center">
                  <Hash className="w-6 h-6" />
                </div>
                <h3 className="font-display font-semibold text-white text-lg">Instant Code</h3>
                <p className="text-sm text-slate-400">
                  Unique 8-digit secure code generated algorithmically directly inside database tables instantly.
                </p>
              </div>

              <div className="p-6 rounded-2xl glass-effect space-y-3 hover:translate-y-[-2px] transition-transform">
                <div className="w-12 h-12 rounded-xl bg-brand-purple/15 text-brand-purple flex items-center justify-center">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h3 className="font-display font-semibold text-white text-lg">One Claim per User</h3>
                <p className="text-sm text-slate-400">
                  Hardware fingerprints combined with standard remote network tracking isolate duplicates.
                </p>
              </div>

              <div className="p-6 rounded-2xl glass-effect space-y-3 hover:translate-y-[-2px] transition-transform">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="font-display font-semibold text-white text-lg">Admin Verified</h3>
                <p className="text-sm text-slate-400">
                  Human administrators review the claim requests to guarantee host server integrity.
                </p>
              </div>

              <div className="p-6 rounded-2xl glass-effect glass-glow-purple space-y-3 hover:translate-y-[-2px] transition-transform">
                <div className="w-12 h-12 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="font-display font-semibold text-white text-lg">Anti-Abuse Engine</h3>
                <p className="text-sm text-slate-400">
                  Dynamic backend check systems filter automated bots, scripts, proxies and duplicate tokens.
                </p>
              </div>

            </div>

            {/* LIVE CONSOLE AND QUICK SEARCH RECOVERY */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6">
              
              {/* Diagnostic Box */}
              <div className="lg:col-span-7 p-8 rounded-3xl glass-effect border-white/5 space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-brand-blue animate-pulse"></div>
                    <span className="font-display font-bold text-lg text-white">Instance Claim Eligibility Checker</span>
                  </div>
                  <span className="text-xs font-mono py-1 px-2.5 bg-slate-900 border border-white/10 rounded-md text-slate-400">
                    DIAGNOSTICS V1
                  </span>
                </div>

                <p className="text-sm text-slate-400 leading-relaxed">
                  Before applying, ensure your hardware device profile registers as green in our node parameters. If you have been blacklisted or have requested a server key, it will instantly report here:
                </p>

                <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-500 font-mono uppercase block">Browser Token</span>
                      <span className="text-xs font-semibold text-brand-blue truncate block">
                        {fingerprint ? fingerprint.substring(0, 15) + '...' : 'Acquiring...'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-mono uppercase block">Claim status</span>
                      {isChecking ? (
                        <span className="text-xs text-slate-400 animate-pulse">Checking status...</span>
                      ) : (
                        <span className="text-xs font-semibold block">
                          {eligibility?.eligible ? (
                            <span className="text-emerald-400">Ready to Claim</span>
                          ) : eligibility?.blocked ? (
                            <span className="text-rose-500">BLOCKED / BANNED</span>
                          ) : (
                            <span className="text-amber-400">Claim Code Issued</span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <span className="text-[10px] text-slate-500 font-mono uppercase block">Remote IP Status</span>
                      <span className="text-xs font-mono text-slate-300 block">Verified Gateway</span>
                    </div>
                  </div>

                  {!eligibility?.eligible && eligibility?.reason && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/15 border border-amber-500/25 text-xs text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{eligibility.reason}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (eligibility?.eligible) {
                        setView('claim');
                      } else {
                        setView(eligibility?.claim ? 'success' : 'terms');
                      }
                    }}
                    className="flex-grow py-3 px-5 rounded-xl bg-slate-900 border border-white/10 hover:bg-slate-800 text-sm font-semibold transition-colors text-center cursor-pointer"
                  >
                    {eligibility?.eligible ? 'Proceed to Application form' : 'View Policy Guidelines'}
                  </button>
                  <button
                    onClick={triggerEligibilityRefresh}
                    className="px-4 bg-slate-950 border border-white/5 hover:border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white"
                  >
                    Force Network Re-Check
                  </button>
                </div>
              </div>

              {/* Recovery box */}
              <div className="lg:col-span-5 p-8 rounded-3xl glass-effect border-brand-purple/10 space-y-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                    <Code className="text-brand-purple w-5 h-5" />
                    <span className="font-display font-bold text-lg text-white">Workstation Code Recovery</span>
                  </div>
                  
                  <p className="text-sm text-slate-400 mt-4 leading-relaxed">
                    Did you lose your generated 8-digit server claim key? If you completed the application earlier from this same browser workstation, enter your email below to instantly recover your active credentials:
                  </p>

                  <form onSubmit={handleLookupSubmit} className="mt-6 space-y-3">
                    <label className="text-xs font-mono text-slate-400 uppercase block">Registered Email Address</label>
                    <div className="relative">
                      <input 
                        type="email"
                        placeholder="john.doe@example.com"
                        value={lookupEmail}
                        onChange={(e) => setLookupEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 focus:border-brand-purple rounded-xl py-3 px-4 text-sm outline-none transition-colors pr-10"
                      />
                      <button 
                        type="submit"
                        className="absolute right-2.5 top-2.5 p-1 rounded bg-brand-purple/20 text-brand-purple hover:bg-brand-purple/30 transition-colors"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </form>

                  {lookupResult && (
                    <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-brand-purple/30 text-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">Claimant Profile:</span>
                        <span className="text-slate-400">{lookupResult.name}</span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-sm">
                        <span className="text-slate-400">Allocated Code:</span>
                        <span className="text-brand-purple font-bold flex items-center gap-1">
                          {lookupResult.code}
                          <button 
                            onClick={() => copyToClipboard(lookupResult.code)}
                            className="p-1 hover:bg-white/10 rounded"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">CURRENT STATE:</span>
                        <span>{getStatusBadge(lookupResult.status)}</span>
                      </div>
                      <button 
                        onClick={() => { setView('success'); }}
                        className="w-full mt-2 py-2 text-center rounded bg-brand-purple text-white font-semibold hover:bg-brand-purple/90 transition-all block text-[11px]"
                      >
                        Launch Detailed Guide Page
                      </button>
                    </div>
                  )}

                  {lookupError && (
                    <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                      {lookupError}
                    </div>
                  )}
                </div>

                <div className="pt-4 text-xs text-slate-500 leading-tight">
                  Note: Code recovery matches verified local persistent metadata to avoid data leaks.
                </div>
              </div>
            </div>

            {/* FREQUENTLY ASKED QUESTIONS (FAQs) */}
            <div id="faq-section" className="space-y-6 max-w-4xl mx-auto pt-6">
              <div className="text-center">
                <HelpCircle className="w-8 h-8 text-brand-blue mx-auto mb-3" />
                <h2 className="font-display font-bold text-3xl text-white">Frequently Answered Queries</h2>
                <p className="text-slate-405 text-sm md:text-base text-slate-400 mt-2">Everything you need to digest about our premium server test drive initiative</p>
              </div>

              <div className="space-y-4">
                {[
                  {
                    q: "How does the free claim work?",
                    a: "It's simple. We distribute 8-digit server claim codes to developers wishing to sample our virtual environment. You enter your basic handle details, receive your passcode instantly, and hold onto it until our system verifies the allocations for deploy."
                  },
                  {
                    q: "Why is only one claim allowed?",
                    a: "HDX Cloud values fair distribution. By leveraging client fingerprint metrics together with IP security barriers we ensure automated script rigs do not drain public cluster server pools."
                  },
                  {
                    q: "How do I check my code?",
                    a: "If you have generated code, you will find it in the 'My Active Code' section in the navigation or retrieve it dynamically by inputting your primary email inside the workstation recovery portal of our index homepage."
                  },
                  {
                    q: "How does admin approval work?",
                    a: "Once you lock in your unique random code, human staff process claims looking inside audit lines. Once status is designated APPROVED, user clusters boot up securely."
                  }
                ].map((item, idx) => (
                  <div 
                    key={idx}
                    className="rounded-2xl glass-effect border-white/5 overflow-hidden transition-all"
                  >
                    <button
                      onClick={() => setFaqIndex(faqIndex === idx ? null : idx)}
                      className="w-full text-left p-6 flex items-center justify-between font-semibold text-white focus:outline-none hover:bg-white/5"
                    >
                      <span>{item.q}</span>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${faqIndex === idx ? 'rotate-180 text-brand-blue' : ''}`} />
                    </button>
                    {faqIndex === idx && (
                      <div className="px-6 pb-6 text-sm text-slate-404 text-slate-400 border-t border-white/5 pt-4">
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* VIEW 2: CLAIM FORM PAGE */}
        {view === 'claim' && (
          <div id="claim-view" className="max-w-xl mx-auto w-full animate-fade-in my-6">
            <div className="p-8 rounded-3xl glass-effect border-white/10 space-y-6 shadow-2xl relative">
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-brand-blue/15 text-brand-blue flex items-center justify-center mx-auto mb-2">
                  <Server className="w-6 h-6 animate-pulse" />
                </div>
                <h2 className="font-display font-extrabold text-2xl text-white">Request Your Server Key</h2>
                <p className="text-xs text-slate-400">Fill in details to receive a unique secure 8-digit server hardware claim ticket.</p>
              </div>

              {/* Status information */}
              <div className="p-4 rounded-xl bg-slate-950 border border-white/5 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">SIGNATURE MATCH:</span>
                  <span className="text-brand-purple">{fingerprint ? fingerprint.slice(0, 15) + '...' : 'Generating...'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">GATEWAY IP:</span>
                  <span className="text-emerald-400">Ready to Lock</span>
                </div>
              </div>

              {/* Claim Form */}
              <form onSubmit={handleClaimSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-slate-430 text-slate-400 block font-medium">Username / Handle</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. cloudmaster"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 focus:border-brand-blue rounded-xl py-3.5 px-4 text-sm text-white placeholder-slate-600 outline-none transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-slate-420 text-slate-400 block font-medium">Email Address (Recovery & Delivery)</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. john.doe@hdx.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 focus:border-brand-blue rounded-xl py-3.5 px-4 text-sm text-white placeholder-slate-600 outline-none transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-slate-420 text-slate-400 block font-medium">Discord ID or Contact Point</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. developer_john#1234"
                    value={form.discordId}
                    onChange={(e) => setForm({ ...form, discordId: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 focus:border-brand-blue rounded-xl py-3.5 px-4 text-sm text-white placeholder-slate-600 outline-none transition-colors"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-brand-blue to-brand-purple text-white font-bold text-md hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Generating Code & Allocating ...
                      </>
                    ) : (
                      <>
                        Request Free Server Code
                        <CheckCircle className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="pt-3 border-t border-white/5 flex flex-col gap-2.5 text-[11px] text-slate-500">
                <p className="flex items-start gap-1.5 leading-normal">
                  <Shield className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
                  <span>Your local identifier <strong>{fingerprint}</strong> is bound securely. Attempting proxy, VM spoofing, or automated submissions triggers immediate hardware-based IP blocks.</span>
                </p>
                <div className="flex justify-between items-center mt-1">
                  <button 
                    onClick={() => setView('home')} 
                    className="text-brand-blue hover:underline"
                  >
                    ← Back to index
                  </button>
                  <button 
                    onClick={() => setView('terms')} 
                    className="hover:text-slate-300 hover:underline text-slate-500"
                  >
                    Read Policy
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 3: SUCCESS PAGE */}
        {view === 'success' && claimResult && (
          <div id="success-view" className="max-w-2xl mx-auto w-full animate-fade-in my-6">
            <div className="p-8 rounded-3xl glass-effect border-emerald-500/20 space-y-6 shadow-2xl relative overflow-hidden">
              
              {/* Highlight background elements of success color */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>

              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h2 className="font-display font-extrabold text-2xl text-white">Free Server Ticket Generated</h2>
                <p className="text-xs text-slate-400">Your claim has been authenticated and entered into our secure database ledger.</p>
              </div>

              {/* Main Ticket Box */}
              <div className="p-6 rounded-2xl bg-slate-950 border border-white/10 space-y-4 shadow-inner">
                
                <div className="text-center space-y-1.5 pb-4 border-b border-white/5">
                  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">ADMIN-VERIFIABLE PASSCODE</span>
                  <div className="flex items-center justify-center gap-3">
                    <span id="allocated-server-code" className="text-3xl md:text-4xl font-mono text-white font-bold tracking-wider">
                      {claimResult.code}
                    </span>
                    <button
                      onClick={() => copyToClipboard(claimResult.code)}
                      className="p-2 rounded bg-slate-900 border border-white/10 hover:border-brand-blue text-slate-300 hover:text-white transition-colors"
                      title="Copy server claiming passcode"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-400 font-mono mt-1">Keep this code safe. It can be used once only.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">CLIENT WORKSTATION</span>
                    <span className="font-mono text-slate-300 truncate block">{claimResult.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">DELIVERY TARGET</span>
                    <span className="font-mono text-slate-300 truncate block">{claimResult.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">CLAIM STATUS</span>
                    <span className="block mt-0.5">{getStatusBadge(claimResult.status)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">ISSUED TIMESTAMP</span>
                    <span className="text-slate-300 font-mono block">{new Date(claimResult.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {claimResult.status === ClaimStatus.PENDING && (
                  <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/25 text-xs text-amber-200 space-y-1 leading-normal">
                    <p className="font-bold flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-400" /> Human Verification Required
                    </p>
                    <p>
                      Your claim code has a status of <strong>PENDING</strong>. An administrator from <strong className="text-amber-300">HDX Cloud Admin</strong> will inspect the device log parameters, blacklisted ranges, and verify the client claim. Check back soon for deployment updates!
                    </p>
                  </div>
                )}

                {claimResult.status === ClaimStatus.APPROVED && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-slate-300 space-y-1 leading-normal">
                    <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" /> Claim Approved!
                    </p>
                    <p>
                      Excellent news! Your workstation configuration validation has succeeded. Copy your claim code above and input it directly into the server claim panel to instantly spin up your new server.
                    </p>
                  </div>
                )}
              </div>

              {/* Action checklist */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider">How to claim your free server:</h4>
                <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-white/5">
                  <li>Copy your unique 8-digit hardware allocation code above.</li>
                  <li>Click verified claim endpoint portals or submit inside Discord channel.</li>
                  <li>Verify that claimant email matches your requested database handle.</li>
                  <li>Wait for cloud node allocation algorithms to deploy your container container.</li>
                </ol>
              </div>

              <div className="pt-2 flex justify-between">
                <button
                  onClick={() => setView('home')}
                  className="px-5 py-2.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/10 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-colors"
                >
                  ← Return to Home
                </button>
                
                <button
                  onClick={triggerEligibilityRefresh}
                  className="px-5 py-2.5 rounded-lg bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-xs font-semibold hover:bg-brand-blue/20 transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} /> Check Live Status
                </button>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 4: ERROR / DUPLICATE DETECTED VIEW */}
        {view === 'duplicate' && (
          <div id="duplicate-error-view" className="max-w-xl mx-auto w-full animate-fade-in my-6">
            <div className="p-8 rounded-3xl glass-effect border-rose-500/20 space-y-6 shadow-2xl relative text-center">
              
              <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-2">
                <AlertOctagon className="w-8 h-8" />
              </div>
              
              <div className="space-y-2">
                <h2 className="font-display font-extrabold text-2xl text-white">Duplicate Claim Identified</h2>
                <p className="text-sm text-slate-403 text-slate-400">
                  Our core hardware registry indicates that a free server has already been requested from this browser workstation, local session, or network address range.
                </p>
              </div>

              {claimResult ? (
                <div className="p-5 rounded-2xl bg-slate-950 border border-white/5 text-left space-y-3">
                  <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
                    <span className="text-[10px] text-slate-500 font-mono uppercase">YOUR PREEXISTING KEY</span>
                    {getStatusBadge(claimResult.status)}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Registered to:</span>
                    <span className="text-xs font-mono text-white font-medium">{claimResult.name} ({claimResult.email})</span>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg flex items-center justify-between font-mono font-bold text-brand-blue text-lg">
                    <span>{claimResult.code}</span>
                    <button 
                      onClick={() => copyToClipboard(claimResult.code)}
                      className="p-1.5 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <span className="text-[10px] text-slate-500 leading-normal block">
                    * If you lost access, recover parameters using the recovery portal on the Home view.
                  </span>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-rose-500/5 text-xs text-rose-300 border border-rose-500/10 leading-normal text-left">
                  We detected an IP signature match showing duplicate allocation attempts. HDX Cloud maintains a strict limit of 1 claim per unique individual to protect system bandwidth from industrial scaling bots.
                </div>
              )}

              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={() => setView('home')}
                  className="py-3 px-6 rounded-xl bg-slate-900 border border-white/5 hover:border-white/10 hover:bg-slate-800 text-sm font-semibold transition-colors"
                >
                  Return to Home
                </button>
                <button
                  onClick={() => setView('terms')}
                  className="py-3 px-6 rounded-xl bg-slate-950 border border-white/5 text-slate-400 hover:text-white text-sm transition-all"
                >
                  Understand Bans & Policies
                </button>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 5: TERMS / ANTI-ABUSE POLICIES VIEW */}
        {view === 'terms' && (
          <div id="terms-view" className="max-w-3xl mx-auto w-full animate-fade-in space-y-8 my-6">
            
            <div className="p-8 rounded-3xl glass-effect border-white/10 space-y-6">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <Shield className="text-brand-blue w-6 h-6" />
                <div>
                  <h2 className="font-display font-extrabold text-2xl text-white">Terms & Anti-Abuse Measures</h2>
                  <p className="text-xs text-slate-400">Strict hardware registry parameters and user rules of HDX Cloud</p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
                <p>
                  To secure fair and uninterrupted cloud allocation, HDX Cloud runs a proprietary anti-abuse detection model. This model verifies and binds claimants dynamically. Check below to ensure compliance.
                </p>

                <h3 className="font-display font-bold text-white text-lg pt-2">1. Hardware Signature Auditing</h3>
                <p>
                  Every request generates device fingerprints combining screen ratios, engine rendering profiles, canvas parameters, and system details. This signature matches claims at backend databases. Spoofing or manipulating headers results in hardware-wide blacklisting.
                </p>

                <h3 className="font-display font-bold text-white text-lg pt-2">2. Single Claim Entitlement</h3>
                <p>
                  Claim code issuance allows <strong>one claim of free server code per unique human entity</strong>. We explicitly forbid multiple server instances per developer cluster. If multiple registrations map to duplicate IP gateways:
                </p>
                <ul className="list-disc list-inside space-y-1.5 pl-4 text-slate-400">
                  <li>The admin log generates a secondary threat score rating.</li>
                  <li>Pending registrations require strict Discord handle verification.</li>
                  <li>Known proxy server ranges and VPN providers face systemic query block.</li>
                </ul>

                <h3 className="font-display font-bold text-white text-lg pt-2">3. Auto Rate-limiting Protection</h3>
                <p>
                  Our server enforces sliding window rate-limits on queries. Excess attempts generate HTTP 429 warnings and result in temporary or permanent admin block protocols.
                </p>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex gap-2">
                  <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    WARNING: Admin logs capture all IP ranges. Blacklisted browser signatures or network nodes can no longer claim server codes or utilize pre-approved ones.
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex justify-between">
                <button
                  onClick={() => setView('home')}
                  className="px-5 py-2.5 rounded-lg bg-slate-900 border border-white/5 hover:bg-slate-800 text-xs font-semibold text-white transition-colors"
                >
                  ← Go Back Home
                </button>
                <button
                  onClick={() => setView('claim')}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-blue to-brand-purple text-white text-xs font-semibold hover:opacity-90 transition-all"
                >
                  Accept & Claim Server Code
                </button>
              </div>
            </div>

          </div>
        )}

        {/* VIEW 6: ADMIN LOGIN PAGE */}
        {view === 'admin-login' && (
          <div id="admin-login-view" className="max-w-md mx-auto w-full animate-fade-in my-10">
            <div className="p-8 rounded-3xl glass-effect border-brand-purple/20 space-y-6 shadow-2xl relative">
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-brand-purple/15 text-brand-purple flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="font-display font-extrabold text-2xl text-white">HDX Cloud Admin Portal</h2>
                <p className="text-xs text-slate-400">Secure entry to database claims, approvals, and IP log settings.</p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-slate-400 block">ADMIN USERNAME</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter admin username"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 focus:border-brand-purple rounded-xl py-3 px-4 text-sm text-white placeholder-slate-600 outline-none transition-colors font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-slate-404 text-slate-400 block">SECURITY PASSWORD</label>
                  <input
                    type="password"
                    required
                    placeholder="Enter admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 focus:border-brand-purple rounded-xl py-3 px-4 text-sm text-white placeholder-slate-600 outline-none transition-colors font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-brand-purple text-white font-bold hover:brightness-110 active:scale-95 transition-all text-sm cursor-pointer"
                >
                  Access Admin Database
                </button>
              </form>

              <div className="pt-2 text-center">
                <button 
                  onClick={() => setView('home')}
                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                >
                  ← Return to public homepage
                </button>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 7: ADMIN CONTROL PANEL PANEL */}
        {view === 'admin-dashboard' && adminToken && (
          <div id="admin-dashboard-view" className="space-y-8 animate-fade-in w-full">
            
            {/* Admin Header with actions */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/5 pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono py-1 px-2.5 bg-brand-purple/10 text-brand-purple border border-brand-purple/20 rounded font-bold uppercase tracking-wider">HDX SYSTEM CORE</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                </div>
                <h1 className="font-display font-extrabold text-3xl text-white mt-1">HDX Admin Console</h1>
                <p className="text-xs text-slate-400">Manage free hosting Claim Requests, inspect hardware fingerprint variables, and handle blacklist controls.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => fetchAdminData(adminToken)}
                  disabled={adminLoading}
                  className="py-2.5 px-4 rounded-lg bg-slate-900 border border-white/10 text-sm font-semibold hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${adminLoading ? 'animate-spin text-brand-purple' : ''}`} /> Refresh Feed
                </button>
                <button
                  onClick={handleAdminLogout}
                  className="py-2.5 px-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-semibold hover:bg-rose-500/20 transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" /> End Session
                </button>
              </div>
            </div>

            {/* STATISTICS STATS BANNER */}
            {adminStats && (
              <div id="admin-stats-grid" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                
                <div className="p-4 rounded-xl bg-slate-900/80 border border-white/5 shadow-inner">
                  <span className="text-[10px] text-slate-500 font-mono block">TOTAL CLAIMS</span>
                  <span className="text-2xl font-bold font-mono text-white block">{adminStats.totalClaims}</span>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                  <span className="text-[10px] text-amber-500/80 font-mono block">PENDING</span>
                  <span className="text-2xl font-bold font-mono text-amber-400 block">{adminStats.pending}</span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                  <span className="text-[10px] text-emerald-500/80 font-mono block">APPROVED</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 block">{adminStats.approved}</span>
                </div>

                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10">
                  <span className="text-[10px] text-rose-500/80 font-mono block">REJECTED</span>
                  <span className="text-2xl font-bold font-mono text-rose-400 block">{adminStats.rejected}</span>
                </div>

                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                  <span className="text-[10px] text-blue-500/80 font-mono block">USED / BUILT</span>
                  <span className="text-2xl font-bold font-mono text-blue-400 block">{adminStats.used}</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-red-500/15">
                  <span className="text-[10px] text-red-400 font-mono block">BLOCKED IPS</span>
                  <span className="text-2xl font-bold font-mono text-white block">{adminStats.blockedIps}</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/15">
                  <span className="text-[10px] text-purple-400 font-mono block">BLOCKED F-PRINTS</span>
                  <span className="text-2xl font-bold font-mono text-white block">{adminStats.blockedFingerprints}</span>
                </div>

              </div>
            )}

            {/* MAIN DATA MODULE FOR ADMIN */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              
              {/* Claims Request Table Panel */}
              <div className="xl:col-span-8 space-y-4">
                
                {/* Search / Filter Utility control bar */}
                <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/60 p-4 rounded-2xl border border-white/5 justify-between">
                  
                  {/* Search query field */}
                  <div className="relative flex-grow max-w-md">
                    <input
                      type="text"
                      placeholder="Filter by name, email, Discord, IP address or code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-xs outline-none focus:border-brand-purple transition-all placeholder-slate-500"
                    />
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>

                  {/* Filter tabs */}
                  <div className="flex gap-1.5 shrink-0 overflow-x-auto">
                    {[
                      { val: 'all', lbl: 'All States' },
                      { val: ClaimStatus.PENDING, lbl: 'Pending' },
                      { val: ClaimStatus.APPROVED, lbl: 'Approved' },
                      { val: ClaimStatus.USED, lbl: 'Used' },
                      { val: ClaimStatus.REJECTED, lbl: 'Rejected' },
                    ].map((item) => (
                      <button
                        key={item.val}
                        onClick={() => setStatusFilter(item.val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                          statusFilter === item.val 
                            ? 'bg-brand-purple text-white' 
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-white/5'
                        }`}
                      >
                        {item.lbl}
                      </button>
                    ))}
                  </div>

                </div>

                {/* DB Table elements */}
                <div id="table-wrapper" className="rounded-2xl border border-white/5 bg-slate-900/30 overflow-hidden shadow-2xl">
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-white/5 text-slate-400 text-[10px] font-mono tracking-widest uppercase">
                          <th className="px-4 py-3.5 font-medium">Claimant User</th>
                          <th className="px-4 py-3.5 font-medium">Allocated Code</th>
                          <th className="px-4 py-3.5 font-medium">Address & Device</th>
                          <th className="px-4 py-3.5 font-medium">Claim State</th>
                          <th className="px-4 py-3.5 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {adminClaims.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-10 text-slate-500 font-mono text-sm">
                              No records found matching filters.
                            </td>
                          </tr>
                        ) : (
                          adminClaims.map((claim) => (
                            <tr 
                              key={claim.id} 
                              className={`hover:bg-white/5 transition-colors cursor-pointer ${
                                activeClaimId === claim.id ? 'bg-brand-purple/10 border-l border-l-brand-purple' : ''
                              }`}
                              onClick={() => setActiveClaimId(claim.id === activeClaimId ? null : claim.id)}
                            >
                              
                              <td className="px-4 py-3.5 space-y-0.5 max-w-[180px] truncate">
                                <div className="font-semibold text-slate-200">{claim.name}</div>
                                <div className="text-[11px] text-slate-400 truncate">{claim.email}</div>
                                <div className="text-[10px] text-brand-blue truncate font-mono">Discord: {claim.discordId}</div>
                              </td>

                              <td className="px-4 py-3.5 font-mono">
                                <div className="flex items-center gap-1.5">
                                  <span id={`admin-code-${claim.id}`} className="font-bold text-slate-100 text-sm">{claim.code}</span>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(claim.code);
                                    }}
                                    className="p-1 text-slate-500 hover:text-white"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-[9px] text-slate-500">ID: {claim.id}</div>
                              </td>

                              <td className="px-4 py-3.5 space-y-0.5 max-w-[180px] truncate font-mono text-[10px]">
                                <div className="text-emerald-400 font-semibold">{claim.ipAddress}</div>
                                <div className="text-slate-500 truncate" title={claim.deviceFingerprint}>Sig: {claim.deviceFingerprint}</div>
                                <div className="text-[9px] text-slate-500">{new Date(claim.createdAt).toLocaleDateString()}</div>
                              </td>

                              <td className="px-4 py-3.5">
                                <div onClick={(e) => e.stopPropagation()}>
                                  {getStatusBadge(claim.status)}
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  
                                  {claim.status === ClaimStatus.PENDING && (
                                    <>
                                      <button
                                        onClick={() => runAdminAction({ action: 'approve', claimId: claim.id })}
                                        className="py-1 px-2.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-semibold text-[10px]"
                                        title="Approve server code request"
                                      >
                                        Approve
                                      </button>
                                      
                                      <button
                                        onClick={() => runAdminAction({ action: 'reject', claimId: claim.id })}
                                        className="py-1 px-2.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 font-semibold text-[10px]"
                                        title="Reject requesting claimant"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}

                                  {claim.status === ClaimStatus.APPROVED && (
                                    <button
                                      onClick={() => runAdminAction({ action: 'mark-used', claimId: claim.id })}
                                      className="py-1 px-2.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 font-semibold text-[10px]"
                                      title="Lock block code status to Claimed"
                                    >
                                      Mark Used
                                    </button>
                                  )}

                                  <div className="h-4 w-px bg-white/5 mx-1"></div>

                                  <button
                                    onClick={() => {
                                      if (confirm(`Confirm permanent deletion on claims record for code ${claim.code}?`)) {
                                        runAdminAction({ action: 'delete', claimId: claim.id });
                                      }
                                    }}
                                    className="p-1 rounded bg-slate-950 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Delete Record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>

                                </div>
                              </td>

                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>

              {/* Action Sidebar Controls (Detail Panel, Audit Log, IP blacklisting) */}
              <div className="xl:col-span-4 space-y-6">
                
                {/* 1. Detail Claims Drawer */}
                {activeClaimId && (
                  <div className="p-6 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-950 border border-brand-purple/20 space-y-4 animate-fade-in relative">
                    
                    <button 
                      onClick={() => setActiveClaimId(null)}
                      className="absolute top-4 right-4 text-slate-500 hover:text-white"
                    >
                      ✕
                    </button>

                    <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-purple" /> Full Claim Parameters
                    </h2>

                    {(() => {
                      const sel = adminClaims.find(c => c.id === activeClaimId);
                      if (!sel) return <p className="text-xs text-slate-500">Select a record row to query full hardware details.</p>;
                      return (
                        <div className="space-y-4 text-xs">
                          
                          <div className="p-3 bg-slate-900 rounded-lg space-y-1.5 font-mono">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Record Id:</span>
                              <span className="text-slate-300 font-bold">{sel.id}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Host Code:</span>
                              <span className="text-brand-blue font-bold tracking-widest">{sel.code}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Gatekeeper IP:</span>
                              <span className="text-emerald-400">{sel.ipAddress}</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <span className="text-[10px] text-slate-500 font-mono uppercase block">User Agent (Browser fingerprint base)</span>
                              <div className="p-2.5 bg-slate-950 border border-white/5 rounded text-slate-400 break-all leading-normal text-[10px]">
                                {sel.deviceFingerprint}
                              </div>
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-500 font-mono uppercase block">Discord Registration contact</span>
                              <div className="text-slate-300 font-mono">{sel.discordId}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <div>
                                <span className="text-[10px] text-slate-500 font-mono uppercase block">Creation Date</span>
                                <span className="text-slate-400 font-mono">{new Date(sel.createdAt).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 font-mono uppercase block">Last update</span>
                                <span className="text-slate-400 font-mono">{new Date(sel.updatedAt).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Quick access control buttons for specific selection */}
                          <div id="quick-action-btns" className="pt-4 border-t border-white/5 space-y-2">
                            
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => runAdminAction({ action: 'block-ip', blockIpValue: sel.ipAddress })}
                                className="py-2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 font-semibold text-[10px] flex items-center justify-center gap-1"
                                title="Blacklist claimant IP network wide"
                              >
                                <AlertTriangle className="w-3 h-3" /> Blacklist IP
                              </button>

                              <button
                                onClick={() => runAdminAction({ action: 'block-fingerprint', blockFingerprintValue: sel.deviceFingerprint })}
                                className="py-2 rounded bg-purple-500/10 text-purple-400 border border-purple-505/20 hover:bg-purple-500/20 font-semibold text-[10px] flex items-center justify-center gap-1"
                                title="Blacklist caller workstation fingerprint"
                              >
                                <Shield className="w-3 h-3" /> Blacklist hardware
                              </button>
                            </div>

                          </div>

                        </div>
                      );
                    })()}

                  </div>
                )}

                {/* 2. Admin Security Controls manual input section */}
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 space-y-4">
                  <h3 className="font-display font-semibold text-sm text-white flex items-center gap-2">
                    <Shield className="w-4 h-3.5 text-rose-500" /> Manual Blacklist controls
                  </h3>
                  
                  <div className="space-y-3 text-xs">
                    
                    {/* Add IP manually */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-mono uppercase">MANUALLY UNLEASH IP BAN</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. 192.168.1.1"
                          id="manual-ip-block-input"
                          className="flex-grow bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 outline-none focus:border-rose-500/50"
                        />
                        <button
                          onClick={() => {
                            const inputElem = document.getElementById('manual-ip-block-input') as HTMLInputElement;
                            if (inputElem && inputElem.value.trim()) {
                              runAdminAction({ action: 'block-ip', blockIpValue: inputElem.value.trim() });
                              inputElem.value = '';
                            }
                          }}
                          className="px-3 rounded bg-slate-900 border border-white/10 hover:bg-slate-800 text-slate-300 hover:text-white"
                        >
                          Ban
                        </button>
                      </div>
                    </div>

                    {/* Add Fingerprint manually */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-mono uppercase">MANUALLY UNLEASH DEVICE SIGNATURE BAN</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. FPR_A1B2C3D4"
                          id="manual-fp-block-input"
                          className="flex-grow bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 outline-none focus:border-rose-500/50"
                        />
                        <button
                          onClick={() => {
                            const inputElem = document.getElementById('manual-fp-block-input') as HTMLInputElement;
                            if (inputElem && inputElem.value.trim()) {
                              runAdminAction({ action: 'block-fingerprint', blockFingerprintValue: inputElem.value.trim() });
                              inputElem.value = '';
                            }
                          }}
                          className="px-3 rounded bg-slate-900 border border-white/10 hover:bg-slate-800 text-slate-300 hover:text-white"
                        >
                          Ban
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* 3. System audit logs feed */}
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 space-y-4">
                  
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="font-display font-semibold text-sm text-white">Security Audit Log</span>
                    <span className="text-[10px] font-mono text-slate-400">ADMIN OPERATIONS</span>
                  </div>

                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                    {adminLogs.length === 0 ? (
                      <p className="text-xs text-slate-500 font-mono">No operations performed in current ledger.</p>
                    ) : (
                      adminLogs.map((log) => (
                        <div key={log.id} className="p-3 bg-slate-950 rounded-lg border border-white/5 space-y-1">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-semibold text-slate-200">{log.adminAction}</span>
                            <span className="text-[9px] font-mono text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span>Code: <strong className="text-brand-blue">{log.targetCode}</strong></span>
                            <span>By IP: {log.adminIp}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                </div>

              </div>

            </div>

          </div>
        )}

      </main>

      {/* Modern High-End Professional Footer */}
      <footer id="main-footer" className="border-t border-white/5 py-12 mt-auto bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-blue flex items-center justify-center font-bold text-white shadow-md">
                <Server className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-lg text-white">HDX Cloud</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Industrial grade free developer container sandboxing tools built on secure local frameworks, protecting system performance and verifying every node.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-mono uppercase tracking-widest text-white mb-4">Navigations</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><button onClick={() => setView('home')} className="hover:text-brand-blue transition-colors text-left">Home Panel Overview</button></li>
              <li><button onClick={() => setView('terms')} className="hover:text-brand-blue transition-colors text-left font-medium">Anti-Abuse Rules</button></li>
              <li><button onClick={() => setView('claim')} className="hover:text-brand-blue transition-colors text-left">Claim Ticket Form</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-mono uppercase tracking-widest text-white mb-4">Administations</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><button onClick={() => setView('admin-login')} className="hover:text-brand-purple transition-colors text-left">Admin Console Access</button></li>
              <li><a href="#admin" className="hover:text-brand-purple transition-colors text-left">Fast Admin Hash Link</a></li>
              <li><span className="text-[10px] text-slate-500">Secure SHA-256 local database</span></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-mono uppercase tracking-widest text-white">Anti-Abuse Status</h4>
            <div className="p-3 bg-slate-950 rounded-xl border border-white/5 space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-500">FINGERPRINT ENGINE</span>
                <span className="text-emerald-400 font-bold">V2 ACTIVE</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-500">GATEWAY RATE-LIMITS</span>
                <span className="text-emerald-400 font-bold">STRICT 15x/m</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-600 font-mono">
              © 2026 HDX Cloud Enterprise. All rights claims registered.
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
