import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Camera, AlertTriangle, Key, CheckCircle, ArrowRight, Zap, Box, DollarSign, Layers, ChevronRight, ArrowLeft, Star, Shield, Check, X as XIcon, Wand2 } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { logTraffic } from '../services/databaseService';
import Logo from './Logo';
import PrivacyPolicyModal from './PrivacyPolicyModal';

type AuthMode = 'LOGIN' | 'SIGNUP' | 'MAGIC_LINK';

// --- LANDING PAGE COMPONENT ---
const LandingPage: React.FC<{ onGetStarted: () => void, onLogin: () => void, onOpenPrivacy: () => void }> = ({ onGetStarted, onLogin, onOpenPrivacy }) => {

  // Track Landing Page Visit on Mount
  useEffect(() => {
    logTraffic('LANDING_PAGE');
  }, []);

  const scrollToPricing = () => {
    const el = document.getElementById('pricing');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden relative font-sans selection:bg-neon-green selection:text-slate-950 pb-20">

      {/* Background Gradients - Fixed Position */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-neon-green/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2"></div>
      </div>

      {/* Nav */}
      <nav className="flex justify-between items-center p-6 relative z-20 max-w-7xl mx-auto w-full pt-safe">
        <div className="flex items-center gap-2">
          <Logo className="w-10 h-10 drop-shadow-md" />
          <span className="font-bold text-lg tracking-tight">Scan<span className="text-neon-green">To</span>Sold</span>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={scrollToPricing} className="text-sm font-bold text-slate-400 hover:text-white transition-colors hidden sm:block">
            PRICING
          </button>
          <button onClick={onLogin} className="text-sm font-bold text-slate-400 hover:text-white transition-colors">
            LOG IN
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="px-6 pt-12 pb-16 flex flex-col items-center text-center relative z-10 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 mb-8 animate-in slide-in-from-top-4 fade-in duration-700">
          <span className="flex h-2 w-2 rounded-full bg-neon-green shadow-[0_0_10px_#39ff14]"></span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Reseller OS v1.0</span>
        </div>

        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter mb-6 leading-[0.9]">
          Turn your <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-emerald-400">death pile</span> <br />
          into cash.
        </h1>

        <p className="text-slate-400 text-lg mb-10 max-w-md leading-relaxed">
          The all-in-one operating system for high-volume resellers. Scan, analyze, draft listings, and track inventory in seconds.
        </p>

        <button
          onClick={onGetStarted}
          className="group relative px-8 py-4 bg-neon-green text-slate-950 font-black text-lg rounded-2xl shadow-[0_0_40px_rgba(57,255,20,0.3)] hover:shadow-[0_0_60px_rgba(57,255,20,0.5)] hover:scale-105 transition-all duration-300 flex items-center gap-3"
        >
          START SCOUTING FREE
          <ArrowRight className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* App Mockup / Visuals */}
      <div className="px-4 mb-24 relative z-10 max-w-md mx-auto">
        <div className="relative w-full aspect-[9/16] bg-slate-900 rounded-[2.5rem] border-8 border-slate-800 shadow-2xl overflow-hidden transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500 ring-1 ring-slate-700/50">
          {/* Mockup Header */}
          <div className="h-14 bg-slate-950 flex items-center justify-between px-6 border-b border-slate-800">
            <div className="w-16 h-4 bg-slate-800 rounded-full"></div>
            <div className="w-8 h-8 bg-slate-800 rounded-full"></div>
          </div>
          {/* Mockup Body - Scanner View */}
          <div className="relative h-full bg-black">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1605518216938-7f31b47143e2?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center opacity-60"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-56 h-40 border-2 border-neon-green rounded-lg relative shadow-[0_0_20px_rgba(57,255,20,0.5)]">
                <div className="absolute top-[-20px] left-1/2 -translate-x-1/2 bg-neon-green text-black px-3 py-1 rounded text-[10px] font-bold shadow-lg">AI DETECTED</div>
                <div className="absolute top-0 left-0 w-full h-1 bg-neon-green/80 shadow-[0_0_10px_#39ff14] animate-[scan_2s_ease-in-out_infinite]"></div>
              </div>
            </div>
            <div className="absolute bottom-14 left-0 right-0 p-4 bg-slate-900/95 backdrop-blur rounded-t-3xl border-t border-slate-700 pb-20 animate-in slide-in-from-bottom-10 fade-in duration-1000 delay-300 fill-mode-forwards">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="text-neon-green font-mono text-[10px] mb-1 font-bold tracking-wider">HIGH DEMAND</div>
                  <div className="text-white font-bold text-lg">Vntg Sony Walkman</div>
                  <div className="text-slate-400 text-xs">Electronics • Used</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white tracking-tight">$45.00</div>
                  <div className="text-[10px] text-slate-500 font-mono">NET PROFIT</div>
                </div>
              </div>
              <div className="w-full h-12 bg-neon-green rounded-xl flex items-center justify-center font-bold text-slate-950 mt-4 shadow-[0_0_15px_rgba(57,255,20,0.3)]">
                ADD TO INVENTORY
              </div>
            </div>
          </div>
        </div>

        {/* Floating Badges */}
        <div className="absolute top-1/4 -right-4 md:-right-12 bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3 animate-bounce [animation-duration:3s] z-20">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400"><Layers size={20} /></div>
          <div>
            <div className="text-[10px] text-slate-400 font-mono uppercase">Mode</div>
            <div className="text-xs font-bold text-white">Death Piles</div>
          </div>
        </div>

        <div className="absolute bottom-1/3 -left-4 md:-left-12 bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3 animate-bounce [animation-duration:4s] z-20">
          <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-400"><Box size={20} /></div>
          <div>
            <div className="text-[10px] text-slate-400 font-mono uppercase">Inventory</div>
            <div className="text-xs font-bold text-white">Unit #55</div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="px-6 py-20 bg-slate-900/50 backdrop-blur-sm border-t border-slate-800/50 relative z-10">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold mb-10 text-center">Everything you need to scale.</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Zap className="text-yellow-400" />}
              title="Instant AI Scouting"
              desc="Identify items without barcodes. Our AI analyzes images to find current market value in seconds."
            />
            <FeatureCard
              icon={<DollarSign className="text-green-400" />}
              title="Real Net Profit"
              desc="Don't guess. We deduct platform fees and estimated shipping automatically so you see the real number."
            />
            <FeatureCard
              icon={<Box className="text-blue-400" />}
              title="Storage Tracking"
              desc="Never lose an item again. Track exactly which bin and storage unit every item is stored in."
            />
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div id="pricing" className="px-6 py-24 relative z-10 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-black text-white mb-4">Simple, Transparent Pricing</h3>
            <p className="text-slate-400">Start for free, upgrade when you scale.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 flex flex-col relative overflow-hidden group hover:border-slate-500 transition-colors h-full">
              <div className="mb-6">
                <span className="text-slate-400 font-mono text-xs uppercase font-bold tracking-wider">Starter</span>
                <div className="text-4xl font-black text-white mt-2 mb-1">$0 <span className="text-lg font-normal text-slate-500">/mo</span></div>
                <p className="text-slate-400 text-sm">Perfect for hobbyists.</p>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-white" /> 3 AI Scans per day</li>
                <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-white" /> Profit Calculator</li>
                <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-white" /> Inventory Tracking</li>
                <li className="flex items-center gap-3 text-slate-600 text-sm line-through decoration-slate-600"><XIcon size={16} /> Bulk "Death Pile" Mode</li>
                <li className="flex items-center gap-3 text-slate-600 text-sm line-through decoration-slate-600"><XIcon size={16} /> AI Listing Generator</li>
              </ul>
              <button onClick={onGetStarted} className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors">Get Started Free</button>
            </div>

            <div className="bg-slate-900 border border-blue-900/50 rounded-3xl p-8 flex flex-col relative overflow-hidden group hover:border-blue-500 transition-colors shadow-lg shadow-blue-900/10 h-full transform md:-translate-y-1">
              <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">Value</div>
              <div className="mb-6">
                <span className="text-blue-400 font-mono text-xs uppercase font-bold tracking-wider">Plus</span>
                <div className="text-4xl font-black text-white mt-2 mb-1">$9.99 <span className="text-lg font-normal text-slate-500">/mo</span></div>
                <p className="text-slate-400 text-sm">For part-time flippers.</p>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-blue-400" /> 30 AI Scans per day</li>
                <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-blue-400" /> Profit Calculator</li>
                <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-blue-400" /> Unlimited Inventory</li>
                <li className="flex items-center gap-3 text-slate-600 text-sm line-through decoration-slate-600"><XIcon size={16} /> Bulk "Death Pile" Mode</li>
                <li className="flex items-center gap-3 text-slate-600 text-sm line-through decoration-slate-600"><XIcon size={16} /> AI Listing Generator</li>
              </ul>
              <button onClick={onGetStarted} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20">Get Plus</button>
            </div>

            <div className="bg-slate-900 border-2 border-neon-green rounded-3xl p-8 flex flex-col relative overflow-hidden shadow-[0_0_30px_rgba(57,255,20,0.15)] transform md:-translate-y-2 transition-transform duration-300 h-full">
              <div className="absolute top-0 right-0 bg-neon-green text-slate-950 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">Most Popular</div>
              <div className="mb-6">
                <span className="text-neon-green font-mono text-xs uppercase font-bold tracking-wider flex items-center gap-1"><Star size={12} fill="currentColor" /> Pro Reseller</span>
                <div className="text-4xl font-black text-white mt-2 mb-1">$29 <span className="text-lg font-normal text-slate-500">/mo</span></div>
                <p className="text-slate-400 text-sm">For volume sellers.</p>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-white text-sm font-bold"><div className="p-1 bg-neon-green rounded-full text-slate-950"><Check size={10} strokeWidth={4} /></div> Unlimited AI Scans</li>
                <li className="flex items-center gap-3 text-white text-sm"><div className="p-1 bg-neon-green/20 rounded-full text-neon-green"><Check size={10} strokeWidth={3} /></div> "Death Pile" Bulk Mode</li>
                <li className="flex items-center gap-3 text-white text-sm"><div className="p-1 bg-neon-green/20 rounded-full text-neon-green"><Check size={10} strokeWidth={3} /></div> AI Listing Description Gen</li>
                <li className="flex items-center gap-3 text-white text-sm"><div className="p-1 bg-neon-green/20 rounded-full text-neon-green"><Check size={10} strokeWidth={3} /></div> CSV Ledger Export</li>
                <li className="flex items-center gap-3 text-white text-sm"><div className="p-1 bg-neon-green/20 rounded-full text-neon-green"><Check size={10} strokeWidth={3} /></div> Priority Support</li>
              </ul>
              <button onClick={onGetStarted} className="w-full py-3 bg-neon-green text-slate-950 font-black rounded-xl hover:bg-neon-green/90 transition-colors shadow-lg shadow-neon-green/20">Upgrade Now</button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="p-8 pb-16 text-center max-w-lg mx-auto relative z-10">
        <h3 className="text-xl font-bold text-white mb-6">Ready to clear the pile?</h3>
        <button onClick={onGetStarted} className="w-full py-4 bg-slate-800 border border-slate-700 text-white font-bold rounded-xl hover:bg-slate-700 hover:text-neon-green hover:border-neon-green transition-all flex items-center justify-center gap-2 group">
          Get Started Now <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} ScanToSold OS. Built for Resellers.</p>
          <button onClick={onOpenPrivacy} className="text-[10px] text-slate-600 hover:text-white underline mt-2 transition-colors">Privacy Policy</button>
        </div>
      </div>

      <style>{`
            @keyframes scan {
              0% { top: 0%; opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { top: 100%; opacity: 0; }
            }
        `}</style>
    </div>
  )
}

