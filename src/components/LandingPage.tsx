import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Zap, Box, DollarSign, Layers, Star, TrendingUp, Shield, Smartphone, BarChart3, Search, Camera } from 'lucide-react';
import Logo from './Logo';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: () => void;
    onOpenPrivacy: () => void;
    onLiteMode?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, onOpenPrivacy, onLiteMode }) => {

    // Scroll to Pricing
    const scrollToPricing = () => {
        const el = document.getElementById('pricing');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden relative font-sans selection:bg-neon-green selection:text-slate-950 pb-20">

            {/* Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-neon-green/5 rounded-full blur-[120px] animate-pulse duration-[4000ms]"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] animate-pulse duration-[5000ms]"></div>
                <div className="absolute top-[40%] left-[20%] w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[100px]"></div>
            </div>

            {/* Navbar */}
            <nav className="flex justify-between items-center p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] relative z-50 max-w-7xl mx-auto w-full">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <Logo className="w-10 h-10 drop-shadow-[0_0_15px_rgba(57,255,20,0.3)]" />
                    <span className="font-bold text-xl tracking-tight">Scan<span className="text-neon-green">To</span>Sold</span>
                </div>
                <div className="flex items-center gap-6">
                    <button onClick={scrollToPricing} className="text-sm font-bold text-slate-400 hover:text-white transition-colors hidden sm:block">
                        PRICING
                    </button>
                    <button onClick={onLogin} className="text-sm font-bold text-slate-400 hover:text-white transition-colors">
                        LOG IN
                    </button>
                    <button onClick={onGetStarted} className="px-5 py-2 bg-white text-slate-950 font-bold rounded-full text-sm hover:bg-neon-green transition-colors shadow-lg shadow-white/10 hover:shadow-neon-green/20">
                        Get App
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="relative z-10 pt-16 pb-24 px-6">
                <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">

                    {/* Hero Copy */}
                    <div className="text-center lg:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/50 border border-slate-800 mb-8 animate-in slide-in-from-bottom-4 fade-in duration-700 backdrop-blur-md">
                            <span className="flex h-2 w-2 rounded-full bg-neon-green shadow-[0_0_10px_#39ff14] animate-pulse"></span>
                            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-300">The OS for Six-Figure Resellers</span>
                        </div>

                        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter mb-6 leading-[0.95] bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                            Stop Guessing. <br />
                            <span className="text-neon-green drop-shadow-[0_0_30px_rgba(57,255,20,0.2)]">Start Scaling.</span>
                        </h1>

                        <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                            The only app that tracks your <strong>true net profit</strong>, manages inventory locations, and lists to eBay in seconds. Built for serious flippers.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                            <button
                                onClick={onGetStarted}
                                className="w-full sm:w-auto px-8 py-4 bg-neon-green text-slate-950 font-black text-lg rounded-2xl shadow-[0_0_40px_rgba(57,255,20,0.3)] hover:shadow-[0_0_60px_rgba(57,255,20,0.5)] hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3"
                            >
                                START FREE
                                <ArrowRight className="w-5 h-5" />
                            </button>
                            <button onClick={scrollToPricing} className="w-full sm:w-auto px-8 py-4 bg-slate-900 border border-slate-800 text-white font-bold text-lg rounded-2xl hover:bg-slate-800 hover:border-slate-600 transition-all flex items-center justify-center gap-3">
                                View Pricing
                            </button>
                        </div>

                        {onLiteMode && (
                            <div className="mt-6 flex justify-center lg:justify-start">
                                <button onClick={onLiteMode} className="text-sm text-slate-400 hover:text-white underline decoration-slate-600 hover:decoration-white transition-all">
                                    Or try "Lite Mode" (Sourcing Tools Only)
                                </button>
                            </div>
                        )}

                        <div className="mt-10 flex items-center justify-center lg:justify-start gap-6 text-slate-500 text-xs font-mono uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                                <Shield size={14} className="text-emerald-500" /> Secure Data
                            </div>
                            <div className="flex items-center gap-2">
                                <Zap size={14} className="text-yellow-500" /> AI Powered
                            </div>
                            <div className="flex items-center gap-2">
                                <TrendingUp size={14} className="text-blue-500" /> Real-time Stats
                            </div>
                        </div>
                    </div>

                    {/* Hero Visual - Interactive Profit Card */}
                    <div className="relative mx-auto w-full max-w-md lg:max-w-full perspective-1000">
                        <div className="relative z-10 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-6 shadow-2xl transform rotate-y-12 hover:rotate-y-0 transition-transform duration-700">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400">
                                        <Camera size={20} />
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400 font-mono uppercase">Just Scanned</div>
                                        <div className="font-bold text-white">Vintage Polaroid 600</div>
                                    </div>
                                </div>
                                <div className="px-3 py-1 bg-neon-green/10 border border-neon-green/20 rounded-full text-neon-green text-xs font-bold animate-pulse">
                                    HIGH DEMAND
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                    <div className="text-xs text-slate-500 font-mono uppercase mb-1">Buy Cost</div>
                                    <div className="text-2xl font-bold text-white">$5.00</div>
                                </div>
                                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                    <div className="text-xs text-slate-500 font-mono uppercase mb-1">Est. Value</div>
                                    <div className="text-2xl font-bold text-white">$45.00</div>
                                </div>
                            </div>

                            {/* Net Profit Highlight */}
                            <div className="p-5 bg-gradient-to-r from-neon-green/20 to-emerald-500/20 rounded-2xl border border-neon-green/30 flex justify-between items-center mb-6">
                                <div>
                                    <div className="text-xs text-neon-green font-bold uppercase tracking-wider mb-1">Net Profit</div>
                                    <div className="text-3xl font-black text-white">$28.45</div>
                                </div>
                                <div className="h-10 w-10 bg-neon-green rounded-full flex items-center justify-center text-slate-950 shadow-[0_0_15px_#39ff14]">
                                    <DollarSign size={20} strokeWidth={3} />
                                </div>
                            </div>

                            {/* Action Button */}
                            <button className="w-full py-3 bg-white text-slate-950 font-bold rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2">
                                <Box size={18} /> Add to Inventory
                            </button>
                        </div>

                        {/* Floating Elements */}
                        <div className="absolute -top-6 -right-6 bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-xl z-20 animate-bounce [animation-duration:4s]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-400"><Layers size={16} /></div>
                                <div>
                                    <div className="text-[10px] text-slate-400 font-mono uppercase">Bin Location</div>
                                    <div className="text-sm font-bold text-white">A-12</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Ticker Section */}
            <div className="w-full bg-slate-900/50 border-y border-slate-800 overflow-hidden py-3 mb-20">
                <div className="flex gap-12 animate-[scroll_20s_linear_infinite] whitespace-nowrap min-w-full">
                    {[...Array(2)].map((_, i) => (
                        <React.Fragment key={i}>
                            <TickerItem item="Nike Air Max 90" profit="$42.50" time="2m ago" />
                            <TickerItem item="Sony Walkman" profit="$28.00" time="5m ago" />
                            <TickerItem item="Pokemon Cards" profit="$150.00" time="12m ago" />
                            <TickerItem item="Vintage Levis" profit="$35.00" time="15m ago" />
                            <TickerItem item="Nintendo 64" profit="$85.00" time="22m ago" />
                            <TickerItem item="Patagonia Fleece" profit="$22.00" time="30m ago" />
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* App Showcase Section */}
            <div className="max-w-7xl mx-auto px-6 py-20 relative z-10">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-black text-white mb-6">Built for Speed</h2>
                    <p className="text-slate-400 max-w-2xl mx-auto text-lg">See how fast you can go from "Death Pile" to "Listed".</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 items-center justify-center">
                    {/* Screen 1: Scan */}
                    <PhoneMockup label="Scan Instantly">
                        <div className="h-full bg-black relative flex flex-col">
                            <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                                <Camera size={48} className="text-slate-700" />
                                <div className="absolute inset-0 border-2 border-neon-green/50 m-8 rounded-lg animate-pulse"></div>
                            </div>
                            <div className="mt-auto p-4 bg-slate-900/90 backdrop-blur">
                                <div className="text-neon-green font-bold text-xs mb-1">AI DETECTED</div>
                                <div className="text-white font-bold">Vintage Camera</div>
                                <div className="text-slate-400 text-xs">$45.00 Est. Value</div>
                            </div>
                        </div>
                    </PhoneMockup>

                    {/* Screen 2: Inventory (Center - Larger/Highlighted) */}
                    <div className="transform md:-translate-y-8 z-10">
                        <PhoneMockup label="Track Inventory" highlight>
                            <div className="h-full bg-slate-950 flex flex-col p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="font-bold text-white">Inventory</div>
                                    <Search size={16} className="text-slate-400" />
                                </div>
                                <div className="space-y-3">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="flex gap-3 p-2 bg-slate-900 rounded-lg border border-slate-800">
                                            <div className="w-10 h-10 bg-slate-800 rounded-md"></div>
                                            <div className="flex-1">
                                                <div className="h-3 w-24 bg-slate-800 rounded mb-1"></div>
                                                <div className="h-2 w-12 bg-slate-800 rounded"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-auto bg-neon-green text-slate-950 font-bold py-2 rounded-lg text-center text-sm">
                                    + Add New Item
                                </div>
                            </div>
                        </PhoneMockup>
                    </div>

                    {/* Screen 3: Stats */}
                    <PhoneMockup label="See Profit">
                        <div className="h-full bg-slate-950 p-4 flex flex-col">
                            <div className="font-bold text-white mb-4">Insights</div>
                            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 mb-4">
                                <div className="text-xs text-slate-400 uppercase">Total Profit</div>
                                <div className="text-2xl font-bold text-neon-green">$1,240.50</div>
                            </div>
                            <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-800/50 flex items-end justify-between p-2 gap-1">
                                {[40, 60, 30, 80, 50, 70, 90].map((h, i) => (
                                    <div key={i} className="w-full bg-blue-600/50 rounded-t-sm" style={{ height: h + '%' }}></div>
                                ))}
                            </div>
                        </div>
                    </PhoneMockup>
                </div>
            </div>

            {/* Value Props */}
            <div className="max-w-7xl mx-auto px-6 py-20">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-black text-white mb-6">Why Top Resellers Switch</h2>
                    <p className="text-slate-400 max-w-2xl mx-auto text-lg">Spreadsheets are dead. Upgrade to an operating system designed for speed.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    <FeatureCard
                        icon={<Smartphone className="text-blue-400" />}
                        title="Scan & Scout"
                        desc="Point your camera at any item. Our AI instantly identifies it and pulls current market comps."
                    />
                    <FeatureCard
                        icon={<BarChart3 className="text-neon-green" />}
                        title="True Profit Tracking"
                        desc="We automatically deduct eBay fees and shipping estimates so you know your EXACT net profit."
                    />
                    <FeatureCard
                        icon={<Box className="text-purple-400" />}
                        title="Inventory Management"
                        desc="Assign items to bins or storage units. Find any item in seconds when it sells."
                    />
                </div>
            </div>

            {/* Pricing Section */}
            <div id="pricing" className="px-6 py-24 relative z-10 bg-slate-900/30">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <h3 className="text-3xl font-black text-white mb-4">Simple, Transparent Pricing</h3>
                        <p className="text-slate-400">Start for free, upgrade when you scale.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
                        {/* Starter */}
                        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 flex flex-col relative overflow-hidden group hover:border-slate-600 transition-colors h-full">
                            <div className="mb-6">
                                <span className="text-slate-400 font-mono text-xs uppercase font-bold tracking-wider">Starter</span>
                                <div className="text-4xl font-black text-white mt-2 mb-1">$0 <span className="text-lg font-normal text-slate-500">/mo</span></div>
                                <p className="text-slate-400 text-sm">Perfect for hobbyists.</p>
                            </div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <CheckItem text="3 AI Scans per day" />
                                <CheckItem text="Profit Calculator" />
                                <CheckItem text="Inventory Tracking" />
                                <CheckItem text="Bulk Mode" crossed />
                            </ul>
                            <button onClick={onGetStarted} className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors">Get Started Free</button>
                        </div>

                        {/* Plus */}
                        <div className="bg-slate-950 border border-blue-900/50 rounded-3xl p-8 flex flex-col relative overflow-hidden group hover:border-blue-500 transition-colors shadow-lg shadow-blue-900/10 h-full transform md:-translate-y-4">
                            <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">Value</div>
                            <div className="mb-6">
                                <span className="text-blue-400 font-mono text-xs uppercase font-bold tracking-wider">Plus</span>
                                <div className="text-4xl font-black text-white mt-2 mb-1">$9.99 <span className="text-lg font-normal text-slate-500">/mo</span></div>
                                <p className="text-slate-400 text-sm">For part-time flippers.</p>
                            </div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <CheckItem text="30 AI Scans per day" color="text-blue-400" />
                                <CheckItem text="Profit Calculator" color="text-blue-400" />
                                <CheckItem text="Unlimited Inventory" color="text-blue-400" />
                                <CheckItem text="Bulk Mode" crossed />
                            </ul>
                            <button onClick={onGetStarted} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20">Get Plus</button>
                        </div>

                        {/* Pro */}
                        <div className="bg-slate-950 border-2 border-neon-green rounded-3xl p-8 flex flex-col relative overflow-hidden shadow-[0_0_30px_rgba(57,255,20,0.15)] transform md:-translate-y-8 transition-transform duration-300 h-full">
                            <div className="absolute top-0 right-0 bg-neon-green text-slate-950 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">Most Popular</div>
                            <div className="mb-6">
                                <span className="text-neon-green font-mono text-xs uppercase font-bold tracking-wider flex items-center gap-1"><Star size={12} fill="currentColor" /> Pro Reseller</span>
                                <div className="text-4xl font-black text-white mt-2 mb-1">$29 <span className="text-lg font-normal text-slate-500">/mo</span></div>
                                <p className="text-slate-400 text-sm">For volume sellers.</p>
                            </div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <CheckItem text="Unlimited AI Scans" highlight />
                                <CheckItem text="Bulk 'Death Pile' Mode" highlight />
                                <CheckItem text="AI Listing Generator" highlight />
                                <CheckItem text="CSV Ledger Export" highlight />
                                <CheckItem text="Priority Support" highlight />
                            </ul>
                            <button onClick={onGetStarted} className="w-full py-3 bg-neon-green text-slate-950 font-black rounded-xl hover:bg-neon-green/90 transition-colors shadow-lg shadow-neon-green/20">Upgrade Now</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer CTA */}
            <div className="p-8 pb-16 text-center max-w-2xl mx-auto relative z-10">
                <h3 className="text-3xl font-bold text-white mb-6">Ready to clear the pile?</h3>
                <button onClick={onGetStarted} className="w-full sm:w-auto px-12 py-4 bg-white text-slate-950 font-black text-lg rounded-full hover:bg-neon-green hover:scale-105 transition-all shadow-xl flex items-center justify-center gap-2 mx-auto">
                    Get Started Now <ArrowRight size={20} />
                </button>
                <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col items-center gap-4">
                    <p className="text-xs text-slate-500">© {new Date().getFullYear()} ScanToSold OS. Built for Resellers.</p>
                    <button onClick={onOpenPrivacy} className="text-[10px] text-slate-600 hover:text-white underline transition-colors">Privacy Policy</button>
                </div>
            </div>

            <style>{`
@keyframes scroll {
    0 % { transform: translateX(0); }
    100 % { transform: translateX(-50 %); }
}
                .perspective - 1000 {
    perspective: 1000px;
}
`}</style>
        </div>
    );
};

