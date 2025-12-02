
import React, { useState } from 'react';
import { X, Send, MessageSquare, AlertTriangle, Lightbulb, ThumbsUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { submitFeedback } from '../services/databaseService';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [type, setType] = useState<'FEATURE' | 'BUG' | 'GENERAL'>('GENERAL');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !user) return;

    setIsSending(true);
    
    try {
      const success = await submitFeedback({
        userId: user.id,
        message: message.trim(),
        type,
        dateCreated: new Date().toISOString()
      });

      if (success) {
        setIsSuccess(true);
        setTimeout(() => {
           onClose();
           // Reset state after close
           setTimeout(() => {
             setIsSuccess(false);
             setMessage('');
             setType('GENERAL');
           }, 500);
        }, 2000);
      } else {
        alert("Failed to send feedback. Please try again later.");
      }
    } catch (err) {
      console.error(err);
      alert("Error sending feedback.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare className="text-neon-green" size={20} /> Share Feedback
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95">
             <div className="w-16 h-16 bg-neon-green/20 rounded-full flex items-center justify-center mb-4">
                <ThumbsUp size={32} className="text-neon-green" />
             </div>
             <h3 className="text-xl font-bold text-white mb-2">Feedback Sent!</h3>
             <p className="text-slate-400">Thank you for helping us improve ScanToSold.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
             {/* Type Selector */}
             <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setType('GENERAL')}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${type === 'GENERAL' ? 'bg-slate-800 border-neon-green text-neon-green' : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                >
                   <MessageSquare size={20} className="mb-1" />
                   <span className="text-[10px] font-bold uppercase">General</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('FEATURE')}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${type === 'FEATURE' ? 'bg-slate-800 border-blue-400 text-blue-400' : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                >
                   <Lightbulb size={20} className="mb-1" />
                   <span className="text-[10px] font-bold uppercase">Feature</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('BUG')}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${type === 'BUG' ? 'bg-slate-800 border-red-400 text-red-400' : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                >
                   <AlertTriangle size={20} className="mb-1" />
                   <span className="text-[10px] font-bold uppercase">Bug</span>
                </button>
             </div>

             {/* Message Input */}
             <div className="space-y-2">
               <label className="text-xs font-mono text-slate-400 uppercase">Your Message</label>
               <textarea 
                 value={message}
                 onChange={(e) => setMessage(e.target.value)}
                 className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-neon-green h-32 resize-none placeholder-slate-600"
                 placeholder={type === 'BUG' ? "Describe what happened..." : "Tell us what you think..."}
                 required
               />
             </div>

             <div className="pt-2">
               <button 
                 type="submit"
                 disabled={isSending || !message.trim()}
                 className="w-full py-3 bg-neon-green text-slate-950 font-bold rounded-xl hover:bg-neon-green/90 transition-all shadow-lg shadow-neon-green/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {isSending ? 'SENDING...' : <><Send size={18} /> SUBMIT FEEDBACK</>}
               </button>
             </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