const FeatureCard = ({ icon, title, desc }: { icon: any, title: string, desc: string }) => (
  <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl hover:border-slate-600 transition-colors">
    <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center mb-4 border border-slate-800 shadow-inner">{icon}</div>
    <h4 className="font-bold text-lg text-white mb-2">{title}</h4>
    <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
  </div>
)

// --- MAIN AUTH SCREEN COMPONENT ---
const AuthScreen: React.FC = () => {
  const { signInWithMagicLink, signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth();

  const [showLanding, setShowLanding] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string>('');
  const [msg, setMsg] = useState<string>('');

  const isConfigured = isSupabaseConfigured();

  // Check for redirect errors on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const errorDesc = params.get('error_description') || hashParams.get('error_description');
    const errorMsg = params.get('error') || hashParams.get('error');
    if (errorDesc || errorMsg) {
      setShowLanding(false);
      setError(decodeURIComponent(errorDesc || errorMsg || 'Authentication failed'));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!isConfigured) { setError("Please configure Supabase credentials in src/lib/supabaseClient.ts first."); return; }
    setIsLoading(true); setError(''); setMsg('');
    try {
      let result;
      if (mode === 'MAGIC_LINK') { result = await signInWithMagicLink(email); if (!result.error) setMagicLinkSent(true); }
      else if (mode === 'LOGIN') { result = await signInWithPassword(email, password); }
      else if (mode === 'SIGNUP') {
        const { data, error } = await signUpWithPassword(email, password);
        if (!error) { if (data?.session) { } else if (data?.user) { setMsg("Account created! Please check your email inbox to verify your account."); } }
        result = { error };
      }
      if (result?.error) {
        if (result.error.message.includes("Invalid login")) { setError("Invalid email or password."); }
        else if (result.error.message.includes("Email not confirmed")) { setError("Email not confirmed. Check your inbox."); }
        else { setError(result.error.message); }
      }
    } catch (err) { setError('An unexpected error occurred'); console.error(err); } finally { setIsLoading(false); }
  };

  const handleGoogleLogin = async () => {
    if (!isConfigured) { setError("Please configure Supabase credentials first."); return; }
    setError(''); setIsLoading(true);
    try { const { error } = await signInWithGoogle(); if (error) { setIsLoading(false); setError(error.message); } }
    catch (err: any) { setIsLoading(false); setError(err.message || "Google Login failed."); }
  };

  if (showLanding) {
    return (
      <>
        <LandingPage onGetStarted={() => setShowLanding(false)} onLogin={() => { setMode('LOGIN'); setShowLanding(false); }} onOpenPrivacy={() => setShowPrivacy(true)} />
        <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      </>
    );
  }

  if (magicLinkSent) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-neon-green/10 rounded-full flex items-center justify-center mb-6 animate-pulse"><CheckCircle size={40} className="text-neon-green" /></div>
        <h2 className="text-2xl font-bold text-white mb-2">Check your Email</h2>
        <p className="text-slate-400 max-w-xs mb-4">We sent a magic link to <strong>{email}</strong>.</p>
        <button onClick={() => { setMagicLinkSent(false); setMode('LOGIN'); }} className="mt-8 text-slate-500 hover:text-white underline text-sm">Back to Login</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 relative flex flex-col">
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />

      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-neon-green/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="absolute top-6 left-6 z-20 pt-safe">
        <button onClick={() => setShowLanding(true)} className="p-2 bg-slate-900 rounded-full text-slate-400 hover:text-white border border-slate-800 hover:border-neon-green transition-all"><ArrowLeft size={20} /></button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 z-10 min-h-min">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl mb-8 relative backdrop-blur-sm">
          <div className="flex flex-col items-center mb-8 space-y-4">
            <Logo className="w-24 h-24 drop-shadow-[0_0_20px_rgba(57,255,20,0.3)] animate-in zoom-in duration-500" />
            <h2 className="text-3xl font-black text-white tracking-tight">Scan<span className="text-neon-green">To</span>Sold</h2>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 rounded-full border border-slate-800 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse shadow-[0_0_5px_#39ff14]"></div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">Reseller OS v1.0</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center mb-4">
              <h3 className="text-lg font-bold text-white">{mode === 'LOGIN' && 'Welcome Back'}{mode === 'SIGNUP' && 'Create Account'}{mode === 'MAGIC_LINK' && 'Passwordless Login'}</h3>
              <p className="text-xs text-slate-400 mt-1">{mode === 'LOGIN' && 'Enter your credentials to access your dashboard.'}{mode === 'SIGNUP' && 'Start scouting smarter in seconds.'}{mode === 'MAGIC_LINK' && 'We’ll email you a secure link to sign in.'}</p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-slate-400 ml-1">Email Access</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-neon-green transition-colors" size={18} />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-12 pr-4 text-white focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all font-mono placeholder-slate-700 text-sm" />
              </div>
            </div>

            {mode !== 'MAGIC_LINK' && (
              <div className="space-y-1 animate-in slide-in-from-top-2 fade-in">
                <label className="text-[10px] font-mono uppercase text-slate-400 ml-1">Passcode</label>
                <div className="relative group">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-neon-green transition-colors" size={18} />
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-12 pr-4 text-white focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all font-mono placeholder-slate-700 text-sm" />
                </div>
              </div>
            )}

            {error && (<div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-xs text-center flex flex-col items-center justify-center gap-2 animate-in slide-in-from-top-2"><div className="flex items-center gap-2"><AlertTriangle size={14} /> {error}</div></div>)}
            {msg && (<div className="p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400 text-xs text-center animate-in slide-in-from-top-2">{msg}</div>)}
            {!isConfigured && (<div className="p-3 bg-yellow-900/20 border border-yellow-600/50 rounded-lg text-yellow-200 text-xs text-center">⚠️ Set URL & Key in <code>src/lib/supabaseClient.ts</code></div>)}

            <button type="submit" disabled={isLoading || !isConfigured} className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(57,255,20,0.1)] hover:shadow-[0_0_30px_rgba(57,255,20,0.3)] transition-all flex items-center justify-center gap-2 ${isLoading || !isConfigured ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none' : 'bg-neon-green text-slate-950 hover:scale-[1.02]'}`}>
              {isLoading ? (<span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>) : (<>{mode === 'LOGIN' && 'LOG IN'}{mode === 'SIGNUP' && 'CREATE ACCOUNT'}{mode === 'MAGIC_LINK' && 'SEND LINK'}</>)}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3 text-xs text-slate-400">
            {mode === 'LOGIN' && (<div className="flex flex-col items-center gap-3"><p>New here?{' '}<button onClick={() => { setMode('SIGNUP'); setError(''); }} className="text-white font-bold hover:text-neon-green underline">Create an Account</button></p><button onClick={() => { setMode('MAGIC_LINK'); setError(''); }} className="flex items-center gap-1.5 text-slate-500 hover:text-white transition-colors py-1 px-2"><Wand2 size={12} /> Sign in with Magic Link</button></div>)}
            {mode === 'SIGNUP' && (<p>Already have an account?{' '}<button onClick={() => { setMode('LOGIN'); setError(''); }} className="text-white font-bold hover:text-neon-green underline">Log In</button></p>)}
            {mode === 'MAGIC_LINK' && (<button onClick={() => { setMode('LOGIN'); setError(''); }} className="text-slate-500 hover:text-white underline">Back to Password Login</button>)}
          </div>

          <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div><div className="relative flex justify-center text-xs uppercase font-bold"><span className="bg-slate-900 px-2 text-slate-500">Or continue with</span></div></div>

          <button onClick={handleGoogleLogin} disabled={isLoading || !isConfigured} className="w-full py-3.5 rounded-xl bg-white hover:bg-gray-100 text-slate-900 font-bold text-sm flex items-center justify-center gap-3 transition-all">
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>Sign in with Google
          </button>

          <div className="mt-6 text-center">
            <p className="text-[10px] text-slate-600 font-mono">SECURE CONNECTION • {isConfigured ? 'SUPABASE LINKED' : 'OFFLINE'}</p>
            <button onClick={() => setShowPrivacy(true)} className="text-[10px] text-slate-600 hover:text-white underline mt-2 transition-colors">Privacy Policy</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;