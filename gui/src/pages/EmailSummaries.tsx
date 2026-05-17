import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Home,
  Inbox,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
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
      return 'border-rose-300 bg-rose-100 text-rose-800';
    case 'medium':
      return 'border-amber-300 bg-amber-100 text-amber-800';
    default:
      return 'border-emerald-300 bg-emerald-100 text-emerald-800';
  }
};

const EMAIL_CACHE_KEY = 'mailme.emailSummaries';

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
  const navigate = useNavigate();
  const location = useLocation();
  const isDraftsView = mailboxView === 'drafts';
  const isAllSyncedView = mailboxView === 'inbox' && viewMode === 'all';
  const isCurrentSyncView = mailboxView === 'inbox' && viewMode === 'current';
  const showReplyAside = isCurrentSyncView;
  const canEditReply = Boolean(selectedEmail) && (isCurrentSyncView || isDraftsView);
  const visibleEmails = useMemo(() => {
    const source = mailboxView === 'drafts' ? allEmails : viewMode === 'current' ? currentSyncEmails : allEmails;
    return mailboxView === 'drafts'
      ? source.filter(email => Boolean(email.draft_reply?.trim()))
      : source;
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
    if (params.get('action') === 'fetch') {
      handleFetchNew();
    }
  }, [location.search]);

  useEffect(() => {
    if (allEmails.length > 0) {
      writeCachedEmails(allEmails);
    }
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
  }, [selectedEmail?.id]);

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
          const nextEmails: EmailSummary[] = data.data.map(normalizeEmailRecord);
          setAllEmails(nextEmails);
        } else if (Array.isArray(data)) {
          const nextEmails: EmailSummary[] = data.map(normalizeEmailRecord);
          setAllEmails(nextEmails);
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
    const nextEmails = nextMode === 'current' ? currentSyncEmails : allEmails;
    setSelectedEmail(nextEmails[0] || null);
    if (nextMode === 'all') {
      fetchSummaries();
    }
  };

  const handleShowDrafts = () => {
    const draftEmails = allEmails.filter(email => Boolean(email.draft_reply?.trim()));
    setMailboxView('drafts');
    setViewMode('all');
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
      if (res.ok) {
        updateSelectedEmail({ draft_reply: draft, status: 'sent' });
      }
    } catch (error) {
      console.error('Error sending reply', error);
    } finally {
      setSending(false);
    }
  };

  const handleFetchNew = async () => {
    try {
      setFetching(true);
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
        if (receivedEmails) {
          return;
        }
      }
    } catch (error) {
      console.error('Failed to fetch new emails', error);
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="relative h-full overflow-hidden bg-[var(--surface)] text-[var(--ink)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 top-16 h-72 w-72 rounded-full bg-[var(--brand)]/12 blur-3xl" />
        <div className="absolute bottom-0 right-20 h-80 w-80 rounded-full bg-[var(--accent)]/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,.06)_1px,transparent_0)] [background-size:28px_28px]" />
      </div>

      <div
        className={`relative grid h-full ${
          showReplyAside
            ? 'grid-cols-[auto_minmax(320px,410px)_minmax(0,1fr)_minmax(340px,420px)] max-[1180px]:grid-cols-[auto_minmax(300px,380px)_minmax(0,1fr)]'
            : 'grid-cols-[auto_minmax(320px,410px)_minmax(0,1fr)]'
        } max-[900px]:grid-cols-1`}
      >
        <aside
          className={`z-10 flex h-full flex-col border-r border-[var(--line)] bg-[var(--nav)] px-3 py-4 transition-all duration-300 max-[900px]:hidden ${
            sidebarCollapsed ? 'w-[76px]' : 'w-[244px]'
          }`}
        >
          <div className="mb-8 flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-[var(--hover)]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-[0_16px_40px_rgba(37,99,235,.22)]">
                <Mail className="h-5 w-5" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-sm font-black">Mailme</div>
                  <div className="text-xs font-semibold text-[var(--muted-ink)]">Reply workspace</div>
                </div>
              )}
            </button>
            <button
              onClick={() => setSidebarCollapsed(value => !value)}
              className="rounded-xl p-2 text-[var(--muted-ink)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <nav className="space-y-2">
            {[
              { label: 'Home', icon: Home, action: () => navigate('/') },
              { label: 'Inbox', icon: Inbox, action: () => setMailboxView('inbox'), active: mailboxView === 'inbox' },
              { label: 'Drafts', icon: PencilLine, action: handleShowDrafts, active: mailboxView === 'drafts' },
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition ${
                    item.active
                      ? 'bg-[var(--brand)] text-white shadow-[0_14px_30px_rgba(37,99,235,.22)]'
                      : 'text-[var(--muted-ink)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            {!sidebarCollapsed && (
              <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_18px_50px_rgba(15,23,42,.06)]">
                <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-[var(--muted-ink)]">
                  <Zap className="h-4 w-4 text-[var(--brand)]" />
                  Pulse
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-[var(--surface)] p-2">
                    <div className="text-lg font-black">{stats.current}</div>
                    <div className="text-[10px] font-bold text-[var(--muted-ink)]">Sync</div>
                  </div>
                    <div className="rounded-2xl bg-[var(--surface)] p-2">
                    <div className="text-lg font-black">{stats.total}</div>
                    <div className="text-[10px] font-bold text-[var(--muted-ink)]">All</div>
                  </div>
                    <div className="rounded-2xl bg-[var(--surface)] p-2">
                    <div className="text-lg font-black">{stats.drafts}</div>
                    <div className="text-[10px] font-bold text-[var(--muted-ink)]">Drafts</div>
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={handleFetchNew}
              disabled={fetching}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-black text-white shadow-[0_18px_50px_rgba(15,23,42,.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
              {!sidebarCollapsed && <span>{fetching ? 'Syncing' : `Sync ${formatTimer(timeRemaining)}`}</span>}
            </button>
          </div>
        </aside>

        <section className="z-10 flex min-h-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] max-[900px]:h-[42vh] max-[900px]:border-b max-[900px]:border-r-0">
          <header className="border-b border-[var(--line)] px-5 py-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                onClick={() => navigate('/')}
                className="hidden rounded-xl p-2 text-[var(--muted-ink)] transition hover:bg-[var(--hover)] max-[900px]:block"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="text-xs font-black uppercase text-[var(--brand)]">
                  {mailboxView === 'drafts'
                    ? 'Saved drafts'
                    : viewMode === 'current'
                      ? 'Latest unread sync'
                      : 'Convex archive'}
                </div>
                <h1 className="text-2xl font-black">{mailboxView === 'drafts' ? 'Drafts' : 'Inbox'}</h1>
              </div>
              <button
                onClick={handleFetchNew}
                disabled={fetching}
                className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 text-[var(--ink)] shadow-sm transition hover:bg-white disabled:opacity-60"
              >
                <RefreshCw className={`h-5 w-5 ${fetching ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 rounded-2xl border border-[var(--line)] bg-[var(--card-muted)] p-1">
              <button
                onClick={() => handleSetViewMode('current')}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                  viewMode === 'current'
                    ? 'bg-[var(--brand)] text-white shadow-[0_10px_24px_rgba(37,99,235,.20)]'
                    : 'text-[var(--muted-ink)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'
                }`}
              >
                Current sync
              </button>
              <button
                onClick={() => handleSetViewMode('all')}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                  viewMode === 'all'
                    ? 'bg-[var(--ink)] text-white shadow-[0_10px_24px_rgba(15,23,42,.14)]'
                    : 'text-[var(--muted-ink)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'
                }`}
              >
                All synced
              </button>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 shadow-inner">
              <Search className="h-4 w-4 text-[var(--muted-ink)]" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={mailboxView === 'drafts' ? 'Search saved drafts' : 'Search sender, subject, summary'}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[var(--muted-ink)]"
              />
            </label>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-[var(--muted-ink)]" />
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--line)] bg-[var(--card)] text-center">
                <CheckCircle2 className="mb-3 h-10 w-10 text-[var(--brand)]" />
                <p className="text-sm font-bold text-[var(--muted-ink)]">
                  {mailboxView === 'drafts'
                    ? 'No saved drafts yet.'
                    : viewMode === 'current'
                      ? 'No new unread emails in this sync.'
                      : 'No synced emails yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEmails.map((email, index) => (
                  <motion.button
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.035, 0.3) }}
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`group w-full rounded-3xl border p-4 text-left transition ${
                      selectedEmail?.id === email.id
                        ? 'border-[var(--brand)] bg-[var(--card)] shadow-[0_18px_50px_rgba(37,99,235,.12)]'
                        : 'border-transparent bg-[var(--card-muted)] hover:border-[var(--line)] hover:bg-[var(--card)]'
                    }`}
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-sm font-black text-[var(--brand)]">
                        {initialsFor(email.sender)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black">{email.subject}</div>
                        <div className="truncate text-xs font-semibold text-[var(--muted-ink)]">{email.sender}</div>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 text-[var(--muted-ink)] transition group-hover:translate-x-1" />
                    </div>
                    <div className="mb-3 line-clamp-2 text-xs font-medium leading-5 text-[var(--soft-ink)]">
                      {(isDraftsView ? email.draft_reply : email.summary)?.replace(/\s+/g, ' ').slice(0, 180) ||
                        (isDraftsView ? 'Saved draft will appear here.' : 'Generated summary will appear here.')}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--muted-ink)]">
                        <Clock3 className="h-3.5 w-3.5" />
                        {email.date ? safeFormatDate(email.date, 'MMM d, h:mm a') : 'Unknown'}
                      </span>
                      <div className="flex items-center gap-2">
                        {email.draft_reply?.trim() && (
                          <span className="rounded-full border border-[var(--brand)]/20 bg-[var(--brand-soft)] px-2.5 py-1 text-[10px] font-black uppercase text-[var(--brand)]">
                            Draft
                          </span>
                        )}
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${priorityClass(email.priority)}`}>
                          {email.priority || 'Normal'}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </section>

        <main className="z-10 min-h-0 overflow-y-auto px-6 py-5 max-[900px]:h-[58vh]">
          <AnimatePresence mode="wait">
            {selectedEmail ? (
              <motion.article
                key={selectedEmail.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mx-auto flex min-h-full flex-col gap-4 ${showReplyAside ? 'max-w-4xl' : 'max-w-5xl'}`}
              >
                <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[0_24px_70px_rgba(15,23,42,.08)]">
                  <div className="mb-5 flex items-start justify-between gap-5">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-black uppercase text-[var(--brand)]">
                          {selectedEmail.status || 'generated'}
                        </span>
                        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-black text-[var(--accent)]">
                          {safeFormatDate(selectedEmail.date, 'PPP p')}
                        </span>
                      </div>
                      <h2 className="text-balance text-[2rem] font-black leading-tight text-[var(--ink)] max-[1180px]:text-2xl">
                        {selectedEmail.subject}
                      </h2>
                    </div>
                    <button
                      onClick={() => setSelectedEmail(null)}
                      className="flex shrink-0 items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-black text-[var(--muted-ink)] transition hover:bg-white hover:text-[var(--ink)]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                  </div>

                  <div className="flex items-center gap-4 rounded-3xl bg-[var(--surface)] p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ink)] text-lg font-black text-white">
                      {initialsFor(selectedEmail.sender)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base font-black">{selectedEmail.sender}</div>
                      <div className="truncate text-sm font-semibold text-[var(--muted-ink)]">{selectedEmail.to_email || selectedEmail.sender}</div>
                    </div>
                  </div>
                </section>

                {!isDraftsView && (
                  <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase">AI Summary</h3>
                        <p className="text-xs font-semibold text-[var(--muted-ink)]">Saved automatically to All synced</p>
                      </div>
                    </div>
                    <div className="email-prose">
                      <ReactMarkdown>{selectedEmail.summary || 'No summary available.'}</ReactMarkdown>
                    </div>
                  </section>
                )}

                {isDraftsView && (
                  <section className="flex min-h-[520px] flex-col rounded-[1.75rem] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                        <PencilLine className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase">Reply Studio</h3>
                        <p className="text-xs font-semibold text-[var(--muted-ink)]">Edit the saved draft and save changes</p>
                      </div>
                    </div>
                    <textarea
                      value={draft}
                      onChange={event => {
                        setDraft(event.target.value);
                        setDraftSaveState('idle');
                      }}
                      className="min-h-0 flex-1 resize-none rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] p-5 text-sm font-medium leading-6 text-[var(--ink)] shadow-inner outline-none transition placeholder:text-[var(--muted-ink)] focus:border-[var(--brand)]"
                      placeholder="Draft reply"
                    />
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        onClick={handleSaveDraft}
                        disabled={savingDraft}
                        className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm font-black transition hover:bg-white disabled:opacity-60"
                      >
                        {savingDraft ? 'Saving...' : draftSaveState === 'saved' ? 'Saved' : 'Save'}
                      </button>
                      <button
                        onClick={handleSendReply}
                        disabled={sending || !draft.trim()}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white shadow-[0_18px_50px_rgba(37,99,235,.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        {sending ? 'Sending' : 'Send'}
                      </button>
                    </div>
                    {draftSaveState === 'error' && (
                      <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                        Draft was not saved. Check the backend log and try again.
                      </p>
                    )}
                  </section>
                )}
              </motion.article>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full items-center justify-center text-center"
              >
                <div className="rounded-[2rem] border border-dashed border-[var(--line)] bg-[var(--card)] p-10">
                  <Mail className="mx-auto mb-4 h-12 w-12 text-[var(--muted-ink)]" />
                  <p className="font-black text-[var(--muted-ink)]">Select an email.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {showReplyAside && (
        <aside className="z-10 flex min-h-0 flex-col border-l border-[var(--line)] bg-[var(--reply)] p-5 max-[1180px]:fixed max-[1180px]:bottom-4 max-[1180px]:right-4 max-[1180px]:top-auto max-[1180px]:z-30 max-[1180px]:h-[54vh] max-[1180px]:w-[min(430px,calc(100vw-2rem))] max-[1180px]:rounded-[2rem] max-[1180px]:border max-[1180px]:shadow-[0_30px_100px_rgba(15,23,42,.20)] max-[900px]:hidden">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase text-[var(--brand)]">
                {isAllSyncedView ? 'Archive' : 'Reply studio'}
              </div>
              <h2 className="text-2xl font-black">
                {isAllSyncedView
                  ? 'Summary Only'
                  : selectedEmail?.draft_reply?.trim()
                    ? 'Saved Draft'
                    : 'Suggested Reply'}
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
              {isAllSyncedView ? <Sparkles className="h-5 w-5" /> : <PencilLine className="h-5 w-5" />}
            </div>
          </div>

          {selectedEmail ? (
            <>
              <div className="mb-4 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-4">
                <div className="mb-1 text-xs font-black uppercase text-[var(--muted-ink)]">To</div>
                <div className="truncate text-sm font-black">{selectedEmail.to_email || selectedEmail.sender}</div>
                <div className="mt-3 inline-flex rounded-full bg-[var(--surface)] px-3 py-1 text-[10px] font-black uppercase text-[var(--muted-ink)]">
                  {isAllSyncedView
                    ? 'Summary saved'
                    : selectedEmail.draft_reply?.trim()
                      ? 'Saved in Drafts'
                      : 'Not saved yet'}
                </div>
              </div>

              {canEditReply ? (
                <>
                  <textarea
                    value={draft}
                    onChange={event => {
                      setDraft(event.target.value);
                      setDraftSaveState('idle');
                    }}
                    className="min-h-0 flex-1 resize-none rounded-[1.25rem] border border-[var(--line)] bg-[var(--card)] p-5 text-sm font-medium leading-6 text-[var(--ink)] shadow-inner outline-none transition placeholder:text-[var(--muted-ink)] focus:border-[var(--brand)]"
                    placeholder="Draft reply"
                  />

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={handleSaveDraft}
                      disabled={savingDraft}
                      className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm font-black transition hover:bg-white disabled:opacity-60"
                    >
                      {savingDraft ? 'Saving...' : draftSaveState === 'saved' ? 'Saved' : 'Save'}
                    </button>
                    <button
                      onClick={handleSendReply}
                      disabled={sending || !draft.trim()}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white shadow-[0_18px_50px_rgba(37,99,235,.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {sending ? 'Sending' : 'Send'}
                    </button>
                  </div>
                  {draftSaveState === 'error' && (
                    <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                      Draft was not saved. Check the backend log and try again.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-dashed border-[var(--line)] bg-[var(--card)] p-5 text-center text-sm font-bold leading-6 text-[var(--muted-ink)]">
                  All synced is the summary archive. Open Drafts to edit saved drafts, or use Current sync to save a suggested reply.
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-dashed border-[var(--line)] bg-[var(--card)] text-center text-sm font-bold text-[var(--muted-ink)]">
              Select an email.
            </div>
          )}
        </aside>
        )}
      </div>
    </div>
  );
}
