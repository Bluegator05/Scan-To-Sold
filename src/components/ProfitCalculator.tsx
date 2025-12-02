
import React, { useEffect, useState, useCallback } from 'react';
import { ProfitCalculation } from '../types';
import { Save, ChevronRight, Scale, Tag, Truck, Loader2, RefreshCw } from 'lucide-react';

interface ProfitCalculatorProps {
  estimatedPrice: number;
  estimatedShipping?: number;
  estimatedWeight?: string;
  onSave: (calc: ProfitCalculation, costCode: string, itemCost: number, weight: string) => void;
  onPriceChange?: (price: number) => void;
  isScanning: boolean;
  isLoading?: boolean;
}

const ProfitCalculator: React.FC<ProfitCalculatorProps> = ({ estimatedPrice, estimatedShipping, estimatedWeight, onSave, onPriceChange, isScanning, isLoading = false }) => {
  const [soldPrice, setSoldPrice] = useState<number>(estimatedPrice);
  const [itemCost, setItemCost] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(10);
  const [weight, setWeight] = useState<string>(estimatedWeight || "");
  const [calculation, setCalculation] = useState<ProfitCalculation | null>(null);

  // Parse weight string to ounces for calculation
  const calculateShippingFromWeight = useCallback((weightStr: string) => {
    if (!weightStr) return 0;
    
    const lower = String(weightStr).toLowerCase();
    let totalOunces = 0;

    const lbMatch = lower.match(/(\d+(\.\d+)?)\s*lb/);
    const ozMatch = lower.match(/(\d+(\.\d+)?)\s*oz/);

    if (lbMatch) totalOunces += parseFloat(lbMatch[1]) * 16;
    if (ozMatch) totalOunces += parseFloat(ozMatch[1]);

    if (!lbMatch && !ozMatch) {
        const num = parseFloat(lower);
        if (!isNaN(num)) return 0; 
    }

    if (totalOunces === 0) return 0;

    // USPS Ground Advantage Estimates (2025 Conservative)
    if (totalOunces <= 4) return 5.00;
    if (totalOunces <= 8) return 5.50;
    if (totalOunces <= 12) return 6.50;
    if (totalOunces < 16) return 8.00;
    if (totalOunces <= 32) return 12.00; // up to 2lbs
    if (totalOunces <= 48) return 15.00; // up to 3lbs
    
    const lbs = totalOunces / 16;
    return 15.00 + ((lbs - 3) * 3); 
  }, []);

  // Sync initial props
  useEffect(() => {
    if (estimatedPrice > 0) setSoldPrice(estimatedPrice);
  }, [estimatedPrice]);

  useEffect(() => {
    if (estimatedShipping !== undefined && !weight) {
        setShippingCost(estimatedShipping);
    }
  }, [estimatedShipping, weight]);

  useEffect(() => {
    if (estimatedWeight) {
        setWeight(estimatedWeight);
        const calculated = calculateShippingFromWeight(estimatedWeight);
        if (calculated > 0) setShippingCost(calculated);
    }
  }, [estimatedWeight, calculateShippingFromWeight]);

  const handleWeightChange = (val: string) => {
      setWeight(val);
      const cost = calculateShippingFromWeight(val);
      if (cost > 0) setShippingCost(parseFloat(cost.toFixed(2)));
  };

  // Calculation Loop
  useEffect(() => {
    const feeRate = 0.1325; // 13.25%
    const fixedFee = 0.30;
    
    const fees = (soldPrice * feeRate) + fixedFee;
    const net = soldPrice - fees - shippingCost - itemCost;
    
    setCalculation({
      soldPrice,
      shippingCost,
      itemCost,
      platformFees: fees,
      netProfit: net,
      isProfitable: net >= 15
    });
    
    if (onPriceChange) onPriceChange(soldPrice);
  }, [soldPrice, itemCost, shippingCost, onPriceChange]);

  const getCostCode = (cost: number) => `C${Math.floor(cost)}`;

  if (isScanning || !calculation) return null;

  const isPriceUnknown = soldPrice === 0;

  return (
    <div className="flex flex-col gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. HERO PROFIT DISPLAY */}
      <div className={`relative overflow-hidden rounded-xl border-2 transition-colors duration-500 ${calculation.netProfit > 0 ? 'bg-gradient-to-br from-slate-900 to-slate-950 border-emerald-500/50 dark:border-neon-green/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-slate-900 border-slate-700'}`}>
         <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%,transparent_100%)] bg-[length:10px_10px]"></div>
         
         <div className="relative p-5 flex justify-between items-center">
            <div>
               <div className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.2em] mb-1">Potential Net</div>
               <div className={`text-5xl font-black font-mono tracking-tighter flex items-baseline gap-1 ${calculation.netProfit > 0 ? 'text-emerald-400 dark:text-neon-green drop-shadow-[0_0_10px_rgba(57,255,20,0.4)]' : 'text-white'}`}>
                  <span className="text-2xl opacity-50 font-sans">$</span>
                  {calculation.netProfit.toFixed(0)}
                  <span className="text-xl opacity-50 font-mono">.{calculation.netProfit.toFixed(2).split('.')[1]}</span>
               </div>
            </div>
            
            <div className="text-right">
                <div className={`inline-block px-3 py-1 rounded-sm border text-[10px] font-bold font-mono uppercase tracking-wider ${calculation.isProfitable ? 'border-emerald-500 dark:border-neon-green text-emerald-400 dark:text-neon-green bg-emerald-500/10 dark:bg-neon-green/10' : 'border-slate-600 text-slate-400 bg-slate-800'}`}>
                   {calculation.isProfitable ? 'BUY' : 'PASS'}
                </div>
            </div>
         </div>
      </div>

      {/* 2. FINANCIALS GRID */}
      <div className="grid grid-cols-2 gap-3">
         
         {/* Sold Price */}
         <div className="bg-white dark:bg-slate-800/50 rounded-lg p-2 border border-gray-200 dark:border-slate-700 flex flex-col relative group focus-within:border-blue-400 transition-colors shadow-sm">
            <label className="text-[9px] font-mono text-blue-500 dark:text-blue-400 uppercase mb-0.5 flex items-center gap-1">
              <Tag size={10} /> Price
            </label>
            <div className="flex items-center">
              <span className="text-slate-400 dark:text-slate-500 text-sm mr-1">$</span>
              <input 
                type="number" 
                value={soldPrice || ''} 
                onChange={(e) => setSoldPrice(parseFloat(e.target.value) || 0)} 
                className="bg-transparent w-full font-mono font-bold text-slate-900 dark:text-white focus:outline-none text-lg"
                placeholder="0.00"
              />
            </div>
         </div>

         {/* Buy Cost */}
         <div className="bg-white dark:bg-slate-800/50 rounded-lg p-2 border border-gray-200 dark:border-slate-700 flex flex-col relative group focus-within:border-emerald-500 dark:focus-within:border-neon-green transition-colors shadow-sm">
            <label className="text-[9px] font-mono text-emerald-600 dark:text-neon-green uppercase mb-0.5 font-bold">
              Buy Cost
            </label>
            <div className="flex items-center">
              <span className="text-slate-400 dark:text-slate-500 text-sm mr-1">$</span>
              <input 
                type="number" 
                value={itemCost || ''} 
                onChange={(e) => setItemCost(parseFloat(e.target.value) || 0)} 
                className="bg-transparent w-full font-mono font-bold text-slate-900 dark:text-white focus:outline-none text-lg"
                placeholder="0.00"
              />
            </div>
         </div>
      </div>

      {/* 3. LOGISTICS CARD */}
      <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
               <Truck size={14} className="text-orange-500" /> Shipping (Ground Adv.)
            </div>
            <button 
               onClick={() => handleWeightChange(weight)} 
               className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"
               title="Recalculate Shipping"
            >
               <RefreshCw size={10} /> Recalc
            </button>
         </div>
         
         <div className="flex items-center gap-4">
            <div className="flex-1">
               <label className="text-[10px] font-mono text-slate-500 uppercase mb-1 block">Rate ($)</label>
               <div className="relative group">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-light group-focus-within:text-orange-500 transition-colors">$</span>
                  <input 
                    type="number" 
                    value={shippingCost || ''} 
                    onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)} 
                    className="w-full bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-orange-500 text-2xl font-bold text-slate-900 dark:text-white pl-4 py-1 focus:outline-none transition-colors"
                    placeholder="0.00"
                  />
               </div>
            </div>

            <div className="w-px h-10 bg-slate-200 dark:bg-slate-800"></div>

            <div className="flex-1">
               <label className="text-[10px] font-mono text-slate-500 uppercase mb-1 block">Weight (Edit Me)</label>
               <div className="relative group">
                  <Scale size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text" 
                    value={weight} 
                    onChange={(e) => handleWeightChange(e.target.value)} 
                    className="w-full bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 text-xl font-bold text-slate-900 dark:text-white pl-6 py-1 focus:outline-none transition-colors"
                    placeholder="e.g. 1 lb 4 oz"
                  />
               </div>
            </div>
         </div>
      </div>

      <div className="text-right">
         <span className="text-[9px] text-slate-400 font-mono">
            Fees: -${calculation.platformFees.toFixed(2)} (13.25% + $0.30)
         </span>
      </div>
      
      <button
        onClick={() => onSave(calculation, getCostCode(itemCost), itemCost, weight)}
        disabled={isPriceUnknown || isLoading}
        className={`w-full py-4 mt-1 font-black text-sm tracking-widest uppercase rounded-xl border-2 shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3
          ${calculation.isProfitable 
            ? 'bg-emerald-500 dark:bg-neon-green border-emerald-500 dark:border-neon-green text-white dark:text-slate-950 hover:bg-emerald-400 dark:hover:bg-neon-green/90 shadow-emerald-500/20 dark:shadow-[0_0_20px_rgba(57,255,20,0.3)]' 
            : (isPriceUnknown ? 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gray-800 dark:bg-slate-800 border-gray-700 dark:border-slate-600 text-white hover:bg-gray-700 dark:hover:bg-slate-700')
          }`}
      >
        {isLoading ? (
           <><Loader2 className="animate-spin" size={18} /> SAVING...</>
        ) : isPriceUnknown ? (
           <>Enter Price <ChevronRight size={16} /></>
        ) : (
           <><Save size={18} /> {calculation.isProfitable ? 'Save to Inventory' : 'Save as Draft'}</>
        )}
      </button>
    </div>
  );
};

export default ProfitCalculator;
