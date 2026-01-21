
import React, { useState, useEffect } from 'react';
import { X, Search, ArrowRight, Loader2, Tag, ShoppingCart, List, ExternalLink, Image as ImageIcon, Copy, DollarSign, Calendar, CheckCircle2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Comp } from '../types';
import { searchEbayComps, fetchEbayItemDetails } from '../services/ebayService';

interface CompsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery: string;
  condition: 'NEW' | 'USED';
  onApplyPrice: (price: number) => void;
  onSellSimilar?: (data: any) => void;
  initialTab?: 'ACTIVE' | 'SOLD';
}

const CompsModal: React.FC<CompsModalProps> = ({ isOpen, onClose, initialQuery, condition, initialTab = 'ACTIVE', onApplyPrice, onSellSimilar }) => {
  const [query, setQuery] = useState(initialQuery);
  const [comps, setComps] = useState<Comp[]>([]);
  const [avgPrice, setAvgPrice] = useState<string>("0.00");
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'SOLD'>(initialTab);
  const [isEstimated, setIsEstimated] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setActiveTab(initialTab);
      if (initialQuery) {
        handleSearch(initialQuery, initialTab);
      }
    }
  }, [isOpen, initialQuery, initialTab]);

  const handleSearch = async (searchQuery: string, tab: 'ACTIVE' | 'SOLD', bypassCache = false) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await searchEbayComps(searchQuery, tab, condition, bypassCache);
      const cleanedComps = (data.comps || []).map((c: any) => ({
        ...c,
        title: c.title || ""
      }));
      setComps(cleanedComps);
      setAvgPrice(data.averagePrice);
      setIsEstimated(!!data.isEstimated);
    } catch (e: any) {
      setError(e.message || "Failed to load comps");
      setComps([]);
    } finally {
      // Small artificial delay to show search is happening
      setTimeout(() => setLoading(false), 300);
    }
  };

  const handleTabChange = (tab: 'ACTIVE' | 'SOLD') => {
    setActiveTab(tab);
    handleSearch(query, tab, false); // Tab change can use cache
  };

  const handleClone = async (comp: Comp) => {
    if (!onSellSimilar) return;
    const targetId = `v1|${comp.id}|0`;

    setCloningId(comp.id);
    try {
      const details = await fetchEbayItemDetails(targetId);
      onSellSimilar(details);
      onClose();
    } catch (e) {
      try {
        const detailsRetry = await fetchEbayItemDetails(comp.id);
        onSellSimilar(detailsRetry);
        onClose();
      } catch (err) {
        alert("Could not clone this listing. ID format might be unsupported.");
      }
    } finally {
      setCloningId(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[85vh]">

        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 rounded-t-2xl">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Tag className="text-neon-green" size={20} /> Market Research
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Context Bar */}
        <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700 text-xs font-mono text-slate-300 flex justify-between">
          <span>FILTER: {condition}</span>
          <span>Searching: "{query}"</span>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-2 bg-slate-800/50 border-b border-slate-800 gap-2">
          <button
            onClick={() => handleTabChange('ACTIVE')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'ACTIVE' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <List size={14} /> ACTIVE LISTINGS
          </button>
          <button
            onClick={() => handleTabChange('SOLD')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'SOLD' ? 'bg-neon-green text-slate-950 shadow-lg shadow-neon-green/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <ShoppingCart size={14} /> SOLD HISTORY {isEstimated && <span className="text-[8px] opacity-70 ml-1">(EST.)</span>}
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-slate-800/50 border-b border-slate-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(query, activeTab, true)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white focus:outline-none focus:border-neon-green font-mono text-sm"
              placeholder="Search eBay..."
            />
            <button
              onClick={() => handleSearch(query, activeTab, true)}
              disabled={loading}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex flex-col">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">
              {activeTab === 'ACTIVE' ? 'Avg List Price' : 'Avg Sold Price'}
            </span>
            <span className={`text-xl font-black font-mono ${activeTab === 'SOLD' ? 'text-neon-green' : 'text-blue-400'}`}>
              ${avgPrice}
            </span>
          </div>
          {parseFloat(avgPrice) > 0 && (
            <button
              onClick={() => { onApplyPrice(parseFloat(avgPrice)); onClose(); }}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all text-xs font-bold text-emerald-400"
            >
              <DollarSign size={14} /> USE AVERAGE
            </button>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
              <Loader2 size={32} className="animate-spin text-neon-green" />
              <p className="text-xs">Scanning eBay ({condition})...</p>
            </div>
          ) : error ? (
            <div className="text-center p-8 text-red-400 bg-red-900/10 rounded-xl border border-red-900/30">
              {error}
            </div>
          ) : comps.length === 0 ? (
            <div className="text-center p-8 flex flex-col items-center gap-4">
              <p className="text-slate-600">No results found in API.</p>
              <button
                onClick={async () => {
                  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=${activeTab === 'SOLD' ? '1' : '0'}&LH_ItemCondition=${condition === 'NEW' ? '1000' : '3000'}`;
                  if (Capacitor.isNativePlatform()) {
                    await Browser.open({ url });
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-700 border border-slate-600"
              >
                <ExternalLink size={14} /> Open eBay Website
              </button>
            </div>
          ) : (
            comps.map(comp => (
              <div key={comp.id || Math.random()} className="bg-slate-900 border border-slate-800 hover:border-slate-600 p-3 rounded-xl flex gap-3 group transition-colors relative">

                {/* Thumbnail */}
                <button
                  onClick={async () => {
                    if (Capacitor.isNativePlatform()) {
                      await Browser.open({ url: comp.url });
                    } else {
                      window.open(comp.url, '_blank');
                    }
                  }}
                  className="w-20 h-20 bg-slate-800 rounded-lg overflow-hidden border border-slate-700 shrink-0 group-hover:opacity-80 transition-opacity"
                >
                  {comp.image ? (
                    <img src={comp.image} alt={comp.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <ImageIcon size={20} />
                    </div>
                  )}
                </button>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <button
                    onClick={async () => {
                      if (Capacitor.isNativePlatform()) {
                        await Browser.open({ url: comp.url });
                      } else {
                        window.open(comp.url, '_blank');
                      }
                    }}
                    className="text-sm font-bold text-slate-200 hover:text-blue-400 hover:underline line-clamp-2 mb-1 text-left"
                  >
                    {comp.title}
                  </button>

                  <div className="flex justify-between items-end">
                    <div className="flex gap-3 text-xs text-slate-500 font-mono">
                      <span>+${comp.shipping.toFixed(0)} Ship</span>
                      <span>{comp.condition}</span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className={`text-lg font-bold ${activeTab === 'SOLD' ? (isEstimated ? 'text-yellow-400' : 'text-neon-green') : 'text-white'}`}>
                        ${comp.price.toFixed(2)}
                      </div>
                      {activeTab === 'SOLD' && comp.dateSold && !isEstimated && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold">
                          <Calendar size={10} /> {formatDate(comp.dateSold)}
                        </div>
                      )}
                      {activeTab === 'SOLD' && !isEstimated && (
                        <div className="text-[9px] font-black uppercase tracking-tighter text-neon-green/60 flex items-center gap-1">
                          <CheckCircle2 size={10} /> Confirmed Sold
                        </div>
                      )}
                      {activeTab === 'SOLD' && isEstimated && (
                        <div className="text-[8px] font-bold text-yellow-400/60 uppercase">
                          Active Fallback
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex gap-2 mt-2">
                    {/* Clone / Sell Similar */}
                    {onSellSimilar && (
                      <button
                        onClick={() => handleClone(comp)}
                        disabled={cloningId === comp.id}
                        className="flex-1 py-1.5 bg-purple-900/30 border border-purple-500/50 rounded text-[10px] font-bold text-purple-300 hover:bg-purple-600 hover:text-white transition-colors flex items-center justify-center gap-1"
                      >
                        {cloningId === comp.id ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                        SELL SIMILAR
                      </button>
                    )}

                    {/* Use Price Only */}
                    <button
                      onClick={() => { onApplyPrice(comp.price); onClose(); }}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded text-[10px] font-bold hover:bg-neon-green hover:text-black hover:border-neon-green transition-colors flex items-center gap-1"
                    >
                      Use Price
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CompsModal;