const TickerItem = ({ item, profit, time }: { item: string, profit: string, time: string }) => (
    <div className="inline-flex items-center gap-3 px-6 py-2 border-r border-slate-800/50">
        <span className="text-slate-400 text-sm font-medium">{item}</span>
        <span className="text-neon-green font-bold font-mono">{profit} Profit</span>
        <span className="text-slate-600 text-xs">{time}</span>
    </div>
);

const FeatureCard = ({ icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl hover:border-slate-600 transition-all hover:-translate-y-1 duration-300">
        <div className="w-14 h-14 bg-slate-950 rounded-2xl flex items-center justify-center mb-6 border border-slate-800 shadow-inner">{icon}</div>
        <h4 className="font-bold text-xl text-white mb-3">{title}</h4>
        <p className="text-slate-400 leading-relaxed">{desc}</p>
    </div>
);

const CheckItem = ({ text, color = "text-slate-300", crossed = false, highlight = false }: { text: string, color?: string, crossed?: boolean, highlight?: boolean }) => (
    <li className={`flex items-center gap-3 text-sm ${crossed ? 'text-slate-600 line-through decoration-slate-600' : color} ${highlight ? 'font-bold text-white' : ''} `}>
        {highlight ? (
            <div className="p-1 bg-neon-green rounded-full text-slate-950"><Check size={10} strokeWidth={4} /></div>
        ) : (
            <Check size={16} className={crossed ? 'text-slate-700' : (color === 'text-slate-300' ? 'text-white' : color)} />
        )}
        {text}
    </li>
);

const PhoneMockup = ({ children, label, highlight = false }: { children: React.ReactNode, label: string, highlight?: boolean }) => (
    <div className="flex flex-col items-center gap-4 group">
        <div className={`relative w-[280px] h-[580px] bg-slate-950 rounded-[3rem] border-8 ${highlight ? 'border-neon-green shadow-[0_0_50px_rgba(57,255,20,0.2)]' : 'border-slate-800 shadow-2xl'} overflow-hidden transition-all duration-500 hover:scale-105`}>
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-950 rounded-b-xl z-20"></div>
            {/* Screen Content */}
            <div className="w-full h-full bg-slate-900 pt-6">
                {children}
            </div>
        </div>
        <span className={`font-mono text-sm uppercase tracking-widest font-bold ${highlight ? 'text-neon-green' : 'text-slate-500'} `}>{label}</span>
    </div>
);

export default LandingPage;

