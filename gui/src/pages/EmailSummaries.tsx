/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability, react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Inbox,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Send,
  SquarePen,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';

interface EmailSummary {
  id: string;
  message_id?: string;
  sender: string;
  to_email?: string;
  subject: string;
  date: string;
  summary: string;
  is_actionable: boolean;
  priority: string;
  generated_reply?: string;
  draft_reply?: string;
  status?: string;
}

type ViewMode = 'current' | 'all';
type MailboxView = 'inbox' | 'drafts';

const EMAIL_CACHE_KEY = 'mailme.emailSummaries';

const safeFormatDate = (dateStr: string, formatStr: string) => {
  if (!dateStr || dateStr === 'Today' || dateStr === 'Unknown') return dateStr || 'Unknown';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return format(d, formatStr);
  } catch {
    return dateStr;
  }
};

const normalizeEmailRecord = (record: any): EmailSummary => {
  const savedRecord = record?.saved_record;
  const source = record?.saved_record || record || {};
  const messageId = source.message_id || record?.message_id || source.id || Math.random().toString();
  const sender = source.from_name || source.from_email || record?.sender || record?.from || 'Unknown';
  const status = source.status || record?.status || 'generated';
  const savedDraft = savedRecord
    ? savedRecord.draft_reply || savedRecord.reply || ''
    : status === 'generated'
      ? source.draft_reply || record?.draft_reply || ''
      : source.draft_reply || source.reply || record?.draft_reply || '';
  const generatedReply = savedRecord
    ? record?.reply || record?.generated_reply || ''
    : status === 'generated'
      ? source.generated_reply || record?.generated_reply || source.reply || record?.reply || ''
      : source.generated_reply || record?.generated_reply || '';

  return {
    id: messageId,
    message_id: messageId,
    sender,
    to_email: source.to_email || record?.to_email || source.from_email || '',
    subject: source.subject || record?.subject || 'No Subject',
    date: source.updated_at || source.generated_at || source.created_at || record?.date || new Date().toISOString(),
    summary: source.summary || record?.summary || '',
    is_actionable: source.is_actionable || record?.is_actionable || false,
    priority: source.priority || record?.priority || 'Normal',
    generated_reply: generatedReply,
    draft_reply: savedDraft,
    status,
  };
};

const mergeEmail = (current: EmailSummary[], next: EmailSummary) => {
  const existingIndex = current.findIndex(email => email.id === next.id || email.message_id === next.message_id);
  if (existingIndex === -1) return [next, ...current];

  const updated = [...current];
  updated[existingIndex] = { ...updated[existingIndex], ...next };
  return updated;
};

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AI';

const priorityClass = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case 'high':
      return 'border-[var(--danger)] text-[var(--danger)]';
    case 'medium':
      return 'border-[var(--warning)] text-[var(--warning)]';
    default:
      return 'border-[var(--success)] text-[var(--success)]';
  }
};

const readCachedEmails = () => {
  try {
    const cached = localStorage.getItem(EMAIL_CACHE_KEY);
    if (!cached) return [];
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed.map(normalizeEmailRecord) : [];
  } catch {
    return [];
  }
};

const writeCachedEmails = (emails: EmailSummary[]) => {
  try {
    localStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(emails));
  } catch {
    // Ignore unavailable storage, such as private windows or locked-down webviews.
  }
};

