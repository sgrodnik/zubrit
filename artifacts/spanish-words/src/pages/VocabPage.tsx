import { useState, useCallback, useRef, useEffect, useMemo } from "react";

interface Word {
  id: number;
  russian: string;
  spanish: string;
  complexity: number;
  group: number;
  key?: string;
  sourceLessonId?: string;
  sourceLineId?: number;
}

const DEFAULT_WORDS_TEXT = [
  "#lang Русский Испанский",
  "Привет\tHola",
  "Доброе утро\tBuenos días",
  "Пожалуйста\tPor favor",
  "Спасибо\tGracias",
  "Да\tSí",
  "Нет\tNo",
  "Я не понимаю\tNo entiendo\t1",
  "Вы говорите по-английски?\t¿Habla inglés?\t1",
  "Сколько это стоит?\t¿Cuánto cuesta?\t1",
  "Где находится туалет?\t¿Dónde está el baño?\t2",
  "Я хочу кофе, пожалуйста.\tQuiero un café, por favor.\t2",
  "Счёт, пожалуйста.\tLa cuenta, por favor.",
  "До свидания\tHasta luego",
].join("\n");

const TAPS_KEY = "spanish-vocab-taps-v2";
const SETTINGS_KEY = "spanish-vocab-settings-v2";
const WORDS_KEY = "spanish-vocab-words";
const LESSONS_KEY = "spanish-vocab-lessons-v1";
const ACTIVE_LESSON_KEY = "spanish-vocab-active-lesson-v1";
const COMPLEX_LESSON_ID = "__complex-words__";
const COMPLEX_STUDY_KEY = "spanish-vocab-complex-study-v1";
const REVEAL_BUTTON_POSITION_KEY = "spanish-vocab-reveal-button-position-v1";
const DEFAULT_REVEAL_BUTTON_SIZE = 104;
const MIN_REVEAL_BUTTON_SIZE = 48;
const MAX_REVEAL_BUTTON_SIZE = 200;
const SCROLL_TO_TOP_DURATION_MS = 700;
const BACKUP_FORMAT = "spanish-words-backup";
const BACKUP_VERSION = 1;
const IDLE_TIMEOUT_MS = 10_000;
const MIN_VISIBLE_STUDY_SECONDS = 30;
const REVEAL_TRANSITION_MS = 180;

type Lesson = { id: string; name: string; wordsText: string; randomize: boolean; createdAt: number; updatedAt: number; studySecondsByDate: Record<string, number> };
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

function studyDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  if (date.getHours() < 4) date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function splitStudyInterval(start: number, end: number): Array<{ date: string; milliseconds: number }> {
  const intervals: Array<{ date: string; milliseconds: number }> = [];
  let cursor = start;
  while (cursor < end) {
    const nextBoundary = new Date(cursor);
    nextBoundary.setHours(4, 0, 0, 0);
    if (nextBoundary.getTime() <= cursor) nextBoundary.setDate(nextBoundary.getDate() + 1);
    const segmentEnd = Math.min(end, nextBoundary.getTime());
    intervals.push({ date: studyDateKey(cursor), milliseconds: segmentEnd - cursor });
    cursor = segmentEnd;
  }
  return intervals;
}

function loadComplexStudySeconds(): Record<string, number> {
  try { return normalizeStudySeconds(JSON.parse(localStorage.getItem(COMPLEX_STUDY_KEY) ?? "{}")); }
  catch { return {}; }
}

function wordIdentity(word: Word): string {
  return word.key ?? word.russian;
}

function normalizeStudySeconds(value: any): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([date, seconds]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(seconds) && (seconds as number) > 0
  )) as Record<string, number>;
}

function formatStudyDate(dateKey: string, locale: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(locale);
}

function formatStudyDateWithWeekday(dateKey: string, locale: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  const weekday = date.toLocaleDateString(locale, { weekday: "short" }).replace(/\.$/, "");
  const monthName = date.toLocaleDateString(locale, { month: "short" }).replace(/\.$/, "");
  return `${weekday} ${String(day).padStart(2, "0")} ${monthName}`;
}

function formatDateTime(timestamp: number, locale: string): string {
  return new Date(timestamp).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function daysBetweenDateKeys(earlier: string, later: string): number {
  const parse = (key: string) => key.split("-").map(Number);
  const [ey, em, ed] = parse(earlier);
  const [ly, lm, ld] = parse(later);
  return Math.max(0, Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / 86_400_000));
}

function lessonStudySummary(lesson: Lesson, today: string, t: { minutesShort: string; today: string; yesterday: string; daysAgo: string }): string {
  const entries = Object.entries(lesson.studySecondsByDate ?? {}).filter(([, seconds]) => seconds > MIN_VISIBLE_STUDY_SECONDS);
  const totalSeconds = entries.reduce((total, [, seconds]) => total + seconds, 0);
  if (entries.length === 0) return `0 ${t.minutesShort}`;
  const dates = entries.map(([date]) => date).sort();
  const lastDate = dates[dates.length - 1];
  const days = daysBetweenDateKeys(lastDate, today);
  const recency = days === 0 ? t.today : days === 1 ? t.yesterday : `${days} ${t.daysAgo}`;
  return `${Math.round(totalSeconds / 60)} ${t.minutesShort} · ${recency}`;
}

