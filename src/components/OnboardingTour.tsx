import React, { useState } from 'react';
import { Camera, BarChart3, Box, Share2, ArrowRight, Check, X } from 'lucide-react';

interface OnboardingTourProps {
    onComplete: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete }) => {
    const [step, setStep] = useState(0);

    const steps = [
        {
            title: "Welcome to ScanToSold",
            desc: "The operating system for professional resellers. Let's get you set up for speed.",
            icon: <div className="w-20 h-20 bg-neon-green/20 rounded-full flex items-center justify-center text-neon-green mb-6"><Camera size={40} /></div>,
            color: "neon-green"
        },
        {
            title: "Scan & Analyze",
            desc: "Point your camera at any item. Our AI identifies it, finds market comps, and estimates value instantly.",
            icon: <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 mb-6"><Camera size={40} /></div>,
            color: "blue-400"
        },
        {
            title: "True Profit",
            desc: "We automatically calculate fees and shipping to show your EXACT net profit before you buy.",
            icon: <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 mb-6"><BarChart3 size={40} /></div>,
            color: "emerald-400"
        },
        {
            title: "Inventory & Bins",
            desc: "Never lose an item. Assign items to specific Storage Units or Bins so you can find them instantly when they sell.",
            icon: <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 mb-6"><Box size={40} /></div>,
            color: "purple-400"
        },
        {
            title: "List to eBay",
            desc: "Connect your eBay account in Settings. Turn your drafts into live listings with one click.",
            icon: <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 mb-6"><Share2 size={40} /></div>,
            color: "orange-400"
        }
    ];

    const currentStep = steps[step];
    const isLastStep = step === steps.length - 1;

    const handleNext = () => {
        if (isLastStep) {
            onComplete();
        } else {
            setStep(prev => prev + 1);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center relative overflow-hidden shadow-2xl">
                {/* Progress Bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
                    <div
                        className="h-full bg-neon-green transition-all duration-300 ease-out"
                        style={{ width: `${((step + 1) / steps.length) * 100}%` }}
                    ></div>
                </div>

                <div className="absolute top-4 right-4">
                    <button onClick={onComplete} className="text-slate-500 hover:text-white transition-colors p-2">
                        <X size={20} />
                    </button>
                </div>

                <div className="mt-8 flex flex-col items-center animate-in slide-in-from-bottom-4 duration-500 key={step}">
                    {currentStep.icon}
                    <h2 className="text-2xl font-black text-white mb-4">{currentStep.title}</h2>
                    <p className="text-slate-400 leading-relaxed mb-8">{currentStep.desc}</p>
                </div>

                <button
                    onClick={handleNext}
                    className="w-full py-4 bg-neon-green text-slate-950 font-black rounded-xl hover:bg-neon-green/90 transition-all shadow-lg shadow-neon-green/20 flex items-center justify-center gap-2 group"
                >
                    {isLastStep ? "Get Started" : "Next"}
                    {isLastStep ? <Check size={20} /> : <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                </button>

                {/* Dots */}
                <div className="flex justify-center gap-2 mt-6">
                    {steps.map((_, i) => (
                        <div
                            key={i}
                            className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-white' : 'bg-slate-800'}`}
                        ></div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OnboardingTour;