export function EmailSummaries() {
  const [currentSyncEmails, setCurrentSyncEmails] = useState<EmailSummary[]>([]);
  const [allEmails, setAllEmails] = useState<EmailSummary[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('current');
  const [mailboxView, setMailboxView] = useState<MailboxView>('inbox');
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailSummary | null>(null);
  const [fetching, setFetching] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(900);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [sending, setSending] = useState(false);
  const location = useLocation();

  const isDraftsView = mailboxView === 'drafts';
  const isCurrentSyncView = mailboxView === 'inbox' && viewMode === 'current';
  const canEditReply = Boolean(selectedEmail) && (isCurrentSyncView || isDraftsView);

  const visibleEmails = useMemo(() => {
    const source = mailboxView === 'drafts' ? allEmails : viewMode === 'current' ? currentSyncEmails : allEmails;
    return mailboxView === 'drafts' ? source.filter(email => Boolean(email.draft_reply?.trim())) : source;
  }, [allEmails, currentSyncEmails, mailboxView, viewMode]);

  const filteredEmails = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return visibleEmails;
    return visibleEmails.filter(email =>
      [email.subject, email.sender, email.summary, email.draft_reply]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle)),
    );
  }, [visibleEmails, query]);

  const stats = useMemo(() => {
    const drafts = allEmails.filter(email => email.draft_reply).length;
    const sent = allEmails.filter(email => email.status === 'sent').length;
    return { current: currentSyncEmails.length, total: allEmails.length, drafts, sent };
  }, [allEmails, currentSyncEmails]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleFetchNew();
          return 900;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cached = readCachedEmails();
    if (cached.length > 0) {
      setAllEmails(cached);
      setLoading(false);
    }
    fetchSummaries();

    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'drafts') {
      setMailboxView('drafts');
      setViewMode('all');
    }
    if (params.get('view') === 'all') {
      setMailboxView('inbox');
      setViewMode('all');
    }
    if (params.get('action') === 'fetch') {
      handleFetchNew();
    }
  }, [location.search]);

  useEffect(() => {
    if (allEmails.length > 0) writeCachedEmails(allEmails);
  }, [allEmails]);

  useEffect(() => {
    if (visibleEmails.length === 0) {
      if (selectedEmail) setSelectedEmail(null);
      return;
    }

    if (!selectedEmail || !visibleEmails.some(email => email.id === selectedEmail.id)) {
      setSelectedEmail(visibleEmails[0]);
    }
  }, [visibleEmails, selectedEmail]);

  useEffect(() => {
    setDraft(selectedEmail?.draft_reply || selectedEmail?.generated_reply || '');
    setDraftSaveState('idle');
  }, [selectedEmail?.draft_reply, selectedEmail?.generated_reply, selectedEmail?.id]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const fetchSummaries = async () => {
    try {
      setLoading(true);
      let res: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          res = await fetch('/api/emails/summaries');
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
        }
      }
      if (!res) return;
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setAllEmails(data.data.map(normalizeEmailRecord));
        } else if (Array.isArray(data)) {
          setAllEmails(data.map(normalizeEmailRecord));
        }
      }
    } catch (error) {
      console.error('Failed to fetch summaries', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSelectedEmail = (patch: Partial<EmailSummary>) => {
    if (!selectedEmail) return;
    const updated = { ...selectedEmail, ...patch };
    setSelectedEmail(updated);
    setCurrentSyncEmails(current => current.map(email => (email.id === updated.id ? updated : email)));
    setAllEmails(current => current.map(email => (email.id === updated.id ? updated : email)));
  };

  const handleSetViewMode = (nextMode: ViewMode) => {
    setMailboxView('inbox');
    setViewMode(nextMode);
    setQuery('');
    const nextEmails = nextMode === 'current' ? currentSyncEmails : allEmails;
    setSelectedEmail(nextEmails[0] || null);
    if (nextMode === 'all') fetchSummaries();
  };

  const handleShowDrafts = () => {
    const draftEmails = allEmails.filter(email => Boolean(email.draft_reply?.trim()));
    setMailboxView('drafts');
    setViewMode('all');
    setQuery('');
    setSelectedEmail(draftEmails[0] || null);
    fetchSummaries();
  };

  const handleSaveDraft = async () => {
    if (!selectedEmail) return;
    try {
      setSavingDraft(true);
      setDraftSaveState('idle');
      const res = await fetch('/api/emails/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: selectedEmail.id,
          draft_reply: draft,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data?.success) {
          setDraftSaveState('error');
          return;
        }
        const savedEmail = data?.data ? normalizeEmailRecord(data.data) : null;
        updateSelectedEmail({
          draft_reply: savedEmail?.draft_reply || draft,
          status: savedEmail?.status || (selectedEmail.status === 'sent' ? 'sent' : 'draft_updated'),
        });
        setDraftSaveState('saved');
      } else {
        setDraftSaveState('error');
      }
    } catch (error) {
      console.error('Failed to save draft', error);
      setDraftSaveState('error');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedEmail || !draft.trim()) return;
    try {
      setSending(true);
      const res = await fetch('/api/emails/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: selectedEmail.id,
          to_email: selectedEmail.to_email || selectedEmail.sender,
          subject: selectedEmail.subject.toLowerCase().startsWith('re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
          body: draft,
        }),
      });
      if (res.ok) updateSelectedEmail({ draft_reply: draft, status: 'sent' });
    } catch (error) {
      console.error('Error sending reply', error);
    } finally {
      setSending(false);
    }
  };

  const handleFetchNew = async () => {
    try {
      setFetching(true);
      setMailboxView('inbox');
      setViewMode('current');
      setCurrentSyncEmails([]);
      setSelectedEmail(null);
      const res = await fetch('/api/emails/fetch');
      if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedEmails = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const dataLine = event.split('\n').find(line => line.startsWith('data: '));
            if (!dataLine) continue;

            const payload = JSON.parse(dataLine.slice(6));
            if (payload.type === 'email_summary' && payload.data) {
              const email = normalizeEmailRecord(payload.data);
              receivedEmails = true;
              setCurrentSyncEmails(current => mergeEmail(current, email));
              setAllEmails(current => mergeEmail(current, email));
              setSelectedEmail(current => current || email);
            }
          }
        }
        if (receivedEmails) return;
      }
    } catch (error) {
      console.error('Failed to fetch new emails', error);
    } finally {
      setFetching(false);
    }
  };

  const emptyText = isDraftsView
    ? 'No saved drafts yet.'
    : viewMode === 'current'
      ? 'No unread messages in this sync.'
      : 'No synced emails yet.';

  return (
    <div className="flex h-full overflow-hidden bg-[var(--app-bg)] text-[var(--text)]">
      <aside
        className={`hidden shrink-0 border-r border-[var(--border)] bg-[var(--sidebar)] px-3 py-4 text-[var(--sidebar-text)] md:flex md:flex-col ${
          sidebarCollapsed ? 'w-[68px]' : 'w-[248px]'
        }`}
      >
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--sidebar-2)] text-[var(--accent)]">
              <Mail className="h-5 w-5" />
            </span>
            {!sidebarCollapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">Mailme</span>
                <span className="block truncate text-xs text-[var(--sidebar-muted)]">Email assistant</span>
              </span>
            )}
          </div>
          <button
            onClick={() => setSidebarCollapsed(value => !value)}
            className="pressable rounded-md p-2 text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-text)]"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="space-y-1">
          {[
            { label: 'Current sync', icon: Inbox, action: () => handleSetViewMode('current'), active: isCurrentSyncView, count: stats.current },
            { label: 'All synced', icon: Archive, action: () => handleSetViewMode('all'), active: mailboxView === 'inbox' && viewMode === 'all', count: stats.total },
            { label: 'Drafts', icon: SquarePen, action: handleShowDrafts, active: isDraftsView, count: stats.drafts },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={item.action}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm ${
                  item.active
                    ? 'nav-item-active bg-[var(--active-soft)] font-semibold text-[var(--sidebar-text)]'
                    : 'text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-text)]'
                }`}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count !== null && (
                      <span className="min-w-7 rounded border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-center text-xs text-[var(--sidebar-muted)]">
                        {item.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-[var(--sidebar-muted)]">
              <span>Sent mail</span>
              <span className="font-semibold text-[var(--sidebar-text)]">{stats.sent}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--sidebar-muted)]">
              <span>Next sync</span>
              <span className="font-semibold text-[var(--sidebar-text)]">{formatTimer(timeRemaining)}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleFetchNew}
          disabled={fetching}
          className="pressable mt-auto flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-text)] shadow-[0_2px_8px_rgba(0,0,0,.22)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          title="Sync mail"
        >
          <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
          {!sidebarCollapsed && <span>{fetching ? 'Syncing' : `Sync in ${formatTimer(timeRemaining)}`}</span>}
        </button>
      </aside>

      <section
        className={`surface-enter w-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--list-bg)] md:flex md:w-[390px] md:shrink-0 xl:w-[430px] ${
          selectedEmail ? 'hidden' : 'flex'
        }`}
      >
        <header className="border-b border-[var(--border)] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{isDraftsView ? 'Drafts' : viewMode === 'all' ? 'All synced' : 'Current sync'}</p>
              <p className="mt-1 truncate text-sm text-[var(--text-muted)]">
                {isDraftsView ? `${stats.drafts} saved replies` : `${filteredEmails.length} messages visible`}
              </p>
            </div>
            <button
              onClick={handleFetchNew}
              disabled={fetching}
              className="pressable rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--text)] hover:bg-[var(--panel-raised)] disabled:opacity-60"
              title="Sync mail"
            >
              <RefreshCw className={`h-5 w-5 ${fetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 rounded-md border border-[var(--border)] bg-[var(--app-bg)] p-1">
            <button
              onClick={() => handleSetViewMode('current')}
              className={`rounded px-3 py-2 text-sm font-medium ${isCurrentSyncView ? 'bg-[var(--active)] text-[var(--accent-text)] shadow-[0_1px_4px_rgba(0,0,0,.18)]' : 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}
            >
              Current
            </button>
            <button
              onClick={() => handleSetViewMode('all')}
              className={`rounded px-3 py-2 text-sm font-medium ${mailboxView === 'inbox' && viewMode === 'all' ? 'bg-[var(--active)] text-[var(--accent-text)] shadow-[0_1px_4px_rgba(0,0,0,.18)]' : 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}
            >
              Archive
            </button>
          </div>

          <label className="command-surface flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--field)] px-3 py-2">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={isDraftsView ? 'Search drafts' : 'Search mail'}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
            />
          </label>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="m-3 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--panel)] p-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-[var(--accent)]" />
              <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>
            </div>
          ) : (
            <div>
              {filteredEmails.map(email => (
                <button
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`pressable row-enter grid w-full grid-cols-[40px_1fr] gap-3 border-b border-[var(--border)] px-4 py-3 text-left hover:bg-[var(--hover)] ${
                    selectedEmail?.id === email.id ? 'bg-[var(--active-soft)] shadow-[inset_2px_0_0_var(--accent)]' : ''
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel-raised)] text-xs font-semibold text-[var(--text)]">
                    {initialsFor(email.sender)}
                  </span>
                  <span className="min-w-0">
                    <span className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-[var(--text)]">{email.subject}</span>
                      <span className="shrink-0 text-xs text-[var(--text-subtle)]">{safeFormatDate(email.date, 'MMM d')}</span>
                    </span>
                    <span className="mb-2 block truncate text-xs text-[var(--text-muted)]">{email.sender}</span>
                    <span className="line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
                      {(isDraftsView ? email.draft_reply : email.summary)?.replace(/\s+/g, ' ').slice(0, 180) ||
                        (isDraftsView ? 'Saved draft will appear here.' : 'Generated summary will appear here.')}
                    </span>
                    <span className="mt-3 flex items-center gap-2">
                      {email.draft_reply?.trim() && (
                        <span className="rounded border border-[var(--border-strong)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">Draft</span>
                      )}
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${priorityClass(email.priority)}`}>{email.priority || 'Normal'}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <main className={`${selectedEmail ? 'block' : 'hidden md:block'} min-w-0 flex-1 overflow-y-auto bg-[var(--app-bg)]`}>
        {selectedEmail ? (
          <article className="surface-enter mx-auto max-w-4xl px-6 py-5">
            <button
              onClick={() => setSelectedEmail(null)}
              className="mb-4 inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--panel-raised)] hover:text-[var(--text)] md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Messages
            </button>
            <section className="panel-depth mb-4 rounded-lg border border-[var(--border)] bg-[var(--panel)]">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="rounded border border-[var(--border)] px-2 py-1">{selectedEmail.status || 'generated'}</span>
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    {safeFormatDate(selectedEmail.date, 'PPP p')}
                  </span>
                </div>
                <h1 className="text-xl font-semibold leading-7 text-[var(--text)]">{selectedEmail.subject}</h1>
              </div>
              <div className="flex items-center gap-3 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--active)] text-sm font-semibold">
                  {initialsFor(selectedEmail.sender)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{selectedEmail.sender}</span>
                  <span className="block truncate text-sm text-[var(--text-muted)]">{selectedEmail.to_email || selectedEmail.sender}</span>
                </span>
              </div>
            </section>

            {!isDraftsView && (
            <section className="panel-depth mb-4 rounded-lg border border-[var(--border)] bg-[var(--panel)]">
                <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-semibold">Summary</div>
                <div className="email-prose px-5 py-4">
                  <ReactMarkdown>{selectedEmail.summary || 'No summary available.'}</ReactMarkdown>
                </div>
              </section>
            )}

            <section className="panel-depth rounded-lg border border-[var(--border)] bg-[var(--panel)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
                <span className="text-sm font-semibold">{isDraftsView ? 'Saved draft' : 'Reply'}</span>
                {draftSaveState === 'saved' && <span className="text-xs text-[var(--success)]">Saved</span>}
              </div>
              {canEditReply ? (
                <div className="p-4">
                  <textarea
                    value={draft}
                    onChange={event => {
                      setDraft(event.target.value);
                      setDraftSaveState('idle');
                    }}
                    className="h-[300px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--field)] p-4 text-sm leading-6 text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)]"
                    placeholder="Draft reply"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={handleSaveDraft}
                      disabled={savingDraft}
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--panel-raised)] disabled:opacity-60"
                    >
                      {savingDraft ? 'Saving' : draftSaveState === 'saved' ? 'Saved' : 'Save'}
                    </button>
                    <button
                      onClick={handleSendReply}
                      disabled={sending || !draft.trim()}
                      className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {sending ? 'Sending' : 'Send'}
                    </button>
                  </div>
                  {draftSaveState === 'error' && (
                    <p className="mt-3 rounded-md border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                      Draft was not saved. Check the backend log and try again.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-5 text-sm leading-6 text-[var(--text-muted)]">
                  Open Current sync to save a suggested reply, or open Drafts to edit saved replies.
                </div>
              )}
            </section>
          </article>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--text-muted)]">Select an email.</div>
        )}
      </main>
    </div>
  );
}
