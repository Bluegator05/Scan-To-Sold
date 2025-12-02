
import React from 'react';
import { ShieldAlert, Check, AlertTriangle } from 'lucide-react';

interface DisclaimerModalProps {
  onAccept: () => void;
}

const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onAccept }) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden relative">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3 bg-red-950/20">
           <AlertTriangle className="text-red-500" size={24} />
           <h3 className="text-lg font-bold text-white">Terms of Service & Disclaimer</h3>
        </div>
        
        <div className="p-6 space-y-4 text-sm text-slate-300 leading-relaxed overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-slate-700">
           <p className="text-white font-bold">
             By accessing ScanToSold, you agree to the following:
           </p>
           
           <ul className="list-disc pl-4 space-y-3 marker:text-slate-500">
             <li>
               <strong className="text-white">Estimates Only:</strong> All profit calculations, market values, and shipping costs are AI-generated estimates. They are <span className="text-red-400">not guarantees</span> of actual sales price or costs.
             </li>
             <li>
               <strong className="text-white">User Responsibility:</strong> You are solely responsible for verifying the accuracy of all data (titles, prices, weights, conditions) before listing items on eBay or any other platform.
             </li>
             <li>
               <strong className="text-white">No Liability:</strong> ScanToSold and its creators are <span className="text-white underline decoration-red-500/50">not liable</span> for any financial losses, inventory issues, shipping errors, or account suspensions (e.g., eBay bans) resulting from the use of this tool.
             </li>
             <li>
               <strong className="text-white">Compliance:</strong> You agree to comply with all terms of service of the marketplaces you use (eBay, Facebook, etc.).
             </li>
           </ul>
        </div>

        <div className="p-5 border-t border-slate-800 bg-slate-900 flex flex-col gap-3">
           <div className="text-[10px] text-slate-500 text-center">
             By clicking "I Accept", you acknowledge that you have read and understood these terms.
           </div>
           <button 
             onClick={onAccept}
             className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
           >
             <Check size={18} strokeWidth={3} /> I ACCEPT
           </button>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerModal;
