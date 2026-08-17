import React, { useState, useEffect, useCallback, useRef } from "react";
import { storage } from "./storage.js";

const LEVELS = [
  "Nursery 1", "Nursery 2",
  "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
  "JSS 1", "JSS 2", "JSS 3",
  "SS 1", "SS 2", "SS 3",
];

const SUBJECTS = [
  "Mathematics", "English Studies", "Basic Science", "Basic Technology",
  "Social Studies", "Civic Education", "Agricultural Science", "Physics",
  "Chemistry", "Biology", "Economics", "Geography", "Government",
  "Christian Religious Studies", "Islamic Religious Studies", "Yoruba",
  "Igbo", "Hausa", "Computer Studies", "Business Studies", "Home Economics",
];

const TERMS = [
  { key: "firstTerm", label: "First Term" },
  { key: "secondTerm", label: "Second Term" },
  { key: "thirdTerm", label: "Third Term" },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function callClaude(systemPrompt, userPrompt) {
  // Calls our own backend function (functions/api/generate.js), which holds
  // the real Anthropic API key server-side. The browser never sees the key.
  fetch("/.netlify/functions/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("The server sent back something that wasn't valid JSON.");
  }
  if (data.error) throw new Error(data.error.message || "The AI service returned an error.");
  if (!response.ok) throw new Error(`Request failed (status ${response.status}).`);

  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    if (data.stop_reason === "max_tokens") {
      throw new Error("The response was cut off before it finished. Try again.");
    }
    throw new Error("The AI's response wasn't in the expected format. Try again.");
  }
}

const SCHEME_SYSTEM_PROMPT = `You are a NERDC (Nigerian Educational Research and Development Council) curriculum specialist. Given a subject and class, produce a realistic scheme of work (syllabus breakdown by week) for that subject and class, covering First Term, Second Term and Third Term of the Nigerian academic year.

Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "firstTerm": [{"week": 1, "topic": "short topic name, max 5 words"}, ...],
  "secondTerm": [{"week": 1, "topic": "..."}, ...],
  "thirdTerm": [{"week": 1, "topic": "..."}, ...]
}
Each term should have exactly 9 weeks. Topics should build progressively and match what is actually taught for that subject at that class level in Nigerian schools. Keep topic names to 5 words or fewer. Respond with nothing but the complete, valid JSON object — it must not be cut off.`;

const LESSON_PLAN_SYSTEM_PROMPT = `You are an experienced Nigerian classroom teacher and curriculum specialist who writes lesson plans strictly in the NERDC (Nigerian Educational Research and Development Council) format used in Nigerian primary and secondary schools.

Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "objectives": ["string", "..."],
  "instructionalMaterials": ["string", "..."],
  "previousKnowledge": "string",
  "referenceMaterials": "string",
  "presentation": [{"step": "string label e.g. Step 1: Introduction", "content": "string"}],
  "evaluation": ["string question", "..."],
  "assignment": "string",
  "summary": "string"
}
Keep every field SHORT — this must fit in a brief reply, so do not pad or over-explain. Objectives: exactly 3 short behavioural items (start "By the end of the lesson, pupils/students should be able to..."). instructionalMaterials: exactly 3 items, a few words each. previousKnowledge and referenceMaterials: one short sentence each. presentation: exactly 3 steps, each "content" no more than 2 short sentences. evaluation: exactly 4 short questions. assignment: one short sentence. summary: one short sentence. Respond with nothing but the JSON object — it must be complete and valid, not cut off.`;

const LESSON_NOTE_SYSTEM_PROMPT = `You are a warm, experienced Nigerian classroom teacher actually TEACHING a lesson to your pupils/students — not writing an abstract plan. Write it the way you would really explain it out loud in class, in simple language matched to the class level, with full worked examples so every pupil can follow along.

Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "introduction": "string - how you'd open the lesson and hook pupils' interest, 2-3 sentences, in a teacher's spoken voice",
  "explanation": [{"concept": "short sub-topic label", "teacherExplanation": "string - explain this concept in simple spoken classroom language a pupil would understand, 2-4 sentences", "example": "string - one full worked example or real-life illustration pupils can follow step by step"}],
  "classActivity": "string - a short activity or question to give pupils to try in class, 1-2 sentences",
  "conclusion": "string - how you'd wrap up and check understanding, 1-2 sentences"
}
Limit "explanation" to exactly 3 concepts so the whole reply stays complete and is never cut off. Match language and example complexity to the class level (simple, concrete examples for Nursery/Primary; more advanced for JSS/SS). Respond with nothing but the complete, valid JSON object.`;

