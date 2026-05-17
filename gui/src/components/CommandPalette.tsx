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
          className="fixed inset-0 bg-[var(--ink)]/28 backdrop-blur-md"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative z-50 flex w-[min(680px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--paper)]/92 shadow-[0_40px_140px_rgba(15,23,42,.22)] backdrop-blur-xl"
        >
          <div className="flex items-center border-b border-[var(--line)] px-5 py-4">
            <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <Search className="h-5 w-5" />
            </div>
            <input
              autoFocus
              className="min-w-0 flex-1 border-none bg-transparent text-lg font-black text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)]"
              placeholder="Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="hidden rounded-full border border-[var(--line)] bg-white/70 px-2.5 py-1 text-xs font-black text-[var(--muted-ink)] sm:inline-block">ESC</kbd>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <div className="py-14 text-center text-sm font-bold text-[var(--muted-ink)]">
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
                        "flex cursor-pointer items-center rounded-2xl px-4 py-3 transition",
                        isSelected
                          ? "bg-[var(--ink)] text-[var(--paper)] shadow-[0_18px_50px_rgba(15,23,42,.20)]"
                          : "text-[var(--ink)] hover:bg-white/70"
                      )}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => {
                        cmd.action();
                        setIsOpen(false);
                        setQuery('');
                      }}
                    >
                      <Icon className={cn("mr-3 h-5 w-5", isSelected ? "text-[var(--brand-soft)]" : "text-[var(--muted-ink)]")} />
                      <span className="font-black">{cmd.title}</span>
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
