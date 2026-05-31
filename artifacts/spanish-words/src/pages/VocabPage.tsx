import { useState, useCallback, useRef, useEffect, useMemo } from "react";

interface Word {
  id: number;
  russian: string;
  spanish: string;
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

const LANGUAGES = {
  ru: {
    settings: "Настройки",
    hideAll: "скрыть все",
    showAll: "показать все",
    wordListHint: "Список слов — по одной паре на строку, разделитель Tab или « — »",
    theme: "Тема",
    themeDay: "День",
    themeNight: "Ночь",
    themeAuto: "Авто",
    soft: "мягкая",
    fontSize: "Размер шрифта",
    rowSpacing: "Интервал строк",
    width: "Ширина",
    randomOrder: "Случайный порядок",
    complexityFilter: "Сложность ≥",
    russian: "Русский",
    complexity: "Сложность",
    spanish: "Испанский",
    resetThis: "Обнулить это",
    sure: "Точно?",
    yes: "да",
    no: "нет",
    resetAll: "Сбросить все",
  },
  en: {
    settings: "Settings",
    hideAll: "hide all",
    showAll: "show all",
    wordListHint: "Word list — one pair per line, separator Tab or ' — '",
    theme: "Theme",
    themeDay: "Day",
    themeNight: "Night",
    themeAuto: "Auto",
    soft: "soft",
    fontSize: "Font size",
    rowSpacing: "Row spacing",
    width: "Width",
    randomOrder: "Random order",
    complexityFilter: "Complexity ≥",
    russian: "Russian",
    complexity: "Complexity",
    spanish: "Spanish",
    resetThis: "Reset this",
    sure: "Are you sure?",
    yes: "yes",
    no: "no",
    resetAll: "Reset all",
  }
};

const getLang = () => (typeof navigator !== "undefined" && navigator.language.startsWith("ru")) ? "ru" : "en";

function loadTaps(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TAPS_KEY) ?? "{}"); }
  catch { return {}; }
}
function saveTaps(t: Record<string, number>) {
  localStorage.setItem(TAPS_KEY, JSON.stringify(t));
}

type Theme = "day" | "night" | "auto";
interface Settings { fontSize: number; rowSpacing: number; randomize: boolean; theme: Theme; soft: boolean; maxWidth: number; }

