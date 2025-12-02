
import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, ScanBarcode, DollarSign, Archive, Share2, HelpCircle, BookOpen } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  const faqs = [
    {
      id: 'scanning',
      question: "Why isn't my barcode scanning?",
      answer: "Ensure you have good lighting and hold the camera steady. Glare on shiny packaging can prevent scanning. If a barcode is damaged or unsupported, you can switch to 'Photo Mode' or use the Manual Search bar to look up the item by name."
    },
    {
        id: 'profit',
        question: "How is Net Profit calculated?",
        answer: "We use the formula: Sold Price - Platform Fees (approx 13.25% + $0.30) - Shipping Cost - Item Cost. You can customize the Item Cost and Shipping in the calculator before saving."
    },
    {
        id: 'ebay',
        question: "How do I list on eBay?",
        answer: "First, go to Settings and connect your eBay account. Once connected, open any 'Draft' item in your inventory and click the 'List on eBay' button. We'll upload your photos and details to create a live Fixed Price listing."
    },
    {
        id: 'storage',
        question: "What are Storage Units?",
        answer: "Storage Units help you track where your inventory is physically located. You can create units (like 'Garage', 'Bin A', 'Storage Unit 55') and assign items to them. This helps calculate profitability per source."
    },
    {
        id: 'bulk',
        question: "What is Death Pile / Bulk Mode?",
        answer: "This mode allows you to snap photos rapidly without analyzing them immediately. It's designed for clearing through large piles of unlisted inventory quickly. You can edit and list them later from your inventory."
    }
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HelpCircle className="text-emerald-600 dark:text-neon-green" size={20} /> Help & Instructions
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50 dark:bg-slate-950">
            
            {/* Quick Start Guide */}
            <section>
                <h4 className="text-sm font-mono text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <BookOpen size={14} /> Quick Start Guide
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700/50 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 font-bold">1</div>
                        <h5 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2"><ScanBarcode size={16}/> Scan Item</h5>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Point your camera at a barcode. If it doesn't scan, snap a photo. Our AI will identify the item and estimate its value.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700/50 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 font-bold">2</div>
                        <h5 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2"><DollarSign size={16}/> Check Profit</h5>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Review the estimated sold price and shipping. Enter your buy cost. We'll show you the potential Net Profit instantly.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700/50 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3 font-bold">3</div>
                        <h5 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2"><Archive size={16}/> Save Draft</h5>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Save profitable items to your inventory. Assign them to a specific Storage Unit bin so you never lose them.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700/50 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-3 font-bold">4</div>
                        <h5 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2"><Share2 size={16}/> List It</h5>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Connect eBay in Settings. Open your draft and click "List". We handle the photos and description for you.
                        </p>
                    </div>
                </div>
            </section>

            {/* FAQ Accordion */}
            <section>
                <h4 className="text-sm font-mono text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <HelpCircle size={14} /> Frequently Asked Questions
                </h4>
                <div className="space-y-2">
                    {faqs.map(faq => (
                        <div key={faq.id} className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-800/30">
                            <button 
                                onClick={() => toggleSection(faq.id)}
                                className="w-full flex justify-between items-center p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                            >
                                <span className="font-bold text-sm text-slate-700 dark:text-slate-200">{faq.question}</span>
                                {expandedSection === faq.id ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                            </button>
                            {expandedSection === faq.id && (
                                <div className="p-4 pt-0 text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-white dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800/50">
                                    <div className="pt-3">{faq.answer}</div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
