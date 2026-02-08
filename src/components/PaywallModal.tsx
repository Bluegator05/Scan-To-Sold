
import React from 'react';
import { X, Lock, Zap, TrendingUp, Shield } from 'lucide-react';
import { startStripeCheckout } from '../services/paymentService';
import { useAuth } from '../contexts/AuthContext';

interface PaywallModalProps {
    isOpen: boolean;
    onClose: () => void;
    scansUsed: number;
    maxScans: number;
}

const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose, scansUsed, maxScans }) => {
    const { user } = useAuth();

    if (!isOpen) return null;

    const handleUpgrade = async (tier: 'PLUS' | 'PRO') => {
        if (!user) {
            alert("Please log in to upgrade.");
            return;
        }
        await startStripeCheckout(user.id, user.email || '', tier, 'MONTHLY');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-8">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors border border-slate-700 hover:border-slate-500"
                >
                    <X size={20} />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500 flex items-center justify-center">
                        <Lock size={32} className="text-red-500" />
                    </div>
                </div>

                {/* Headline */}
                <h2 className="text-3xl font-black text-white text-center mb-3">
                    You've Used All {maxScans} Free Scans
                </h2>
                <p className="text-slate-400 text-center mb-8">
                    You've scanned <span className="text-white font-bold">{scansUsed}</span> items. Upgrade to continue scanning and unlock premium features.
                </p>

                {/* Comparison Table */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    {/* PLUS Tier */}
                    <div className="p-6 rounded-2xl border border-blue-500/50 bg-slate-800/60 hover:border-blue-500 transition-all">
                        <div className="flex items-center gap-2 mb-4">
                            <TrendingUp size={20} className="text-blue-400" />
                            <h3 className="text-blue-400 font-mono text-sm uppercase font-bold">Plus</h3>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">$9.99<span className="text-sm font-normal text-slate-500">/mo</span></div>
                        <p className="text-xs text-slate-500 mb-4">For part-time flippers</p>
                        <ul className="space-y-2 mb-6 text-xs text-slate-300">
                            <li className="flex items-start gap-2">
                                <Zap size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                                <span>Unlimited Scans</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <Zap size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                                <span>20 Image Optimizations/Day</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <Zap size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                                <span>Priority Support</span>
                            </li>
                        </ul>
                        <button
                            onClick={() => handleUpgrade('PLUS')}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg"
                        >
                            Get Plus
                        </button>
                    </div>

                    {/* PRO Tier */}
                    <div className="p-6 rounded-2xl border-2 border-neon-green bg-slate-800 hover:border-neon-green/80 transition-all shadow-[0_0_30px_rgba(57,255,20,0.15)]">
                        <div className="absolute top-0 right-0 bg-neon-green text-black text-[9px] font-bold px-3 py-1 rounded-bl-lg tracking-wider">BEST VALUE</div>
                        <div className="flex items-center gap-2 mb-4">
                            <Shield size={20} className="text-neon-green" />
                            <h3 className="text-neon-green font-mono text-sm uppercase font-bold">Pro</h3>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">$29<span className="text-sm font-normal text-slate-500">/mo</span></div>
                        <p className="text-xs text-slate-500 mb-4">For volume sellers</p>
                        <ul className="space-y-2 mb-6 text-xs text-white">
                            <li className="flex items-start gap-2">
                                <Zap size={14} className="text-neon-green mt-0.5 flex-shrink-0" />
                                <span>Unlimited Everything</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <Zap size={14} className="text-neon-green mt-0.5 flex-shrink-0" />
                                <span>Bulk Mode (Death Pile)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <Zap size={14} className="text-neon-green mt-0.5 flex-shrink-0" />
                                <span>AI Magic Description</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <Zap size={14} className="text-neon-green mt-0.5 flex-shrink-0" />
                                <span>CSV Export</span>
                            </li>
                        </ul>
                        <button
                            onClick={() => handleUpgrade('PRO')}
                            className="w-full py-3 bg-neon-green text-slate-950 font-black rounded-xl transition-all shadow-lg hover:bg-neon-green/90"
                        >
                            Go Pro
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center">
                    <p className="text-xs text-slate-500">Cancel anytime. No hidden fees.</p>
                </div>
            </div>
        </div>
    );
};

export default PaywallModal;
