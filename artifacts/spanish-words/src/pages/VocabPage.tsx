import { useState, useCallback, useRef, useEffect } from "react";

interface Word {
  id: number;
  russian: string;
  spanish: string;
}

const WORDS: Word[] = [
  { id: 1, russian: "я предлагаю", spanish: "propongo" },
  { id: 2, russian: "я предлагаю / я советую", spanish: "sugiero" },
  { id: 3, russian: "я предполагаю", spanish: "supongo" },
  { id: 4, russian: "я предполагаю заранее", spanish: "presupongo" },
  { id: 5, russian: "я принимаю как данность / я предполагаю", spanish: "asumo" },
  { id: 6, russian: "я понимаю / я воспринимаю", spanish: "percibo" },
  { id: 7, russian: "я замечаю", spanish: "noto" },
  { id: 8, russian: "я наблюдаю", spanish: "observo" },
  { id: 9, russian: "я считаю / я полагаю", spanish: "considero" },
  { id: 10, russian: "я признаю", spanish: "reconozco" },
  { id: 11, russian: "я соглашаюсь", spanish: "acepto" },
  { id: 12, russian: "я отказываюсь", spanish: "rechazo" },
  { id: 13, russian: "я объясняю", spanish: "explico" },
  { id: 14, russian: "я описываю", spanish: "describo" },
  { id: 15, russian: "я упоминаю", spanish: "menciono" },
];

const TAPS_KEY = "spanish-vocab-taps";
const SETTINGS_KEY = "spanish-vocab-settings";

function loadTaps(): Record<number, number> {
  try {
    const raw = localStorage.getItem(TAPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveTaps(taps: Record<number, number>) {
  localStorage.setItem(TAPS_KEY, JSON.stringify(taps));
}

interface Settings { fontSize: number; lineHeight: number; }

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { fontSize: 14, lineHeight: 2.0 };
  } catch { return { fontSize: 14, lineHeight: 2.0 }; }
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function counterColor(count: number): string {
  if (count === 0) return "#bbb";
  if (count <= 2) return "#555";
  if (count === 3) return "#000";
  return "#c0392b";
}

function CounterCell({ wordId, count, onIncrement, onDecrement, onReset }: {
  wordId: number;
  count: number;
  onIncrement: (id: number) => void;
  onDecrement: (id: number) => void;
  onReset: (id: number) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
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
    if (!didLongPress.current) onIncrement(wordId);
  };

  return (
    <>
      <button
        data-testid={`counter-${wordId}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        style={{ color: counterColor(count), fontVariantNumeric: "tabular-nums", background: "none", border: "none", cursor: "pointer", padding: "0 8px", fontSize: "inherit" }}
      >
        {count}
      </button>
      {menu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenu(null)} />
          <div style={{ position: "fixed", zIndex: 50, background: "#fff", border: "1px solid #000", left: menu.x, top: menu.y }}>
            <button
              data-testid={`decrement-${wordId}`}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "inherit" }}
              onClick={() => { onDecrement(wordId); setMenu(null); }}
            >
              −1
            </button>
            <button
              data-testid={`reset-${wordId}`}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "inherit" }}
              onClick={() => { onReset(wordId); setMenu(null); }}
            >
              Обнулить
            </button>
          </div>
        </>
      )}
    </>
  );
}

export default function VocabPage() {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [taps, setTaps] = useState<Record<number, number>>(loadTaps);
  const [allRevealed, setAllRevealed] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => { saveSettings(settings); }, [settings]);

  const toggleReveal = useCallback((id: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const increment = useCallback((id: number) => {
    setTaps((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      saveTaps(next); return next;
    });
  }, []);

  const decrement = useCallback((id: number) => {
    setTaps((prev) => {
      const next = { ...prev, [id]: Math.max(0, (prev[id] ?? 0) - 1) };
      saveTaps(next); return next;
    });
  }, []);

  const reset = useCallback((id: number) => {
    setTaps((prev) => {
      const next = { ...prev, [id]: 0 };
      saveTaps(next); return next;
    });
  }, []);

  const toggleAll = () => {
    if (allRevealed) { setRevealed(new Set()); }
    else { setRevealed(new Set(WORDS.map((w) => w.id))); }
    setAllRevealed(!allRevealed);
  };

  return (
    <div style={{ padding: "2rem", fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
        <strong>Испанские слова</strong>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <label style={{ fontSize: "0.85em" }}>
            размер{" "}
            <input
              data-testid="input-font-size"
              type="range"
              min={11}
              max={22}
              value={settings.fontSize}
              onChange={(e) => setSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))}
              style={{ width: 70, verticalAlign: "middle" }}
            />
            {" "}{settings.fontSize}px
          </label>
          <label style={{ fontSize: "0.85em" }}>
            интервал{" "}
            <input
              data-testid="input-line-height"
              type="range"
              min={1.2}
              max={3.0}
              step={0.1}
              value={settings.lineHeight}
              onChange={(e) => setSettings((s) => ({ ...s, lineHeight: Number(e.target.value) }))}
              style={{ width: 70, verticalAlign: "middle" }}
            />
            {" "}{settings.lineHeight.toFixed(1)}
          </label>
          <button
            data-testid="button-toggle-all"
            onClick={toggleAll}
            style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: "0.85em", padding: 0 }}
          >
            {allRevealed ? "скрыть все" : "показать все"}
          </button>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ fontSize: "0.75em", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999" }}>
            <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingRight: "1em" }}>Русский</th>
            <th style={{ textAlign: "center", fontWeight: "normal", paddingBottom: "0.5em", width: "3em" }}>Статус</th>
            <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingLeft: "1em" }}>Испанский</th>
          </tr>
        </thead>
        <tbody>
          {WORDS.map((word) => {
            const count = taps[word.id] ?? 0;
            const isRevealed = revealed.has(word.id);
            return (
              <tr key={word.id} data-testid={`row-word-${word.id}`}>
                <td style={{ paddingRight: "1em", verticalAlign: "middle" }}>{word.russian}</td>
                <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                  <CounterCell
                    wordId={word.id}
                    count={count}
                    onIncrement={increment}
                    onDecrement={decrement}
                    onReset={reset}
                  />
                </td>
                <td
                  data-testid={`cell-spanish-${word.id}`}
                  onClick={() => toggleReveal(word.id)}
                  style={{ paddingLeft: "1em", verticalAlign: "middle", cursor: "pointer" }}
                >
                  {isRevealed
                    ? <span>{word.spanish}</span>
                    : <span style={{ display: "inline-block", width: "4em", height: "0.65em", background: "#ddd", borderRadius: 2, verticalAlign: "middle" }} />
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
