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

// v2 uses russian text as key — immune to list reordering/insertion
const TAPS_KEY = "spanish-vocab-taps-v2";
const SETTINGS_KEY = "spanish-vocab-settings-v2";
const WORDS_KEY = "spanish-vocab-words";

function loadTaps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TAPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveTaps(taps: Record<string, number>) {
  localStorage.setItem(TAPS_KEY, JSON.stringify(taps));
}

interface Settings {
  fontSize: number;
  rowSpacing: number;
  randomize: boolean;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { fontSize: p.fontSize ?? 14, rowSpacing: p.rowSpacing ?? 8, randomize: p.randomize ?? false };
    }
  } catch {}
  return { fontSize: 14, rowSpacing: 8, randomize: false };
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadWordsText(): string {
  return localStorage.getItem(WORDS_KEY) ?? DEFAULT_WORDS_TEXT;
}

function parseWords(text: string): Word[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const result: Word[] = [];
  lines.forEach((line, i) => {
    let parts: string[];
    if (line.includes("\t")) {
      parts = line.split("\t");
    } else if (line.includes(" — ")) {
      parts = line.split(" — ");
    } else if (line.includes(" - ")) {
      parts = line.split(" - ");
    } else {
      return;
    }
    const russian = parts[0]?.trim();
    const spanish = parts[1]?.trim();
    if (russian && spanish) result.push({ id: i + 1, russian, spanish });
  });
  return result;
}

