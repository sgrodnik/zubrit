import { useState, useCallback } from "react";
import { Eye, EyeOff, RotateCcw, BookOpen } from "lucide-react";

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

function getLevel(count: number): { label: string; color: string; bg: string } {
  if (count === 0) return { label: "Новое", color: "text-muted-foreground", bg: "bg-muted/60" };
  if (count <= 2) return { label: "Знакомо", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40" };
  if (count <= 5) return { label: "Учу", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40" };
  return { label: "Знаю", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" };
}

export default function VocabPage() {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [taps, setTaps] = useState<Record<number, number>>(loadTaps);
  const [allRevealed, setAllRevealed] = useState(false);

  const toggleReveal = useCallback((id: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const incrementTap = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      setTaps((prev) => {
        const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
        saveTaps(next);
        return next;
      });
    },
    []
  );

  const resetTap = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      setTaps((prev) => {
        const next = { ...prev, [id]: 0 };
        saveTaps(next);
        return next;
      });
    },
    []
  );

  const toggleAll = () => {
    if (allRevealed) {
      setRevealed(new Set());
    } else {
      setRevealed(new Set(WORDS.map((w) => w.id)));
    }
    setAllRevealed(!allRevealed);
  };

  const totalKnown = WORDS.filter((w) => (taps[w.id] ?? 0) > 5).length;
  const totalLearning = WORDS.filter((w) => {
    const t = taps[w.id] ?? 0;
    return t > 0 && t <= 5;
  }).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Испанские слова
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Нажмите на ячейку испанского слова, чтобы показать перевод
          </p>
        </div>

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs text-muted-foreground">{totalKnown} знаю</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-xs text-muted-foreground">{totalLearning} учу</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40"></span>
              <span className="text-xs text-muted-foreground">{WORDS.length - totalKnown - totalLearning} новых</span>
            </div>
          </div>

          <button
            data-testid="button-toggle-all"
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/60"
          >
            {allRevealed ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                Скрыть все
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                Показать все
              </>
            )}
          </button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden shadow-sm bg-card">
          <div className="grid grid-cols-[1fr_auto_1fr] text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
            <div className="px-4 py-3">Русский</div>
            <div className="px-4 py-3 text-center border-x border-border">Повторения</div>
            <div className="px-4 py-3">Испанский</div>
          </div>

          {WORDS.map((word, idx) => {
            const count = taps[word.id] ?? 0;
            const level = getLevel(count);
            const isRevealed = revealed.has(word.id);

            return (
              <div
                key={word.id}
                data-testid={`row-word-${word.id}`}
                className={`grid grid-cols-[1fr_auto_1fr] items-center ${idx < WORDS.length - 1 ? "border-b border-border" : ""} transition-colors hover:bg-muted/20`}
              >
                <div className="px-4 py-3.5 text-sm text-foreground leading-snug">
                  {word.russian}
                </div>

                <div className="px-3 py-3.5 border-x border-border flex flex-col items-center gap-1.5 min-w-[90px]">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${level.bg} ${level.color}`}>
                    {level.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      data-testid={`button-tap-${word.id}`}
                      onClick={(e) => incrementTap(e, word.id)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono tabular-nums px-1.5 py-0.5 rounded hover:bg-primary/10 active:scale-95"
                      title="Нажмите, чтобы отметить повторение"
                    >
                      +{count}
                    </button>
                    {count > 0 && (
                      <button
                        data-testid={`button-reset-${word.id}`}
                        onClick={(e) => resetTap(e, word.id)}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors"
                        title="Сбросить счётчик"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div
                  data-testid={`cell-spanish-${word.id}`}
                  onClick={() => toggleReveal(word.id)}
                  className="px-4 py-3.5 cursor-pointer select-none"
                >
                  {isRevealed ? (
                    <span className="text-sm font-medium text-primary transition-all">
                      {word.spanish}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/50 italic">
                      <span className="w-16 h-4 rounded bg-muted-foreground/15 inline-block align-middle"></span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          Нажмите на закрашенную ячейку, чтобы увидеть слово &bull; Нажмите +N для счётчика повторений
        </p>
      </div>
    </div>
  );
}
