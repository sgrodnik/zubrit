import { useState, useCallback, useRef, useEffect, useMemo } from "react";

interface Word {
  id: number;
  russian: string;
  spanish: string;
  complexity: number;
}

const DEFAULT_WORDS_TEXT = [
  "я предлагаю\tpropongo",
  "я предлагаю / я советую\tsugiero",
  "я предполагаю\tsupongo",
  "я предполагаю заранее\tpresupongo",
  "я принимаю как данность / я предполагаю\tasumo",
  "я понимаю / я воспринимаю\tpercibo",
  "я замечаю\tnoto",
  "я наблюдаю\tobservo",
  "я считаю / я полагаю\tconsidero",
  "я признаю\treconozco",
  "я соглашаюсь\tacepto",
  "я отказываюсь\trechazo",
  "я объясняю\texplico",
  "я описываю\tdescribo",
  "я упоминаю\tmenciono",
].join("\n");

const TAPS_KEY = "spanish-vocab-taps-v2";
const SETTINGS_KEY = "spanish-vocab-settings-v2";
const WORDS_KEY = "spanish-vocab-words";
const LESSONS_KEY = "spanish-vocab-lessons-v1";
const ACTIVE_LESSON_KEY = "spanish-vocab-active-lesson-v1";
const BACKUP_FORMAT = "spanish-words-backup";
const BACKUP_VERSION = 1;

type Lesson = { id: string; name: string; wordsText: string; createdAt: number; updatedAt: number };
type LessonState = { lessons: Lesson[]; activeId: string };

function setLineComplexity(text: string, lineId: number, complexity: number): string {
  const lines = text.split("\n");
  const index = lineId - 1;
  if (index < 0 || index >= lines.length) return text;
  const content = lines[index].replace(/\t\d+\s*$/, "");
  lines[index] = complexity > 0 ? `${content}\t${complexity}` : content;
  return lines.join("\n");
}

function isInverted(text: string): boolean {
  return /^\s*#i\s*$/m.test(text);
}

