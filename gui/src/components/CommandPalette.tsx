import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Mail, Home, Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const commands = [
    { id: 'home', title: 'Go to Home', icon: Home, action: () => navigate('/') },
    { id: 'emails', title: 'Email Summaries', icon: Mail, action: () => navigate('/emails') },
    { id: 'fetch', title: 'Fetch New Emails', icon: Bot, action: () => navigate(`/emails?action=fetch&ts=${Date.now()}`) },
  ];

  const filteredCommands = commands.filter(cmd => 
    cmd.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          cmd.action();
          setIsOpen(false);
          setQuery('');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative w-full max-w-2xl bg-background border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col z-50"
        >
          <div className="flex items-center border-b border-border px-4 py-3">
            <Search className="w-5 h-5 text-muted-foreground mr-3" />
            <input
              autoFocus
              className="flex-1 bg-transparent border-none outline-none text-lg text-foreground placeholder:text-muted-foreground"
              placeholder="Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="hidden sm:inline-block font-mono bg-muted px-1.5 py-0.5 rounded text-xs text-muted-foreground border border-border">ESC</kbd>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredCommands.map((cmd, idx) => {
                  const Icon = cmd.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      className={cn(
                        "flex items-center px-4 py-3 rounded-lg cursor-pointer transition-colors",
                        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                      )}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => {
                        cmd.action();
                        setIsOpen(false);
                        setQuery('');
                      }}
                    >
                      <Icon className={cn("w-5 h-5 mr-3", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")} />
                      <span className="font-medium">{cmd.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
