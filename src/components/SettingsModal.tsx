import React, { useState, useEffect } from 'react';
import { X, Lock, LogOut, Check, AlertTriangle, User as UserIcon, Shield, CreditCard, MessageSquare, Link as LinkIcon, ExternalLink, Loader2, MapPin, Save, FileText, HelpCircle, ChevronRight, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isEbayConnected, connectEbayAccount, disconnectEbayAccount, checkEbayConnection } from '../services/ebayService';
import { requestNotificationPermissions, scheduleGoalReminder, NotificationSettings } from '../services/notificationService';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPricing: () => void;
  onOpenFeedback: () => void;
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
  onConnectionChange?: (connected: boolean) => void;
  onSwitchToLiteMode: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onOpenPricing, onOpenFeedback, onOpenPrivacy, onOpenHelp, onConnectionChange, onSwitchToLiteMode }) => {
  const { user, signOut, updatePassword, subscription } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Integration State
  const [ebayConnected, setEbayConnected] = useState(false);
  const [isConnectingEbay, setIsConnectingEbay] = useState(false);

  // Defaults
  const [defaultZip, setDefaultZip] = useState('');
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({ enabled: false, frequency: '4h' });
  const [showDangerZone, setShowDangerZone] = useState(false);

  // ...

  useEffect(() => {
    if (isOpen) {
      const check = () => {
        setEbayConnected(isEbayConnected());
        checkEbayConnection().then((connected) => {
          setEbayConnected(connected);
          setIsConnectingEbay(false);
          if (onConnectionChange) onConnectionChange(connected);
        });
      };

      check();
      check();
      setDefaultZip(localStorage.getItem('sts_default_zip') || '');
      const savedNotif = localStorage.getItem('sts_notification_settings');
      if (savedNotif) {
        setNotificationSettings(JSON.parse(savedNotif));
      } else {
        // Check if permissions are already granted at system level
        LocalNotifications.checkPermissions().then(perm => {
          if (perm.display === 'granted') {
            setNotificationSettings(prev => ({ ...prev, enabled: true }));
          }
        });
      }

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

  const handleDeleteAccount = async () => {
    if (confirm("DANGER: Are you sure you want to delete your account? This will wipe all data from this device and sign you out. This action cannot be undone.")) {
      if (confirm("Please confirm one last time: DELETE ACCOUNT & WIPE DATA?")) {
        try {
          // 1. Wipe Local Storage
          localStorage.clear();
          // 2. Sign Out
          await signOut();
          // 3. Close Modal
          onClose();
          // 4. Reload to clear state
          window.location.reload();
        } catch (e) {
          alert("Failed to delete account data. Please try again.");
        }
      }
    }
  };

  const handleEbayToggle = async () => {
    if (!user) return;

    if (ebayConnected) {
      setIsConnectingEbay(true);
      await disconnectEbayAccount();
      setEbayConnected(false);
      setIsConnectingEbay(false);
      if (onConnectionChange) onConnectionChange(false);
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

  const handleNotificationToggle = async () => {
    try {
      const newState = !notificationSettings.enabled;
      if (newState) {
        const granted = await requestNotificationPermissions();
        if (!granted) {
          alert("Permission denied. Please enable notifications in system settings.");
          return;
        }
      }
      const newSettings: NotificationSettings = { ...notificationSettings, enabled: newState };
      setNotificationSettings(newSettings);
      localStorage.setItem('sts_notification_settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error("Toggle error:", error);
      alert("Failed to update settings. Please try again.");
    }
  };

  const handleFrequencyChange = (freq: '2h' | '4h' | 'daily') => {
    const newSettings: NotificationSettings = { ...notificationSettings, frequency: freq };
    setNotificationSettings(newSettings);
    localStorage.setItem('sts_notification_settings', JSON.stringify(newSettings));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass-panel rounded-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-transparent">
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
            <div className="glass-panel p-4 rounded-xl flex items-center gap-4">
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
            <div className={`p-4 rounded-xl border flex justify-between items-center glass-panel ${subscription.tier === 'PRO' ? 'border-neon-green/30' : 'border-white/10'}`}>
              <div className="flex items-center gap-3">
                <Shield size={20} className={subscription.tier === 'PRO' ? 'text-neon-green' : 'text-slate-400'} />
                <div>
                  <div className="text-white font-bold">{subscription.tier} TIER</div>
                  <div className="text-[10px] text-slate-400">
                    {subscription.tier === 'PRO' ? (
                      'Unlimited Access'
                    ) : (
                      (() => {
                        // Use user-specific key to avoid leaking counts between accounts on same device
                        const todayKey = `opt_count_${user?.id}_${new Date().toDateString()}`;
                        const count = parseInt(localStorage.getItem(todayKey) || '0');
                        // Assuming the limit from feature gate is 5 for free tier, hardcoding for display consistency with App.tsx limit default
                        const limit = subscription.maxDailyScans;
                        return `${count} / ${limit} Daily Optimizations`;
                      })()
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* App Mode */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">App Mode</label>
            <button
              onClick={() => { onClose(); onSwitchToLiteMode(); }}
              className="w-full glass-panel p-4 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-neon-green/10 flex items-center justify-center text-neon-green group-hover:scale-110 transition-transform">
                  <Loader2 size={24} className="animate-pulse" />
                </div>
                <div className="text-left">
                  <div className="text-white font-bold text-sm">Lite Mode</div>
                  <div className="text-[10px] text-slate-400">Simplified scanner for quick lookups</div>
                </div>
              </div>
              <ExternalLink size={16} className="text-slate-500 group-hover:text-white" />
            </button>
          </div>

          {/* Notifications */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Notifications</label>
            <div className="glass-panel p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell size={20} className={notificationSettings.enabled ? "text-neon-green" : "text-slate-400"} />
                  <div>
                    <div className="text-white font-bold text-sm">Goal Reminders</div>
                    <div className="text-[10px] text-slate-400">Get reminded to hit your daily goal</div>
                  </div>
                </div>
                <button
                  onClick={handleNotificationToggle}
                  className={`w-12 h-6 rounded-full transition-colors relative ${notificationSettings.enabled ? 'bg-neon-green' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${notificationSettings.enabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {notificationSettings.enabled && (
                <div className="pt-2 border-t border-white/10">
                  <label className="text-[10px] text-slate-400 mb-2 block">Frequency</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['2h', '4h', 'daily'] as const).map((freq) => (
                      <button
                        key={freq}
                        onClick={() => handleFrequencyChange(freq)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${notificationSettings.frequency === freq ? 'bg-neon-green/20 border-neon-green text-neon-green' : 'bg-black/20 border-transparent text-slate-400 hover:bg-white/5'}`}
                      >
                        {freq === 'daily' ? 'Daily (6PM)' : `Every ${freq}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Listing Defaults */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Listing Defaults</label>
            <div className="glass-panel p-4 rounded-xl">
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
                  className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neon-green"
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
              onClick={() => { onClose(); onOpenHelp(); }}
              className="w-full flex items-center justify-between p-4 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors group border border-slate-700"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                  <HelpCircle size={20} />
                </div>
                <div className="text-left">
                  <div className="font-bold text-white">Help & Instructions</div>
                  <div className="text-xs text-slate-400">Guides, FAQs, and Tips</div>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-500 group-hover:text-white transition-colors" />
            </button>

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
            onClick={async () => { await signOut(); onClose(); }}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={18} /> LOG OUT
          </button>

          {/* Danger Zone */}
          <div className="pt-8 border-t border-slate-800">
            <button
              onClick={() => setShowDangerZone(!showDangerZone)}
              className="w-full flex justify-between items-center py-2 text-xs font-mono text-red-500 uppercase tracking-widest mb-2 hover:text-red-400 transition-colors"
            >
              <span>Danger Zone</span>
              <span>{showDangerZone ? 'Hide' : 'Show'}</span>
            </button>

            {showDangerZone && (
              <div className="animate-in slide-in-from-top-2 duration-200">
                <button
                  onClick={handleDeleteAccount}
                  className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={18} /> DELETE ACCOUNT
                </button>
                <p className="text-[10px] text-slate-500 text-center mt-2">
                  This will permanently delete your local data and sign you out.
                </p>
              </div>
            )}
          </div>

          <div className="text-center">
            <p className="text-[10px] text-slate-600 font-mono">ScanToSold v1.1.0</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;