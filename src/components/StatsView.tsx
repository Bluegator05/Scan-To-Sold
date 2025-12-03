
import React, { useMemo, useState, useEffect } from 'react';
import { InventoryItem } from '../types';
import { BarChart3, TrendingUp, DollarSign, Settings, Sun, Moon, Package, Target, CalendarDays, ChevronRight, PenLine, X, ArrowUpRight, ChevronLeft, ChevronDown, ChevronUp, Flame, Trophy, Activity, Wallet, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface StatsViewProps {
    inventory: InventoryItem[];
    onSettings?: () => void;
}

interface UserGoals {
    dailyCount: number;
    dailyValue: number;
}

const StatsView: React.FC<StatsViewProps> = ({ inventory, onSettings }) => {
    const { theme, toggleTheme } = useTheme();
    const [timeframe, setTimeframe] = useState<'DAY' | 'WEEK' | 'MONTH'>('DAY');
    const [isEditingGoals, setIsEditingGoals] = useState(false);
    const [goals, setGoals] = useState<UserGoals>({ dailyCount: 5, dailyValue: 100 });

    // Calendar State
    const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
    const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    // Load Goals
    useEffect(() => {
        const saved = localStorage.getItem('sts_user_goals');
        if (saved) {
            try {
                setGoals(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse goals", e);
            }
        }
    }, []);

    const saveGoals = (newGoals: UserGoals) => {
        setGoals(newGoals);
        localStorage.setItem('sts_user_goals', JSON.stringify(newGoals));
        setIsEditingGoals(false);
    };

    // Advanced Metrics Calculation
    const { metrics, dailyStats, chartData, streak } = useMemo(() => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).getTime(); // Sunday
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        // Restore date for other calcs
        const today = new Date();

        // Overall Stats
        const totalItems = inventory.length;
        const totalValue = inventory.reduce((sum, i) => sum + i.calculation.soldPrice, 0);
        const totalNet = inventory.reduce((sum, i) => sum + i.calculation.netProfit, 0);
        const listedCount = inventory.filter(i => i.status === 'LISTED').length;
        const soldCount = inventory.filter(i => i.status === 'SOLD').length;
        const avgProfit = soldCount + listedCount > 0 ? totalNet / (soldCount + listedCount) : 0;

        // Draft Stats
        const draftItems = inventory.filter(i => i.status === 'DRAFT');
        const draftCount = draftItems.length;
        const draftValue = draftItems.reduce((sum, i) => sum + i.calculation.soldPrice, 0);

        // Progress Tracking (Listed items only)
        const listedItems = inventory.filter(i => i.status === 'LISTED' || i.status === 'SOLD');

        let progressCount = 0;
        let progressValue = 0;

        // Daily Aggregation for Calendar & Chart
        const stats: Record<string, { count: number, value: number, profit: number }> = {};

        listedItems.forEach(item => {
            const dateObj = item.ebayListedDate ? new Date(item.ebayListedDate) : new Date(item.dateScanned);
            const dateKey = dateObj.toLocaleDateString('en-CA'); // YYYY-MM-DD in Local Time
            const todayKey = new Date().toLocaleDateString('en-CA');

            if (!stats[dateKey]) stats[dateKey] = { count: 0, value: 0, profit: 0 };

            const val = item.ebayPrice || item.calculation.soldPrice;
            const profit = item.calculation.netProfit;

            stats[dateKey].count += 1;
            stats[dateKey].value += val;
            stats[dateKey].profit += profit;

            // Progress Tracking
            if (timeframe === 'DAY') {
                if (dateKey === todayKey) {
                    progressCount++;
                    progressValue += val;
                }
            } else if (timeframe === 'WEEK') {
                const time = dateObj.getTime();
                if (time >= startOfWeek) {
                    progressCount++;
                    progressValue += val;
                }
            } else if (timeframe === 'MONTH') {
                const time = dateObj.getTime();
                if (time >= startOfMonth) {
                    progressCount++;
                    progressValue += val;
                }
            }
        });

        // Generate Chart Data (Last 14 Days)
        const chart = [];
        let maxChartValue = 0;
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const key = d.toLocaleDateString('en-CA');
            const dayStat = stats[key] || { value: 0, profit: 0, count: 0 };
            chart.push({
                day: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
                date: d.getDate(),
                value: dayStat.value,
                profit: dayStat.profit,
                count: dayStat.count
            });
            if (dayStat.value > maxChartValue) maxChartValue = dayStat.value;
        }

        // Streak Calculation (Consecutive days with at least 1 listing)
        const sortedDates = Object.keys(stats).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        let currentStreak = 0;

        // Check if we listed today
        const listedToday = stats[new Date().toLocaleDateString('en-CA')]?.count > 0;

        // If listed today, start streak at 1. If not, streak is 0 (unless we check yesterday, but let's keep it simple: strict streak)
        // Actually, users prefer if streak doesn't break until the day is OVER. 
        // So if listed today, count it. If not, check yesterday.

        let streakDate = new Date();
        // Check today
        if (stats[streakDate.toLocaleDateString('en-CA')]?.count > 0) {
            currentStreak++;
            streakDate.setDate(streakDate.getDate() - 1);
        } else {
            // If nothing today, check yesterday. If yesterday has data, streak is alive but waiting for today.
            // If yesterday is empty, streak is broken (0).
            streakDate.setDate(streakDate.getDate() - 1);
            if (stats[streakDate.toLocaleDateString('en-CA')]?.count > 0) {
                // Streak continues from yesterday
            } else {
                // Streak broken
            }
        }

        // Simple loop for past days
        while (true) {
            const dateKey = streakDate.toLocaleDateString('en-CA');
            if (stats[dateKey]?.count > 0) {
                currentStreak++;
                streakDate.setDate(streakDate.getDate() - 1);
            } else {
                break;
            }
        }

        // Calculate Target based on timeframe
        let targetCount = goals.dailyCount;
        let targetValue = goals.dailyValue;

        if (timeframe === 'WEEK') {
            targetCount *= 7;
            targetValue *= 7;
        } else if (timeframe === 'MONTH') {
            targetCount *= 30;
            targetValue *= 30;
        }

        // Top Sources
        const sourcePerformance: Record<string, number> = {};
        inventory.forEach(i => {
            sourcePerformance[i.storageUnitId] = (sourcePerformance[i.storageUnitId] || 0) + i.calculation.netProfit;
        });

        const topSources = Object.entries(sourcePerformance)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, val], idx, arr) => ({
                name,
                val,
                percent: (val / (arr[0][1] || 1)) * 100 // Relative to top performer
            }));

        return {
            metrics: {
                totalItems,
                totalValue,
                totalNet,
                listedCount,
                topSources,
                avgProfit,
                draftCount,
                draftValue,
                progressCount,
                progressValue,
                targetCount,
                targetValue
            },
            dailyStats: stats,
            chartData: { data: chart, max: maxChartValue > 0 ? maxChartValue : 100 },
            streak: currentStreak
        };
    }, [inventory, goals, timeframe]);

    // Calendar Generation Helpers
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday

        const days = [];
        // Add empty slots for days before the first day of the month
        for (let i = 0; i < firstDayOfWeek; i++) {
            days.push(null);
        }
        // Add actual days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }
        return days;
    };

    const calendarDays = getDaysInMonth(currentCalendarMonth);

    const changeMonth = (delta: number) => {
        setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    };

    // Helper for Consistent Currency Formatting
    const formatMoney = (amount: number) => {
        return amount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    // Circular Progress Component
    const CircularProgress = ({ value, max, size = 60, strokeWidth = 6, children }: any) => {
        const radius = (size - strokeWidth) / 2;
        const circumference = radius * 2 * Math.PI;
        const percent = Math.min(100, Math.max(0, (value / max) * 100));
        const offset = circumference - (percent / 100) * circumference;

        let color = "stroke-blue-500";
        if (percent >= 100) color = "stroke-neon-green";
        else if (percent < 30) color = "stroke-slate-500";

        return (
            <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="transform -rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-slate-200 dark:text-slate-800" />
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={`transition-all duration-1000 ${color}`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    {children}
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950 overflow-y-auto pb-24 text-slate-900 dark:text-white transition-colors pt-safe">
            {/* Goals Editor Modal */}
            {isEditingGoals && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Target className="text-emerald-600 dark:text-neon-green" /> Set Daily Targets
                            </h3>
                            <button onClick={() => setIsEditingGoals(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20} /></button>
                        </div>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const c = parseInt((form.elements.namedItem('count') as HTMLInputElement).value);
                            const v = parseInt((form.elements.namedItem('value') as HTMLInputElement).value);
                            saveGoals({ dailyCount: c, dailyValue: v });
                        }} className="space-y-4">
                            <div>
                                <label className="text-xs font-mono uppercase text-slate-500 mb-1 block">Daily Listings Goal</label>
                                <input name="count" type="number" defaultValue={goals.dailyCount} className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 text-lg font-bold focus:border-emerald-500 dark:focus:border-neon-green outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-mono uppercase text-slate-500 mb-1 block">Daily Revenue Goal ($)</label>
                                <input name="value" type="number" defaultValue={goals.dailyValue} className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 text-lg font-bold focus:border-emerald-500 dark:focus:border-neon-green outline-none" />
                            </div>
                            <button type="submit" className="w-full py-3 bg-emerald-600 dark:bg-neon-green text-white dark:text-slate-950 font-bold rounded-xl shadow-lg mt-2">
                                Update Goals
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Daily Listings Modal */}
            {selectedDate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedDate(null)}>
                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                            <h3 className="font-bold text-lg flex items-center gap-2 text-slate-900 dark:text-white">
                                <CalendarDays className="text-blue-500" size={20} />
                                {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </h3>
                            <button onClick={() => setSelectedDate(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {(() => {
                                const dateKey = new Date(selectedDate).toLocaleDateString('en-CA');
                                // Filter items for this date
                                const itemsOnDate = inventory.filter(i => {
                                    const d = i.ebayListedDate ? new Date(i.ebayListedDate) : new Date(i.dateScanned);
                                    return d.toLocaleDateString('en-CA') === dateKey && (i.status === 'LISTED' || i.status === 'SOLD');
                                });

                                if (itemsOnDate.length === 0) return <div className="text-center text-slate-500 py-8">No items listed on this date.</div>;

                                const totalGross = itemsOnDate.reduce((sum, i) => sum + i.calculation.soldPrice, 0);

                                return (
                                    <>
                                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl flex justify-between items-center">
                                            <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Total Listing Value</span>
                                            <span className="text-xl font-black text-blue-600 dark:text-blue-400">${totalGross.toFixed(2)}</span>
                                        </div>
                                        {itemsOnDate.map(item => (
                                            <div key={item.id} className="flex gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
                                                <div className="w-12 h-12 bg-gray-200 dark:bg-slate-800 rounded-lg overflow-hidden shrink-0">
                                                    {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{item.title}</div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-xs font-mono text-emerald-600 dark:text-neon-green font-bold">${item.calculation.soldPrice}</span>
                                                        <span className="text-[10px] text-slate-400 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700">{item.status}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
                <div>
                    <h2 className="text-xl font-black flex items-center gap-2">
                        <BarChart3 className="text-emerald-600 dark:text-neon-green" size={20} /> Analytics
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={toggleTheme} className="p-2 rounded-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:scale-105 transition-all">
                        {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}
                    </button>
                    {onSettings && (
                        <button onClick={onSettings} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-gray-200 dark:border-slate-700">
                            <Settings size={18} />
                        </button>
                    )}
                </div>
            </div>

            <div className="p-4 space-y-6">

                {/* 1. FINANCIAL DASHBOARD HERO */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 dark:from-slate-800 dark:to-slate-900 p-5 rounded-2xl shadow-xl border border-slate-700 relative overflow-hidden group">
                        {/* Background Glow */}
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/20 dark:bg-neon-green/10 rounded-full blur-3xl group-hover:bg-emerald-500/30 transition-all duration-700"></div>

                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 dark:text-neon-green mb-1 flex items-center gap-1">
                                        <Wallet size={12} /> Projected Net Profit
                                    </div>
                                    <div className="text-4xl font-black text-white tracking-tight">
                                        {formatMoney(metrics.totalNet)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[9px] font-mono uppercase text-slate-400">Total Sales</div>
                                    <div className="text-lg font-bold text-slate-200">
                                        {formatMoney(metrics.totalValue)}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/10 flex gap-4 text-xs text-slate-400 font-medium">
                                <div className="flex items-center gap-1">
                                    <TrendingUp size={14} className="text-emerald-400" />
                                    <span className="text-white font-bold">{formatMoney(metrics.avgProfit).replace('$', '')}</span> avg/item
                                </div>
                                <div className="flex items-center gap-1">
                                    <Activity size={14} className="text-blue-400" />
                                    <span className="text-white font-bold">{metrics.listedCount}</span> listed
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. GOAL TRACKER (MISSION CONTROL) */}
                <div>
                    <div className="flex justify-between items-center mb-3 px-1">
                        <h3 className="text-slate-500 font-mono text-xs uppercase tracking-widest flex items-center gap-2">
                            <Target size={14} /> Mission Control
                        </h3>
                        <div className="flex items-center gap-2">
                            {streak > 2 && (
                                <div className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
                                    <Flame size={10} fill="currentColor" /> {streak} Day Streak
                                </div>
                            )}
                            <button onClick={() => setIsEditingGoals(true)} className="text-slate-400 hover:text-emerald-500 dark:hover:text-neon-green">
                                <PenLine size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Timeframe Toggles */}
                    <div className="flex bg-gray-200 dark:bg-slate-800 rounded-lg p-1 mb-4 w-fit mx-auto">
                        {(['DAY', 'WEEK', 'MONTH'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setTimeframe(t)}
                                className={`px-4 py-1 rounded-md text-[10px] font-bold transition-all ${timeframe === t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white scale-105' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Circular Progress Card */}
                        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Items Listed</div>
                            <CircularProgress value={metrics.progressCount} max={metrics.targetCount} size={90} strokeWidth={8}>
                                <div className="flex flex-col items-center">
                                    <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">{metrics.progressCount}</span>
                                    <span className="text-[9px] text-slate-400">/ {metrics.targetCount}</span>
                                </div>
                            </CircularProgress>
                            {metrics.progressCount >= metrics.targetCount && (
                                <div className="absolute bottom-2 text-[9px] text-emerald-500 font-bold flex items-center gap-1 animate-in fade-in slide-in-from-bottom-2">
                                    <Check size={10} strokeWidth={4} /> GOAL MET
                                </div>
                            )}
                        </div>

                        {/* Revenue Progress Card */}
                        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between relative overflow-hidden">
                            <div className="flex justify-between items-start">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Revenue</div>
                                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${metrics.progressValue >= metrics.targetValue ? 'bg-emerald-100 dark:bg-neon-green/20 text-emerald-600 dark:text-neon-green' : 'bg-gray-100 dark:bg-slate-800 text-slate-500'}`}>
                                    {Math.round((metrics.progressValue / (metrics.targetValue || 1)) * 100)}%
                                </div>
                            </div>
                            <div className="mt-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white block">
                                    {formatMoney(metrics.progressValue).replace('.00', '')}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">Target: ${metrics.targetValue}</span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ${metrics.progressValue >= metrics.targetValue ? 'bg-emerald-500 dark:bg-neon-green' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(100, (metrics.progressValue / (metrics.targetValue || 1)) * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. PERFORMANCE CALENDAR (TRANSPARENT / IMMERSIVE) */}
                <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-white/20 dark:border-slate-800/50 rounded-3xl overflow-hidden shadow-2xl ring-1 ring-slate-900/5 dark:ring-white/5">
                    <div
                        className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/10 dark:hover:bg-white/5 transition-colors"
                        onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
                    >
                        <div className="flex items-center gap-2">
                            <CalendarDays size={18} className="text-emerald-600 dark:text-neon-green" />
                            <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white">Activity Log</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono hidden sm:block uppercase tracking-wider font-bold">
                                {currentCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </span>
                            {isCalendarExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                    </div>

                    {isCalendarExpanded && (
                        <div className="p-5 pt-0 animate-in slide-in-from-top-4 duration-300">
                            {/* Month Nav */}
                            <div className="flex justify-between items-center mb-4 px-2">
                                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-white/20 dark:hover:bg-slate-700/50 rounded-full transition-colors"><ChevronLeft size={16} className="text-slate-600 dark:text-slate-300" /></button>
                                <span className="text-xs font-bold font-mono text-slate-600 dark:text-slate-300 sm:hidden">{currentCalendarMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-white/20 dark:hover:bg-slate-700/50 rounded-full transition-colors"><ChevronRight size={16} className="text-slate-600 dark:text-slate-300" /></button>
                            </div>

                            <div className="grid grid-cols-7 gap-2">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                    <div key={i} className="text-center text-[9px] text-slate-400 font-bold mb-1 opacity-60">{d}</div>
                                ))}
                                {calendarDays.map((date, i) => {
                                    if (!date) return <div key={i} className="aspect-square"></div>;

                                    const dateKey = date.toLocaleDateString('en-CA');
                                    const stat = dailyStats[dateKey];
                                    const count = stat ? stat.count : 0;
                                    const isToday = new Date().toDateString() === date.toDateString();
                                    const intensity = count === 0 ? 0 : count >= goals.dailyCount ? 3 : count >= Math.floor(goals.dailyCount / 2) ? 2 : 1;

                                    // Visual Logic for Transparent Cells
                                    let cellClass = "bg-slate-200/30 dark:bg-slate-800/30 border-transparent text-slate-400/50";
                                    let countColor = "text-slate-400/50";
                                    let dateColor = "text-slate-400/50";

                                    if (intensity === 3) {
                                        // Goal Met (Vibrant Gradient)
                                        cellClass = "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 border-t border-white/20";
                                        countColor = "text-white drop-shadow-md";
                                        dateColor = "text-emerald-100";
                                    } else if (intensity === 2) {
                                        // Near Goal
                                        cellClass = "bg-emerald-500/20 border border-emerald-500/30";
                                        countColor = "text-emerald-600 dark:text-emerald-400";
                                        dateColor = "text-emerald-600/60 dark:text-emerald-400/60";
                                    } else if (intensity === 1) {
                                        // Some Activity
                                        cellClass = "bg-emerald-500/10 border border-emerald-500/10";
                                        countColor = "text-emerald-600/80 dark:text-emerald-400/80";
                                        dateColor = "text-slate-500";
                                    }

                                    if (isToday) {
                                        cellClass += " ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-900";
                                    }

                                    return (
                                        <div
                                            key={i}
                                            onClick={() => setSelectedDate(date.toISOString())}
                                            className={`aspect-square rounded-xl flex flex-col p-1 relative transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_#39ff14] hover:border-neon-green/50 cursor-pointer ${cellClass}`}
                                        >
                                            <span className={`text-xs font-bold font-mono leading-none absolute top-1.5 left-2 ${dateColor}`}>{date.getDate()}</span>

                                            <div className="flex-1 flex flex-col items-center justify-center pt-3">
                                                {count > 0 ? (
                                                    <>
                                                        <span className={`text-3xl font-black tracking-tighter ${countColor}`}>
                                                            {count}
                                                        </span>
                                                        <span className="text-[9px] uppercase font-mono text-emerald-400/90 font-bold mt-[-2px]">Listed</span>
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] font-bold opacity-0">-</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. REVENUE HISTORY CHART (Moved Below Calendar) */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <Activity size={16} className="text-blue-500" /> Revenue (14 Days)
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono">Last updated: Today</span>
                    </div>

                    {/* Bar Chart Container */}
                    <div className="flex items-end justify-between h-32 w-full gap-1">
                        {chartData.data.map((d, i) => {
                            const heightPct = Math.max(5, (d.value / chartData.max) * 100);
                            const isProfit = d.value > 0;
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none font-mono">
                                        ${d.value.toFixed(2)} ({d.count} items)
                                    </div>
                                    {/* Bar */}
                                    <div
                                        className={`w-full rounded-t-sm transition-all duration-500 ease-out hover:brightness-110 ${isProfit ? 'bg-blue-500 dark:bg-blue-600' : 'bg-gray-200 dark:bg-slate-800'}`}
                                        style={{ height: `${heightPct}%` }}
                                    ></div>
                                    {/* Label */}
                                    <span className="text-[8px] font-mono text-slate-400 uppercase">{d.day.charAt(0)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 5. TOP SOURCES LEADERBOARD */}
                <div>
                    <h3 className="text-slate-500 font-mono text-xs uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
                        <Trophy size={14} className="text-yellow-500" /> Best Sources
                    </h3>
                    <div className="space-y-3">
                        {metrics.topSources.length === 0 ? (
                            <div className="text-center p-6 text-slate-500 bg-white dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-800 text-xs">
                                Scan items to uncover profitable sources.
                            </div>
                        ) : (
                            metrics.topSources.map((source, index) => (
                                <div key={source.name} className="relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg overflow-hidden group">
                                    {/* Progress Bar Background */}
                                    <div
                                        className="absolute inset-y-0 left-0 bg-emerald-50 dark:bg-emerald-900/10 transition-all duration-1000"
                                        style={{ width: `${source.percent}%` }}
                                    ></div>

                                    <div className="relative p-3 flex items-center justify-between z-10">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 dark:bg-slate-800 text-slate-500'}`}>
                                                {index + 1}
                                            </div>
                                            <span className="font-bold text-sm text-slate-900 dark:text-white">#{source.name}</span>
                                        </div>
                                        <span className="font-mono text-emerald-600 dark:text-neon-green font-bold text-sm">+{formatMoney(source.val).replace('.00', '')}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 6. DRAFT POTENTIAL */}
                <div className="bg-gradient-to-r from-orange-50 to-white dark:from-slate-900 dark:to-slate-800 p-4 rounded-xl border border-orange-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                            <Package size={12} /> Hidden Inventory
                        </div>
                        <div className="text-xl font-black text-slate-900 dark:text-white">
                            {formatMoney(metrics.draftValue).replace('.00', '')} <span className="text-xs font-normal text-slate-400">Potential</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-black text-slate-300 dark:text-slate-600">{metrics.draftCount}</div>
                        <div className="text-[8px] text-slate-400 font-bold uppercase">Drafts</div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default StatsView;
