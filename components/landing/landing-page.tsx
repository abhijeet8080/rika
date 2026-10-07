import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Headphones,
  Link2,
  MessageSquareText,
  Quote,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { LandingNav } from "./nav";
import { Hero } from "./hero";
import { LandingMotion } from "./landing-motion";
import styles from "./landing.module.css";

const faq = [
  {
    question: "How does Rika join my meeting?",
    answer:
      "Paste a Zoom, Google Meet, or Microsoft Teams meeting link in your workspace. Rika joins as a guest to record and transcribe the conversation. You can also connect Google Calendar and enable automatic recording for synced meetings.",
  },
  {
    question: "Can I ask questions across multiple meetings?",
    answer:
      "Yes. Group related meetings into a category, such as a client or recurring team sync, then ask Rika questions across that category. You can also ask about a single meeting from its workspace. Answers link back to supporting transcript excerpts.",
  },
  {
    question: "What do I get after a meeting?",
    answer:
      "A speaker-attributed transcript, a summary, action items, and highlights. When a recording is available, you can play it alongside the transcript and click a transcript line to jump to that moment.",
  },
  {
    question: "Can I export my transcripts?",
    answer:
      "Yes. You can download a meeting transcript as a TXT, SRT, or PDF file from the meeting workspace.",
  },
  {
    question: "Who can access my meetings?",
    answer:
      "Your meetings are associated with your signed-in account. Other Rika users cannot access your meeting library through their accounts.",
  },
];

