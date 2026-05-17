import { motion } from 'framer-motion';
import { ArrowRight, Inbox, Mail, Sparkles, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="relative h-full overflow-hidden bg-[var(--surface)] text-[var(--ink)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-16 h-96 w-96 rounded-full bg-[var(--brand)]/12 blur-3xl" />
        <div className="absolute right-[-7rem] top-28 h-96 w-96 rounded-full bg-[var(--accent)]/10 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[var(--brand-soft)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(30,43,53,.08)_1px,transparent_1px),linear-gradient(0deg,rgba(30,43,53,.05)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <main className="relative flex h-full items-center px-8 py-8 max-[780px]:px-5">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[1.05fr_.95fr] items-center gap-10 max-[900px]:grid-cols-1">
          <section>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className="mb-8 inline-flex items-center gap-3 rounded-full border border-[var(--line)] bg-white/64 px-4 py-2 shadow-[0_18px_60px_rgba(28,38,44,.08)] backdrop-blur-xl"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
                <Mail className="h-4 w-4" />
              </span>
              <span className="text-sm font-black">Mailme</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.05, ease: 'easeOut' }}
              className="max-w-3xl text-balance text-7xl font-black leading-[0.86] max-[1050px]:text-6xl max-[640px]:text-5xl"
            >
              Your inbox, arranged like a command desk.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16, ease: 'easeOut' }}
              className="mt-7 max-w-xl text-lg font-semibold leading-8 text-[var(--soft-ink)]"
            >
              Summaries, sender context, and replies stay in separate lanes so triage feels fast instead of cramped.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.26, ease: 'easeOut' }}
              className="mt-9 flex flex-wrap gap-3"
            >
              <button
                onClick={() => navigate('/emails')}
                className="group flex items-center gap-3 rounded-2xl bg-[var(--ink)] px-6 py-4 text-sm font-black text-[var(--paper)] shadow-[0_22px_70px_rgba(30,43,53,.26)] transition hover:-translate-y-0.5"
              >
                Open inbox
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
              <button
                onClick={() => navigate(`/emails?action=fetch&ts=${Date.now()}`)}
                className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/64 px-6 py-4 text-sm font-black text-[var(--ink)] shadow-[0_18px_60px_rgba(28,38,44,.08)] backdrop-blur-xl transition hover:bg-white"
              >
                <Zap className="h-4 w-4 text-[var(--brand)]" />
                Sync mail
              </button>
            </motion.div>
          </section>

          <motion.section
            initial={{ opacity: 0, x: 28, rotate: 1.5 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: 'easeOut' }}
            className="relative min-h-[560px] max-[900px]:hidden"
          >
            <div className="absolute left-4 top-4 h-[470px] w-[76%] rotate-[-5deg] rounded-[2.5rem] border border-[var(--line)] bg-[var(--paper)]/64 shadow-[0_40px_120px_rgba(28,38,44,.16)] backdrop-blur-xl" />
            <div className="absolute right-3 top-20 h-[430px] w-[76%] rotate-[4deg] rounded-[2.5rem] border border-[var(--line)] bg-[var(--reply)]/86 shadow-[0_40px_120px_rgba(28,38,44,.18)] backdrop-blur-xl" />
            <div className="absolute inset-x-10 top-0 rounded-[2.5rem] border border-[var(--line)] bg-[var(--panel)]/92 p-5 shadow-[0_40px_120px_rgba(28,38,44,.18)] backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Inbox className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-lg font-black">Priority queue</div>
                    <div className="text-xs font-bold text-[var(--muted-ink)]">3 lanes active</div>
                  </div>
                </div>
                <Sparkles className="h-5 w-5 text-[var(--brand)]" />
              </div>

              <div className="space-y-3">
                {[
                  ['Partnership follow-up', 'Ready to send', 'bg-[var(--brand-soft)]'],
                  ['Invoice question', 'Needs review', 'bg-[var(--accent-soft)]'],
                  ['Calendar conflict', 'Draft prepared', 'bg-[var(--brand)] text-white'],
                ].map(([title, state, color]) => (
                  <div key={title} className="rounded-3xl border border-[var(--line)] bg-white/62 p-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-2xl ${color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black">{title}</div>
                        <div className="text-xs font-bold text-[var(--muted-ink)]">{state}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
