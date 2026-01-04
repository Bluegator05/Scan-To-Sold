
import React, { useEffect, useState } from 'react';
import { ProfitCalculation } from '../types';
import { DollarSign, Box, Tag, Save, AlertCircle } from 'lucide-react';

interface ProfitCalculatorProps {
  estimatedPrice: number;
  estimatedShipping?: number;
  onSave: (calc: ProfitCalculation, costCode: string, itemCost: number) => void;
  isScanning: boolean;
}

const ProfitCalculator: React.FC<ProfitCalculatorProps> = ({ estimatedPrice, estimatedShipping, onSave, isScanning }) => {
  const [soldPrice, setSoldPrice] = useState<number>(estimatedPrice);
  const [itemCost, setItemCost] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(10); // Default fallback
  const [calculation, setCalculation] = useState<ProfitCalculation | null>(null);

  useEffect(() => {
    setSoldPrice(estimatedPrice);
  }, [estimatedPrice]);

  useEffect(() => {
    if (estimatedShipping !== undefined && estimatedShipping !== null) {
      setShippingCost(estimatedShipping);
    }
  }, [estimatedShipping]);

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
      isProfitable: net >= 20
    });
  }, [soldPrice, itemCost, shippingCost]);

  const handleCostChange = (val: string) => {
    const num = parseFloat(val);
    setItemCost(isNaN(num) ? 0 : num);
  };

  const handleShipChange = (val: string) => {
    const num = parseFloat(val);
    setShippingCost(isNaN(num) ? 0 : num);
  };

  // Generate a simple "Cost Code" (e.g., Cost $5 -> C5)
  const getCostCode = (cost: number) => `C${Math.floor(cost)}`;

  if (isScanning) return null;
  if (!calculation) return null;

  const profitColor = calculation.netProfit > 0 
    ? (calculation.isProfitable ? "text-neon-green" : "text-yellow-400") 
    : "text-neon-red";

  // Overlay State logic
  // If soldPrice is 0, it likely means we don't have data, so prompt user to set it
  const isPriceUnknown = soldPrice === 0;
  
  const verdict = isPriceUnknown 
    ? "SET PRICE" 
    : (calculation.isProfitable ? "PROFIT" : (calculation.netProfit < 0 ? "LOSS" : "PASS"));
    
  const verdictBg = isPriceUnknown 
    ? "bg-slate-800 border-slate-500" 
    : (calculation.isProfitable ? "bg-neon-green/20 border-neon-green" : (calculation.netProfit < 0 ? "bg-neon-red/20 border-neon-red" : "bg-yellow-500/20 border-yellow-500"));
    
  const verdictText = isPriceUnknown
    ? "text-slate-400"
    : (calculation.isProfitable ? "text-neon-green" : (calculation.netProfit < 0 ? "text-neon-red" : "text-yellow-500"));

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* The Verdict Banner */}
      <div className={`w-full p-4 rounded-lg border-2 flex items-center justify-between shadow-lg transition-all duration-500 ${verdictBg}`}>
        <div>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Net Profit</span>
          <div className={`text-4xl font-bold font-mono ${isPriceUnknown ? 'text-slate-500' : profitColor}`}>
            ${calculation.netProfit.toFixed(2)}
          </div>
        </div>
        <div className={`text-3xl font-black italic tracking-tighter ${verdictText}`}>
          {verdict}
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
          <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
             <Tag size={12} /> Buy Cost ($)
          </label>
          <input 
            type="number" 
            value={itemCost || ''}
            onChange={(e) => handleCostChange(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent text-white text-lg font-mono focus:outline-none placeholder-slate-600"
          />
        </div>
        
        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
          <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
             <Box size={12} /> Ship Est ($)
          </label>
          <input 
            type="number" 
            value={shippingCost || ''}
            onChange={(e) => handleShipChange(e.target.value)}
            placeholder={estimatedShipping ? estimatedShipping.toFixed(2) : "0.00"}
            className="w-full bg-transparent text-white text-lg font-mono focus:outline-none placeholder-slate-600"
          />
        </div>
      </div>

      {/* Edit Sold Price */}
      <div className={`bg-slate-800/50 p-3 rounded-lg border flex justify-between items-center ${isPriceUnknown ? 'border-neon-green shadow-[0_0_10px_rgba(57,255,20,0.2)] animate-pulse' : 'border-slate-700'}`}>
        <label className={`text-xs flex items-center gap-1 ${isPriceUnknown ? 'text-neon-green font-bold' : 'text-slate-400'}`}>
           <DollarSign size={12} /> {isPriceUnknown ? 'ENTER VALUE' : 'Market Value'}
        </label>
        <input 
          type="number"
          value={soldPrice === 0 ? '' : soldPrice}
          onChange={(e) => setSoldPrice(parseFloat(e.target.value) || 0)}
          placeholder="0.00"
          className="bg-transparent text-right text-white font-mono focus:outline-none w-24 font-bold placeholder-slate-600"
        />
      </div>

      {/* Fees Breakdown */}
      <div className="text-xs text-slate-500 font-mono px-2">
        <span>Fees: -${calculation.platformFees.toFixed(2)} (13.25% + $0.30)</span>
      </div>

      {/* Action Button */}
      <button
        onClick={() => onSave(calculation, getCostCode(itemCost), itemCost)}
        disabled={(!calculation.isProfitable && calculation.netProfit <= 0) && !isPriceUnknown}
        className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95
          ${calculation.isProfitable 
            ? 'bg-neon-green text-slate-950 hover:bg-neon-green/90' 
            : (isPriceUnknown ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700 text-slate-400 cursor-not-allowed')
          }`}
      >
        {calculation.isProfitable ? (
          <>
            <Save size={20} /> SCAN TO INVENTORY
          </>
        ) : (
          <>
            <AlertCircle size={20} /> {isPriceUnknown ? 'SAVE AS DRAFT' : 'LOW PROFIT'}
          </>
        )}
      </button>
    </div>
  );
};

export default ProfitCalculator;