function setInverted(text: string, inverted: boolean): string {
  const lines = text.split(/\r?\n/).filter(line => !/^\s*#i\s*$/.test(line));
  if (inverted) {
    const languageDirective = lines.findIndex(line => /^\s*#lang\b/i.test(line));
    lines.splice(languageDirective >= 0 ? languageDirective + 1 : 0, 0, "#i");
  }
  return lines.join("\n");
}

function withoutLessonFlags(text: string): string {
  return text.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join("\n");
}

function mergeLegacyTaps(text: string, taps: Record<string, number>): string {
  return parseWords(text).reduce((result, word) => {
    const score = taps[word.russian] ?? 0;
    return score > 0 && word.complexity === 0 ? setLineComplexity(result, word.id, score) : result;
  }, text);
}

function suggestedLessonName(previousName: string): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${date} ${previousName}`;
}

function loadLessonState(): LessonState {
  try {
    const saved = JSON.parse(localStorage.getItem(LESSONS_KEY) ?? "null");
    if (saved?.lessons?.length) {
      let legacyInverted = false;
      try { legacyInverted = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").reverseTranslation === true; } catch { /* ignore malformed settings */ }
      const lessons: Lesson[] = saved.lessons.map((lesson: any) => {
        let wordsText = mergeLegacyTaps(lesson.wordsText ?? "", lesson.taps ?? {});
        if (legacyInverted && !isInverted(wordsText)) wordsText = setInverted(wordsText, true);
        return {
          id: lesson.id,
          name: lesson.name,
          wordsText,
          createdAt: lesson.createdAt ?? Date.now(),
          updatedAt: lesson.updatedAt ?? Date.now(),
        };
      });
      const activeId = localStorage.getItem(ACTIVE_LESSON_KEY);
      return { lessons, activeId: lessons.some(lesson => lesson.id === activeId) ? activeId! : lessons[0].id };
    }
  } catch { /* migrate legacy storage below */ }
  const now = Date.now();
  let wordsText = mergeLegacyTaps(localStorage.getItem(WORDS_KEY) ?? DEFAULT_WORDS_TEXT, loadTaps());
  try {
    if (JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").reverseTranslation === true) wordsText = setInverted(wordsText, true);
  } catch { /* ignore malformed settings */ }
  const lesson: Lesson = {
    id: `lesson-${now}`,
    name: "Урок ноль",
    wordsText,
    createdAt: now,
    updatedAt: now,
  };
  return { lessons: [lesson], activeId: lesson.id };
}

const LANGUAGES = {
  ru: {
    settings: "Настройки",
    hideAll: "скрыть все",
    showAll: "показать все",
    wordListHint: "Список слов — пара на строку, разделитель Tab или « — »; сложность третьим полем через Tab. #lang Русский Турецкий задаёт заголовки, #i меняет направление",
    theme: "Тема",
    themeDay: "День",
    themeNight: "Ночь",
    themeAuto: "Авто",
    soft: "мягкая",
    fontSize: "Размер шрифта",
    rowSpacing: "Интервал строк",
    width: "Ширина",
    randomOrder: "Случайный порядок",
    reverseTranslation: "Обратный перевод",
    complexityFilter: "Сложность ≥",
    russian: "Русский",
    complexity: "Сложность",
    spanish: "Испанский",
    resetThis: "Обнулить это",
    sure: "Точно?",
    yes: "да",
    no: "нет",
    resetAll: "Сбросить все",
    exportData: "Экспорт данных",
    importData: "Импорт данных",
  },
  en: {
    settings: "Settings",
    hideAll: "hide all",
    showAll: "show all",
    wordListHint: "Word list — one pair per line; complexity is an optional third Tab-separated field. #lang Russian Turkish sets headers, #i reverses direction",
    theme: "Theme",
    themeDay: "Day",
    themeNight: "Night",
    themeAuto: "Auto",
    soft: "soft",
    fontSize: "Font size",
    rowSpacing: "Row spacing",
    width: "Width",
    randomOrder: "Random order",
    reverseTranslation: "Reverse translation",
    complexityFilter: "Complexity ≥",
    russian: "Russian",
    complexity: "Complexity",
    spanish: "Spanish",
    resetThis: "Reset this",
    sure: "Are you sure?",
    yes: "yes",
    no: "no",
    resetAll: "Reset all",
    exportData: "Export data",
    importData: "Import data",
  }
};

const getLang = () => (typeof navigator !== "undefined" && navigator.language.startsWith("ru")) ? "ru" : "en";

function loadTaps(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TAPS_KEY) ?? "{}"); }
  catch { return {}; }
}
type Theme = "day" | "night" | "auto";
interface Settings { fontSize: number; rowSpacing: number; randomize: boolean; theme: Theme; soft: boolean; maxWidth: number; }

function normalizeSettings(value: any): Settings {
  const p = value && typeof value === "object" ? value : {};
  const raw = p.theme;
  const theme: Theme = raw === "day" || raw === "night" || raw === "auto" ? raw : "auto";
  return {
    fontSize: Number.isFinite(p.fontSize) ? p.fontSize : 14,
    rowSpacing: Number.isFinite(p.rowSpacing) ? p.rowSpacing : 8,
    randomize: typeof p.randomize === "boolean" ? p.randomize : false,
    theme,
    soft: typeof p.soft === "boolean" ? p.soft : true,
    maxWidth: Number.isFinite(p.maxWidth) ? p.maxWidth : 680,
  };
}

function loadSettings(): Settings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")); }
  catch { return normalizeSettings(null); }
}
function saveSettings(s: Settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function parseWords(text: string): Word[] {
  return text.split("\n").reduce<Word[]>((acc, rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return acc;
    const content = line.replace(/\t\d+\s*$/, "");
    let parts: string[] = [];
    if (content.includes("\t")) parts = content.split("\t");
    else if (content.includes(" — ")) parts = content.split(" — ");
    else if (content.includes(" - ")) parts = content.split(" - ");
    else return acc;
    const russian = parts[0]?.trim();
    const spanish = parts[1]?.trim();
    const complexity = Number(line.match(/\t(\d+)\s*$/)?.[1] ?? 0);
    if (russian && spanish) acc.push({ id: index + 1, russian, spanish, complexity });
    return acc;
  }, []);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Theme colours ─────────────────────────────────────────────────────────────
interface Palette {
  bg: string; fg: string; fgMuted: string; fgVeryMuted: string;
  divider: string; placeholder: string;
  menuBg: string; menuBorder: string;
  settingsBg: string; warningBg: string; warningBorder: string;
  counterColor: (n: number) => string;
}

const LIGHT: Palette = {
  bg: "#fff", fg: "#000", fgMuted: "#555", fgVeryMuted: "#bbb",
  divider: "#f2f2f2", placeholder: "#e0e0e0",
  menuBg: "#fff", menuBorder: "#000",
  settingsBg: "#fff", warningBg: "#fffbe6", warningBorder: "#e08000",
  counterColor: (n) => n === 0 ? "#e8e8e8" : n <= 2 ? "#b8b8b8" : n === 3 ? "#000" : "#c0392b",
};

const DARK: Palette = {
  bg: "#111", fg: "#ddd", fgMuted: "#888", fgVeryMuted: "#444",
  divider: "#1e1e1e", placeholder: "#333",
  menuBg: "#1c1c1c", menuBorder: "#555",
  settingsBg: "#1c1c1c", warningBg: "#2a2000", warningBorder: "#a06000",
  counterColor: (n) => n === 0 ? "#2a2a2a" : n <= 2 ? "#555" : n === 3 ? "#ddd" : "#e05040",
};

function softenPalette(base: Palette, dark: boolean): Palette {
  return dark ? {
    ...base,
    bg: "#1e1a14", fg: "#988e7a", fgMuted: "#635c50", fgVeryMuted: "#38332a",
    divider: "#272218", placeholder: "#312c22",
    menuBg: "#1e1a14", menuBorder: "#504840",
    settingsBg: "#1e1a14", warningBg: "#25200e", warningBorder: "#706030",
    counterColor: (n) => n === 0 ? "#312c22" : n <= 2 ? "#504840" : n === 3 ? "#988e7a" : "#b84832",
  } : {
    ...base,
    bg: "#ede5d4", fg: "#443e38", fgMuted: "#8a7e70", fgVeryMuted: "#bdb4a8",
    divider: "#dfd6c4", placeholder: "#cbc0b0",
    menuBg: "#ede5d4", menuBorder: "#908070",
    settingsBg: "#ede5d4", warningBg: "#f8eecc", warningBorder: "#a07820",
    counterColor: (n) => n === 0 ? "#cbc0b0" : n <= 2 ? "#9c9080" : n === 3 ? "#443e38" : "#a02820",
  };
}

// ── Numbered textarea ─────────────────────────────────────────────────────────
function NumberedTextarea({ value, onChange, onBlur, p, maxHeight }: {
  value: string; onChange: (v: string) => void; onBlur: (v: string) => void; p: Palette; maxHeight?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;
  const syncScroll = () => {
    if (taRef.current && numRef.current) numRef.current.scrollTop = taRef.current.scrollTop;
  };
  return (
    <div style={{ display: "flex", border: `1px solid ${p.fgVeryMuted}`, fontFamily: "monospace", fontSize: 12, lineHeight: "1.5", background: p.bg, maxHeight: maxHeight ?? undefined, overflow: "hidden" }}>
      <div ref={numRef} style={{ padding: "4px 6px", color: p.fgVeryMuted, textAlign: "right", userSelect: "none", overflow: "hidden", minWidth: 28, background: p.divider, borderRight: `1px solid ${p.divider}`, whiteSpace: "pre" }}>
        {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
      </div>
      <textarea
        ref={taRef}
        data-testid="input-words"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onBlur(e.target.value)}
        onScroll={syncScroll}
        style={{ flex: 1, padding: "4px 6px", fontSize: 12, fontFamily: "monospace", lineHeight: "1.5", border: "none", outline: "none", resize: "none", boxSizing: "border-box", background: p.bg, color: p.fg, height: maxHeight ?? "auto", overflowY: "auto" }}
      />
    </div>
  );
}

// ── Counter cell ──────────────────────────────────────────────────────────────
function CounterCell({ rk, count, onInc, onDec, onReset, onResetAll, rowPadding, fontSize, p }: {
  rk: string; count: number;
  onInc: (k: string) => void; onDec: (k: string) => void;
  onReset: (k: string) => void; onResetAll: () => void;
  rowPadding: number; fontSize: number; p: Palette;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLong = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    wasLong.current = false;
    timer.current = setTimeout(() => { wasLong.current = true; setMenu({ x: e.clientX, y: e.clientY }); }, 500);
  };
  const onPointerUp = () => { if (timer.current) clearTimeout(timer.current); };
  const onClick = () => { if (!wasLong.current) onInc(rk); };
  const close = () => { setMenu(null); setConfirmAll(false); };

  const t = LANGUAGES[getLang()];
  const mi: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "12px 20px", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: p.fg };

  return (
    <>
      <button
        aria-label={`Сложность ${rk}: ${count}`}
        data-testid={`counter-${rk}`}
        onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onClick}
        style={{ color: p.counterColor(count), fontVariantNumeric: "tabular-nums", background: "none", border: "none", cursor: "pointer", padding: `${rowPadding}px 8px`, fontSize, lineHeight: 1, display: "block", width: "100%", textAlign: "center", userSelect: "none", WebkitUserSelect: "none" }}
      >
        {count > 0 ? count : ""}
      </button>
      {menu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={close} />
          <div style={{ position: "fixed", zIndex: 50, background: p.menuBg, border: `1px solid ${p.menuBorder}`, left: menu.x, top: menu.y, fontSize: 13, minWidth: 150, color: p.fg }}>
            <button onClick={() => { onDec(rk); close(); }} style={mi}>−1</button>
            <button onClick={() => { onReset(rk); close(); }} style={mi}>{t.resetThis}</button>
            <div style={{ borderTop: `1px solid ${p.divider}` }} />
            {confirmAll
              ? <div style={{ padding: "6px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: p.fgMuted }}>{t.sure}</span>
                  <button onClick={() => { onResetAll(); close(); }} style={{ ...mi, padding: 0, color: "#c0392b" }}>{t.yes}</button>
                  <button onClick={() => setConfirmAll(false)} style={{ ...mi, padding: 0 }}>{t.no}</button>
                </div>
              : <button onClick={() => setConfirmAll(true)} style={{ ...mi, color: "#c0392b" }}>{t.resetAll}</button>
            }
          </div>
        </>
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VocabPage() {
  const [lessonState, setLessonState] = useState<LessonState>(loadLessonState);
  const activeLesson = lessonState.lessons.find(lesson => lesson.id === lessonState.activeId) ?? lessonState.lessons[0];
  const wordsText = activeLesson.wordsText;
  const words = useMemo(() => parseWords(wordsText), [wordsText]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [createLessonOpen, setCreateLessonOpen] = useState(false);
  const [renameLessonOpen, setRenameLessonOpen] = useState(false);
  const [copyLesson, setCopyLesson] = useState(true);
  const [newLessonName, setNewLessonName] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [shuffledWords, setShuffledWords] = useState<Word[]>(() =>
    settings.randomize ? shuffle(words) : []
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [allRevealed, setAllRevealed] = useState(false);

  useEffect(() => {
    localStorage.setItem(LESSONS_KEY, JSON.stringify({ lessons: lessonState.lessons }));
    localStorage.setItem(ACTIVE_LESSON_KEY, lessonState.activeId);
  }, [lessonState]);
  useEffect(() => { saveSettings(settings); }, [settings]);

  // Resolve active theme
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isDark = settings.theme === "night" || (settings.theme === "auto" && systemDark);
  const baseP = isDark ? DARK : LIGHT;
  const p = settings.soft ? softenPalette(baseP, isDark) : baseP;

  const handleRandomize = (val: boolean) => {
    if (val) setShuffledWords(shuffle(words));
    setSettings(s => ({ ...s, randomize: val }));
  };

  const baseWords = useMemo(
    () => settings.randomize ? shuffledWords : words,
    [settings.randomize, shuffledWords, words]
  );

  useEffect(() => {
    if (settings.randomize) setShuffledWords(shuffle(words));
  }, [words, settings.randomize]);

  // Filter — not persisted, resets on page reload
  const [filterLevel, setFilterLevel] = useState(0);
  const maxComplexity = useMemo(
    () => Math.max(0, ...baseWords.map(word => word.complexity)),
    [baseWords]
  );
  const activeFilterLevel = Math.min(filterLevel, maxComplexity);
  useEffect(() => {
    if (filterLevel > maxComplexity) setFilterLevel(maxComplexity);
  }, [filterLevel, maxComplexity]);
  const displayWords = useMemo(
    () => activeFilterLevel === 0 ? baseWords : baseWords.filter(word => word.complexity >= activeFilterLevel),
    [baseWords, activeFilterLevel]
  );

  const updateActiveLesson = (update: (lesson: Lesson) => Lesson, updateTimestamp = true) => {
    setLessonState(state => ({
      ...state,
      lessons: state.lessons.map(lesson => lesson.id === state.activeId
        ? { ...update(lesson), updatedAt: updateTimestamp ? Date.now() : lesson.updatedAt }
        : lesson),
    }));
  };

  const createLesson = () => {
    const name = newLessonName.trim();
    if (!name) return;
    const now = Date.now();
    const lesson: Lesson = {
      id: `lesson-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      wordsText: copyLesson ? activeLesson.wordsText : "",
      createdAt: now,
      updatedAt: now,
    };
    setLessonState(state => ({ lessons: [...state.lessons, lesson], activeId: lesson.id }));
    setNewLessonName("");
    setCopyLesson(true);
    setCreateLessonOpen(false);
    setRevealed(new Set());
    setFilterLevel(0);
  };

  const renameCurrentLesson = () => {
    const name = newLessonName.trim();
    if (!name) return;
    setLessonState(state => ({
      ...state,
      lessons: state.lessons.map(lesson => lesson.id === state.activeId ? { ...lesson, name, updatedAt: Date.now() } : lesson),
    }));
    setRenameLessonOpen(false);
  };

  const deleteCurrentLesson = () => {
    if (lessonState.lessons.length <= 1 || !window.confirm(`Удалить урок «${activeLesson.name}»?`)) return;
    const index = lessonState.lessons.findIndex(lesson => lesson.id === activeLesson.id);
    const remaining = lessonState.lessons.filter(lesson => lesson.id !== activeLesson.id);
    setLessonState({ lessons: remaining, activeId: remaining[Math.max(0, index - 1)].id });
    setRevealed(new Set());
    setAllRevealed(false);
    setFilterLevel(0);
  };

  const toggleReveal = useCallback((key: string) => {
    setRevealed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  const toggleAll = () => {
    if (allRevealed) { setRevealed(new Set()); }
    else { setRevealed(new Set(displayWords.map(w => w.russian))); }
    setAllRevealed(a => !a);
  };

  const changeTap = (lineId: string, change: (value: number) => number) => {
    const id = Number(lineId);
    updateActiveLesson(lesson => {
      const word = parseWords(lesson.wordsText).find(item => item.id === id);
      if (!word) return lesson;
      return { ...lesson, wordsText: setLineComplexity(lesson.wordsText, id, Math.max(0, change(word.complexity))) };
    });
  };
  const inc = (key: string) => changeTap(key, value => value + 1);
  const dec = (key: string) => changeTap(key, value => value - 1);
  const reset = (key: string) => changeTap(key, () => 0);
  const resetAll = () => updateActiveLesson(lesson => ({
    ...lesson,
    wordsText: parseWords(lesson.wordsText).reduce((text, word) => setLineComplexity(text, word.id, 0), lesson.wordsText),
  }));

  const exportData = () => {
    const backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      lessons: lessonState.lessons,
      activeLessonId: lessonState.activeId,
      settings,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spanish-words-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = async (file: File) => {
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== BACKUP_FORMAT || backup?.version !== BACKUP_VERSION || !Array.isArray(backup.lessons) || backup.lessons.length === 0) {
        throw new Error("Неподдерживаемый формат файла или нет уроков");
      }
      const now = Date.now();
      const ids = new Set<string>();
      const lessons: Lesson[] = backup.lessons.map((item: any, index: number) => {
        if (!item || typeof item.name !== "string" || !item.name.trim() || typeof item.wordsText !== "string") {
          throw new Error(`Некорректные данные урока №${index + 1}`);
        }
        let id = typeof item.id === "string" && item.id ? item.id : `import-${now}-${index}`;
        while (ids.has(id)) id = `${id}-${index + 1}`;
        ids.add(id);
        return {
          id,
          name: item.name,
          wordsText: item.wordsText,
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now,
          updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now,
        };
      });
      if (!window.confirm("Импорт заменит все текущие уроки и настройки. Продолжить?")) return;
      const activeId = lessons.some(lesson => lesson.id === backup.activeLessonId) ? backup.activeLessonId : lessons[0].id;
      setLessonState({ lessons, activeId });
      setSettings(normalizeSettings(backup.settings));
      setRevealed(new Set());
      setAllRevealed(false);
      setFilterLevel(0);
      window.alert("Данные импортированы");
    } catch (error) {
      window.alert(error instanceof Error ? `Не удалось импортировать файл: ${error.message}` : "Не удалось импортировать файл");
    }
  };

  const cell: React.CSSProperties = {
    padding: `${settings.rowSpacing}px 0`,
    verticalAlign: "middle",
    lineHeight: 1,
    borderTop: `1px solid ${p.divider}`,
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  const lnk: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13, color: p.fg };
  const lbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.75rem", color: p.fg };

  const revealedCount = displayWords.filter(w => revealed.has(w.russian)).length;
  const totalCount = displayWords.length;
  const pct = totalCount > 0 ? Math.round((revealedCount / totalCount) * 100) : 0;

  const t = LANGUAGES[getLang()];
  const languagePair = wordsText.match(/^\s*#lang\s+(\S+)\s+(.+?)\s*$/m);
  const firstLanguage = languagePair?.[1] ?? t.russian;
  const secondLanguage = languagePair?.[2] ?? t.spanish;
  const inverted = isInverted(wordsText);

  return (
    <>
      <style>{`
        body { background: ${p.bg}; color: ${p.fg}; }
        .zc { padding: 1.5rem; max-width: ${settings.maxWidth}px; margin: 0 auto; }
        @media (max-width: 600px) { .zc { padding: 1.5rem 0.75rem; } }
        details.zs { interpolate-size: allow-keywords; }
        details.zs > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; }
        details.zs > summary::-webkit-details-marker { display: none; }
        details.zs::details-content {
          height: 0; opacity: 0; overflow: clip;
          transition: height 240ms ease, opacity 180ms ease, content-visibility 240ms allow-discrete;
        }
        details.zs[open]::details-content { height: auto; opacity: 1; }
        @media (prefers-reduced-motion: reduce) { details.zs::details-content { transition: none; } }
        .zw { display: flex; }
        @media (max-width: 600px) { .zw { display: none; } }
      `}</style>

      <div className="zc">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: "1rem" }}>
          <select aria-label="Урок" value={activeLesson.id} onChange={event => {
            setLessonState(state => ({ ...state, activeId: event.target.value }));
            setRevealed(new Set());
            setAllRevealed(false);
            setFilterLevel(0);
          }} style={{ maxWidth: "70%", padding: "6px 8px", color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }}>
            {[...lessonState.lessons].sort((a, b) => b.createdAt - a.createdAt).map((lesson, index, sorted) => <option key={lesson.id} value={lesson.id}>{sorted.length - index}. {lesson.name}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={() => { setNewLessonName(suggestedLessonName(activeLesson.name)); setCreateLessonOpen(true); }} style={lnk}>+ Новый урок</button>
            <button type="button" onClick={() => { setNewLessonName(activeLesson.name); setRenameLessonOpen(true); }} style={lnk}>Переименовать</button>
            <button type="button" disabled={lessonState.lessons.length <= 1} onClick={deleteCurrentLesson} style={{ ...lnk, opacity: lessonState.lessons.length <= 1 ? 0.4 : 1 }}>Удалить</button>
          </div>
        </div>

        {renameLessonOpen && <div role="dialog" aria-modal="true" aria-label="Переименовать урок" style={{ position: "fixed", inset: 0, zIndex: 100, background: "#0008", display: "grid", placeItems: "center", padding: 16 }}>
          <form onSubmit={event => { event.preventDefault(); renameCurrentLesson(); }} style={{ width: "min(360px, 100%)", padding: 20, background: p.settingsBg, border: `1px solid ${p.menuBorder}`, color: p.fg, display: "flex", flexDirection: "column", gap: 12 }}>
            <strong>Переименовать урок</strong>
            <input autoFocus value={newLessonName} onChange={event => setNewLessonName(event.target.value)} required style={{ padding: 8, color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button type="button" onClick={() => setRenameLessonOpen(false)} style={lnk}>Отмена</button>
              <button type="submit" style={lnk}>Сохранить</button>
            </div>
          </form>
        </div>}

        {createLessonOpen && <div role="dialog" aria-modal="true" aria-label="Новый урок" style={{ position: "fixed", inset: 0, zIndex: 100, background: "#0008", display: "grid", placeItems: "center", padding: 16 }}>
          <form onSubmit={event => { event.preventDefault(); createLesson(); }} style={{ width: "min(360px, 100%)", padding: 20, background: p.settingsBg, border: `1px solid ${p.menuBorder}`, color: p.fg, display: "flex", flexDirection: "column", gap: 12 }}>
            <strong>Новый урок</strong>
            <input autoFocus value={newLessonName} onChange={event => setNewLessonName(event.target.value)} placeholder="Название урока" required style={{ padding: 8, color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }} />
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={copyLesson} onChange={event => setCopyLesson(event.target.checked)} />Скопировать слова и сложность текущего урока</label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button type="button" onClick={() => setCreateLessonOpen(false)} style={lnk}>Отмена</button>
              <button type="submit" style={lnk}>Создать</button>
            </div>
          </form>
        </div>}

        {/* Settings spoiler row */}
        <details className="zs" style={{ marginBottom: "1.25rem" }}>
          <summary style={{ cursor: "pointer", userSelect: "none", fontSize: 13, color: p.fgMuted }}>
            {/* Left: label + triangle */}
            <span>{t.settings}</span>
            {/* Right: controls — stop propagation so they don't toggle details */}
            <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }} onClick={e => e.preventDefault()}>
              <span style={{ color: p.fgVeryMuted }}>
                {revealedCount}/{totalCount}
              </span>
              <span style={{ color: p.fgVeryMuted }}>
                {pct}%
              </span>
              <button data-testid="button-toggle-all" onClick={toggleAll} style={{ ...lnk, color: p.fgMuted, fontSize: 13 }}>
                {allRevealed ? t.hideAll : t.showAll}
              </button>
            </span>
          </summary>

          <div style={{ paddingTop: "0.9rem", display: "flex", flexDirection: "column", gap: "0.7rem", fontSize: 13 }}>

            {/* 1. Word list */}
            <div>
              <div style={{ marginBottom: "0.4rem", color: p.fgMuted }}>
                {t.wordListHint}
              </div>
              <NumberedTextarea value={wordsText} onChange={text => updateActiveLesson(
                lesson => ({ ...lesson, wordsText: text }),
                withoutLessonFlags(text) !== withoutLessonFlags(wordsText),
              )} onBlur={() => {}} p={p} maxHeight={220} />
            </div>

            {/* 2. Theme */}
            <label style={lbl}>
              <span style={{ width: 120 }}>{t.theme}</span>
              <span style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                {(["day", "night", "auto"] as Theme[]).map(themeKey => (
                  <label key={themeKey} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: p.fg }}>
                    <input type="radio" name="theme" value={themeKey} checked={settings.theme === themeKey}
                      onChange={() => setSettings(s => ({ ...s, theme: themeKey }))} />
                    {{ day: t.themeDay, night: t.themeNight, auto: t.themeAuto }[themeKey]}
                  </label>
                ))}
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: p.fgMuted, borderLeft: `1px solid ${p.fgVeryMuted}`, paddingLeft: "1rem", marginLeft: "0.25rem" }}>
                  <input type="checkbox" checked={settings.soft}
                    onChange={e => setSettings(s => ({ ...s, soft: e.target.checked }))} />
                  {t.soft}
                </label>
              </span>
            </label>

            {/* 3. Sliders */}
            <label style={lbl}>
              <span style={{ width: 120 }}>{t.fontSize}</span>
              <input data-testid="input-font-size" type="range" min={8} max={32} value={settings.fontSize}
                onChange={e => setSettings(s => ({ ...s, fontSize: +e.target.value }))} style={{ flex: 1 }} />
              <span style={{ width: 36, color: p.fgMuted }}>{settings.fontSize}px</span>
            </label>

            <label style={lbl}>
              <span style={{ width: 120 }}>{t.rowSpacing}</span>
              <input data-testid="input-row-spacing" type="range" min={1} max={32} value={settings.rowSpacing}
                onChange={e => setSettings(s => ({ ...s, rowSpacing: +e.target.value }))} style={{ flex: 1 }} />
              <span style={{ width: 36, color: p.fgMuted }}>{settings.rowSpacing}px</span>
            </label>

            {/* 4. Width (desktop only) */}
            <label className="zw" style={lbl}>
              <span style={{ width: 120 }}>{t.width}</span>
              <input type="range" min={400} max={1400} step={20} value={settings.maxWidth}
                onChange={e => setSettings(s => ({ ...s, maxWidth: +e.target.value }))} style={{ flex: 1 }} />
              <span style={{ width: 36, color: p.fgMuted }}>{settings.maxWidth}</span>
            </label>

            {/* 5. Random order */}
            <label style={lbl}>
              <span style={{ width: 120 }}>{t.randomOrder}</span>
              <input data-testid="input-randomize" type="checkbox" checked={settings.randomize}
                onChange={e => handleRandomize(e.target.checked)} />
            </label>

            <label style={lbl}>
              <span style={{ width: 120 }}>{t.reverseTranslation}</span>
              <input type="checkbox" checked={isInverted(wordsText)}
                onChange={event => {
                  updateActiveLesson(lesson => ({ ...lesson, wordsText: setInverted(lesson.wordsText, event.target.checked) }), false);
                  setRevealed(new Set());
                  setAllRevealed(false);
                }} />
            </label>

            {/* 5. Complexity filter */}
            <label style={lbl}>
              <span style={{ width: 120 }}>{t.complexityFilter}</span>
              <input data-testid="input-filter" type="range" min={0} max={Math.max(1, maxComplexity)} step={1} value={activeFilterLevel}
                disabled={maxComplexity === 0}
                onChange={e => setFilterLevel(+e.target.value)} style={{ flex: 1 }} />
              <span style={{ width: 36, color: activeFilterLevel > 0 ? p.fg : p.fgVeryMuted }}>{activeFilterLevel}</span>
            </label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, paddingTop: 4 }}>
              <button type="button" onClick={exportData} style={lnk}>{t.exportData}</button>
              <button type="button" onClick={() => importInputRef.current?.click()} style={lnk}>{t.importData}</button>
              <input ref={importInputRef} type="file" accept=".json,application/json" hidden onChange={event => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                input.value = "";
                if (file) void importData(file);
              }} />
            </div>

          </div>
        </details>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: settings.fontSize }}>
          <thead>
            <tr style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: p.fgVeryMuted }}>
              <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingRight: "1em", lineHeight: 1 }}>{inverted ? secondLanguage : firstLanguage}</th>
              <th style={{ textAlign: "center", fontWeight: "normal", paddingBottom: "0.5em", width: "3.5em", lineHeight: 1 }}>{t.complexity}</th>
              <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingLeft: "1em", lineHeight: 1 }}>{inverted ? firstLanguage : secondLanguage}</th>
            </tr>
          </thead>
          <tbody>
            {displayWords.map(word => {
              const count = word.complexity;
              const isRevealed = revealed.has(word.russian);
              return (
                <tr key={word.id} data-testid={`row-word-${word.id}`}>
                  <td style={{ ...cell, paddingRight: "1em", color: p.fg }}>{inverted ? word.spanish : word.russian}</td>
                  <td style={{ ...cell, textAlign: "center", padding: 0 }}>
                    <CounterCell rk={String(word.id)} count={count} onInc={inc} onDec={dec} onReset={reset} onResetAll={resetAll} rowPadding={settings.rowSpacing} fontSize={settings.fontSize} p={p} />
                  </td>
                  <td data-testid={`cell-spanish-${word.id}`} onClick={() => toggleReveal(word.russian)}
                    style={{ ...cell, paddingLeft: "1em", cursor: "pointer", color: p.fg }}>
                    {isRevealed
                      ? <span>{inverted ? word.russian : word.spanish}</span>
                      : <span style={{ display: "inline-block", width: "4em", height: "0.6em", background: p.placeholder, borderRadius: 2, verticalAlign: "middle" }} />
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