function counterColor(count: number): string {
  if (count === 0) return "#e8e8e8";
  if (count <= 2) return "#b8b8b8";
  if (count === 3) return "#000";
  return "#c0392b";
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Line-numbered textarea
function NumberedTextarea({ value, onChange, onBlur }: {
  value: string;
  onChange: (v: string) => void;
  onBlur: (v: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  const syncScroll = () => {
    if (taRef.current && numRef.current) {
      numRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  return (
    <div style={{ display: "flex", border: "1px solid #ddd", fontFamily: "monospace", fontSize: 12, lineHeight: "1.5" }}>
      <div
        ref={numRef}
        style={{
          padding: "4px 6px",
          color: "#bbb",
          textAlign: "right",
          userSelect: "none",
          overflow: "hidden",
          minWidth: 28,
          background: "#fafafa",
          borderRight: "1px solid #eee",
          whiteSpace: "pre",
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
      </div>
      <textarea
        ref={taRef}
        data-testid="input-words"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
        onScroll={syncScroll}
        rows={10}
        style={{
          flex: 1,
          padding: "4px 6px",
          fontSize: 12,
          fontFamily: "monospace",
          lineHeight: "1.5",
          border: "none",
          outline: "none",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function CounterCell({ russianKey, count, onIncrement, onDecrement, onReset, onResetAll, rowPadding, fontSize }: {
  russianKey: string;
  count: number;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onReset: (key: string) => void;
  onResetAll: () => void;
  rowPadding: number;
  fontSize: number;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setMenu({ x: e.clientX, y: e.clientY });
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleClick = () => {
    if (!didLongPress.current) onIncrement(russianKey);
  };

  const closeMenu = () => { setMenu(null); setConfirmAll(false); };

  return (
    <>
      <button
        data-testid={`counter-${russianKey}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        style={{
          color: counterColor(count),
          fontVariantNumeric: "tabular-nums",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: `${rowPadding}px 8px`,
          fontSize: fontSize,
          lineHeight: 1,
          display: "block",
          width: "100%",
          textAlign: "center",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {count}
      </button>

      {menu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={closeMenu} />
          <div style={{ position: "fixed", zIndex: 50, background: "#fff", border: "1px solid #000", left: menu.x, top: menu.y, fontSize: 13, minWidth: 140 }}>
            <button data-testid={`decrement-${russianKey}`} onClick={() => { onDecrement(russianKey); closeMenu(); }} style={menuItem}>
              −1
            </button>
            <button data-testid={`reset-${russianKey}`} onClick={() => { onReset(russianKey); closeMenu(); }} style={menuItem}>
              Обнулить это
            </button>
            <div style={{ borderTop: "1px solid #eee" }} />
            {confirmAll ? (
              <div style={{ padding: "6px 16px", display: "flex", gap: 8 }}>
                <span style={{ color: "#999" }}>Точно?</span>
                <button onClick={() => { onResetAll(); closeMenu(); }} style={{ ...menuItem, padding: 0, color: "#c0392b" }}>да</button>
                <button onClick={() => setConfirmAll(false)} style={{ ...menuItem, padding: 0 }}>нет</button>
              </div>
            ) : (
              <button data-testid="reset-all" onClick={() => setConfirmAll(true)} style={{ ...menuItem, color: "#c0392b" }}>
                Сбросить все
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 16px",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "inherit",
  color: "inherit",
};

export default function VocabPage() {
  const [wordsText, setWordsText] = useState<string>(loadWordsText);
  const [words, setWords] = useState<Word[]>(() => parseWords(loadWordsText()));
  const [shuffledWords, setShuffledWords] = useState<Word[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [taps, setTaps] = useState<Record<string, number>>(loadTaps);
  const [allRevealed, setAllRevealed] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => { saveSettings(settings); }, [settings]);

  // When randomize toggled ON, shuffle once; OFF = original order
  const handleRandomize = (val: boolean) => {
    if (val) setShuffledWords(shuffleArray(words));
    setSettings(s => ({ ...s, randomize: val }));
  };

  const displayWords = useMemo(() => {
    return settings.randomize ? shuffledWords : words;
  }, [settings.randomize, shuffledWords, words]);

  const applyWordsText = (text: string) => {
    localStorage.setItem(WORDS_KEY, text);
    const parsed = parseWords(text);
    setWords(parsed);
    if (settings.randomize) setShuffledWords(shuffleArray(parsed));
    // don't reset revealed — keys are russian text, stable
  };

  const toggleReveal = useCallback((key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = () => {
    if (allRevealed) { setRevealed(new Set()); }
    else { setRevealed(new Set(displayWords.map(w => w.russian))); }
    setAllRevealed(!allRevealed);
  };

  const increment = useCallback((key: string) => {
    setTaps((prev) => {
      const next = { ...prev, [key]: (prev[key] ?? 0) + 1 };
      saveTaps(next); return next;
    });
  }, []);

  const decrement = useCallback((key: string) => {
    setTaps((prev) => {
      const next = { ...prev, [key]: Math.max(0, (prev[key] ?? 0) - 1) };
      saveTaps(next); return next;
    });
  }, []);

  const reset = useCallback((key: string) => {
    setTaps((prev) => {
      const next = { ...prev, [key]: 0 };
      saveTaps(next); return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    saveTaps({});
    setTaps({});
  }, []);

  const cellStyle: React.CSSProperties = {
    padding: `${settings.rowSpacing}px 0`,
    verticalAlign: "middle",
    lineHeight: 1,
    borderTop: "1px solid #f2f2f2",
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 680 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <strong style={{ fontSize: 15 }}>Испанские слова</strong>
        <button data-testid="button-toggle-all" onClick={toggleAll} style={linkBtn}>
          {allRevealed ? "скрыть все" : "показать все"}
        </button>
      </div>

      {/* Settings spoiler */}
      <details style={{ marginBottom: "1.5rem" }}>
        <summary style={{ cursor: "pointer", userSelect: "none", fontSize: 13, color: "#555" }}>
          настройки
        </summary>
        <div style={{ paddingTop: "0.9rem", display: "flex", flexDirection: "column", gap: "0.7rem", fontSize: 13, color: "#333" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ width: 110 }}>размер шрифта</span>
            <input
              data-testid="input-font-size"
              type="range" min={11} max={22} value={settings.fontSize}
              onChange={(e) => setSettings(s => ({ ...s, fontSize: Number(e.target.value) }))}
              style={{ flex: 1 }}
            />
            <span style={{ width: 36, color: "#777" }}>{settings.fontSize}px</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ width: 110 }}>интервал строк</span>
            <input
              data-testid="input-row-spacing"
              type="range" min={2} max={20} step={1} value={settings.rowSpacing}
              onChange={(e) => setSettings(s => ({ ...s, rowSpacing: Number(e.target.value) }))}
              style={{ flex: 1 }}
            />
            <span style={{ width: 36, color: "#777" }}>{settings.rowSpacing}px</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              data-testid="input-randomize"
              type="checkbox"
              checked={settings.randomize}
              onChange={(e) => handleRandomize(e.target.checked)}
            />
            <span>случайный порядок</span>
          </label>

          <div style={{ marginTop: "0.4rem" }}>
            <div style={{ marginBottom: "0.4rem", color: "#555" }}>
              список слов — по одной паре на строку, разделитель Tab или « — »
            </div>
            <div style={{ marginBottom: "0.4rem", fontSize: 12, color: "#e08000", background: "#fffbe6", padding: "4px 8px", borderLeft: "2px solid #e08000" }}>
              ⚠ Не вставляйте новые строки в начало или середину — статусы привязаны к тексту русского слова и сохранятся корректно. Только дописывайте в конец, либо редактируйте существующие строки.
            </div>
            <NumberedTextarea
              value={wordsText}
              onChange={setWordsText}
              onBlur={applyWordsText}
            />
          </div>
        </div>
      </details>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: settings.fontSize }}>
        <thead>
          <tr style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#ccc" }}>
            <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingRight: "1em", lineHeight: 1 }}>Русский</th>
            <th style={{ textAlign: "center", fontWeight: "normal", paddingBottom: "0.5em", width: "3em", lineHeight: 1 }}>Статус</th>
            <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingLeft: "1em", lineHeight: 1 }}>Испанский</th>
          </tr>
        </thead>
        <tbody>
          {displayWords.map((word) => {
            const count = taps[word.russian] ?? 0;
            const isRevealed = revealed.has(word.russian);
            return (
              <tr key={word.russian} data-testid={`row-word-${word.id}`}>
                <td style={{ ...cellStyle, paddingRight: "1em" }}>{word.russian}</td>
                <td style={{ ...cellStyle, textAlign: "center", padding: 0 }}>
                  <CounterCell
                    russianKey={word.russian}
                    count={count}
                    onIncrement={increment}
                    onDecrement={decrement}
                    onReset={reset}
                    onResetAll={resetAll}
                    rowPadding={settings.rowSpacing}
                    fontSize={settings.fontSize}
                  />
                </td>
                <td
                  data-testid={`cell-spanish-${word.id}`}
                  onClick={() => toggleReveal(word.russian)}
                  style={{ ...cellStyle, paddingLeft: "1em", cursor: "pointer" }}
                >
                  {isRevealed
                    ? <span>{word.spanish}</span>
                    : <span style={{ display: "inline-block", width: "4em", height: "0.6em", background: "#e0e0e0", borderRadius: 2, verticalAlign: "middle" }} />
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
  fontSize: 13,
  color: "inherit",
};
