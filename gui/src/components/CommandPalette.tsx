/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { Archive, Mail, RefreshCw, Search, SquarePen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const commands = useMemo(
    () => [
      { id: 'current', title: 'Current sync', icon: Mail, action: () => navigate('/') },
      { id: 'archive', title: 'All synced', icon: Archive, action: () => navigate('/emails?view=all') },
      { id: 'drafts', title: 'Drafts', icon: SquarePen, action: () => navigate('/emails?view=drafts') },
      { id: 'fetch', title: 'Sync mail', icon: RefreshCw, action: () => navigate(`/emails?action=fetch&ts=${Date.now()}`) },
    ],
    [navigate],
  );

  const filteredCommands = useMemo(
    () => commands.filter(command => command.title.toLowerCase().includes(query.toLowerCase())),
    [commands, query],
  );

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsOpen(open => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex(prev => (filteredCommands.length === 0 ? 0 : (prev + 1) % filteredCommands.length));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex(prev => (filteredCommands.length === 0 ? 0 : (prev - 1 + filteredCommands.length) % filteredCommands.length));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          command.action();
          setIsOpen(false);
          setQuery('');
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, isOpen, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[14vh]" onMouseDown={() => setIsOpen(false)}>
      <section
        className="command-surface surface-enter w-full max-w-[620px] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--panel)]"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-5 w-5 text-[var(--text-muted)]" />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
            placeholder="Search commands"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <kbd className="hidden rounded border border-[var(--border)] bg-[var(--app-bg)] px-2 py-1 text-xs text-[var(--text-muted)] sm:inline-block">
            Esc
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">No commands found.</div>
          ) : (
            filteredCommands.map((command, index) => {
              const Icon = command.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={command.id}
                  className={cn(
                    'pressable flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                    isSelected ? 'bg-[var(--active)] text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]',
                  )}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    command.action();
                    setIsOpen(false);
                    setQuery('');
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{command.title}</span>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
