import React from 'react';
import { X, Shield, Lock, Eye, Server, FileText } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="text-emerald-600" size={20} /> Privacy Policy & Data Handling
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300 text-sm leading-relaxed">
            <div className="text-xs text-slate-500 font-mono mb-4">Last Updated: {new Date().toLocaleDateString()}</div>

            <section>
                <h4 className="text-white font-bold mb-2 flex items-center gap-2 text-base"><Lock size={16} className="text-blue-400"/> Data Collection</h4>
                <p>We collect specific information required to provide our inventory management services:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-400">
                    <li><strong>Account Information:</strong> Email address and User ID (managed securely via Supabase Authentication).</li>
                    <li><strong>Security Data:</strong> IP addresses and device information for security logging and abuse prevention.</li>
                    <li><strong>User Content:</strong> Inventory data, including item titles, costs, prices, and photos you upload.</li>
                </ul>
            </section>

            <section>
                <h4 className="text-white font-bold mb-2 flex items-center gap-2 text-base"><Server size={16} className="text-purple-400"/> Data Usage</h4>
                <p>Your data is used solely for the following purposes:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-400">
                    <li>Providing, maintaining, and improving the ScanToSold service.</li>
                    <li>Managing your account, subscription, and inventory database.</li>
                    <li>Personalizing your dashboard insights and sales tracking.</li>
                </ul>
                <p className="mt-2 text-xs text-slate-500 italic">We do not sell your personal data to third parties/advertisers.</p>
            </section>

            <section className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <h4 className="text-white font-bold mb-2 flex items-center gap-2 text-base"><Eye size={16} className="text-emerald-400"/> Third-Party Disclosure (AI Processing)</h4>
                <p className="mb-2">To provide our core "AI Scanning" and "Listing Generator" features, specific data must be processed by a third-party AI provider.</p>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-slate-200 font-medium">
                    "User-submitted images and descriptive text are sent to the Google Gemini API for analysis and returned to the user."
                </div>
                <p className="mt-3 text-xs text-slate-400">
                    This data is processed ephemerally by Google to generate descriptions, identify items, and estimate prices. The data is processed according to Google’s API Data Protection Policies and is not used to train their public models (for paid API tiers).
                </p>
            </section>

            <section>
                <h4 className="text-white font-bold mb-2 text-base">Data Retention & Deletion</h4>
                <p>Your inventory data and images are stored securely in our database. You retain full ownership of your data. You can delete individual items or your entire account (and all associated data) at any time by contacting support or using the delete features within the app.</p>
            </section>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors border border-slate-700">
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;