export function LandingPage() {
  return (
    <LandingMotion>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <LandingNav />
      <main id="main-content">
        <Hero />
        <section
          className={styles.integrations}
          aria-label="Supported meeting platforms"
        >
          <p>Fits right into the way you meet.</p>
          <div>
            <span className={styles.zoomLogo}>
              <Video size={23} fill="currentColor" /> zoom
            </span>
            <span>
              <Video size={24} className={styles.meetIcon} /> Google Meet
            </span>
            <span>
              <span className={styles.teamsIcon}>T</span> Microsoft Teams
            </span>
          </div>
        </section>

        <section id="features" className={styles.section}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>
              <span /> MORE PRESENCE. LESS BUSYWORK.
            </span>
            <h2>
              Good conversations deserve
              <br />a better memory.
            </h2>
            <p>
              Stay in the moment. Come back to the details.
              <br />
              Let Rika take care of everything in between.
            </p>
          </div>
          <div className={styles.featureGrid}>
            <article className={`${styles.featureCard} ${styles.notesFeature}`}>
              <div className={styles.cardIcon}>
                <FileText size={20} />
              </div>
              <h3>From conversation to clarity.</h3>
              <p>
                Summaries, decisions, and action items.
                <br />
                The important bits, already pulled together.
              </p>
              <div className={styles.notesIllustration}>
                <div className={styles.miniDocHeader}>
                  <span>
                    <Sparkles size={14} /> Meeting notes
                  </span>
                  <small>Ready for you</small>
                </div>
                <span className={styles.miniDocLabel}>THE TAKEAWAY</span>
                <p>A simpler launch plan. Clear next steps.</p>
                <div>
                  <Check size={13} /> Three pricing tiers agreed
                </div>
                <div>
                  <Check size={13} /> Enterprise decision by Friday
                </div>
                <div className={styles.miniAction}>
                  <span className={styles.miniCheckbox} /> Update the pricing
                  page <span>Sam</span>
                </div>
              </div>
            </article>
            <article
              className={`${styles.featureCard} ${styles.answersFeature}`}
            >
              <div className={styles.cardIcon}>
                <MessageSquareText size={20} />
              </div>
              <h3>Ask it. Find it. Remember it.</h3>
              <p>
                Get answers from a meeting or a category of related calls.
                <br />
                Every answer comes with a way back to the source.
              </p>
              <div className={styles.answerIllustration}>
                <div>What did we decide on pricing?</div>
                <p>
                  <Sparkles size={16} /> Three tiers. Enterprise pricing will be
                  finalized before Friday.
                </p>
                <span>
                  <Clock3 size={11} /> Product planning · 04:47{" "}
                  <ArrowUpRight size={11} />
                </span>
              </div>
            </article>
            <article className={styles.smallFeature}>
              <span className={styles.cardIcon}>
                <CalendarDays size={19} />
              </span>
              <h3>One less thing to schedule.</h3>
              <p>
                Connect Google Calendar and enable auto-recording. Rika joins
                your synced meetings on time.
              </p>
              <div className={styles.connectionPill}>
                <span /> Calendar connected <Check size={12} />
              </div>
            </article>
            <article className={styles.smallFeature}>
              <span className={styles.cardIcon}>
                <Headphones size={19} />
              </span>
              <h3>Back to the exact moment.</h3>
              <p>
                Speaker names, timestamps, and recording playback. Get the
                context behind every decision.
              </p>
              <div className={styles.miniWaveform} aria-hidden="true">
                <AudioLines size={18} />
                {[
                  10, 19, 12, 26, 16, 32, 23, 13, 28, 18, 32, 12, 24, 16, 10,
                ].map((height, i) => (
                  <span key={i} style={{ height }} />
                ))}
                <small>04:47</small>
              </div>
            </article>
            <article className={styles.smallFeature}>
              <span className={styles.cardIcon}>
                <ShieldCheck size={19} />
              </span>
              <h3>Your meetings. Your space.</h3>
              <p>
                A personal library tied to your account, with transcript exports
                whenever you need them.
              </p>
              <div className={styles.exportPills}>
                <span>TXT</span>
                <span>SRT</span>
                <span>
                  PDF <ArrowUpRight size={11} />
                </span>
              </div>
            </article>
          </div>
        </section>

        <section id="how-it-works" className={styles.workflowSection}>
          <div className={styles.section}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>
                <span /> SIMPLE FROM THE FIRST CALL
              </span>
              <h2>
                A little help.
                <br />
                Before, during, and after.
              </h2>
            </div>
            <div className={styles.steps}>
              {[
                {
                  icon: Link2,
                  title: "Invite Rika in.",
                  body: "Paste your meeting link or connect your calendar. Your new notetaker is ready to join.",
                  detail: "Before the meeting",
                },
                {
                  icon: AudioLines,
                  title: "Be part of the conversation.",
                  body: "Rika records and captures who said what. You can focus on the people in front of you.",
                  detail: "While you meet",
                },
                {
                  icon: Sparkles,
                  title: "Take the clarity with you.",
                  body: "Review your notes, find the next steps, or ask a question. The conversation stays useful.",
                  detail: "Whenever you need it",
                },
              ].map(({ icon: Icon, title, body, detail }, i) => (
                <article className={styles.step} key={title}>
                  <div className={styles.stepTop}>
                    <span>0{i + 1}</span>
                    <Icon size={23} strokeWidth={1.5} />
                  </div>
                  <small>{detail}</small>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="ask" className={`${styles.section} ${styles.askSection}`}>
          <div className={styles.askCopy}>
            <span className={styles.eyebrow}>
              <span /> THE ANSWER IS IN THE CONVERSATION
            </span>
            <h2>
              Less searching.
              <br />
              More knowing.
            </h2>
            <p>
              “What did we agree on?” shouldn&apos;t mean replaying an entire
              call. Ask Rika and get an answer with the moment behind it.
            </p>
            <ul>
              <li>
                <Check size={15} /> Ask about one meeting or a related category
              </li>
              <li>
                <Check size={15} /> Follow citations into the transcript
              </li>
              <li>
                <Check size={15} /> Ask during the call with @Rika in meeting
                chat
              </li>
            </ul>
            <Link href="/sign-up" className={styles.textLink}>
              Find your next answer <ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.largeChat}>
            <div className={styles.largeChatHeader}>
              <span className={styles.brandIcon}>
                <AudioLines size={18} />
              </span>
              <div>
                Ask Rika<small>Product team · Related meetings</small>
              </div>
              <span className={styles.onlineDot} />
            </div>
            <div className={styles.largeChatBody}>
              <div className={styles.largeQuestion}>
                Where did we land on the launch pricing?
              </div>
              <div className={styles.largeAnswer}>
                <span className={styles.answerIdentity}>
                  <Sparkles size={14} /> Rika
                </span>
                <p>
                  The team agreed on{" "}
                  <strong>three tiers: Starter, Growth, and Enterprise.</strong>{" "}
                  Priya asked to lock Enterprise pricing before Friday, and Sam
                  will update the pricing page by Thursday.
                </p>
                <div className={styles.sourceExcerpt}>
                  <Quote size={14} />
                  <p>
                    “Let&apos;s lock the Enterprise tier before Friday.”
                    <small>Priya · Q3 Product Planning · 04:47</small>
                  </p>
                </div>
              </div>
              <span className={styles.chatSampleLabel}>
                Example answer from a sample meeting
              </span>
            </div>
            <div className={styles.largeChatFooter}>
              <Sparkles size={14} /> A clearer answer starts with a better
              memory.
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.faqSection}`}>
          <div>
            <span className={styles.eyebrow}>
              <span /> A FEW THINGS TO KNOW
            </span>
            <h2>Glad you asked.</h2>
            <p>A little context before your first call.</p>
          </div>
          <div className={styles.faqList}>
            {faq.map(({ question, answer }) => (
              <details className={styles.faq} key={question}>
                <summary>
                  {question}
                  <ChevronDown size={17} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={styles.ctaSection}>
          <div className={styles.ctaInner}>
            <span className={styles.eyebrow}>
              <span /> MAKE ROOM FOR THE MOMENT
            </span>
            <h2>
              Your next meeting.
              <br />A little more present.
            </h2>
            <p>Bring Rika along. Leave the note-taking to her.</p>
            <Link href="/sign-up" className={styles.primaryButton}>
              Get started free <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandIcon}>
              <AudioLines size={20} />
            </span>
            rika<span className={styles.brandDot}>.</span>
          </Link>
          <p>For the moments worth remembering.</p>
          <a href="#main-content">Back to top ↑</a>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} Rika</span>
          <nav aria-label="Footer navigation">
            <Link href="/sign-in">Sign in</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
          <span>Made for a little more presence.</span>
        </div>
      </footer>
    </LandingMotion>
  );
}
