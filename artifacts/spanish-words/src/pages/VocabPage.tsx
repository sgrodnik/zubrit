import { useState, useCallback, useRef } from "react";

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

const STORAGE_KEY = "spanish-vocab-taps";

function loadTaps(): Record<number, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTaps(taps: Record<number, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(taps));
}

function CounterCell({ wordId, count, onIncrement, onReset }: {
  wordId: number;
  count: number;
  onIncrement: (id: number) => void;
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
        style={{ fontVariantNumeric: "tabular-nums" }}
        className="w-full h-full flex items-center justify-center text-sm text-black select-none cursor-pointer py-3"
      >
        {count}
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-black text-sm"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              data-testid={`reset-${wordId}`}
              className="block w-full text-left px-4 py-2 hover:bg-black hover:text-white transition-colors"
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

  const toggleReveal = useCallback((id: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const increment = useCallback((id: number) => {
    setTaps((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      saveTaps(next);
      return next;
    });
  }, []);

  const reset = useCallback((id: number) => {
    setTaps((prev) => {
      const next = { ...prev, [id]: 0 };
      saveTaps(next);
      return next;
    });
  }, []);

  const toggleAll = () => {
    if (allRevealed) {
      setRevealed(new Set());
    } else {
      setRevealed(new Set(WORDS.map((w) => w.id)));
    }
    setAllRevealed(!allRevealed);
  };

  return (
    <div className="min-h-screen bg-white px-6 py-10 max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-base font-semibold tracking-tight text-black">
          Испанские слова
        </h1>
        <button
          data-testid="button-toggle-all"
          onClick={toggleAll}
          className="text-xs text-[#888] hover:text-black transition-colors"
        >
          {allRevealed ? "скрыть все" : "показать все"}
        </button>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[11px] uppercase tracking-widest text-[#888]">
            <th className="text-left font-normal pb-3 pr-4 w-[44%]">Русский</th>
            <th className="text-center font-normal pb-3 w-[12%]">Статус</th>
            <th className="text-left font-normal pb-3 pl-4">Испанский</th>
          </tr>
        </thead>
        <tbody>
          {WORDS.map((word) => {
            const count = taps[word.id] ?? 0;
            const isRevealed = revealed.has(word.id);

            return (
              <tr
                key={word.id}
                data-testid={`row-word-${word.id}`}
                className="group"
              >
                <td className="text-sm text-black py-3 pr-4 align-middle leading-snug">
                  {word.russian}
                </td>

                <td className="text-center align-middle p-0">
                  <CounterCell
                    wordId={word.id}
                    count={count}
                    onIncrement={increment}
                    onReset={reset}
                  />
                </td>

                <td
                  data-testid={`cell-spanish-${word.id}`}
                  onClick={() => toggleReveal(word.id)}
                  className="pl-4 py-3 align-middle cursor-pointer"
                >
                  {isRevealed ? (
                    <span className="text-sm text-black">{word.spanish}</span>
                  ) : (
                    <span className="inline-block w-14 h-3.5 rounded-sm bg-[#e0e0e0]" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
