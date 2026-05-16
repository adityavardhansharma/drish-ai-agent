import { motion } from 'framer-motion';
import { Bot, Mail, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Home() {
  const navigate = useNavigate();
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/20"
      >
        <Bot size={48} className="text-white" />
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <h1 className="text-4xl font-bold tracking-tight mb-2">AI Agent Pro</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your personal AI assistant. Press <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs mx-1 border border-border">Ctrl</kbd> + <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs mx-1 border border-border">K</kbd> to open the command palette.
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid grid-cols-2 gap-4 w-full max-w-lg mt-8"
      >
        <button 
          onClick={() => navigate('/emails')}
          className="flex flex-col items-center justify-center p-6 rounded-xl border border-border bg-muted/30 hover:bg-muted/80 transition-colors group"
        >
          <Mail className="mb-3 text-muted-foreground group-hover:text-foreground transition-colors" size={28} />
          <span className="font-medium">Email Summaries</span>
        </button>
        <button 
          className="flex flex-col items-center justify-center p-6 rounded-xl border border-border bg-muted/30 hover:bg-muted/80 transition-colors group"
        >
          <Settings className="mb-3 text-muted-foreground group-hover:text-foreground transition-colors" size={28} />
          <span className="font-medium">Settings</span>
        </button>
      </motion.div>
    </div>
  );
}
