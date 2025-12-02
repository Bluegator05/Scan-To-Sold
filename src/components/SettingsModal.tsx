import React, { useState, useEffect } from 'react';
import { X, Lock, LogOut, Check, AlertTriangle, User as UserIcon, Shield, CreditCard, MessageSquare, Link as LinkIcon, ExternalLink, Loader2, MapPin, Save, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isEbayConnected, connectEbayAccount, disconnectEbayAccount, checkEbayConnection } from '../services/ebayService';
import { App } from '@capacitor/app';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPricing: () => void;
  onOpenFeedback: () => void;
  onOpenPrivacy: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onOpenPricing, onOpenFeedback, onOpenPrivacy }) => {
  const { user, signOut, updatePassword, subscription } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Integration State
  const [ebayConnected, setEbayConnected] = useState(false);
  const [isConnectingEbay, setIsConnectingEbay] = useState(false);

  // Defaults
  const [defaultZip, setDefaultZip] = useState('');

  // ...

  useEffect(() => {
    if (isOpen) {
      const check = () => {
        // DEBUG: Show what we are checking
        if (user) alert(`Checking connection for UserID: ${user.id}`);

        setEbayConnected(isEbayConnected());
        checkEbayConnection().then((connected) => {
          alert(`Connection Result: ${connected}`); // DEBUG
          setEbayConnected(connected);
          setIsConnectingEbay(false);
        });
      };

      check();
      setDefaultZip(localStorage.getItem('sts_default_zip') || '');

      // Listen for app resume (returning from Safari)
      const listener = App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          check();
        }
      });

      return () => {
        listener.then(l => l.remove());
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    try {
      const { error } = await updatePassword(newPassword);
      if (error) throw error;
      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setNewPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEbayToggle = async () => {
    if (!user) return;

    if (ebayConnected) {
      setIsConnectingEbay(true);
      await disconnectEbayAccount();
      setEbayConnected(false);
      setIsConnectingEbay(false);
    } else {
      setIsConnectingEbay(true);
      await connectEbayAccount();
      // We don't set loading false here because we redirect away
    }
  };

  const handleSaveZip = () => {
    localStorage.setItem('sts_default_zip', defaultZip);
    alert("Default Zip Code saved.");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <UserIcon className="text-slate-400" size={20} /> Settings
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto">

          {/* Account Info */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Account</label>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                <span className="font-bold text-lg">{user?.email?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="text-white font-bold truncate">{user?.email}</div>
                <div className="text-xs text-slate-400 font-mono">ID: {user?.id.slice(0, 8)}...</div>
              </div>
            </div>
          </div>

          {/* Subscription Status */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Membership</label>
              {subscription.tier !== 'PRO' && (
                <button onClick={() => { onClose(); onOpenPricing(); }} className="text-xs text-neon-green font-bold hover:underline">
                  Upgrade Plan
                </button>
              )}
            </div>
            <div className={`p-4 rounded-xl border flex justify-between items-center ${subscription.tier === 'PRO' ? 'bg-slate-800/50 border-neon-green/30' : 'bg-slate-800 border-slate-700'}`}>
              <div className="flex items-center gap-3">
                <Shield size={20} className={subscription.tier === 'PRO' ? 'text-neon-green' : 'text-slate-400'} />
                <div>
                  <div className="text-white font-bold">{subscription.tier} TIER</div>
                  <div className="text-[10px] text-slate-400">
                    {subscription.tier === 'PRO' ? 'Unlimited Access' : `${subscription.scansToday} / ${subscription.maxDailyScans} Scans Today`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Listing Defaults */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Listing Defaults</label>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-3">
                <MapPin size={20} className="text-slate-400" />
                <div className="flex-1">
                  <div className="text-white font-bold text-sm">Default Zip Code</div>
                  <div className="text-[10px] text-slate-400">Used for "Item Location" on eBay</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={defaultZip}
                  onChange={(e) => setDefaultZip(e.target.value)}
                  placeholder="e.g. 76028"
                  className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neon-green"
                />
                <button onClick={handleSaveZip} className="bg-slate-700 hover:bg-slate-600 text-white px-3 rounded-lg"><Save size={16} /></button>
              </div>
            </div>
          </div>

          {/* Integrations (eBay) */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Integrations</label>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl font-black ${ebayConnected ? 'bg-white text-blue-700' : 'bg-slate-700 text-slate-500'}`}>
                  e
                </div>
                <div>
                  <div className="text-white font-bold text-sm">eBay Store</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    {ebayConnected ? (
                      <span className="text-neon-green flex items-center gap-1"><Check size={10} /> Connected</span>
                    ) : (
                      'Not Connected'
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={handleEbayToggle}
                disabled={isConnectingEbay}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${ebayConnected ? 'bg-slate-900 border-slate-600 text-slate-400 hover:text-white' : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'}`}
              >
                {isConnectingEbay ? <Loader2 size={14} className="animate-spin" /> : (ebayConnected ? 'Disconnect' : 'Connect')}
              </button>
            </div>
            {ebayConnected && <p className="text-[10px] text-slate-500 px-1">Active listings will automatically sync to your inventory.</p>}
          </div>

          {/* Legal / Policies */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Legal</label>
            <button
              onClick={onOpenPrivacy}
              className="w-full p-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 transition-all flex items-center justify-between text-left group"
            >
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-slate-400 group-hover:text-white" />
                <div>
                  <div className="text-white font-bold text-sm">Privacy Policy</div>
                  <div className="text-[10px] text-slate-400">Data handling & AI disclosure</div>
                </div>
              </div>
              <div className="text-slate-500 group-hover:text-white">→</div>
            </button>
          </div>

          {/* Feedback Button */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Support</label>
            <button
              onClick={() => { onClose(); onOpenFeedback(); }}
              className="w-full p-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 transition-all flex items-center justify-between text-left group"
            >
              <div className="flex items-center gap-3">
                <MessageSquare size={20} className="text-slate-400 group-hover:text-white" />
                <div>
                  <div className="text-white font-bold text-sm">Send Feedback</div>
                  <div className="text-[10px] text-slate-400">Report bugs or request features</div>
                </div>
              </div>
              <div className="text-slate-500 group-hover:text-white">→</div>
            </button>
          </div>

          {/* Password Management */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Security</label>
            <form onSubmit={handleUpdatePassword} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <Lock size={14} className="text-neon-green" /> Set Password
                </h4>
                <p className="text-xs text-slate-400 mb-3">
                  Set a password to log in without a Magic Link next time.
                </p>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Password"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neon-green"
                  />
                  <button
                    type="submit"
                    disabled={isUpdating || !newPassword}
                    className="px-4 py-2 bg-slate-700 text-white font-bold rounded-lg text-xs hover:bg-slate-600 disabled:opacity-50 transition-colors"
                  >
                    {isUpdating ? '...' : 'SAVE'}
                  </button>
                </div>
              </div>

              {message && (
                <div className={`text-xs p-2 rounded flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {message.type === 'success' ? <Check size={12} /> : <AlertTriangle size={12} />}
                  {message.text}
                </div>
              )}
            </form>
          </div>

          <button
            onClick={() => { signOut(); onClose(); }}
            className="w-full py-4 bg-slate-800 hover:bg-red-900/20 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-900/50 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={18} /> LOG OUT
          </button>

          <div className="text-center">
            <p className="text-[10px] text-slate-600 font-mono">ScanToSold v1.1.0</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;