function loadSettings(): Settings {
  try {
    const p = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    const raw = p.theme;
    const theme: Theme = raw === "day" || raw === "night" || raw === "auto" ? raw : "auto";
    return {
      fontSize: p.fontSize ?? 14,
      rowSpacing: p.rowSpacing ?? 8,
      randomize: p.randomize ?? false,
      theme,
      soft: p.soft ?? false,
      maxWidth: p.maxWidth ?? 680,
    };
  } catch { return { fontSize: 14, rowSpacing: 8, randomize: false, theme: "auto", soft: false, maxWidth: 680 }; }
}
function saveSettings(s: Settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function loadWordsText(): string { return localStorage.getItem(WORDS_KEY) ?? DEFAULT_WORDS_TEXT; }

function parseWords(text: string): Word[] {
  return text.split("\n").map(l => l.trim()).filter(Boolean).reduce<Word[]>((acc, line, i) => {
    let parts: string[] = [];
    if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(" — ")) parts = line.split(" — ");
    else if (line.includes(" - ")) parts = line.split(" - ");
    else return acc;
    const russian = parts[0]?.trim();
    const spanish = parts[1]?.trim();
    if (russian && spanish) acc.push({ id: i + 1, russian, spanish });
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
        data-testid={`counter-${rk}`}
        onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onClick}
        style={{ color: p.counterColor(count), fontVariantNumeric: "tabular-nums", background: "none", border: "none", cursor: "pointer", padding: `${rowPadding}px 8px`, fontSize, lineHeight: 1, display: "block", width: "100%", textAlign: "center", userSelect: "none", WebkitUserSelect: "none" }}
      >
        {count}
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
  const [wordsText, setWordsText] = useState(loadWordsText);
  const [words, setWords] = useState<Word[]>(() => parseWords(loadWordsText()));
  const [shuffledWords, setShuffledWords] = useState<Word[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [taps, setTaps] = useState<Record<string, number>>(loadTaps);
  const [allRevealed, setAllRevealed] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);

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

  // Filter — not persisted, resets on page reload
  const [filterLevel, setFilterLevel] = useState(0);
  const maxComplexity = useMemo(
    () => Math.max(0, ...baseWords.map(w => taps[w.russian] ?? 0)),
    [baseWords, taps]
  );
  const displayWords = useMemo(
    () => filterLevel === 0 ? baseWords : baseWords.filter(w => (taps[w.russian] ?? 0) >= filterLevel),
    [baseWords, taps, filterLevel]
  );

  const applyWordsText = (text: string) => {
    localStorage.setItem(WORDS_KEY, text);
    const parsed = parseWords(text);
    setWords(parsed);
    if (settings.randomize) setShuffledWords(shuffle(parsed));
  };

  const toggleReveal = useCallback((key: string) => {
    setRevealed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  const toggleAll = () => {
    if (allRevealed) { setRevealed(new Set()); }
    else { setRevealed(new Set(displayWords.map(w => w.russian))); }
    setAllRevealed(a => !a);
  };

  const inc = useCallback((k: string) => setTaps(p => { const n = { ...p, [k]: (p[k] ?? 0) + 1 }; saveTaps(n); return n; }), []);
  const dec = useCallback((k: string) => setTaps(p => { const n = { ...p, [k]: Math.max(0, (p[k] ?? 0) - 1) }; saveTaps(n); return n; }), []);
  const reset = useCallback((k: string) => setTaps(p => { const n = { ...p, [k]: 0 }; saveTaps(n); return n; }), []);
  const resetAll = useCallback(() => { saveTaps({}); setTaps({}); }, []);

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

  return (
    <>
      <style>{`
        body { background: ${p.bg}; color: ${p.fg}; }
        .zc { padding: 1.5rem; max-width: ${settings.maxWidth}px; margin: 0 auto; }
        @media (max-width: 600px) { .zc { padding: 1.5rem 0.75rem; } }
        details.zs > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; }
        details.zs > summary::-webkit-details-marker { display: none; }
        .zw { display: flex; }
        @media (max-width: 600px) { .zw { display: none; } }
      `}</style>

      <div className="zc">
        {/* Settings spoiler row */}
        <details className="zs" style={{ marginBottom: "1.25rem" }}>
          <summary style={{ cursor: "pointer", userSelect: "none", fontSize: 13, color: p.fgMuted }}>
            {/* Left: label + triangle */}
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ fontSize: 10 }}>▶</span>
              <span>{t.settings}</span>
            </span>
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
              <NumberedTextarea value={wordsText} onChange={setWordsText} onBlur={applyWordsText} p={p} maxHeight={220} />
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

            {/* 5. Complexity filter */}
            {maxComplexity > 0 && (
              <label style={lbl}>
                <span style={{ width: 120 }}>{t.complexityFilter}</span>
                <input data-testid="input-filter" type="range" min={0} max={maxComplexity} step={1} value={filterLevel}
                  onChange={e => setFilterLevel(+e.target.value)} style={{ flex: 1 }} />
                <span style={{ width: 36, color: filterLevel > 0 ? p.fg : p.fgVeryMuted }}>{filterLevel}</span>
              </label>
            )}

          </div>
        </details>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: settings.fontSize }}>
          <thead>
            <tr style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: p.fgVeryMuted }}>
              <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingRight: "1em", lineHeight: 1 }}>{t.russian}</th>
              <th style={{ textAlign: "center", fontWeight: "normal", paddingBottom: "0.5em", width: "3.5em", lineHeight: 1 }}>{t.complexity}</th>
              <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingLeft: "1em", lineHeight: 1 }}>{t.spanish}</th>
            </tr>
          </thead>
          <tbody>
            {displayWords.map(word => {
              const count = taps[word.russian] ?? 0;
              const isRevealed = revealed.has(word.russian);
              return (
                <tr key={word.russian} data-testid={`row-word-${word.id}`}>
                  <td style={{ ...cell, paddingRight: "1em", color: p.fg }}>{word.russian}</td>
                  <td style={{ ...cell, textAlign: "center", padding: 0 }}>
                    <CounterCell rk={word.russian} count={count} onInc={inc} onDec={dec} onReset={reset} onResetAll={resetAll} rowPadding={settings.rowSpacing} fontSize={settings.fontSize} p={p} />
                  </td>
                  <td data-testid={`cell-spanish-${word.id}`} onClick={() => toggleReveal(word.russian)}
                    style={{ ...cell, paddingLeft: "1em", cursor: "pointer", color: p.fg }}>
                    {isRevealed
                      ? <span>{word.spanish}</span>
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