function lessonIdFromPath(pathname = window.location.pathname): string | null {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const appPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const match = appPath.match(/^\/lesson\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}

function homePath(): string {
  return import.meta.env.BASE_URL || "/";
}

function lessonPath(id: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/lesson/${encodeURIComponent(id)}`;
}

function recentStudyDateKeys(today: string, count: number): string[] {
  const [year, month, day] = today.split("-").map(Number);
  const lastDate = new Date(year, month - 1, day, 12);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(lastDate);
    date.setDate(lastDate.getDate() - (count - index - 1));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
}

function ActivityHistogram({ studySecondsByDate, today, label, minutesShort, color, mutedColor }: {
  studySecondsByDate: Record<string, number>;
  today: string;
  label: string;
  minutesShort: string;
  color: string;
  mutedColor: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [dayCount, setDayCount] = useState(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateCount = () => setDayCount(Math.max(1, Math.floor((container.clientWidth + 2) / 5)));
    updateCount();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateCount);
      return () => window.removeEventListener("resize", updateCount);
    }
    const observer = new ResizeObserver(updateCount);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const days = recentStudyDateKeys(today, dayCount);
  const secondsByDay = days.map(date => {
    const seconds = studySecondsByDate[date] ?? 0;
    return seconds > MIN_VISIBLE_STUDY_SECONDS ? seconds : 0;
  });
  const maxSeconds = Math.max(0, ...secondsByDay);
  return (
    <span ref={containerRef} role="img" aria-label={label} style={{ display: "flex", alignItems: "end", gap: 2, height: 24, width: "100%", marginTop: 7, overflow: "hidden" }}>
      {secondsByDay.map((seconds, index) => {
        const date = new Date(`${days[index]}T12:00:00`);
        const weekday = date.getDay();
        const isWeekend = weekday === 0 || weekday === 6;
        const isLastDayOfMonth = date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        return (
          <span key={days[index]} title={`${days[index]} · ${Math.round(seconds / 60)} ${minutesShort}`} style={{ position: "relative", flex: "0 0 3px", height: 24 }}>
            <span style={{ position: "absolute", top: `${isLastDayOfMonth ? 20 : 0}%`, right: 0, bottom: `${isWeekend ? 20 : 0}%`, left: 0, background: mutedColor, opacity: 0.15 }} />
            {seconds > 0 && <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.max(3, Math.round((seconds / maxSeconds) * 22)), background: color, opacity: 0.5 }} />}
          </span>
        );
      })}
    </span>
  );
}

function DailyTotalsHistogram({ studySecondsByDate, lessonCreatedOnDates, today, label, minutesShort, lessonCreatedLabel, locale, color, mutedColor, dotColor, backgroundColor }: {
  studySecondsByDate: Record<string, number>;
  lessonCreatedOnDates: ReadonlySet<string>;
  today: string;
  label: string;
  minutesShort: string;
  lessonCreatedLabel: string;
  locale: string;
  color: string;
  mutedColor: string;
  dotColor: string;
  backgroundColor: string;
}) {
  const days = recentStudyDateKeys(today, 30);
  const [selectedDate, setSelectedDate] = useState(today);
  useEffect(() => setSelectedDate(today), [today]);
  const secondsByDay = days.map(date => studySecondsByDate[date] ?? 0);
  const maxSeconds = Math.max(0, ...secondsByDay);
  const selectedSeconds = studySecondsByDate[selectedDate] ?? 0;
  const selectedDateLabel = formatStudyDateWithWeekday(selectedDate, locale);

  return (
    <>
      <div role="group" aria-label={label} style={{ display: "flex", alignItems: "end", gap: 2, height: 52, width: "100%", marginTop: 7 }}>
        {days.map((date, index) => {
          const seconds = secondsByDay[index];
          const dateObject = new Date(`${date}T12:00:00`);
          const weekday = dateObject.getDay();
          const isWeekend = weekday === 0 || weekday === 6;
          const isLastDayOfMonth = dateObject.getDate() === new Date(dateObject.getFullYear(), dateObject.getMonth() + 1, 0).getDate();
          const isSelected = date === selectedDate;
          const hasCreatedLesson = lessonCreatedOnDates.has(date);
          const dateLabel = formatStudyDateWithWeekday(date, locale);
          const minutes = Math.round(seconds / 60);
          const accessibleLabel = `${dateLabel} · ${minutes} ${minutesShort}${hasCreatedLesson ? ` · ${lessonCreatedLabel}` : ""}`;
          return (
            <button key={date} type="button" aria-label={accessibleLabel} aria-pressed={isSelected}
              title={accessibleLabel} onClick={() => setSelectedDate(date)}
              style={{ position: "relative", flex: "1 1 0", minWidth: 0, height: 52, padding: 0, border: 0, borderRadius: 2, overflow: "hidden", background: "transparent", outline: isSelected ? `1px solid ${color}` : "none", cursor: "pointer" }}>
              <span aria-hidden="true" style={{ position: "absolute", top: `${isLastDayOfMonth ? 20 : 0}%`, right: 0, bottom: `${isWeekend ? 20 : 0}%`, left: 0, background: mutedColor, opacity: 0.15 }} />
              {seconds > MIN_VISIBLE_STUDY_SECONDS && <span aria-hidden="true" style={{ position: "absolute", right: 0, bottom: 0, left: 0, height: `${Math.max(6, (seconds / maxSeconds) * 46)}px`, background: color, opacity: isSelected ? 0.85 : 0.55 }} />}
              {hasCreatedLesson && <span aria-hidden="true" style={{ position: "absolute", zIndex: 1, top: "50%", left: "50%", width: 4, height: 4, borderRadius: "50%", background: dotColor, boxShadow: `0 0 0 1px ${backgroundColor}`, transform: "translate(-50%, -50%)" }} />}
            </button>
          );
        })}
      </div>
      <div aria-live="polite" style={{ marginTop: 6, minHeight: 18, color: color, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
        {selectedDateLabel} · {Math.round(selectedSeconds / 60)} {minutesShort}{lessonCreatedOnDates.has(selectedDate) && ` · ${lessonCreatedLabel}`}
      </div>
    </>
  );
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
          randomize: lesson.randomize === true,
          createdAt: lesson.createdAt ?? Date.now(),
          updatedAt: lesson.updatedAt ?? Date.now(),
          studySecondsByDate: normalizeStudySeconds(lesson.studySecondsByDate),
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
    name: getLang() === "ru" ? "Пример — поездка" : "Sample — travel",
    wordsText,
    randomize: false,
    createdAt: now,
    updatedAt: now,
    studySecondsByDate: {},
  };
  return { lessons: [lesson], activeId: lesson.id };
}

const LANGUAGES = {
  ru: {
    settings: "Настройки",
    detailedSettings: "Подробные настройки",
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
    exportShort: "Экспорт",
    importShort: "Импорт",
    lessonDetails: "Детали урока",
    details: "Детали",
    deleteLesson: "Удалить",
    lessonName: "Название",
    created: "Создан",
    updated: "Изменён",
    date: "Дата",
    duration: "Длительность",
    noStudyTime: "Пока нет учтённого времени",
    minutesShort: "мин",
    save: "Сохранить",
    close: "Закрыть",
    today: "сегодня",
    yesterday: "вчера",
    daysAgo: "дн. назад",
    noActivity: "нет активности",
    revealNextHint: "Пробел: открыть следующую строку",
    revealNext: "Открыть следующую строку",
    autoScroll: "Автоматическая прокрутка",
    showRevealButton: "Показывать плавающую кнопку",
    revealButtonSize: "Размер кнопки (px)",
    scrollToTop: "Прокрутить наверх",
    restartReveals: "Закрыть все строки и начать заново",
    dragToMove: "Перетащите, чтобы переместить",
    lesson: "Уроки",
    complexLesson: "Сложные слова",
    size: "Размер",
    difficult: "сложных",
    activity: "Активность",
    last30Days: "Последние 30 дней",
    lessonCreated: "создан урок",
    newLesson: "Новый урок",
    lessonNamePlaceholder: "Название урока",
    copyLesson: "Скопировать слова и сложность текущего урока",
    cancel: "Отмена",
    create: "Создать",
    deleteConfirm: "Удалить урок «{name}»?",
    unsupportedBackup: "Неподдерживаемый формат файла или нет уроков",
    invalidLessonData: "Некорректные данные урока №{index}",
    importConfirm: "Импорт заменит все текущие уроки и настройки. Продолжить?",
    importSuccess: "Данные импортированы",
    importFailure: "Не удалось импортировать файл: {message}",
    importFailureUnknown: "Не удалось импортировать файл",
  },
  en: {
    settings: "Settings",
    detailedSettings: "Detailed settings",
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
    exportShort: "Export",
    importShort: "Import",
    lessonDetails: "Lesson details",
    details: "Details",
    deleteLesson: "Delete",
    lessonName: "Name",
    created: "Created",
    updated: "Edited",
    date: "Date",
    duration: "Duration",
    noStudyTime: "No study time recorded yet",
    minutesShort: "min",
    save: "Save",
    close: "Close",
    today: "today",
    yesterday: "yesterday",
    daysAgo: "d ago",
    noActivity: "no activity",
    revealNextHint: "Space: reveal the next row",
    revealNext: "Reveal the next row",
    autoScroll: "Automatic scrolling",
    showRevealButton: "Show floating button",
    revealButtonSize: "Button size (px)",
    scrollToTop: "Scroll to top",
    restartReveals: "Hide all answers and start again",
    dragToMove: "Drag to move",
    lesson: "Lessons",
    complexLesson: "Difficult words",
    size: "Size",
    difficult: "difficult",
    activity: "Activity",
    last30Days: "Last 30 days",
    lessonCreated: "lesson created",
    newLesson: "New lesson",
    lessonNamePlaceholder: "Lesson name",
    copyLesson: "Copy words and complexity from the current lesson",
    cancel: "Cancel",
    create: "Create",
    deleteConfirm: "Delete lesson “{name}”?",
    unsupportedBackup: "Unsupported file format or no lessons found",
    invalidLessonData: "Invalid data for lesson #{index}",
    importConfirm: "Importing will replace all current lessons and settings. Continue?",
    importSuccess: "Data imported",
    importFailure: "Could not import file: {message}",
    importFailureUnknown: "Could not import file",
  }
};

const getLang = () => (typeof navigator !== "undefined" && navigator.language.startsWith("ru")) ? "ru" : "en";

function loadTaps(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TAPS_KEY) ?? "{}"); }
  catch { return {}; }
}
type Theme = "day" | "night" | "auto";
interface Settings { fontSize: number; rowSpacing: number; complexRandomize: boolean; theme: Theme; soft: boolean; maxWidth: number; autoScroll: boolean; showRevealButton: boolean; revealButtonSize: number; }

function normalizeSettings(value: any): Settings {
  const p = value && typeof value === "object" ? value : {};
  const raw = p.theme;
  const theme: Theme = raw === "day" || raw === "night" || raw === "auto" ? raw : "auto";
  return {
    fontSize: Number.isFinite(p.fontSize) ? p.fontSize : 14,
    rowSpacing: Number.isFinite(p.rowSpacing) ? p.rowSpacing : 8,
    complexRandomize: typeof p.complexRandomize === "boolean" ? p.complexRandomize : false,
    theme,
    soft: typeof p.soft === "boolean" ? p.soft : true,
    maxWidth: Number.isFinite(p.maxWidth) ? p.maxWidth : 680,
    autoScroll: typeof p.autoScroll === "boolean" ? p.autoScroll : true,
    showRevealButton: typeof p.showRevealButton === "boolean" ? p.showRevealButton : true,
    revealButtonSize: Number.isFinite(p.revealButtonSize) ? Math.round(Math.min(MAX_REVEAL_BUTTON_SIZE, Math.max(MIN_REVEAL_BUTTON_SIZE, p.revealButtonSize))) : DEFAULT_REVEAL_BUTTON_SIZE,
  };
}

function loadSettings(): Settings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")); }
  catch { return normalizeSettings(null); }
}
function saveSettings(s: Settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function parseWords(text: string): Word[] {
  const words: Word[] = [];
  let group = 0;
  let separatorPending = false;
  for (const [index, rawLine] of text.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) {
      if (words.length > 0) separatorPending = true;
      continue;
    }
    const content = line.replace(/\t\d+\s*$/, "");
    let parts: string[] = [];
    if (content.includes("\t")) parts = content.split("\t");
    else if (content.includes(" — ")) parts = content.split(" — ");
    else if (content.includes(" - ")) parts = content.split(" - ");
    else continue;
    const russian = parts[0]?.trim();
    const spanish = parts[1]?.trim();
    const complexity = Number(line.match(/\t(\d+)\s*$/)?.[1] ?? 0);
    if (!russian || !spanish) continue;
    if (separatorPending) {
      group++;
      separatorPending = false;
    }
    words.push({ id: index + 1, russian, spanish, complexity, group });
  }
  return words;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleWithinGroups(words: Word[]): Word[] {
  const groups = new Map<number, Word[]>();
  for (const word of words) {
    const group = groups.get(word.group) ?? [];
    group.push(word);
    groups.set(word.group, group);
  }
  return [...groups.values()].flatMap(shuffle);
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
  const [sourceRevealed, setSourceRevealed] = useState(false);
  const lines = value.split("\n").length;
  const syncScroll = () => {
    if (taRef.current && numRef.current) numRef.current.scrollTop = taRef.current.scrollTop;
  };
  return (
    <div style={{ display: "flex", border: `1px solid ${p.fgVeryMuted}`, fontFamily: "monospace", fontSize: 12, lineHeight: "1.5", background: p.bg, maxHeight: maxHeight ?? undefined, overflow: "hidden" }}>
      <div ref={numRef} style={{ padding: "4px 6px", color: p.fgVeryMuted, textAlign: "right", userSelect: "none", overflow: "hidden", minWidth: 28, background: p.divider, borderRight: `1px solid ${p.divider}`, whiteSpace: "pre", filter: sourceRevealed ? undefined : "blur(5px)" }}>
        {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
      </div>
      <textarea
        ref={taRef}
        data-testid="input-words"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setSourceRevealed(true)}
        onBlur={e => onBlur(e.target.value)}
        onScroll={syncScroll}
        style={{ flex: 1, padding: "4px 6px", fontSize: 12, fontFamily: "monospace", lineHeight: "1.5", border: "none", outline: "none", resize: "none", boxSizing: "border-box", background: p.bg, color: p.fg, height: maxHeight ?? "auto", overflowY: "auto", filter: sourceRevealed ? undefined : "blur(5px)" }}
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
        aria-label={`${t.complexity} ${rk}: ${count}`}
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
  const requestedLessonId = lessonIdFromPath();
  const [lessonState, setLessonState] = useState<LessonState>(() => {
    const state = loadLessonState();
    if (requestedLessonId && requestedLessonId !== COMPLEX_LESSON_ID && state.lessons.some(lesson => lesson.id === requestedLessonId)) state.activeId = requestedLessonId;
    return state;
  });
  const requestedLessonExists = requestedLessonId === COMPLEX_LESSON_ID || Boolean(requestedLessonId && lessonState.lessons.some(lesson => lesson.id === requestedLessonId));
  const [isComplexLesson, setIsComplexLesson] = useState(requestedLessonId === COMPLEX_LESSON_ID);
  const [showHome, setShowHome] = useState(() => !requestedLessonExists);
  const lessonStateRef = useRef(lessonState);
  lessonStateRef.current = lessonState;
  const showHomeRef = useRef(showHome);
  showHomeRef.current = showHome;
  const activeLesson = lessonState.lessons.find(lesson => lesson.id === lessonState.activeId) ?? lessonState.lessons[0];
  const [complexStudySecondsByDate, setComplexStudySecondsByDate] = useState<Record<string, number>>(loadComplexStudySeconds);
  const t = LANGUAGES[getLang()];
  const wordsText = activeLesson.wordsText;
  const inverted = isInverted(wordsText);
  const lessonWordsSignature = lessonState.lessons.map(lesson => `${lesson.id}\u0000${lesson.wordsText}`).join("\u0001");
  const words = useMemo(() => {
    if (!isComplexLesson) return parseWords(wordsText);
    let nextId = 0;
    let groupOffset = 0;
    return [...lessonState.lessons].sort((a, b) => b.createdAt - a.createdAt).flatMap(lesson => {
      const sourceWords = parseWords(lesson.wordsText);
      const swapDirection = isInverted(lesson.wordsText) !== inverted;
      const mapped = sourceWords.map(word => ({
        ...word,
        id: ++nextId,
        russian: swapDirection ? word.spanish : word.russian,
        spanish: swapDirection ? word.russian : word.spanish,
        group: word.group + groupOffset,
        key: `${lesson.id}:${word.id}`,
        sourceLessonId: lesson.id,
        sourceLineId: word.id,
      }));
      groupOffset += Math.max(0, ...sourceWords.map(word => word.group)) + 1;
      return mapped;
    });
  }, [isComplexLesson, wordsText, inverted, lessonWordsSignature]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [revealButtonSizeDraft, setRevealButtonSizeDraft] = useState(String(settings.revealButtonSize));
  const revealButtonSize = Math.min(MAX_REVEAL_BUTTON_SIZE, Math.max(MIN_REVEAL_BUTTON_SIZE, settings.revealButtonSize));
  const [createLessonOpen, setCreateLessonOpen] = useState(false);
  const [lessonDetailsOpen, setLessonDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyLesson, setCopyLesson] = useState(false);
  const [newLessonName, setNewLessonName] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const studyRemaindersRef = useRef<Record<string, number>>({});
  const activityRef = useRef({
    lessonId: lessonState.activeId,
    lastActivityAt: 0,
    accountedUntil: Date.now(),
    visible: typeof document === "undefined" || document.visibilityState === "visible",
  });
  const randomize = isComplexLesson ? settings.complexRandomize : activeLesson.randomize;
  const randomOrderContext = isComplexLesson ? COMPLEX_LESSON_ID : activeLesson.id;
  const [shuffledWords, setShuffledWords] = useState<Word[]>(() =>
    randomize ? shuffleWithinGroups(words) : []
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [allRevealed, setAllRevealed] = useState(false);
  const [revealButtonPosition, setRevealButtonPosition] = useState<{ left: number; top: number } | null>(() => {
    try {
      const position = JSON.parse(localStorage.getItem(REVEAL_BUTTON_POSITION_KEY) ?? "null");
      return Number.isFinite(position?.left) && Number.isFinite(position?.top) ? position : null;
    } catch { return null; }
  });
  const revealButtonDragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressRevealButtonClickRef = useRef(false);
  const revealScrollFrameRef = useRef<number | null>(null);
  const revealScrollTargetRef = useRef<number | null>(null);
  const revealControlActionRef = useRef<() => void>(() => {});
  const scrollYRef = useRef(typeof window === "undefined" ? 0 : window.scrollY);
  const [isAtTop, setIsAtTop] = useState(() => typeof window === "undefined" || window.scrollY <= 1);

  const accrueStudyTime = useCallback((now: number) => {
    const tracker = activityRef.current;
    const lessonId = tracker.lessonId;
    const additions: Record<string, number> = {};
    if (tracker.visible && tracker.lastActivityAt > 0) {
      const from = Math.max(tracker.accountedUntil, tracker.lastActivityAt);
      const until = Math.min(now, tracker.lastActivityAt + IDLE_TIMEOUT_MS);
      if (until > from) {
        for (const segment of splitStudyInterval(from, until)) {
          const remainderKey = `${lessonId}|${segment.date}`;
          const totalMs = (studyRemaindersRef.current[remainderKey] ?? 0) + segment.milliseconds;
          const seconds = Math.floor(totalMs / 1000);
          studyRemaindersRef.current[remainderKey] = totalMs - seconds * 1000;
          if (seconds > 0) additions[segment.date] = (additions[segment.date] ?? 0) + seconds;
        }
      }
    }
    tracker.accountedUntil = Math.max(tracker.accountedUntil, now);
    if (Object.keys(additions).length > 0) {
      if (lessonId === COMPLEX_LESSON_ID) {
        setComplexStudySecondsByDate(current => ({
          ...current,
          ...Object.fromEntries(Object.entries(additions).map(([date, seconds]) => [date, (current[date] ?? 0) + seconds])),
        }));
      } else {
        setLessonState(state => ({
          ...state,
          lessons: state.lessons.map(lesson => lesson.id === lessonId
            ? { ...lesson, studySecondsByDate: { ...(lesson.studySecondsByDate ?? {}), ...Object.fromEntries(Object.entries(additions).map(([date, seconds]) => [date, (lesson.studySecondsByDate?.[date] ?? 0) + seconds])) } }
            : lesson),
        }));
      }
    }
  }, []);

  const recordActivity = useCallback(() => {
    const tracker = activityRef.current;
    if (showHomeRef.current || !tracker.visible || document.visibilityState !== "visible") return;
    const now = Date.now();
    accrueStudyTime(now);
    tracker.lastActivityAt = now;
    tracker.accountedUntil = now;
  }, [accrueStudyTime]);

  useEffect(() => { setRevealButtonSizeDraft(String(settings.revealButtonSize)); }, [settings.revealButtonSize]);
  useEffect(() => {
    localStorage.setItem(LESSONS_KEY, JSON.stringify({ lessons: lessonState.lessons }));
    localStorage.setItem(ACTIVE_LESSON_KEY, activeLesson.id);
  }, [lessonState, activeLesson.id]);
  useEffect(() => {
    localStorage.setItem(COMPLEX_STUDY_KEY, JSON.stringify(complexStudySecondsByDate));
  }, [complexStudySecondsByDate]);

  useEffect(() => {
    const syncRoute = () => {
      const lessonId = lessonIdFromPath();
      if (!lessonId) {
        setIsComplexLesson(false);
        setShowHome(true);
      } else if (lessonId === COMPLEX_LESSON_ID) {
        setIsComplexLesson(true);
        setShowHome(false);
      } else if (lessonStateRef.current.lessons.some(lesson => lesson.id === lessonId)) {
        setLessonState(state => ({ ...state, activeId: lessonId }));
        setIsComplexLesson(false);
        setShowHome(false);
      } else {
        window.history.replaceState(null, "", homePath());
        setIsComplexLesson(false);
        setShowHome(true);
      }
      setRevealed(new Set());
      setAllRevealed(false);
      setFilterLevel(lessonIdFromPath() === COMPLEX_LESSON_ID ? 1 : 0);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);
  useEffect(() => { saveSettings(settings); }, [settings]);

  useEffect(() => {
    const tick = () => accrueStudyTime(Date.now());
    const onVisibilityChange = () => {
      const tracker = activityRef.current;
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        accrueStudyTime(now);
        tracker.visible = false;
        tracker.lastActivityAt = 0;
        tracker.accountedUntil = now;
      } else {
        tracker.visible = true;
        tracker.lastActivityAt = 0;
        tracker.accountedUntil = now;
      }
    };
    const onPageHide = () => {
      const tracker = activityRef.current;
      accrueStudyTime(Date.now());
      tracker.visible = false;
      tracker.lastActivityAt = 0;
    };
    const onPageShow = () => {
      const tracker = activityRef.current;
      tracker.visible = document.visibilityState === "visible";
      tracker.lastActivityAt = 0;
      tracker.accountedUntil = Date.now();
    };
    document.addEventListener("pointermove", recordActivity, { passive: true });
    document.addEventListener("pointerdown", recordActivity, { passive: true });
    document.addEventListener("scroll", recordActivity, { passive: true, capture: true });
    document.addEventListener("keydown", recordActivity);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    const interval = window.setInterval(tick, 1000);
    return () => {
      accrueStudyTime(Date.now());
      window.clearInterval(interval);
      document.removeEventListener("pointermove", recordActivity);
      document.removeEventListener("pointerdown", recordActivity);
      document.removeEventListener("scroll", recordActivity, true);
      document.removeEventListener("keydown", recordActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [accrueStudyTime, recordActivity]);

  useEffect(() => {
    if (!showHome) return;
    const tracker = activityRef.current;
    const now = Date.now();
    accrueStudyTime(now);
    tracker.lastActivityAt = 0;
    tracker.accountedUntil = now;
  }, [showHome, accrueStudyTime]);

  const activeStudyId = isComplexLesson ? COMPLEX_LESSON_ID : activeLesson.id;
  useEffect(() => {
    const tracker = activityRef.current;
    if (tracker.lessonId === activeStudyId) return;
    const now = Date.now();
    const wasActive = tracker.visible && tracker.lastActivityAt > 0 && now - tracker.lastActivityAt <= IDLE_TIMEOUT_MS;
    accrueStudyTime(now);
    tracker.lessonId = activeStudyId;
    tracker.accountedUntil = now;
    tracker.lastActivityAt = wasActive ? now : 0;
  }, [activeStudyId, accrueStudyTime]);

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

  const wordOrderSignature = JSON.stringify(words.map(word => [word.key ?? word.id, word.russian, word.spanish, word.group]));

  const handleRandomize = (val: boolean) => {
    if (val) setShuffledWords(shuffleWithinGroups(words));
    if (isComplexLesson) setSettings(s => ({ ...s, complexRandomize: val }));
    else updateActiveLesson(lesson => ({ ...lesson, randomize: val }), false);
  };

  const baseWords = useMemo(() => {
    if (!randomize) return words;
    const wordsByOrderKey = new Map(words.map(word => [word.key ?? word.id, word]));
    return shuffledWords
      .map(word => wordsByOrderKey.get(word.key ?? word.id))
      .filter((word): word is Word => word !== undefined);
  }, [randomize, shuffledWords, words]);

  useEffect(() => {
    if (randomize) setShuffledWords(shuffleWithinGroups(words));
  }, [wordOrderSignature, randomize, randomOrderContext]);

  // Filter — not persisted, resets on page reload
  const [filterLevel, setFilterLevel] = useState(isComplexLesson ? 1 : 0);
  const maxComplexity = useMemo(
    () => Math.max(isComplexLesson ? 1 : 0, ...baseWords.map(word => word.complexity)),
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

  const nextHiddenWord = displayWords.find(word => !revealed.has(wordIdentity(word)));
  const revealNext = useCallback(() => {
    if (!nextHiddenWord) return false;
    setRevealed(previous => new Set(previous).add(wordIdentity(nextHiddenWord)));
    if (!displayWords.some(word => wordIdentity(word) !== wordIdentity(nextHiddenWord) && !revealed.has(wordIdentity(word)))) setAllRevealed(true);
    return true;
  }, [displayWords, nextHiddenWord, revealed]);

  const animateScrollTo = (targetY: number, durationMs = 2000) => {
    if (revealScrollFrameRef.current !== null) cancelAnimationFrame(revealScrollFrameRef.current);
    const startY = window.scrollY;
    revealScrollTargetRef.current = targetY;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, targetY);
      revealScrollFrameRef.current = null;
      revealScrollTargetRef.current = null;
      return;
    }
    const startTime = performance.now();
    const duration = durationMs;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
      window.scrollTo(0, startY + (targetY - startY) * eased);
      if (progress < 1) revealScrollFrameRef.current = requestAnimationFrame(animate);
      else {
        revealScrollFrameRef.current = null;
        revealScrollTargetRef.current = null;
      }
    };
    revealScrollFrameRef.current = requestAnimationFrame(animate);
  };

  const scrollByRevealHeight = (height: number) => {
    const currentTarget = revealScrollFrameRef.current !== null ? revealScrollTargetRef.current ?? window.scrollY : window.scrollY;
    animateScrollTo(currentTarget + height);
  };

  const revealNextFromButton = () => {
    if (!nextHiddenWord) return;
    const row = document.querySelector<HTMLElement>(`[data-testid="row-word-${nextHiddenWord.id}"]`);
    const answer = row?.querySelector<HTMLElement>(".answer-reveal");
    if (!revealNext() || !settings.autoScroll || !row || !answer) return;

    let finished = false;
    let fallbackTimer = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      answer.removeEventListener("transitionend", onTransitionEnd);
      requestAnimationFrame(() => {
        const rowHeight = row.getBoundingClientRect().height;
        if (settingsRef.current.autoScroll && rowHeight > 0) scrollByRevealHeight(rowHeight);
      });
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === answer && event.propertyName === "grid-template-rows") finish();
    };
    answer.addEventListener("transitionend", onTransitionEnd);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(finish);
    else fallbackTimer = window.setTimeout(finish, REVEAL_TRANSITION_MS + 50);
  };

  const hasHiddenWords = nextHiddenWord !== undefined;
  const handleRevealControlAction = () => {
    if (hasHiddenWords) {
      revealNextFromButton();
    } else if (settings.autoScroll && scrollYRef.current > 1) {
      animateScrollTo(0, SCROLL_TO_TOP_DURATION_MS);
    } else {
      setRevealed(new Set());
      setAllRevealed(false);
    }
  };
  revealControlActionRef.current = handleRevealControlAction;

  useEffect(() => () => {
    if (revealScrollFrameRef.current !== null) cancelAnimationFrame(revealScrollFrameRef.current);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY;
      scrollYRef.current = scrollY;
      setIsAtTop(current => current === (scrollY <= 1) ? current : scrollY <= 1);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const clampPosition = () => setRevealButtonPosition(position => position ? {
      left: Math.max(0, Math.min(position.left, window.innerWidth - revealButtonSize)),
      top: Math.max(0, Math.min(position.top, window.innerHeight - revealButtonSize)),
    } : null);
    clampPosition();
    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, [revealButtonSize]);

  const startRevealButtonDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    revealButtonDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveRevealButton = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = revealButtonDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    setRevealButtonPosition({
      left: Math.max(0, Math.min(drag.left + deltaX, window.innerWidth - event.currentTarget.offsetWidth)),
      top: Math.max(0, Math.min(drag.top + deltaY, window.innerHeight - event.currentTarget.offsetHeight)),
    });
  };

  const finishRevealButtonDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = revealButtonDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      if (event.type === "pointerup") {
        suppressRevealButtonClickRef.current = true;
        window.setTimeout(() => { suppressRevealButtonClickRef.current = false; }, 500);
      }
      const position = {
        left: Math.max(0, Math.min(drag.left + event.clientX - drag.startX, window.innerWidth - event.currentTarget.offsetWidth)),
        top: Math.max(0, Math.min(drag.top + event.clientY - drag.startY, window.innerHeight - event.currentTarget.offsetHeight)),
      };
      setRevealButtonPosition(position);
      try { localStorage.setItem(REVEAL_BUTTON_POSITION_KEY, JSON.stringify(position)); } catch { /* position is still available for this session */ }
    }
    revealButtonDragRef.current = null;
  };

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || createLessonOpen || lessonDetailsOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, button, summary, a, [contenteditable='true'], [role='button']")) return;
      event.preventDefault();
      revealControlActionRef.current();
    };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [createLessonOpen, lessonDetailsOpen]);

  const openLesson = (lessonId: string, replace = false) => {
    if (replace) window.history.replaceState(null, "", lessonPath(lessonId));
    else window.history.pushState(null, "", lessonPath(lessonId));
    if (lessonId !== COMPLEX_LESSON_ID) setLessonState(state => ({ ...state, activeId: lessonId }));
    setIsComplexLesson(lessonId === COMPLEX_LESSON_ID);
    setRevealed(new Set());
    setAllRevealed(false);
    setFilterLevel(lessonId === COMPLEX_LESSON_ID ? 1 : 0);
    setShowHome(false);
  };

  const openHome = () => {
    window.history.pushState(null, "", homePath());
    setIsComplexLesson(false);
    setShowHome(true);
  };

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
      randomize: copyLesson ? activeLesson.randomize : false,
      createdAt: now,
      updatedAt: now,
      studySecondsByDate: {},
    };
    setLessonState(state => ({ lessons: [...state.lessons, lesson], activeId: lesson.id }));
    openLesson(lesson.id);
    setNewLessonName("");
    setCopyLesson(true);
    setCreateLessonOpen(false);
    setRevealed(new Set());
    setFilterLevel(0);
  };

  const saveLessonName = () => {
    const name = newLessonName.trim();
    if (!name) return;
    if (name !== activeLesson.name) {
      setLessonState(state => ({
        ...state,
        lessons: state.lessons.map(lesson => lesson.id === state.activeId ? { ...lesson, name, updatedAt: Date.now() } : lesson),
      }));
    }
    setNewLessonName(name);
  };

  const deleteCurrentLesson = () => {
    if (lessonState.lessons.length <= 1 || !window.confirm(t.deleteConfirm.replace("{name}", activeLesson.name))) return;
    const index = lessonState.lessons.findIndex(lesson => lesson.id === activeLesson.id);
    const remaining = lessonState.lessons.filter(lesson => lesson.id !== activeLesson.id);
    setLessonState({ lessons: remaining, activeId: remaining[Math.max(0, index - 1)].id });
    setLessonDetailsOpen(false);
    setRevealed(new Set());
    setAllRevealed(false);
    setFilterLevel(0);
  };

  const toggleReveal = useCallback((key: string) => {
    setRevealed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  const toggleAll = () => {
    if (allRevealed) { setRevealed(new Set()); }
    else { setRevealed(new Set(displayWords.map(wordIdentity))); }
    setAllRevealed(a => !a);
  };

  const changeTap = (lineId: string, change: (value: number) => number) => {
    if (isComplexLesson) {
      const sourceWord = words.find(word => wordIdentity(word) === lineId);
      if (!sourceWord?.sourceLessonId || !sourceWord.sourceLineId) return;
      setLessonState(state => ({
        ...state,
        lessons: state.lessons.map(lesson => {
          if (lesson.id !== sourceWord.sourceLessonId) return lesson;
          const currentWord = parseWords(lesson.wordsText).find(word => word.id === sourceWord.sourceLineId);
          if (!currentWord) return lesson;
          return {
            ...lesson,
            updatedAt: Date.now(),
            wordsText: setLineComplexity(lesson.wordsText, sourceWord.sourceLineId!, Math.max(0, change(currentWord.complexity))),
          };
        }),
      }));
      return;
    }
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
  const resetAll = () => {
    if (isComplexLesson) {
      const updatedAt = Date.now();
      setLessonState(state => ({
        ...state,
        lessons: state.lessons.map(lesson => ({
          ...lesson,
          updatedAt,
          wordsText: parseWords(lesson.wordsText).reduce((text, word) => setLineComplexity(text, word.id, 0), lesson.wordsText),
        })),
      }));
      return;
    }
    updateActiveLesson(lesson => ({
      ...lesson,
      wordsText: parseWords(lesson.wordsText).reduce((text, word) => setLineComplexity(text, word.id, 0), lesson.wordsText),
    }));
  };

  const exportData = () => {
    const backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      lessons: lessonState.lessons,
      activeLessonId: activeLesson.id,
      complexStudySecondsByDate,
      settings,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zubrit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = async (file: File) => {
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== BACKUP_FORMAT || backup?.version !== BACKUP_VERSION || !Array.isArray(backup.lessons) || backup.lessons.length === 0) {
        throw new Error(t.unsupportedBackup);
      }
      const now = Date.now();
      const ids = new Set<string>();
      const lessons: Lesson[] = backup.lessons.map((item: any, index: number) => {
        if (!item || typeof item.name !== "string" || !item.name.trim() || typeof item.wordsText !== "string") {
          throw new Error(t.invalidLessonData.replace("{index}", String(index + 1)));
        }
        let id = typeof item.id === "string" && item.id ? item.id : `import-${now}-${index}`;
        while (ids.has(id)) id = `${id}-${index + 1}`;
        ids.add(id);
        return {
          id,
          name: item.name,
          wordsText: item.wordsText,
          randomize: item.randomize === true,
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now,
          updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now,
          studySecondsByDate: normalizeStudySeconds(item.studySecondsByDate),
        };
      });
      if (!window.confirm(t.importConfirm)) return;
      const activeId = lessons.some(lesson => lesson.id === backup.activeLessonId) ? backup.activeLessonId : lessons[0].id;
      setLessonState({ lessons, activeId });
      setComplexStudySecondsByDate(normalizeStudySeconds(backup.complexStudySecondsByDate));
      setSettings(normalizeSettings(backup.settings));
      setRevealed(new Set());
      setAllRevealed(false);
      setFilterLevel(0);
      window.alert(t.importSuccess);
    } catch (error) {
      window.alert(error instanceof Error ? t.importFailure.replace("{message}", error.message) : t.importFailureUnknown);
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

  const revealedCount = displayWords.filter(word => revealed.has(wordIdentity(word))).length;
  const totalCount = displayWords.length;
  const pct = totalCount > 0 ? Math.round((revealedCount / totalCount) * 100) : 0;

  const languagePair = wordsText.match(/^\s*#lang\s+(\S+)\s+(.+?)\s*$/m);
  const firstLanguage = languagePair?.[1] ?? t.russian;
  const secondLanguage = languagePair?.[2] ?? t.spanish;
  const todayStudyDate = studyDateKey(Date.now());
  const allStudySecondsByDate = useMemo(() => {
    const totals = { ...complexStudySecondsByDate };
    for (const lesson of lessonState.lessons) {
      for (const [date, seconds] of Object.entries(lesson.studySecondsByDate ?? {})) {
        totals[date] = (totals[date] ?? 0) + seconds;
      }
    }
    return totals;
  }, [lessonState.lessons, complexStudySecondsByDate]);
  const lessonCreatedOnDates = useMemo(() => new Set(lessonState.lessons.map(lesson => studyDateKey(lesson.createdAt))), [lessonState.lessons]);
  const sortedLessons = [...lessonState.lessons].sort((a, b) => b.createdAt - a.createdAt);
  const buttonOffersTop = settings.autoScroll && !isAtTop;
  const revealButtonLabel = hasHiddenWords ? t.revealNext : buttonOffersTop ? t.scrollToTop : t.restartReveals;
  const revealButtonIcon = hasHiddenWords ? "↓" : buttonOffersTop ? "↑" : "↻";
  const revealButtonTitle = `${revealButtonLabel}${hasHiddenWords ? ` · ${t.revealNextHint}` : ""} · ${t.dragToMove}`;

  if (showHome) {
    const allHomeWords = lessonState.lessons.flatMap(lesson => parseWords(lesson.wordsText));
    const complexWordCount = allHomeWords.filter(word => word.complexity > 0).length;
    const complexStudyEntries = Object.entries(complexStudySecondsByDate).filter(([, seconds]) => seconds > MIN_VISIBLE_STUDY_SECONDS);
    const complexTotalMinutes = Math.round(complexStudyEntries.reduce((sum, [, seconds]) => sum + seconds, 0) / 60);
    const complexLastDate = complexStudyEntries.map(([date]) => date).sort().at(-1);
    const complexRecency = complexLastDate
      ? (() => { const days = daysBetweenDateKeys(complexLastDate, todayStudyDate); return days === 0 ? t.today : days === 1 ? t.yesterday : `${days} ${t.daysAgo}`; })()
      : "";
    return (
      <>
        <style>{`body { background: ${p.bg}; color: ${p.fg}; } .zc { padding: 1.5rem; padding-bottom: 24px; max-width: ${settings.maxWidth}px; margin: 0 auto; } @media (max-width: 600px) { .zc { padding: 1.5rem 0.75rem; padding-bottom: 24px; } }`}</style>
        <main className="zc">
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: "1rem" }}>
            <span style={{ fontSize: 13, color: p.fgMuted }}>{t.lesson}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
              <button type="button" onClick={() => { setNewLessonName(suggestedLessonName(activeLesson.name)); setCreateLessonOpen(true); }} style={lnk}>+ {t.newLesson}</button>
              <button type="button" onClick={() => importInputRef.current?.click()} style={lnk}>{t.importShort}</button>
              <button type="button" onClick={exportData} style={lnk}>{t.exportShort}</button>
            </div>
          </header>
          <input ref={importInputRef} type="file" accept=".json,application/json" hidden onChange={event => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            input.value = "";
            if (file) void importData(file);
          }} />
          <section style={{ marginBottom: 18 }}>
            <div style={{ color: p.fgMuted, fontSize: 12 }}>{t.activity} · {t.last30Days}</div>
            <DailyTotalsHistogram studySecondsByDate={allStudySecondsByDate} lessonCreatedOnDates={lessonCreatedOnDates} today={todayStudyDate} label={`${t.activity} · ${t.last30Days}`} minutesShort={t.minutesShort} lessonCreatedLabel={t.lessonCreated} locale={getLang() === "ru" ? "ru-RU" : "en-US"} color={p.fgMuted} mutedColor={p.fgVeryMuted} dotColor={p.fg} backgroundColor={p.bg} />
          </section>
          <div>
            {allHomeWords.length > 0 && <button type="button" onClick={() => openLesson(COMPLEX_LESSON_ID)}
              aria-label={`${t.complexLesson}. ${t.size} ${allHomeWords.length}${complexWordCount > 0 ? `, ${complexWordCount} ${t.difficult}` : ""}`}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 0", color: p.fg, background: "none", border: "none", cursor: "pointer" }}>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 14 }}>
                <span>{t.complexLesson}</span>
                <span style={{ color: p.fgMuted, fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {t.size} {allHomeWords.length}{complexWordCount > 0 && `, ${complexWordCount} ${t.difficult}`} · {complexTotalMinutes} {t.minutesShort}
                  {complexRecency && <> · {complexRecency}</>}
                </span>
              </span>
              <ActivityHistogram studySecondsByDate={complexStudySecondsByDate} today={todayStudyDate} label={t.activity} minutesShort={t.minutesShort} color={p.fgMuted} mutedColor={p.fgVeryMuted} />
            </button>}
            {sortedLessons.map((lesson, index) => {
              const lessonWords = parseWords(lesson.wordsText);
              const complexCount = lessonWords.filter(word => word.complexity > 0).length;
              const studyEntries = Object.entries(lesson.studySecondsByDate ?? {}).filter(([, seconds]) => seconds > MIN_VISIBLE_STUDY_SECONDS);
              const totalMinutes = Math.round(studyEntries.reduce((sum, [, seconds]) => sum + seconds, 0) / 60);
              const lastDate = studyEntries.map(([date]) => date).sort().at(-1);
              let recency = "";
              if (lastDate) {
                const days = daysBetweenDateKeys(lastDate, todayStudyDate);
                recency = days === 0 ? t.today : days === 1 ? t.yesterday : `${days} ${t.daysAgo}`;
              }
              return (
                <button key={lesson.id} type="button" onClick={() => {
                  openLesson(lesson.id);
                }} aria-label={`${lesson.name}. ${t.size} ${lessonWords.length}${complexCount > 0 ? `, ${complexCount} ${t.difficult}` : ""}`}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 0", color: p.fg, background: "none", border: "none", cursor: "pointer" }}>
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 14 }}>
                    <span>{sortedLessons.length - index}. {lesson.name}</span>
                    <span style={{ color: p.fgMuted, fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {t.size} {lessonWords.length}{complexCount > 0 && `, ${complexCount} ${t.difficult}`}{" · "}{totalMinutes} {t.minutesShort}
                      {recency && <> · {recency}</>}
                    </span>
                  </span>
                  <ActivityHistogram studySecondsByDate={lesson.studySecondsByDate ?? {}} today={todayStudyDate} label={t.activity} minutesShort={t.minutesShort} color={p.fgMuted} mutedColor={p.fgVeryMuted} />
                </button>
              );
            })}
          </div>
        </main>
        {createLessonOpen && <div role="dialog" aria-modal="true" aria-label={t.newLesson} style={{ position: "fixed", inset: 0, zIndex: 100, background: "#0008", display: "grid", placeItems: "center", padding: 16 }}>
          <form onSubmit={event => { event.preventDefault(); createLesson(); }} style={{ width: "min(360px, 100%)", padding: 20, background: p.settingsBg, border: `1px solid ${p.menuBorder}`, color: p.fg, display: "flex", flexDirection: "column", gap: 12 }}>
            <strong>{t.newLesson}</strong>
            <input autoFocus value={newLessonName} onChange={event => setNewLessonName(event.target.value)} placeholder={t.lessonNamePlaceholder} required style={{ padding: 8, color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }} />
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={copyLesson} onChange={event => setCopyLesson(event.target.checked)} />{t.copyLesson}</label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button type="button" onClick={() => setCreateLessonOpen(false)} style={lnk}>{t.cancel}</button>
              <button type="submit" style={lnk}>{t.create}</button>
            </div>
          </form>
        </div>}
      </>
    );
  }

  return (
    <>
      <style>{`
        body { background: ${p.bg}; color: ${p.fg}; }
        .zc { padding: 1.5rem; padding-bottom: 100vh; max-width: ${settings.maxWidth}px; margin: 0 auto; }
        @media (max-width: 600px) { .zc { padding: 1.5rem 0.75rem; padding-bottom: 100vh; } }
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
        .answer-reveal { position: relative; display: grid; grid-template-rows: 0fr; min-height: 0.6em; transition: grid-template-rows ${REVEAL_TRANSITION_MS}ms ease; }
        .answer-reveal.is-open { grid-template-rows: 1fr; }
        .answer-reveal__content { min-height: 0; overflow: hidden; opacity: 0; transform: translateY(-2px); transition: opacity 150ms ease, transform ${REVEAL_TRANSITION_MS}ms ease; }
        .answer-reveal.is-open .answer-reveal__content { opacity: 1; transform: translateY(0); }
        .answer-reveal__placeholder { position: absolute; left: 0; top: 50%; width: 4em; height: 0.6em; transform: translateY(-50%); transition: opacity 120ms ease; }
        .answer-reveal.is-open .answer-reveal__placeholder { opacity: 0; }
        @media (prefers-reduced-motion: reduce) { .answer-reveal, .answer-reveal__content, .answer-reveal__placeholder { transition: none; } }
        @media (max-width: 600px) { .zw { display: none; } }
      `}</style>

      <div className="zc">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: "1rem" }}>
          <select aria-label={t.lesson} value={isComplexLesson ? COMPLEX_LESSON_ID : activeLesson.id} onChange={event => {
            if (event.target.value === "__home__") {
              openHome();
              return;
            }
            openLesson(event.target.value, true);
          }} style={{ maxWidth: "70%", padding: "6px 8px", color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }}>
            <option value="__home__">{t.lesson}</option>
            <option value={COMPLEX_LESSON_ID}>{t.complexLesson}</option>
            {sortedLessons.map((lesson, index) => <option key={lesson.id} value={lesson.id}>{sortedLessons.length - index}. {lesson.name} — {lessonStudySummary(lesson, todayStudyDate, t)}</option>)}
          </select>
          {!isComplexLesson && <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={() => { setNewLessonName(activeLesson.name); setLessonDetailsOpen(true); }} style={lnk}>{t.details}</button>
          </div>}
        </div>

        {lessonDetailsOpen && <div role="dialog" aria-modal="true" aria-label={t.lessonDetails} style={{ position: "fixed", inset: 0, zIndex: 100, background: "#0008", display: "grid", placeItems: "center", padding: 16 }}>
          <form onSubmit={event => { event.preventDefault(); saveLessonName(); }} style={{ width: "min(480px, 100%)", maxHeight: "85vh", overflowY: "auto", padding: 20, background: p.settingsBg, border: `1px solid ${p.menuBorder}`, color: p.fg, display: "flex", flexDirection: "column", gap: 14 }}>
            <strong>{t.lessonDetails}</strong>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ color: p.fgMuted }}>{t.lessonName}</span>
              <input autoFocus value={newLessonName} onChange={event => setNewLessonName(event.target.value)} required style={{ padding: 8, color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 13 }}>
              <span style={{ color: p.fgMuted }}>{t.created}:</span><span>{formatDateTime(activeLesson.createdAt, getLang() === "ru" ? "ru-RU" : "en-US")}</span>
              <span style={{ color: p.fgMuted }}>{t.updated}:</span><span>{formatDateTime(activeLesson.updatedAt, getLang() === "ru" ? "ru-RU" : "en-US")}</span>
            </div>
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: p.fgMuted, textAlign: "left" }}>
                  <th style={{ padding: "6px 8px 6px 0", fontWeight: "normal" }}>{t.date}</th>
                  <th style={{ padding: "6px 0", fontWeight: "normal", textAlign: "right" }}>{t.duration}</th>
                </tr></thead>
                <tbody>
                  {Object.entries(activeLesson.studySecondsByDate ?? {}).filter(([, seconds]) => seconds > MIN_VISIBLE_STUDY_SECONDS).sort(([dateA], [dateB]) => dateB.localeCompare(dateA)).map(([date, seconds]) => (
                    <tr key={date} style={{ borderTop: `1px solid ${p.divider}` }}>
                      <td style={{ padding: "7px 8px 7px 0" }}>{formatStudyDate(date, getLang() === "ru" ? "ru-RU" : "en-US")}</td>
                      <td style={{ padding: "7px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(seconds / 60)} {t.minutesShort}</td>
                    </tr>
                  ))}
                  {Object.values(activeLesson.studySecondsByDate ?? {}).every(seconds => seconds <= MIN_VISIBLE_STUDY_SECONDS) && <tr><td colSpan={2} style={{ padding: "8px 0", color: p.fgMuted }}>{t.noStudyTime}</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <button type="button" disabled={lessonState.lessons.length <= 1} onClick={deleteCurrentLesson}
                style={{ ...lnk, color: "#c0392b", opacity: lessonState.lessons.length <= 1 ? 0.4 : 1 }}>{t.deleteLesson}</button>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setLessonDetailsOpen(false)} style={lnk}>{t.close}</button>
                <button type="submit" style={lnk}>{t.save}</button>
              </div>
            </div>
          </form>
        </div>}

        {createLessonOpen && <div role="dialog" aria-modal="true" aria-label={t.newLesson} style={{ position: "fixed", inset: 0, zIndex: 100, background: "#0008", display: "grid", placeItems: "center", padding: 16 }}>
          <form onSubmit={event => { event.preventDefault(); createLesson(); }} style={{ width: "min(360px, 100%)", padding: 20, background: p.settingsBg, border: `1px solid ${p.menuBorder}`, color: p.fg, display: "flex", flexDirection: "column", gap: 12 }}>
            <strong>{t.newLesson}</strong>
            <input autoFocus value={newLessonName} onChange={event => setNewLessonName(event.target.value)} placeholder={t.lessonNamePlaceholder} required style={{ padding: 8, color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }} />
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={copyLesson} onChange={event => setCopyLesson(event.target.checked)} />{t.copyLesson}</label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button type="button" onClick={() => setCreateLessonOpen(false)} style={lnk}>{t.cancel}</button>
              <button type="submit" style={lnk}>{t.create}</button>
            </div>
          </form>
        </div>}

        {/* Sticky settings / progress header */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, padding: "8px 0", marginBottom: settingsOpen ? "0.5rem" : "1.25rem", background: p.bg, borderBottom: `1px solid ${p.divider}` }}>
          <button type="button" aria-expanded={settingsOpen} aria-controls="vocab-settings-panel" onClick={() => setSettingsOpen(open => !open)}
            style={{ background: "none", border: "none", padding: 0, justifySelf: "start", cursor: "pointer", color: p.fgMuted, fontSize: 13, textAlign: "left" }}>{t.settings}</button>
          <div role="status" aria-live="polite" aria-label={`${revealedCount}/${totalCount} · ${pct}%`}
            style={{ display: "flex", gap: 16, justifyContent: "center", color: p.fg, fontSize: 13 }}>
            <span data-testid="vocab-progress-count">{revealedCount}/{totalCount}</span>
            <span data-testid="vocab-progress-percent">{pct}%</span>
          </div>
          <button type="button" data-testid="button-toggle-all" title={t.revealNextHint} onClick={toggleAll}
            style={{ ...lnk, justifySelf: "end", textDecoration: "none", color: p.fgMuted, fontSize: 13 }}>
            {allRevealed ? t.hideAll : t.showAll}
          </button>
        </div>

        <div id="vocab-settings-panel" hidden={!settingsOpen} style={{ marginBottom: "1.25rem" }}>
          <div style={{ paddingTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.7rem", fontSize: 13 }}>
            {/* Frequently used controls */}
            <label style={lbl}>
              <span style={{ width: 120 }}>{t.randomOrder}</span>
              <input data-testid="input-randomize" type="checkbox" checked={randomize}
                onChange={e => handleRandomize(e.target.checked)} />
            </label>

            {!isComplexLesson && <label style={lbl}>
              <span style={{ width: 120 }}>{t.reverseTranslation}</span>
              <input type="checkbox" checked={isInverted(wordsText)}
                onChange={event => {
                  updateActiveLesson(lesson => ({ ...lesson, wordsText: setInverted(lesson.wordsText, event.target.checked) }), false);
                  setRevealed(new Set());
                  setAllRevealed(false);
                }} />
            </label>}

            <label style={lbl}>
              <span style={{ width: 120 }}>{t.complexityFilter}</span>
              <input data-testid="input-filter" type="range" min={0} max={Math.max(1, maxComplexity)} step={1} value={activeFilterLevel}
                disabled={maxComplexity === 0}
                onChange={e => setFilterLevel(+e.target.value)} style={{ flex: 1 }} />
              <span style={{ width: 36, color: activeFilterLevel > 0 ? p.fg : p.fgVeryMuted }}>{activeFilterLevel}</span>
            </label>

            {!isComplexLesson && <>
              {/* Source data */}
              <div>
                <div style={{ marginBottom: "0.4rem", color: p.fgMuted }}>{t.wordListHint}</div>
                <NumberedTextarea value={wordsText} onChange={text => updateActiveLesson(
                  lesson => ({ ...lesson, wordsText: text }),
                  withoutLessonFlags(text) !== withoutLessonFlags(wordsText),
                )} onBlur={() => {}} p={p} maxHeight={220} />
              </div>
            </>}

            <details className="zs">
              <summary style={{ cursor: "pointer", userSelect: "none", color: p.fgMuted }}>{t.detailedSettings}</summary>
              <div style={{ paddingTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
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

                <label style={lbl}>
                  <span style={{ width: 120 }}>{t.autoScroll}</span>
                  <input type="checkbox" checked={settings.autoScroll} onChange={event => {
                    if (!event.target.checked && revealScrollFrameRef.current !== null) {
                      cancelAnimationFrame(revealScrollFrameRef.current);
                      revealScrollFrameRef.current = null;
                      revealScrollTargetRef.current = null;
                    }
                    setSettings(s => ({ ...s, autoScroll: event.target.checked }));
                  }} />
                </label>

                <label style={lbl}>
                  <span style={{ width: 120 }}>{t.showRevealButton}</span>
                  <input type="checkbox" checked={settings.showRevealButton}
                    onChange={event => setSettings(s => ({ ...s, showRevealButton: event.target.checked }))} />
                </label>

                <label style={lbl}>
                  <span style={{ width: 120 }}>{t.revealButtonSize}</span>
                  <input type="number" min={MIN_REVEAL_BUTTON_SIZE} max={MAX_REVEAL_BUTTON_SIZE} value={revealButtonSizeDraft}
                    onChange={event => setRevealButtonSizeDraft(event.target.value)}
                    onBlur={() => {
                      const value = Number(revealButtonSizeDraft);
                      const size = revealButtonSizeDraft.trim() && Number.isFinite(value)
                        ? Math.round(Math.min(MAX_REVEAL_BUTTON_SIZE, Math.max(MIN_REVEAL_BUTTON_SIZE, value)))
                        : settings.revealButtonSize;
                      setRevealButtonSizeDraft(String(size));
                      setSettings(s => ({ ...s, revealButtonSize: size }));
                    }}
                    style={{ width: 76, padding: "4px 6px", color: p.fg, background: p.bg, border: `1px solid ${p.fgVeryMuted}` }} />
                </label>

                <label className="zw" style={lbl}>
                  <span style={{ width: 120 }}>{t.width}</span>
                  <input type="range" min={400} max={1400} step={20} value={settings.maxWidth}
                    onChange={e => setSettings(s => ({ ...s, maxWidth: +e.target.value }))} style={{ flex: 1 }} />
                  <span style={{ width: 36, color: p.fgMuted }}>{settings.maxWidth}</span>
                </label>


              </div>
            </details>
          </div>
        </div>

        {/* Table */}
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: settings.fontSize }}>
          <thead>
            <tr style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: p.fg }}>
              <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingRight: "1em", lineHeight: 1 }}>{inverted ? secondLanguage : firstLanguage}</th>
              <th title={t.complexity} aria-label={t.complexity} style={{ width: Math.max(32, settings.fontSize * 1.4), textAlign: "center", fontWeight: "normal", paddingBottom: "0.5em", lineHeight: 1 }}>#</th>
              <th style={{ textAlign: "left", fontWeight: "normal", paddingBottom: "0.5em", paddingLeft: "1em", lineHeight: 1 }}>{inverted ? firstLanguage : secondLanguage}</th>
            </tr>
          </thead>
          <tbody>
            {displayWords.map((word, index) => {
              const count = word.complexity;
              const isRevealed = revealed.has(wordIdentity(word));
              const previousWord = displayWords[index - 1];
              const startsNewGroup = Boolean(previousWord && previousWord.group !== word.group);
              const borderTop = startsNewGroup ? `1px solid ${p.fgMuted}` : cell.borderTop;
              return (
                <tr key={word.id} data-testid={`row-word-${word.id}`}>
                  <td style={{ ...cell, borderTop, paddingRight: "1em", color: p.fg, overflowWrap: "anywhere" }}>{inverted ? word.spanish : word.russian}</td>
                  <td style={{ ...cell, borderTop, textAlign: "center", padding: 0 }}>
                    <CounterCell rk={word.key ?? String(word.id)} count={count} onInc={inc} onDec={dec} onReset={reset} onResetAll={resetAll} rowPadding={settings.rowSpacing} fontSize={settings.fontSize} p={p} />
                  </td>
                  <td data-testid={`cell-spanish-${word.id}`} onClick={() => toggleReveal(wordIdentity(word))}
                    style={{ ...cell, borderTop, paddingLeft: "1em", cursor: "pointer", color: p.fg, overflowWrap: "anywhere" }}>
                    <div className={`answer-reveal${isRevealed ? " is-open" : ""}`}>
                      <span className="answer-reveal__placeholder" aria-hidden="true" style={{ background: p.placeholder, borderRadius: 2 }} />
                      <span className="answer-reveal__content" aria-hidden={!isRevealed}>
                        {inverted ? word.russian : word.spanish}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {settings.showRevealButton && displayWords.length > 0 && !createLessonOpen && !lessonDetailsOpen && <button
        type="button"
        aria-label={revealButtonLabel}
        title={revealButtonTitle}
        onClick={event => {
          if (suppressRevealButtonClickRef.current) {
            suppressRevealButtonClickRef.current = false;
            event.preventDefault();
            return;
          }
          handleRevealControlAction();
        }}
        onPointerDown={startRevealButtonDrag}
        onPointerMove={moveRevealButton}
        onPointerUp={finishRevealButtonDrag}
        onPointerCancel={finishRevealButtonDrag}
        style={{ position: "fixed", left: revealButtonPosition ? `${revealButtonPosition.left}px` : undefined, top: revealButtonPosition ? `${revealButtonPosition.top}px` : undefined, right: revealButtonPosition ? "auto" : "max(16px, env(safe-area-inset-right, 0px))", bottom: revealButtonPosition ? "auto" : "max(16px, env(safe-area-inset-bottom, 0px))", zIndex: 50, width: revealButtonSize, height: revealButtonSize, border: `1px solid ${p.fgMuted}`, borderRadius: "50%", background: p.fg, color: p.bg, boxShadow: "0 2px 10px #0003", display: "grid", placeItems: "center", fontSize: revealButtonSize / 2, lineHeight: 1, cursor: "grab", touchAction: "none", userSelect: "none", transition: "transform 150ms ease" }}
      >{revealButtonIcon}</button>}
    </>
  );
}
