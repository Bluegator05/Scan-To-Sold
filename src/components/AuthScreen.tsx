import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Camera, AlertTriangle, Key, CheckCircle, ArrowRight, Zap, Box, DollarSign, Layers, ChevronRight, ArrowLeft, Star, Shield, Check, X as XIcon, Wand2 } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { logTraffic } from '../services/databaseService';
import Logo from './Logo';
import PrivacyPolicyModal from './PrivacyPolicyModal';

type AuthMode = 'LOGIN' | 'SIGNUP' | 'MAGIC_LINK';

import LandingPage from './LandingPage';

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