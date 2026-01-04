import React from 'react';
import { ItemAnalysis, MarketAnalysis } from '../types';
import MarketChart from './MarketChart';
import { ShoppingBag, Tag, AlertCircle, Copy, Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ResultsDashboardProps {
  analysis: ItemAnalysis;
  marketAnalysis: MarketAnalysis;
  onReset: () => void;
}

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ analysis, marketAnalysis, onReset }) => {
  
  // Construct eBay Deep Links
  const encodedQuery = encodeURIComponent(analysis.keywords);
  const activeUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sop=12`; 
  const soldUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&LH_Sold=1&LH_Complete=1&_sop=13`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const { listings, sellThroughRate, marketStatus, activeCount, soldCount } = marketAnalysis;

  // Determine styles based on STR
  const getStrStyles = (rate: number) => {
    if (rate >= 50) return { color: 'text-[#00ba7c]', bg: 'bg-[#00ba7c]/10', icon: TrendingUp, label: 'High Demand' };
    if (rate >= 20) return { color: 'text-[#ffd400]', bg: 'bg-[#ffd400]/10', icon: Minus, label: 'Steady Demand' };
    return { color: 'text-[#f91880]', bg: 'bg-[#f91880]/10', icon: TrendingDown, label: 'Low Demand' };
  };

  const strStyle = getStrStyles(sellThroughRate);
  const StrIcon = strStyle.icon;

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      
      {/* Header Summary */}
      <div className="bg-black rounded-xl p-5 border border-[#2f3336]">
        <div className="flex justify-between items-start">
            <div>
                <span className="inline-block text-[#1d9bf0] text-sm font-bold mb-1">
                    {analysis.brand || analysis.category || "Identified"}
                </span>
                <h2 className="text-xl font-bold text-[#e7e9ea] leading-tight">{analysis.title}</h2>
            </div>
            <div className="text-right pl-4">
                <p className="text-xs text-[#71767b]">Est. Value</p>
                <p className="text-lg font-bold text-[#00ba7c]">
                    ${analysis.estimatedValue.min} - ${analysis.estimatedValue.max}
                </p>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mt-6">
            <a 
                href={soldUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-[#00ba7c] hover:bg-[#00ba7c]/90 text-white py-2.5 px-4 rounded-full font-bold transition-all active:scale-95 text-sm"
            >
                <Tag size={16} />
                View Solds
            </a>
            <a 
                href={activeUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-[#1d9bf0] hover:bg-[#1d9bf0]/90 text-white py-2.5 px-4 rounded-full font-bold transition-all active:scale-95 text-sm"
            >
                <ShoppingBag size={16} />
                View Actives
            </a>
        </div>
        
        <a 
            href={`https://www.google.com/search?q=${encodedQuery}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-2 w-full bg-transparent border border-[#536471] text-[#1d9bf0] py-2 rounded-full font-bold hover:bg-[#1d9bf0]/10 transition-colors text-sm"
        >
            <Search size={16} />
            Search on Google
        </a>
      </div>

      {/* Market Health & Analysis */}
      <div className="bg-black rounded-xl p-5 border border-[#2f3336]">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#e7e9ea]">Market Health</h3>
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${strStyle.bg} ${strStyle.color}`}>
                <StrIcon size={14} />
                {marketStatus}
            </div>
        </div>

        {/* Sell Through Rate Bar */}
        <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
                <span className="text-[#71767b]">90-Day Sell Through Rate</span>
                <div className="text-right">
                    <span className={`font-bold ${strStyle.color} text-lg`}>{sellThroughRate}%</span>
                </div>
            </div>
            
            <div className="w-full bg-[#2f3336] rounded-full h-2 mb-2">
                <div 
                    className={`h-2 rounded-full transition-all duration-1000 ${strStyle.color.replace('text-', 'bg-')}`} 
                    style={{ width: `${Math.min(sellThroughRate, 100)}%` }}
                ></div>
            </div>

            <div className="flex justify-between items-center text-xs text-[#71767b] pt-1">
                <div className="flex items-center gap-1">
                     <div className="w-2 h-2 rounded-full bg-[#00ba7c]"></div>
                     <span className="font-medium">{soldCount} Sold (90d)</span>
                </div>
                <span>vs</span>
                <div className="flex items-center gap-1">
                     <div className="w-2 h-2 rounded-full bg-[#1d9bf0]"></div>
                     <span className="font-medium">{activeCount} Active</span>
                </div>
            </div>
        </div>

        {listings.length > 0 && (
            <>
                <div className="border-t border-[#2f3336] pt-4">
                    <h4 className="text-sm font-bold text-[#e7e9ea] mb-2">Price Comparables</h4>
                    <MarketChart data={listings} />
                </div>
                
                <div className="mt-4 space-y-px">
                    {listings.slice(0, 3).map((item, idx) => (
                        <a 
                            key={idx} 
                            href={item.link} 
                            target="_blank" 
                            rel="noreferrer"
                            className="flex items-center justify-between py-3 px-2 rounded hover:bg-[#16181c] transition-colors group"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.type === 'sold' ? 'bg-[#00ba7c]' : 'bg-[#1d9bf0]'}`} />
                                <span className="text-sm text-[#71767b] truncate group-hover:text-[#1d9bf0]">{item.title}</span>
                            </div>
                            <span className="font-bold text-[#e7e9ea] text-sm">${item.price}</span>
                        </a>
                    ))}
                </div>
            </>
        )}
      </div>

      {/* Item Details Card */}
      <div className="bg-black rounded-xl p-5 border border-[#2f3336]">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#e7e9ea]">Listing Details</h3>
            <button 
                onClick={() => copyToClipboard(analysis.description)}
                className="text-[#1d9bf0] hover:text-[#1d9bf0]/80 text-xs font-bold flex items-center gap-1"
            >
                <Copy size={12} /> Copy Desc
            </button>
        </div>
        
        <div className="space-y-4">
            <div>
                <label className="text-xs text-[#71767b] uppercase font-bold tracking-wider">Recommended Title</label>
                <p className="text-sm font-medium text-[#e7e9ea] mt-1">{analysis.title}</p>
            </div>
            
            <div>
                <label className="text-xs text-[#71767b] uppercase font-bold tracking-wider">Visual Condition</label>
                <div className="flex items-center gap-2 mt-1">
                    <span className="px-3 py-1 rounded-full bg-[#2f3336] text-[#e7e9ea] text-xs font-semibold">
                        {analysis.condition}
                    </span>
                </div>
            </div>

            <div>
                <label className="text-xs text-[#71767b] uppercase font-bold tracking-wider">Features</label>
                <div className="flex flex-wrap gap-2 mt-2">
                    {analysis.features.map((feature, i) => (
                        <span key={i} className="px-3 py-1 bg-[#2f3336] text-[#1d9bf0] text-xs rounded-full font-medium">
                            {feature}
                        </span>
                    ))}
                </div>
            </div>

            <div className="pt-3 border-t border-[#2f3336]">
                <label className="text-xs text-[#71767b] uppercase font-bold tracking-wider">Description Draft</label>
                <p className="text-sm text-[#e7e9ea] mt-1 leading-relaxed">{analysis.description}</p>
            </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 p-3 rounded-lg text-[#71767b] text-xs border border-[#2f3336]">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <p>AI estimates based on visual search. Always verify specifics before listing.</p>
      </div>

      <button 
        onClick={onReset}
        className="w-full py-4 text-[#71767b] font-medium text-sm hover:text-[#1d9bf0] transition-colors"
      >
        Analyze Another Item
      </button>

    </div>
  );
};

export default ResultsDashboard;