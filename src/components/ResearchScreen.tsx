import React, { useState } from 'react';
import { ArrowLeft, ExternalLink, Calendar, RefreshCw, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, Box, DollarSign, Filter, Search, Tag, ShoppingBag, Copy, AlertCircle, ScanLine } from 'lucide-react';
import { ScoutResult, Comp, MarketData } from '../types';
import { Browser } from '@capacitor/browser';
import MarketChart from './MarketChart';

interface ResearchScreenProps {
    result: ScoutResult;
    onDiscard: () => void;
    onCreateDraft: () => void;
}

const ResearchScreen: React.FC<ResearchScreenProps> = ({ result, onDiscard, onCreateDraft }) => {
    const [activeTab, setActiveTab] = useState<'SOLD' | 'ACTIVE'>('SOLD');

    const { marketData, itemTitle, estimatedSoldPrice, optimizedTitle, description, condition, itemSpecifics } = result;

    const activeComps = marketData?.activeComps || [];
    const soldComps = marketData?.soldComps || [];

    // Combine comps for Chart
    const allCompsForChart: MarketData[] = [
        ...soldComps.map(c => ({ price: c.price, title: c.title, type: 'sold' as const })),
        ...activeComps.map(c => ({ price: c.price, title: c.title, type: 'active' as const }))
    ];

    const displayComps = activeTab === 'SOLD' ? soldComps : activeComps;
    const sellThroughRate = marketData?.sellThroughRate || 0;

    // STR Logic
    const isGreat = sellThroughRate >= 50;
    const isGood = sellThroughRate >= 20 && sellThroughRate < 50;
    const isBad = sellThroughRate < 20;

    // Use neon theme colors but adapted logic
    const strColor = isGreat ? 'text-neon-green' : isGood ? 'text-yellow-400' : 'text-red-500';
    const strBg = isGreat ? 'bg-neon-green' : isGood ? 'bg-yellow-400' : 'bg-red-500';
    const StrIcon = isGreat ? TrendingUp : isGood ? Minus : TrendingDown;
    const marketStatusLabel = isGreat ? 'Hot Market' : isGood ? 'Steady Market' : 'Slow Market';

    const handleOpenLink = async (url: string) => {
        if (!url) return;
        await Browser.open({ url });
    };

    const copyToClipboard = (text: string) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            // Could show toast here
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch { return ''; }
    };

    // External Links Construction
    const encodedQuery = encodeURIComponent(itemTitle);
    const activeUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sop=12`;
    const soldUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&LH_Sold=1&LH_Complete=1&_sop=13`;
    const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;

    return (
        <div className="flex flex-col h-full bg-slate-950 pt-safe animate-in fade-in duration-300">

            {/* --- HEADER --- */}
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between z-20 sticky top-0">
                <button onClick={onDiscard} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                    <XCircle size={24} />
                </button>

                <div className="flex-1 mx-4 text-center">
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-0.5">RESEARCH DASHBOARD</div>
                    <h2 className="text-sm font-bold text-white truncate max-w-[200px] mx-auto leading-tight">{typeof itemTitle === 'object' ? JSON.stringify(itemTitle) : String(itemTitle || '')}</h2>
                </div>

                <button
                    onClick={onCreateDraft}
                    className="bg-neon-green text-slate-950 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-[0_0_15px_rgba(57,255,20,0.3)] hover:scale-105 transition-all"
                >
                    Draft <ScanLine size={12} className="ml-1 opacity-50" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">

                {/* --- SUMMARY CARD --- */}
                <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="inline-block text-blue-400 text-xs font-bold mb-1 uppercase tracking-wider">
                                {typeof itemSpecifics?.['Brand'] === 'object' ? JSON.stringify(itemSpecifics['Brand']) : String(itemSpecifics?.['Brand'] || itemSpecifics?.['Category'] || "Identified Item")}
                            </span>
                            <h2 className="text-xl font-bold text-white leading-tight mt-1">{typeof itemTitle === 'object' ? JSON.stringify(itemTitle) : String(itemTitle || '')}</h2>
                        </div>
                        <div className="text-right pl-4 shrink-0">
                            <p className="text-[10px] text-slate-500 uppercase font-mono">Est. Value</p>
                            <p className="text-2xl font-black text-neon-green">
                                ${typeof estimatedSoldPrice === 'object' ? JSON.stringify(estimatedSoldPrice) : Number(estimatedSoldPrice || 0).toFixed(0)}
                            </p>
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div className="grid grid-cols-2 gap-3 mt-6">
                        <button onClick={() => handleOpenLink(soldUrl)} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-neon-green border border-slate-700 py-2.5 px-4 rounded-xl font-bold transition-all text-xs">
                            <Tag size={14} /> View Solds
                        </button>
                        <button onClick={() => handleOpenLink(activeUrl)} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 py-2.5 px-4 rounded-xl font-bold transition-all text-xs">
                            <ShoppingBag size={14} /> View Actives
                        </button>
                    </div>
                    <button onClick={() => handleOpenLink(googleUrl)} className="mt-3 flex items-center justify-center gap-2 w-full bg-transparent border border-slate-700 text-slate-400 py-2 rounded-xl font-bold hover:bg-slate-800 transition-colors text-xs">
                        <Search size={14} /> Search on Google
                    </button>
                </div>


                {/* --- MARKET HEALTH (CHART) --- */}
                <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-white">Market Health</h3>
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-950 border border-slate-800 ${strColor}`}>
                            <StrIcon size={14} />
                            {marketStatusLabel}
                        </div>
                    </div>

                    {/* STR Bar */}
                    <div className="mb-6">
                        <div className="flex justify-between text-xs mb-2 items-baseline">
                            <span className="text-slate-500 font-medium">Sell Through Rate (90d)</span>
                            <span className={`font-black ${strColor} text-lg`}>{Math.round(sellThroughRate)}%</span>
                        </div>

                        <div className="w-full bg-slate-800 rounded-full h-2 mb-3 overflow-hidden">
                            <div
                                className={`h-full ${strBg.replace('bg-', 'bg-')} transition-all duration-1000`}
                                style={{ width: `${Math.min(sellThroughRate, 100)}%`, backgroundColor: isGreat ? '#39ff14' : isGood ? '#facc15' : '#ef4444' }}
                            ></div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-neon-green"></div>
                                <span className="font-bold text-slate-400">{marketData?.totalSold || 0} SOLD</span>
                            </div>
                            <span>vs</span>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <span className="font-bold text-slate-400">{marketData?.totalActive || 0} ACTIVE</span>
                            </div>
                        </div>
                    </div>

                    {/* CHART */}
                    {allCompsForChart.length > 0 && (
                        <div className="border-t border-slate-800 pt-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Price Distribution</h4>
                            <MarketChart data={allCompsForChart} />
                        </div>
                    )}

                    {/* Estimation Warning */}
                    {marketData?.isEstimated && (
                        <div className="mt-4 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-pulse">
                            <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-bold text-red-500">Estimated Data Used</p>
                                <p className="text-[10px] text-red-500/80 leading-tight mt-0.5">
                                    eBay Finding API returned 0 results. Sold data is estimated based on active listings minus 15%.
                                </p>
                            </div>
                        </div>
                    )}
                </div>


                {/* --- LISTING DETAILS --- */}
                <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h3 className="text-lg font-bold text-white">Listing Draft</h3>
                        <button
                            onClick={() => copyToClipboard(description)}
                            className="text-blue-400 hover:text-blue-300 text-xs font-bold flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded-lg"
                        >
                            <Copy size={12} /> Copy
                        </button>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Optimized Title</label>
                        <div className="text-sm font-medium text-white bg-slate-950 p-3 rounded-lg border border-slate-800 select-all">
                            {typeof optimizedTitle === 'object' ? JSON.stringify(optimizedTitle) : String(optimizedTitle || itemTitle || '')}
                        </div>
                    </div>

                    {/* Features/Specifics */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 block">Detected Specifics</label>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-3 py-1 rounded-full bg-slate-800 text-white text-xs font-semibold border border-slate-700">
                                {typeof condition === 'object' ? JSON.stringify(condition) : String(condition || '')}
                            </span>
                            {Object.entries(itemSpecifics || {}).slice(0, 6).map(([key, val], i) => (
                                <span key={i} className="px-3 py-1 bg-slate-800 text-blue-400 text-xs rounded-full font-medium border border-slate-700">
                                    <span className="opacity-50 mr-1">{String(key)}:</span>{typeof val === 'object' ? JSON.stringify(val) : String(val || '')}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Description Preview</label>
                        <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-32 overflow-y-auto leading-relaxed">
                            {typeof description === 'object' ? JSON.stringify(description) : String(description || '')}
                        </div>
                    </div>
                </div>


                {/* --- COMPS LIST (Tabs) --- */}
                <div className="space-y-3">
                    <div className="bg-slate-900 p-1 rounded-xl flex border border-slate-800">
                        <button
                            onClick={() => setActiveTab('SOLD')}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'SOLD' ? 'bg-slate-800 text-neon-green shadow-sm ring-1 ring-white/5' : 'text-slate-500 hover:text-white'}`}
                        >
                            <CheckCircle2 size={14} />
                            SOLD {marketData?.isEstimated && <span className="text-[8px] opacity-60 ml-0.5">(EST.)</span>}
                        </button>
                        <button
                            onClick={() => setActiveTab('ACTIVE')}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'ACTIVE' ? 'bg-slate-800 text-blue-400 shadow-sm ring-1 ring-white/5' : 'text-slate-500 hover:text-white'}`}
                        >
                            <Box size={14} />
                            ACTIVE
                        </button>
                    </div>

                    {displayComps.map((comp) => (
                        <div
                            key={comp.id}
                            onClick={() => handleOpenLink(comp.url)}
                            className={`bg-slate-900 border border-slate-800 rounded-xl p-3 flex gap-3 hover:bg-slate-800 transition-colors cursor-pointer group active:scale-[0.99] ${activeTab === 'SOLD' && marketData?.isEstimated ? 'opacity-90' : ''}`}
                        >
                            {/* Image */}
                            <div className="w-16 h-16 bg-slate-950 rounded-lg shrink-0 overflow-hidden relative border border-slate-800">
                                {comp.image ? (
                                    <img src={comp.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full"><Box size={20} className="text-slate-700" /></div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                <h4 className="text-xs font-medium text-slate-300 line-clamp-2 leading-snug group-hover:text-white transition-colors">
                                    {typeof comp.title === 'object' ? JSON.stringify(comp.title) : String(comp.title || '')}
                                </h4>

                                <div className="flex items-end justify-between mt-1">
                                    <div>
                                        <div className={`text-sm font-black ${activeTab === 'SOLD' ? (marketData?.isEstimated ? 'text-yellow-400' : 'text-neon-green') : 'text-white'}`}>
                                            ${typeof comp.price === 'object' ? JSON.stringify(comp.price) : Number(comp.price || 0).toFixed(2)}
                                        </div>
                                    </div>

                                    {activeTab === 'SOLD' && comp.dateSold && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                            <Calendar size={10} /> {formatDate(comp.dateSold)}
                                        </div>
                                    )}
                                    {activeTab === 'SOLD' && marketData?.isEstimated && (
                                        <div className="text-[9px] font-bold text-yellow-400/60 uppercase">
                                            Active Fallback
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Disclaimer */}
                <div className="flex items-start gap-3 p-3 rounded-lg text-slate-600 text-[10px] border border-slate-800/50">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <p>AI estimates and comps are for reference only. Verify all details on eBay before listing.</p>
                </div>

            </div>
        </div>
    );
};

export default ResearchScreen;
