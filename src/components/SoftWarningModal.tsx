
import React from 'react';
import { X, AlertTriangle, Zap } from 'lucide-react';

interface SoftWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    scansUsed: number;
    maxScans: number;
    onUpgrade: () => void;
}

const SoftWarningModal: React.FC<SoftWarningModalProps> = ({ isOpen, onClose, scansUsed, maxScans, onUpgrade }) => {
    if (!isOpen) return null;

    const remaining = maxScans - scansUsed;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-slate-900 border border-yellow-500/50 rounded-2xl shadow-2xl p-6">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/10 border-2 border-yellow-500 flex items-center justify-center">
                        <AlertTriangle size={24} className="text-yellow-500" />
                    </div>
                </div>

                {/* Headline */}
                <h3 className="text-xl font-bold text-white text-center mb-2">
                    Almost Out of Free Scans
                </h3>
                <p className="text-slate-400 text-center text-sm mb-6">
                    You've used <span className="text-yellow-500 font-bold">{scansUsed} of {maxScans}</span> free scans.
                    Only <span className="text-white font-bold">{remaining} scans</span> remaining.
                </p>

                {/* CTA */}
                <div className="space-y-3">
                    <button
                        onClick={onUpgrade}
                        className="w-full py-3 bg-neon-green text-slate-950 font-bold rounded-xl transition-all shadow-lg hover:bg-neon-green/90 flex items-center justify-center gap-2"
                    >
                        <Zap size={18} />
                        Upgrade for Unlimited Scans
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-2 text-slate-400 hover:text-white text-sm transition-colors"
                    >
                        Continue with {remaining} scans
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SoftWarningModal;
