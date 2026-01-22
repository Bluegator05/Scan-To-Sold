import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Eye, Users, Calendar, ExternalLink, 
  TrendingDown, AlertTriangle, RefreshCw, Filter, 
  ChevronRight, Box, Tag, Clock, ArrowUpDown
} from 'lucide-react';
import { fetchSellerItems } from '../services/ebayService';
import { Browser } from '@capacitor/browser';

interface StoreOptimizerProps {
  onBack?: () => void;
}

const StoreOptimizer: React.FC<StoreOptimizerProps> = ({ onBack }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'newest' | 'oldest'>('oldest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadItems();
  }, [sort, page]);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSellerItems(page, 20, sort);
      setItems(data.items || []);
    } catch (e: any) {
      setError(e.message || "Failed to load store items");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLink = async (url: string) => {
    if (!url) return;
    await Browser.open({ url });
  };

  const handleRevise = async (itemId: string) => {
    const url = `https://www.ebay.com/sl/vi/${itemId}/revise`;
    await Browser.open({ url });
  };

  const getDaysActive = (startTime: string) => {
    try {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      return Math.floor((now - start) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  const getAgedLabel = (days: number) => {
    if (days >= 90) return { label: 'Stale', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (days >= 60) return { label: 'Aged', color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    return { label: 'Recent', color: 'text-neon-green', bg: 'bg-neon-green/10' };
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 animate-in fade-in duration-300">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h2 className="text-sm font-bold text-white leading-tight uppercase tracking-wider">Store Optimizer</h2>
            <p className="text-[10px] font-mono text-slate-500">Revive your oldest listings</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setSort(sort === 'oldest' ? 'newest' : 'oldest')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
              sort === 'oldest' 
                ? 'bg-red-500/20 border-red-500/40 text-red-500' 
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <ArrowUpDown size={12} />
            {sort === 'oldest' ? 'OLDEST FIRST' : 'NEWEST FIRST'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <RefreshCw className="text-neon-green mb-4 animate-spin" size={32} />
            <p className="text-slate-500 font-mono text-xs">Scanning Inventory...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl text-center">
            <AlertTriangle className="text-red-500 mx-auto mb-3" size={32} />
            <h3 className="text-white font-bold mb-1">Access Denied</h3>
            <p className="text-red-500/80 text-xs mb-4">{error}</p>
            <button onClick={loadItems} className="bg-red-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wide">
              Retry Connection
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 px-6 bg-slate-900 rounded-2xl border border-slate-800">
            <Box size={40} className="text-slate-700 mx-auto mb-4" />
            <h3 className="text-white font-bold mb-1">No Listings Found</h3>
            <p className="text-slate-500 text-xs">Connect your eBay account to optimize your store.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const days = getDaysActive(item.startTime);
              const aged = getAgedLabel(days);
              
              return (
                <div 
                  key={item.itemId}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex gap-4 transition-all hover:bg-slate-800 group"
                >
                  {/* Image */}
                  <div className="w-20 h-20 bg-slate-950 rounded-xl shrink-0 overflow-hidden relative border border-slate-800">
                    <img 
                      src={item.imageUrl || item.galleryURL} 
                      alt="" 
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/80?text=No+Image')}
                    />
                    <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${aged.bg} ${aged.color} border border-current opacity-90`}>
                      {aged.label}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white line-clamp-2 leading-tight group-hover:text-neon-green transition-colors">
                        {item.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <div className="flex items-center gap-1 text-slate-500">
                          <Clock size={12} />
                          <span className="text-[10px] font-mono">{days} Days Active</span>
                        </div>
                        <div className="flex items-center gap-1 text-blue-400">
                          <Eye size={12} />
                          <span className="text-[10px] font-mono">{item.viewCount || 0} Views</span>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-400">
                          <Users size={12} />
                          <span className="text-[10px] font-mono">{item.watchCount || 0} Watchers</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <div className="text-sm font-black text-white">
                        ${parseFloat(item.price || "0").toFixed(2)}
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleOpenLink(item.viewItemURL)}
                          className="p-2 text-slate-500 hover:text-white transition-colors"
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button 
                          onClick={() => handleRevise(item.itemId)}
                          className="bg-neon-green text-slate-950 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight hover:scale-105 transition-all shadow-[0_0_10px_rgba(57,255,20,0.2)]"
                        >
                          Revise Price
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <button 
            onClick={() => setPage(p => p + 1)}
            disabled={loading}
            className="w-full py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load More Listings'}
          </button>
        )}
      </div>
    </div>
  );
};

export default StoreOptimizer;
旋
