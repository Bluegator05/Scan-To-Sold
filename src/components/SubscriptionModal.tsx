
import React, { useState } from 'react';
import { Check, X, Star, Zap, Shield, Rocket, Layers } from 'lucide-react';
import { startStripeCheckout } from '../services/paymentService';
import { useAuth } from '../contexts/AuthContext';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { user, subscription } = useAuth();
    const [loading, setLoading] = useState<'PLUS' | 'PRO' | null>(null);
    const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

    if (!isOpen) return null;

    const handleUpgrade = async (tier: 'PLUS' | 'PRO') => {
        if (!user) {
            alert("Please log in to upgrade.");
            return;
        }
        setLoading(tier);

        // Redirects to Stripe hosted page
        const success = await startStripeCheckout(user.id, user.email || '', tier, billingInterval);

        if (!success) {
            setLoading(null);
        }
    };

    // Distinct style for the "Current Plan" button so it doesn't blend into the background
    const currentPlanStyle = "bg-slate-950/50 border-2 border-slate-700 text-slate-500 cursor-not-allowed shadow-none hover:bg-slate-950/50";

    return (
        <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
            {/* Modal Container */}
            <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl scale-100 animate-in zoom-in-95 duration-300 my-8 md:my-0 overflow-hidden">

                {/* Header Background */}
                <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-neon-green/5 to-transparent pointer-events-none"></div>
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors z-20 border border-slate-700 hover:border-slate-500">
                    <X size={20} />
                </button>

                <div className="p-6 md:p-12 relative z-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neon-green/10 text-neon-green text-xs font-bold font-mono mb-4 border border-neon-green/20">
                            <Star size={12} fill="currentColor" /> CHOOSE YOUR PLAN
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black text-white mb-3">Scale Your Business</h2>
                        <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">Choose the tier that fits your volume. Upgrade or cancel anytime.</p>

                        {/* Billing Toggle */}
                        <div className="inline-flex bg-slate-800 p-1 rounded-xl border border-slate-700 relative">
                            <button
                                onClick={() => setBillingInterval('MONTHLY')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${billingInterval === 'MONTHLY' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setBillingInterval('YEARLY')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${billingInterval === 'YEARLY' ? 'bg-neon-green text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                            >
                                Yearly <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-current">SAVE 20%</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-stretch">
                        {/* Free Plan */}
                        <div className={`p-6 rounded-2xl border flex flex-col transition-all ${subscription.tier === 'FREE' ? 'border-slate-600 bg-slate-800/80 ring-1 ring-slate-600' : 'border-slate-700 bg-slate-800/30'}`}>
                            <div className="mb-4">
                                <h3 className="text-slate-400 font-mono text-xs uppercase font-bold mb-2">Starter</h3>
                                <div className="text-3xl font-bold text-white mb-1">$0 <span className="text-sm font-normal text-slate-500">/mo</span></div>
                                <p className="text-xs text-slate-500">For hobbyists.</p>
                                {subscription.tier === 'FREE' && (
                                    <div className="mt-2 text-xs text-yellow-500 font-mono">
                                        {subscription.totalScans || 0} / {subscription.maxTotalScans || 10} scans used
                                    </div>
                                )}
                            </div>
                            <div className="w-full h-px bg-slate-800 mb-6"></div>
                            <ul className="space-y-3 flex-1">
                                <li className="text-xs text-slate-300 flex items-center gap-2"><Check size={14} /> 10 Lifetime Scans</li>
                                <li className="text-xs text-slate-300 flex items-center gap-2"><Check size={14} /> 3 Image Optimizations / Day</li>
                                <li className="text-xs text-slate-300 flex items-center gap-2"><Check size={14} /> Basic Inventory</li>
                                <li className="text-xs text-slate-600 flex items-center gap-2"><X size={14} /> No AI Magic Description</li>
                            </ul>
                            <div className="mt-6">
                                <button
                                    disabled
                                    className={`w-full py-3 font-bold rounded-xl text-sm ${subscription.tier === 'FREE' ? currentPlanStyle : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                >
                                    {subscription.tier === 'FREE' ? 'Current Plan' : 'Free'}
                                </button>
                            </div>
                        </div>

                        {/* Plus Plan (Middle) */}
                        <div className={`p-6 rounded-2xl border flex flex-col relative shadow-lg transition-all ${subscription.tier === 'PLUS' ? 'border-blue-500 bg-slate-800/80 ring-1 ring-blue-500 shadow-blue-900/20' : 'border-blue-500/50 bg-slate-800/60 shadow-blue-900/10'}`}>
                            <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl">VALUE</div>
                            <div className="mb-4">
                                <h3 className="text-blue-400 font-mono text-xs uppercase font-bold mb-2 flex items-center gap-1"><Layers size={14} /> Plus</h3>
                                <div className="text-3xl font-bold text-white mb-1">
                                    {billingInterval === 'MONTHLY' ? '$9.99' : '$99'}
                                    <span className="text-sm font-normal text-slate-500">/{billingInterval === 'MONTHLY' ? 'mo' : 'yr'}</span>
                                </div>
                                <p className="text-xs text-slate-500">For part-time flippers.</p>
                            </div>
                            <div className="w-full h-px bg-slate-700 mb-6"></div>
                            <ul className="space-y-3 flex-1">
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-blue-400" /> Unlimited Scans</li>
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-blue-400" /> 20 Image Optimizations / Day</li>
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-blue-400" /> Unlimited Inventory</li>
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-blue-400" /> Priority Support</li>
                                <li className="text-xs text-slate-500 flex items-center gap-2"><X size={14} /> No Bulk Mode</li>
                            </ul>
                            <div className="mt-6">
                                <button
                                    onClick={() => handleUpgrade('PLUS')}
                                    disabled={loading !== null || subscription.tier === 'PLUS'}
                                    className={`w-full py-3 font-bold rounded-xl transition-all shadow-lg text-sm flex justify-center items-center gap-2 ${subscription.tier === 'PLUS' ? currentPlanStyle : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'}`}
                                >
                                    {subscription.tier === 'PLUS' ? 'Current Plan' : (loading === 'PLUS' ? 'Processing...' : 'Get Plus')}
                                </button>
                            </div>
                        </div>

                        {/* Pro Plan (Top) */}
                        <div className={`p-6 rounded-2xl border-2 flex flex-col relative overflow-hidden shadow-[0_0_30px_rgba(57,255,20,0.15)] transform md:-translate-y-2 transition-all ${subscription.tier === 'PRO' ? 'border-neon-green bg-slate-800 ring-2 ring-neon-green/30' : 'border-neon-green bg-slate-800'}`}>
                            <div className="absolute top-0 right-0 bg-neon-green text-black text-[9px] font-bold px-3 py-1 rounded-bl-lg tracking-wider">PRO</div>
                            <div className="mb-4">
                                <h3 className="text-neon-green font-mono text-xs uppercase font-bold mb-2 flex items-center gap-1"><Zap size={14} /> Pro Reseller</h3>
                                <div className="text-3xl font-bold text-white mb-1">
                                    {billingInterval === 'MONTHLY' ? '$29' : '$299'}
                                    <span className="text-sm font-normal text-slate-500">/{billingInterval === 'MONTHLY' ? 'mo' : 'yr'}</span>
                                </div>
                                <p className="text-xs text-slate-500">For volume sellers.</p>
                            </div>
                            <div className="w-full h-px bg-slate-700 mb-6"></div>
                            <ul className="space-y-3 flex-1">
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-neon-green" /> Unlimited Scans + Optimizations</li>
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-neon-green" /> Death Pile (Bulk) Mode</li>
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-neon-green" /> AI Magic Description</li>
                                <li className="text-xs text-white flex items-center gap-2"><Check size={14} className="text-neon-green" /> CSV Ledger Export</li>
                            </ul>
                            <div className="mt-6">
                                <button
                                    onClick={() => handleUpgrade('PRO')}
                                    disabled={loading !== null || subscription.tier === 'PRO'}
                                    className={`w-full py-3 font-black rounded-xl transition-all shadow-lg text-sm flex justify-center items-center gap-2 ${subscription.tier === 'PRO' ? currentPlanStyle : 'bg-neon-green text-slate-950 hover:bg-neon-green/90 shadow-neon-green/30'}`}
                                >
                                    {subscription.tier === 'PRO' ? 'Current Plan' : (loading === 'PRO' ? 'Processing...' : <><Rocket size={16} /> Go Pro</>)}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <span className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
                            <Shield size={10} /> Secure payment powered by Stripe
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionModal;