const WORKSHEET_SYSTEM_PROMPT = `You are an experienced Nigerian classroom teacher preparing a practice worksheet for pupils/students that matches a given lesson.

Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "instructions": "string, one line telling pupils what to do",
  "questions": ["string", "..."],
  "answerKey": ["string", "..."]
}
Produce 6-10 questions appropriate to the class level, mixing recall and application. answerKey items correspond in order to questions. Respond with nothing but the complete, valid JSON object.`;

function StampBadge({ label }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 96, height: 96, borderRadius: "50%",
      border: "3px dashed #A32D22", color: "#A32D22",
      fontFamily: "'Courier New', Courier, monospace", fontWeight: 700,
      fontSize: 10, textAlign: "center", letterSpacing: 0.5,
      transform: "rotate(-9deg)", mixBlendMode: "multiply", opacity: 0.85,
      lineHeight: 1.3, padding: 6, flexShrink: 0,
    }}>
      {label}
    </div>
  );
}

function LedgerField({ label, children }) {
  return (
    <div style={styles.ledgerRow}>
      <div style={styles.ledgerLabel}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function LessonNoteRegister() {
  const [tab, setTab] = useState("new");
  const [lessons, setLessons] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);

  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  const [teacherName, setTeacherName] = useState("");
  const [pickLevel, setPickLevel] = useState("");

  // schemes[level] = { [subject]: { firstTerm, secondTerm, thirdTerm } }
  const [schemes, setSchemes] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: "" });
  const [schemeError, setSchemeError] = useState("");

  const [activeSubject, setActiveSubject] = useState("");
  const [activeTermKey, setActiveTermKey] = useState("firstTerm");

  const [form, setForm] = useState({
    subject: "", level: "", term: "First Term", week: "",
    duration: "40 minutes", topic: "", date: todayISO(),
  });

  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState("");
  const [genError, setGenError] = useState("");
  const [draft, setDraft] = useState(null); // { plan, note }

  const [selectedId, setSelectedId] = useState(null);
  const [worksheetLoadingId, setWorksheetLoadingId] = useState(null);
  const [worksheetError, setWorksheetError] = useState("");

  const draftRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("lessons");
        setLessons(res ? JSON.parse(res.value) : []);
      } catch (e) { setLessons([]); }
      try {
        const res2 = await storage.get("schemes-v2");
        setSchemes(res2 ? JSON.parse(res2.value) : {});
      } catch (e) { setSchemes({}); }
      try {
        const res3 = await storage.get("teacher-profile");
        if (res3) setTeacherName(JSON.parse(res3.value).name || "");
      } catch (e) { /* no profile yet */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    // Android / Windows (Chrome, Edge): browser fires this when the app is installable.
    function handleBeforeInstall(e) {
      e.preventDefault();
      setInstallPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Detect if already running as an installed app.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);

    // iOS Safari never fires beforeinstallprompt — detect it so we can show manual steps instead.
    const ua = window.navigator.userAgent || "";
    const iOSDevice = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    setIsIOS(iOSDevice);

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  async function handleInstallClick() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const persistLessons = useCallback(async (next) => {
    setLessons(next);
    try {
      const res = await storage.set("lessons", JSON.stringify(next));
      if (!res) setStorageOk(false);
    } catch (e) { setStorageOk(false); }
  }, []);

  const persistSchemes = useCallback(async (next) => {
    setSchemes(next);
    try { await storage.set("schemes-v2", JSON.stringify(next)); }
    catch (e) { setStorageOk(false); }
  }, []);

  async function saveTeacherName(name) {
    setTeacherName(name);
    try { await storage.set("teacher-profile", JSON.stringify({ name })); }
    catch (e) { /* non-critical */ }
  }

  function updateForm(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const levelSchemes = schemes[pickLevel] || {};
  const loadedSubjects = Object.keys(levelSchemes);

  async function handleBulkLoadSchemes() {
    if (!pickLevel) return;
    setSchemeError("");
    setBulkLoading(true);
    const remaining = SUBJECTS.filter((s) => !levelSchemes[s]);
    setBulkProgress({ done: 0, total: remaining.length, current: "" });
    let working = { ...schemes, [pickLevel]: { ...(schemes[pickLevel] || {}) } };
    for (let i = 0; i < remaining.length; i++) {
      const subject = remaining[i];
      setBulkProgress({ done: i, total: remaining.length, current: subject });
      try {
        const result = await callClaude(SCHEME_SYSTEM_PROMPT, `Subject: ${subject}\nClass: ${pickLevel}`);
        working = { ...working, [pickLevel]: { ...working[pickLevel], [subject]: result } };
        await persistSchemes(working);
        if (!activeSubject) setActiveSubject(subject);
      } catch (e) {
        setSchemeError(`Stopped after an error on "${subject}": ${e.message} You can tap the button again to continue with the remaining subjects.`);
        setBulkLoading(false);
        return;
      }
    }
    setBulkProgress({ done: remaining.length, total: remaining.length, current: "" });
    setBulkLoading(false);
  }

  async function generateBoth(nextForm) {
    setDraft(null);
    setGenError("");
    setGenerating(true);
    try {
      setGenStage("Drafting the lesson plan…");
      const planPrompt = `Subject: ${nextForm.subject}\nClass: ${nextForm.level}\nTerm: ${nextForm.term}\nWeek: ${nextForm.week || "not specified"}\nDuration: ${nextForm.duration}\nTopic: ${nextForm.topic}`;
      const plan = await callClaude(LESSON_PLAN_SYSTEM_PROMPT, planPrompt);

      setGenStage("Writing the classroom explanation & examples…");
      const notePrompt = `Subject: ${nextForm.subject}\nClass: ${nextForm.level}\nTopic: ${nextForm.topic}\nLesson objectives: ${plan.objectives.join("; ")}`;
      const note = await callClaude(LESSON_NOTE_SYSTEM_PROMPT, notePrompt);

      setDraft({ plan, note });
      return true;
    } catch (e) {
      setGenError(e.message || "Could not generate this lesson. Please try again.");
      return false;
    } finally {
      setGenerating(false);
      setGenStage("");
    }
  }

  async function handleTopicTap(termLabel, termItem) {
    const nextForm = {
      subject: activeSubject, level: pickLevel, term: termLabel,
      week: `Week ${termItem.week}`, duration: "40 minutes",
      topic: termItem.topic, date: todayISO(),
    };
    setForm(nextForm);
    const ok = await generateBoth(nextForm);
    if (ok) setTimeout(() => draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  const canGenerate = form.subject.trim() && form.level && form.topic.trim();

  async function handleGenerate() {
    if (!canGenerate) return;
    await generateBoth(form);
  }

  async function handleSaveDraft() {
    if (!draft) return;
    const lesson = {
      id: uid(), createdAt: new Date().toISOString(), teacherName,
      ...form, plan: draft.plan, note: draft.note, worksheet: null,
    };
    const next = [lesson, ...lessons];
    await persistLessons(next);
    setDraft(null);
    setForm({ subject: "", level: "", term: "First Term", week: "", duration: "40 minutes", topic: "", date: todayISO() });
    setSelectedId(lesson.id);
    setTab("register");
  }

  async function handleDelete(id) {
    const next = lessons.filter((l) => l.id !== id);
    await persistLessons(next);
    if (selectedId === id) setSelectedId(null);
  }

  async function handleGenerateWorksheet(lesson) {
    setWorksheetLoadingId(lesson.id);
    setWorksheetError("");
    try {
      const userPrompt = `Subject: ${lesson.subject}\nClass: ${lesson.level}\nTopic: ${lesson.topic}\nObjectives: ${lesson.plan.objectives.join("; ")}\nSummary: ${lesson.plan.summary}`;
      const result = await callClaude(WORKSHEET_SYSTEM_PROMPT, userPrompt);
      const next = lessons.map((l) => (l.id === lesson.id ? { ...l, worksheet: result } : l));
      await persistLessons(next);
    } catch (e) {
      setWorksheetError(e.message || "Could not generate a worksheet for this lesson. Please try again.");
    } finally {
      setWorksheetLoadingId(null);
    }
  }

  const selected = lessons.find((l) => l.id === selectedId) || null;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes stampIn {
          0% { transform: scale(0.4) rotate(-30deg); opacity: 0; }
          70% { transform: scale(1.08) rotate(-9deg); opacity: 1; }
          100% { transform: scale(1) rotate(-9deg); opacity: 0.85; }
        }
        .stamp-anim { animation: stampIn 0.5s ease-out; }
        .lnr-btn { cursor: pointer; border: none; font-family: 'Courier New', Courier, monospace; }
        .lnr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .lnr-input, .lnr-select {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 15px; background: transparent; border: none;
          border-bottom: 1px solid #C9C2A6; padding: 4px 2px; width: 100%;
          color: #1B2A22; outline: none;
        }
        .lnr-input:focus, .lnr-select:focus { border-bottom: 1px solid #A32D22; }
        .lnr-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .lnr-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(27,42,34,0.18); }
        .topic-chip { transition: background 0.15s ease, color 0.15s ease; }
        .topic-chip:hover { background: #1F3D2E !important; color: #F4F1E6 !important; }
        .term-tab, .subject-chip { transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease; }
        @media (prefers-reduced-motion: reduce) {
          .stamp-anim { animation: none; }
          .lnr-card:hover { transform: none; }
        }
        @media print { .no-print { display: none !important; } }
      `}</style>

      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <div style={styles.eyebrow}>NERDC · Nigerian Curriculum</div>
            <h1 style={styles.title}>EDUNOJECH</h1>
          </div>
          <nav style={styles.tabs}>
            <button className="lnr-btn" onClick={() => setTab("new")}
              style={{ ...styles.tabBtn, ...(tab === "new" ? styles.tabBtnActive : {}) }}>New Entry</button>
            <button className="lnr-btn" onClick={() => { setTab("register"); setSelectedId(null); }}
              style={{ ...styles.tabBtn, ...(tab === "register" ? styles.tabBtnActive : {}) }}>My Register ({lessons.length})</button>
            {!isStandalone && installPrompt && (
              <button className="lnr-btn" onClick={handleInstallClick} style={styles.installBtn}>
                ⬇ Install App
              </button>
            )}
            {!isStandalone && isIOS && (
              <button className="lnr-btn" onClick={() => setShowIOSHelp(true)} style={styles.installBtn}>
                ⬇ Install App
              </button>
            )}
          </nav>
        </div>
      </header>

      {showIOSHelp && (
        <div style={styles.modalOverlay} onClick={() => setShowIOSHelp(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.cardHeading}>Install on iPhone</div>
            <ol style={styles.list}>
              <li style={styles.listItem}>Tap the <strong>Share</strong> icon in Safari (square with an arrow, at the bottom of the screen).</li>
              <li style={styles.listItem}>Scroll down and tap <strong>"Add to Home Screen."</strong></li>
              <li style={styles.listItem}>Tap <strong>Add</strong> — the app icon appears on your home screen, opening full-screen like a real app.</li>
            </ol>
            <button className="lnr-btn" style={styles.primaryBtn} onClick={() => setShowIOSHelp(false)}>Got it</button>
          </div>
        </div>
      )}

      <main style={styles.main}>
        {!storageOk && (
          <div style={styles.warnBanner}>Your entries may not be saving right now. Keep this tab open until saving is confirmed.</div>
        )}

        {tab === "new" && (
          <div>
            <section style={styles.kraftCard}>
              <div style={styles.cardHeading}>Step 1 · Teacher & Class</div>
              <LedgerField label="Teacher's Name">
                <input className="lnr-input" value={teacherName}
                  onChange={(e) => saveTeacherName(e.target.value)} placeholder="e.g. Mrs. Adaeze Okonkwo" />
              </LedgerField>
              <LedgerField label="Class">
                <select className="lnr-select" value={pickLevel}
                  onChange={(e) => { setPickLevel(e.target.value); setActiveSubject(""); }}>
                  <option value="">Select class</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </LedgerField>
              {pickLevel && (
                <>
                  <button className="lnr-btn" style={styles.primaryBtn}
                    disabled={bulkLoading || loadedSubjects.length === SUBJECTS.length}
                    onClick={handleBulkLoadSchemes}>
                    {bulkLoading
                      ? `Loading ${bulkProgress.current}… (${bulkProgress.done}/${bulkProgress.total})`
                      : loadedSubjects.length === SUBJECTS.length
                        ? `All ${SUBJECTS.length} subjects loaded ✓`
                        : loadedSubjects.length > 0
                          ? `Continue loading remaining subjects (${loadedSubjects.length}/${SUBJECTS.length} done)`
                          : `Generate scheme of work for all ${SUBJECTS.length} subjects — ${pickLevel}`}
                  </button>
                  <div style={styles.helperText}>
                    Generates the 3-term scheme for every subject at this class level, one at a time. You can start using topics as each subject finishes loading — no need to wait for all of them.
                  </div>
                  {schemeError && <div style={styles.errorText}>{schemeError}</div>}
                </>
              )}
            </section>

            {pickLevel && loadedSubjects.length > 0 && (
              <section style={{ ...styles.kraftCard, marginTop: 16 }}>
                <div style={styles.cardHeading}>Step 2 · Tap a topic to generate its lesson</div>
                <div style={styles.subjectChips}>
                  {loadedSubjects.map((s) => (
                    <button key={s} className="lnr-btn subject-chip"
                      onClick={() => setActiveSubject(s)}
                      style={{ ...styles.subjectChip, ...(activeSubject === s ? styles.subjectChipActive : {}) }}>
                      {s}
                    </button>
                  ))}
                </div>
                {activeSubject && (
                  <>
                    <div style={styles.termTabs}>
                      {TERMS.map((t) => (
                        <button key={t.key} className="lnr-btn term-tab" onClick={() => setActiveTermKey(t.key)}
                          style={{ ...styles.termTabBtn, ...(activeTermKey === t.key ? styles.termTabBtnActive : {}) }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div style={styles.topicList}>
                      {((levelSchemes[activeSubject] || {})[activeTermKey] || []).map((item) => (
                        <button key={item.week} className="lnr-btn topic-chip"
                          onClick={() => handleTopicTap(TERMS.find((t) => t.key === activeTermKey).label, item)}
                          style={styles.topicChip} disabled={generating}>
                          <span style={styles.topicWeek}>Wk {item.week}</span>
                          <span>{item.topic}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            <section style={{ ...styles.kraftCard, marginTop: 16 }}>
              <div style={styles.cardHeading}>Or enter a topic manually</div>
              <LedgerField label="Subject">
                <input className="lnr-input" list="subject-list" value={form.subject}
                  onChange={(e) => updateForm("subject", e.target.value)} placeholder="e.g. Basic Science" />
                <datalist id="subject-list">{SUBJECTS.map((s) => <option key={s} value={s} />)}</datalist>
              </LedgerField>
              <LedgerField label="Class">
                <select className="lnr-select" value={form.level} onChange={(e) => updateForm("level", e.target.value)}>
                  <option value="">Select class</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </LedgerField>
              <LedgerField label="Term">
                <select className="lnr-select" value={form.term} onChange={(e) => updateForm("term", e.target.value)}>
                  {TERMS.map((t) => <option key={t.key} value={t.label}>{t.label}</option>)}
                </select>
              </LedgerField>
              <LedgerField label="Week"><input className="lnr-input" value={form.week}
                onChange={(e) => updateForm("week", e.target.value)} placeholder="e.g. Week 4" /></LedgerField>
              <LedgerField label="Duration"><input className="lnr-input" value={form.duration}
                onChange={(e) => updateForm("duration", e.target.value)} placeholder="e.g. 40 minutes" /></LedgerField>
              <LedgerField label="Date"><input className="lnr-input" type="date" value={form.date}
                onChange={(e) => updateForm("date", e.target.value)} /></LedgerField>
              <LedgerField label="Topic"><input className="lnr-input" value={form.topic}
                onChange={(e) => updateForm("topic", e.target.value)} placeholder="e.g. States of Matter" /></LedgerField>
              <button className="lnr-btn" disabled={!canGenerate || generating} onClick={handleGenerate} style={styles.primaryBtn}>
                {generating ? genStage || "Working…" : "Generate Lesson Plan & Note"}
              </button>
              {genError && <div style={styles.errorText}>{genError}</div>}
            </section>

            <div ref={draftRef} />
            {(generating || draft) && (
              <section style={{ ...styles.paperCard, marginTop: 16 }}>
                {generating && !draft && <div style={styles.emptyState}>{genStage || "Working…"}</div>}
                {draft && (
                  <div>
                    <div style={styles.paperHeadRow}>
                      <div>
                        <div style={styles.paperTopic}>{form.topic}</div>
                        <div style={styles.paperMeta}>{form.subject} · {form.level} · {form.term}{form.week ? ` · ${form.week}` : ""} · {form.duration}</div>
                        <div style={styles.paperMeta}>Teacher: {teacherName || "—"} · Date: {form.date}</div>
                      </div>
                    </div>
                    <DocLabel text="Lesson Plan" />
                    <LessonPlanBody plan={draft.plan} />
                    <DocLabel text="Lesson Note — Classroom Explanation & Examples" />
                    <LessonNoteBody note={draft.note} />
                    <SignatureBlock />
                    <div style={styles.draftActions}>
                      <button className="lnr-btn" style={styles.primaryBtn} onClick={handleSaveDraft}>Save to Register</button>
                      <button className="lnr-btn" style={styles.ghostBtn} onClick={() => setDraft(null)}>Discard</button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {tab === "register" && !selected && (
          <div>
            {loaded && lessons.length === 0 && (
              <div style={styles.emptyState}>No lesson notes recorded yet. Go to "New Entry" to write your first one.</div>
            )}
            <div style={styles.cardsGrid}>
              {lessons.map((l) => (
                <button key={l.id} className="lnr-btn lnr-card" onClick={() => setSelectedId(l.id)} style={styles.listCard}>
                  <div style={styles.listCardEyebrow}>{l.level} · {l.subject}</div>
                  <div style={styles.listCardTopic}>{l.topic}</div>
                  <div style={styles.listCardMeta}>{l.term}{l.week ? ` · ${l.week}` : ""}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "register" && selected && (
          <section style={styles.paperCard}>
            <button className="lnr-btn no-print" style={styles.backBtn} onClick={() => setSelectedId(null)}>← Back to register</button>
            <div style={styles.paperHeadRow}>
              <div>
                <div style={styles.paperTopic}>{selected.topic}</div>
                <div style={styles.paperMeta}>{selected.subject} · {selected.level} · {selected.term}{selected.week ? ` · ${selected.week}` : ""} · {selected.duration}</div>
                <div style={styles.paperMeta}>Teacher: {selected.teacherName || "—"} · Date: {selected.date || "—"}</div>
              </div>
              <div className="stamp-anim"><StampBadge label="RECORDED IN REGISTER" /></div>
            </div>
            <DocLabel text="Lesson Plan" />
            <LessonPlanBody plan={selected.plan} />
            <DocLabel text="Lesson Note — Classroom Explanation & Examples" />
            <LessonNoteBody note={selected.note} />
            <SignatureBlock />

            <div style={styles.worksheetSection}>
              <div style={styles.cardHeading}>Practice Worksheet</div>
              {!selected.worksheet && (
                <button className="lnr-btn" style={styles.primaryBtn} disabled={worksheetLoadingId === selected.id}
                  onClick={() => handleGenerateWorksheet(selected)}>
                  {worksheetLoadingId === selected.id ? "Preparing worksheet…" : "Generate Worksheet"}
                </button>
              )}
              {worksheetError && <div style={styles.errorText}>{worksheetError}</div>}
              {selected.worksheet && (
                <div style={styles.worksheetBox}>
                  <div style={styles.worksheetInstructions}>{selected.worksheet.instructions}</div>
                  <ol style={styles.list}>{selected.worksheet.questions.map((q, i) => <li key={i} style={styles.listItem}>{q}</li>)}</ol>
                  <details style={styles.answerKeyDetails}>
                    <summary style={styles.answerKeySummary}>Answer key</summary>
                    <ol style={styles.list}>{selected.worksheet.answerKey.map((a, i) => <li key={i} style={styles.listItem}>{a}</li>)}</ol>
                  </details>
                </div>
              )}
            </div>

            <div style={styles.draftActions}>
              <button className="lnr-btn no-print" style={styles.dangerBtn} onClick={() => handleDelete(selected.id)}>Delete entry</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function DocLabel({ text }) {
  return <div style={styles.docLabel}>{text}</div>;
}

function SignatureBlock() {
  return (
    <div style={styles.signatureBlock}>
      <div style={styles.signatureRow}>
        <div style={styles.signatureLine}><div style={styles.signatureLabel}>Teacher's Signature</div></div>
        <div style={styles.signatureLine}><div style={styles.signatureLabel}>Date</div></div>
      </div>
      <div style={styles.signatureRow}>
        <div style={styles.signatureLine}><div style={styles.signatureLabel}>Checked by (Head of Dept. / Supervisor)</div></div>
        <div style={styles.signatureLine}><div style={styles.signatureLabel}>Date</div></div>
      </div>
    </div>
  );
}

function LessonPlanBody({ plan }) {
  return (
    <div>
      <Section title="Behavioural Objectives">
        <ul style={styles.list}>{plan.objectives.map((o, i) => <li key={i} style={styles.listItem}>{o}</li>)}</ul>
      </Section>
      <Section title="Instructional Materials">
        <ul style={styles.list}>{plan.instructionalMaterials.map((m, i) => <li key={i} style={styles.listItem}>{m}</li>)}</ul>
      </Section>
      <Section title="Previous Knowledge"><p style={styles.paragraph}>{plan.previousKnowledge}</p></Section>
      <Section title="Reference Materials"><p style={styles.paragraph}>{plan.referenceMaterials}</p></Section>
      <Section title="Presentation">
        {plan.presentation.map((p, i) => (
          <div key={i} style={styles.presentStep}>
            <div style={styles.presentStepLabel}>{p.step}</div>
            <p style={styles.paragraph}>{p.content}</p>
          </div>
        ))}
      </Section>
      <Section title="Evaluation">
        <ol style={styles.list}>{plan.evaluation.map((q, i) => <li key={i} style={styles.listItem}>{q}</li>)}</ol>
      </Section>
      <Section title="Assignment"><p style={styles.paragraph}>{plan.assignment}</p></Section>
      <Section title="Summary"><p style={styles.paragraph}>{plan.summary}</p></Section>
    </div>
  );
}

function LessonNoteBody({ note }) {
  return (
    <div>
      <Section title="How I'll Open the Lesson"><p style={styles.paragraph}>{note.introduction}</p></Section>
      {note.explanation.map((e, i) => (
        <Section key={i} title={e.concept}>
          <p style={styles.paragraph}><em>In my own words to the class:</em> {e.teacherExplanation}</p>
          <div style={styles.exampleBox}>
            <div style={styles.exampleLabel}>Worked Example</div>
            <p style={styles.paragraph}>{e.example}</p>
          </div>
        </Section>
      ))}
      <Section title="Class Activity"><p style={styles.paragraph}>{note.classActivity}</p></Section>
      <Section title="Wrapping Up"><p style={styles.paragraph}>{note.conclusion}</p></Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#EFE9D8", fontFamily: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif", color: "#1B2A22" },
  header: { background: "#1F3D2E", borderBottom: "4px solid #A32D22" },
  headerInner: { maxWidth: 1000, margin: "0 auto", padding: "20px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 },
  eyebrow: { fontFamily: "'Courier New', Courier, monospace", fontSize: 11, letterSpacing: 1.5, color: "#C9A24B", textTransform: "uppercase" },
  title: { fontFamily: "Georgia, 'Times New Roman', serif", color: "#F4F1E6", fontSize: 28, margin: "4px 0 0", fontWeight: 700 },
  tabs: { display: "flex", gap: 4 },
  tabBtn: { background: "transparent", color: "#D8D3BE", padding: "8px 14px", fontSize: 12, letterSpacing: 0.5, borderBottom: "2px solid transparent" },
  tabBtnActive: { color: "#F4F1E6", borderBottom: "2px solid #A32D22" },
  installBtn: { background: "#A32D22", color: "#F4F1E6", padding: "8px 14px", fontSize: 12, letterSpacing: 0.5, borderRadius: 3, marginLeft: 4 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(27,42,34,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 },
  modalBox: { background: "#FBFAF3", borderRadius: 6, padding: 22, maxWidth: 360, width: "100%" },
  main: { maxWidth: 1000, margin: "0 auto", padding: "24px 20px 60px" },
  warnBanner: { background: "#F3E3C9", border: "1px solid #C9A24B", padding: "10px 14px", borderRadius: 4, fontSize: 13, marginBottom: 16 },
  kraftCard: { background: "#E7DFC6", border: "1px solid #C9C2A6", borderLeft: "4px solid #A32D22", borderRadius: 4, padding: 20 },
  paperCard: { background: "#FBFAF3", border: "1px solid #DDD6BE", borderRadius: 4, padding: 24, backgroundImage: "repeating-linear-gradient(#FBFAF3, #FBFAF3 27px, #E8E2CC 28px)", minHeight: 200 },
  cardHeading: { fontFamily: "'Courier New', Courier, monospace", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#1F3D2E", marginBottom: 14, borderBottom: "1px solid #C9C2A6", paddingBottom: 8 },
  ledgerRow: { marginBottom: 12 },
  ledgerLabel: { fontFamily: "'Courier New', Courier, monospace", fontSize: 11, letterSpacing: 0.5, color: "#6B6650", textTransform: "uppercase", marginBottom: 2 },
  primaryBtn: { background: "#1F3D2E", color: "#F4F1E6", padding: "11px 18px", borderRadius: 3, fontSize: 12, letterSpacing: 0.5, marginTop: 8, width: "100%", textTransform: "uppercase" },
  ghostBtn: { background: "transparent", color: "#6B6650", padding: "11px 18px", fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "underline" },
  dangerBtn: { background: "transparent", color: "#A32D22", padding: "10px 0", fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "underline" },
  backBtn: { background: "transparent", color: "#6B6650", fontSize: 12, marginBottom: 12, padding: 0 },
  errorText: { color: "#A32D22", fontSize: 12, marginTop: 8 },
  helperText: { fontSize: 12, color: "#6B6650", marginTop: 8, lineHeight: 1.5 },
  emptyState: { color: "#8A836A", fontSize: 14, fontStyle: "italic", padding: "40px 10px", textAlign: "center" },
  paperHeadRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 },
  paperTopic: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 24, fontWeight: 700, color: "#1F3D2E" },
  paperMeta: { fontFamily: "'Courier New', Courier, monospace", fontSize: 12, color: "#6B6650", marginTop: 4 },
  docLabel: { fontFamily: "'Courier New', Courier, monospace", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#F4F1E6", background: "#1F3D2E", display: "inline-block", padding: "4px 10px", borderRadius: 2, margin: "22px 0 14px" },
  section: { marginBottom: 18 },
  sectionTitle: { fontFamily: "'Courier New', Courier, monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#A32D22", marginBottom: 6 },
  paragraph: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 15, lineHeight: 1.6, margin: 0 },
  exampleBox: { background: "#F3EFDD", borderLeft: "3px solid #C9A24B", padding: "10px 14px", marginTop: 8, borderRadius: 2 },
  exampleLabel: { fontFamily: "'Courier New', Courier, monospace", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "#8A6B1F", marginBottom: 4 },
  list: { margin: 0, paddingLeft: 20 },
  listItem: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 15, lineHeight: 1.6, marginBottom: 4 },
  presentStep: { marginBottom: 10 },
  presentStepLabel: { fontFamily: "'Courier New', Courier, monospace", fontSize: 12, color: "#1F3D2E", fontWeight: 700, marginBottom: 2 },
  draftActions: { display: "flex", gap: 12, marginTop: 20, alignItems: "center" },
  cardsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  listCard: { background: "#FBFAF3", border: "1px solid #DDD6BE", borderLeft: "3px solid #A32D22", borderRadius: 4, padding: 16, textAlign: "left" },
  listCardEyebrow: { fontFamily: "'Courier New', Courier, monospace", fontSize: 10, letterSpacing: 0.5, color: "#6B6650", textTransform: "uppercase", marginBottom: 6 },
  listCardTopic: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 16, fontWeight: 700, color: "#1F3D2E" },
  listCardMeta: { fontSize: 12, color: "#8A836A", marginTop: 6 },
  worksheetSection: { marginTop: 28, borderTop: "1px solid #C9C2A6", paddingTop: 18 },
  worksheetBox: { marginTop: 10 },
  worksheetInstructions: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 14, marginBottom: 10, color: "#6B6650" },
  answerKeyDetails: { marginTop: 14 },
  answerKeySummary: { cursor: "pointer", fontFamily: "'Courier New', Courier, monospace", fontSize: 12, color: "#A32D22", letterSpacing: 0.5, textTransform: "uppercase" },
  subjectChips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  subjectChip: { background: "#FBFAF3", border: "1px solid #DDD6BE", borderRadius: 12, padding: "5px 12px", fontSize: 12, fontFamily: "Georgia, serif", color: "#1B2A22" },
  subjectChipActive: { background: "#1F3D2E", color: "#F4F1E6", borderColor: "#1F3D2E" },
  termTabs: { display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid #C9C2A6" },
  termTabBtn: { background: "transparent", color: "#6B6650", padding: "6px 12px", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "2px solid transparent" },
  termTabBtnActive: { color: "#1F3D2E", borderBottom: "2px solid #A32D22", fontWeight: 700 },
  topicList: { display: "flex", flexDirection: "column", gap: 6 },
  topicChip: { display: "flex", gap: 10, alignItems: "baseline", background: "#FBFAF3", border: "1px solid #DDD6BE", borderRadius: 3, padding: "10px 14px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 14, textAlign: "left", color: "#1B2A22" },
  topicWeek: { fontFamily: "'Courier New', Courier, monospace", fontSize: 11, color: "#A32D22", flexShrink: 0, width: 46 },
  signatureBlock: { marginTop: 26, paddingTop: 16, borderTop: "1px dashed #C9C2A6" },
  signatureRow: { display: "flex", gap: 24, marginBottom: 20 },
  signatureLine: { flex: 1, borderBottom: "1px solid #6B6650", paddingBottom: 4 },
  signatureLabel: { fontFamily: "'Courier New', Courier, monospace", fontSize: 10, letterSpacing: 0.5, color: "#8A836A", textTransform: "uppercase", marginTop: 4 },
};
