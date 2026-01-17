
import React, { useEffect, useState, useCallback } from 'react';
import { ProfitCalculation } from '../types';
import { Save, ChevronRight, Scale, Tag, Truck, Loader2, RefreshCw, Globe } from 'lucide-react';

interface ProfitCalculatorProps {
   estimatedPrice: number;
   estimatedShipping?: number;
   estimatedWeight?: string;
   estimatedDimensions?: string;
   onSave: (calc: ProfitCalculation, costCode: string, itemCost: number, weight: string, dimensions: string) => void;
   onList?: (calc: ProfitCalculation, costCode: string, itemCost: number, weight: string, dimensions: string) => void;
   onPriceChange?: (price: number) => void;
   onEstimate?: () => void;
   isScanning: boolean;
   isLoading?: boolean;
}

const ProfitCalculator: React.FC<ProfitCalculatorProps> = ({ estimatedPrice, estimatedShipping, estimatedWeight, estimatedDimensions, onSave, onList, onPriceChange, onEstimate, isScanning, isLoading = false }) => {
   const [soldPrice, setSoldPrice] = useState<number>(estimatedPrice);
   const [itemCost, setItemCost] = useState<number>(0);
   const [shippingCost, setShippingCost] = useState<number>(10);

   const [weightLbs, setWeightLbs] = useState<string>("");
   const [weightOz, setWeightOz] = useState<string>("");

   const [dimL, setDimL] = useState<string>("");
   const [dimW, setDimW] = useState<string>("");
   const [dimH, setDimH] = useState<string>("");

   const [calculation, setCalculation] = useState<ProfitCalculation | null>(null);

   // Parse weight string to ounces for calculation
   const calculateShippingFromWeight = useCallback((lbsStr: string, ozStr: string) => {
      const lbs = parseFloat(lbsStr) || 0;
      const oz = parseFloat(ozStr) || 0;
      const totalOunces = (lbs * 16) + oz;

      if (totalOunces === 0) return 0;

      // USPS Ground Advantage Estimates (2025 Conservative)
      if (totalOunces <= 4) return 5.00;
      if (totalOunces <= 8) return 5.50;
      if (totalOunces <= 12) return 6.50;
      if (totalOunces < 16) return 8.00;
      if (totalOunces <= 32) return 12.00; // up to 2lbs
      if (totalOunces <= 48) return 15.00; // up to 3lbs

      const weightLbs = totalOunces / 16;
      return 15.00 + ((weightLbs - 3) * 3);
   }, []);

   // Sync initial props
   useEffect(() => {
      if (estimatedPrice > 0) setSoldPrice(estimatedPrice);
   }, [estimatedPrice]);

   useEffect(() => {
      if (estimatedShipping !== undefined && (!weightLbs && !weightOz)) {
         setShippingCost(estimatedShipping);
      }
   }, [estimatedShipping, weightLbs, weightOz]);

   useEffect(() => {
      if (estimatedWeight) {
         const lower = String(estimatedWeight).toLowerCase();
         const lbMatch = lower.match(/(\d+(\.\d+)?)\s*lb/);
         const ozMatch = lower.match(/(\d+(\.\d+)?)\s*oz/);

         const l = lbMatch ? lbMatch[1] : "";
         const o = ozMatch ? ozMatch[1] : (!lbMatch && !ozMatch && parseFloat(lower) ? lower : "");

         setWeightLbs(l);
         setWeightOz(o);

         const calculated = calculateShippingFromWeight(l, o);
         if (calculated > 0) setShippingCost(calculated);
      }
   }, [estimatedWeight, calculateShippingFromWeight]);

   useEffect(() => {
      if (estimatedDimensions) {
         // Parse "L x W x H"
         const parts = estimatedDimensions.toLowerCase().split('x').map(s => s.trim().replace(/[^0-9.]/g, ''));
         if (parts.length >= 3) {
            setDimL(parts[0]);
            setDimW(parts[1]);
            setDimH(parts[2]);
         }
      }
   }, [estimatedDimensions]);

   const handleLbsChange = (val: string) => {
      setWeightLbs(val);
      const cost = calculateShippingFromWeight(val, weightOz);
      if (cost > 0) setShippingCost(parseFloat(cost.toFixed(2)));
   };

   const handleOzChange = (val: string) => {
      setWeightOz(val);
      const cost = calculateShippingFromWeight(weightLbs, val);
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
                  <Truck size={14} className="text-orange-500" /> Shipping & Dims
               </div>
               <button
                  onClick={onEstimate}
                  disabled={isLoading}
                  className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 disabled:opacity-50"
                  title="Estimate Weight & Dims"
               >
                  {isLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Estimate
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

               <div className="flex-1 space-y-2">
                  {/* Weight */}
                  <div>
                     <label className="text-[9px] font-mono text-slate-500 uppercase mb-0.5 block">Weight</label>
                     <div className="flex gap-2">
                        <div className="relative group flex-1">
                           <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">lb</span>
                           <input type="number" value={weightLbs} onChange={(e) => handleLbsChange(e.target.value)} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-indigo-500 text-sm font-bold text-slate-900 dark:text-white px-1 py-0.5 focus:outline-none text-center" placeholder="0" />
                        </div>
                        <div className="relative group flex-1">
                           <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">oz</span>
                           <input type="number" value={weightOz} onChange={(e) => handleOzChange(e.target.value)} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-indigo-500 text-sm font-bold text-slate-900 dark:text-white px-1 py-0.5 focus:outline-none text-center" placeholder="0" />
                        </div>
                     </div>
                  </div>

                  {/* Dimensions */}
                  <div>
                     <label className="text-[9px] font-mono text-slate-500 uppercase mb-0.5 block">Dims (in)</label>
                     <div className="flex gap-1">
                        <input type="number" value={dimL} onChange={(e) => setDimL(e.target.value)} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-indigo-500 text-xs font-bold text-slate-900 dark:text-white py-0.5 focus:outline-none text-center" placeholder="L" />
                        <span className="text-slate-400 text-xs">x</span>
                        <input type="number" value={dimW} onChange={(e) => setDimW(e.target.value)} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-indigo-500 text-xs font-bold text-slate-900 dark:text-white py-0.5 focus:outline-none text-center" placeholder="W" />
                        <span className="text-slate-400 text-xs">x</span>
                        <input type="number" value={dimH} onChange={(e) => setDimH(e.target.value)} className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-indigo-500 text-xs font-bold text-slate-900 dark:text-white py-0.5 focus:outline-none text-center" placeholder="H" />
                     </div>
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
            onClick={() => {
               const finalWeight = `${weightLbs || '0'} lb ${weightOz || '0'} oz`;
               const finalDims = `${dimL || '0'}x${dimW || '0'}x${dimH || '0'}`;
               onSave(calculation, getCostCode(itemCost), itemCost, finalWeight, finalDims);
            }}
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

         {onList && !isPriceUnknown && (
            <button
               onClick={() => {
                  const finalWeight = `${weightLbs || '0'} lb ${weightOz || '0'} oz`;
                  const finalDims = `${dimL || '0'}x${dimW || '0'}x${dimH || '0'}`;
                  onList(calculation, getCostCode(itemCost), itemCost, finalWeight, finalDims);
               }}
               disabled={isLoading}
               className="w-full py-4 bg-blue-600 shadow-xl shadow-blue-600/20 text-white font-black rounded-xl uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:bg-blue-500 active:scale-95 transition-all mt-1"
            >
               {isLoading ? <Loader2 className="animate-spin" size={18} /> : <><Globe size={18} /> List on eBay Now</>}
            </button>
         )}
      </div>
   );
};

export default ProfitCalculator;
