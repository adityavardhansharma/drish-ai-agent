import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowLeft, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
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
  draft_reply?: string;
}


const safeFormatDate = (dateStr: string, formatStr: string) => {
  if (!dateStr || dateStr === 'Today' || dateStr === 'Unknown') return dateStr || 'Unknown';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, formatStr);
  } catch (e) {
    return dateStr;
  }
};

const normalizeEmailRecord = (record: any): EmailSummary => {
  const source = record?.saved_record || record || {};
  const messageId = source.message_id || record?.message_id || source.id || Math.random().toString();
  const sender = source.from_name || source.from_email || record?.sender || record?.from || 'Unknown';

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
    draft_reply: source.reply || source.draft_reply || record?.reply || record?.draft_reply || '',
  };
};

const mergeEmail = (current: EmailSummary[], next: EmailSummary) => {
  const existingIndex = current.findIndex(email => email.id === next.id || email.message_id === next.message_id);
  if (existingIndex === -1) {
    return [next, ...current];
  }

  const updated = [...current];
  updated[existingIndex] = { ...updated[existingIndex], ...next };
  return updated;
};

export function EmailSummaries() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailSummary | null>(null);
  const [fetching, setFetching] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const [timeRemaining, setTimeRemaining] = useState(900); // 15 minutes
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleFetchNew();
          return 900;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };


  useEffect(() => {
    fetchSummaries();
    
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'fetch') {
      handleFetchNew();
    }
  }, [location.search]);

  const fetchSummaries = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/emails/summaries');
      if (res.ok) {
        const data = await res.json();
        
        if (data.success && Array.isArray(data.data)) {
          const normalizedEmails = data.data.map(normalizeEmailRecord);
          setEmails(normalizedEmails);
        } else if (Array.isArray(data)) {
          setEmails(data.map(normalizeEmailRecord));
        }
  
      }
    } catch (error) {
      console.error('Failed to fetch summaries', error);
    } finally {
      setLoading(false);
    }
  };

  
  const handleSendReply = async () => {
    if (!selectedEmail || !selectedEmail.draft_reply) return;
    try {
      setLoading(true);
      const res = await fetch('/api/emails/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: selectedEmail.id, // message_id is mapped to id in normalizedEmails
          to_email: selectedEmail.to_email || selectedEmail.sender,
          subject: 'Re: ' + selectedEmail.subject,
          body: selectedEmail.draft_reply
        })
      });
      if (res.ok) {
        alert('Reply sent successfully!');
      } else {
        alert('Failed to send reply');
      }
    } catch (e) {
      alert('Error sending reply');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchNew = async () => {
    try {
      setFetching(true);
      const res = await fetch('/api/emails/fetch');
      if (!res.ok) {
        throw new Error(`Fetch failed with status ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const dataLine = event
              .split('\n')
              .find(line => line.startsWith('data: '));
            if (!dataLine) continue;

            const payload = JSON.parse(dataLine.slice(6));
            if (payload.type === 'email_summary' && payload.data) {
              const email = normalizeEmailRecord(payload.data);
              setEmails(current => mergeEmail(current, email));
              setSelectedEmail(current => current || email);
            }
          }
        }
      }
      await fetchSummaries();
    } catch (error) {
      console.error('Failed to fetch new emails', error);
    } finally {
      setFetching(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority?.toLowerCase()) {
      case 'high': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-green-500 bg-green-500/10 border-green-500/20';
    }
  };

  return (
    <div className="flex h-full bg-background relative">
      <div className={`flex flex-col border-r border-border transition-all duration-300 ${selectedEmail ? 'w-1/3' : 'w-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/')}
              className="p-2 hover:bg-muted rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="font-semibold text-lg flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Inbox
            </h1>
          </div>
          <button 
            onClick={handleFetchNew}
            disabled={fetching}
            className="p-2 hover:bg-muted rounded-md transition-colors text-muted-foreground disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching...' : `Sync (${formatTimer(timeRemaining)})`}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mb-4 opacity-50" />
              <p>Inbox zero! You're all caught up.</p>
            </div>
          ) : (
            emails.map((email) => (
              <motion.div
                layoutId={`email-${email.id}`}
                key={email.id}
                onClick={() => setSelectedEmail(email)}
                className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                  selectedEmail?.id === email.id 
                    ? 'bg-primary/5 border-primary/20 shadow-sm' 
                    : 'bg-card border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex justify-between items-start mb-2 gap-4">
                  <h3 className="font-semibold truncate flex-1" title={email.subject}>{email.subject}</h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {email.date ? safeFormatDate(email.date, 'MMM d, h:mm a') : 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm text-muted-foreground truncate max-w-[150px]">{email.sender}</span>
                  <div className="flex gap-2">
                    {email.is_actionable && (
                      <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border border-blue-500/20 text-blue-500 bg-blue-500/10">
                        Action Needed
                      </span>
                    )}
                    <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${getPriorityColor(email.priority)}`}>
                      {email.priority || 'Normal'}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedEmail && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-2/3 h-full flex flex-col bg-muted/10 relative overflow-hidden"
          >
            <div className="p-6 border-b border-border bg-background">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold">{selectedEmail.subject}</h2>
                <button 
                  onClick={() => setSelectedEmail(null)}
                  className="p-2 hover:bg-muted rounded-md transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {selectedEmail.sender.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-foreground">{selectedEmail.sender}</div>
                  <div>{selectedEmail.date ? safeFormatDate(selectedEmail.date, 'PPP p') : 'Unknown date'}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-background rounded-xl p-6 border border-border shadow-sm">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">AI Summary</h3>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{selectedEmail.summary}</ReactMarkdown>
                </div>
              </div>

              {selectedEmail.draft_reply && (
                <div className="bg-primary/5 rounded-xl p-6 border border-primary/20">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Draft Reply</h3>
                    <button onClick={handleSendReply} className="flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors">
                      <Send className="w-3 h-3" />
                      Send Reply
                    </button>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none bg-background p-4 rounded-lg border border-border/50">
                    <ReactMarkdown>{selectedEmail.draft_reply}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
