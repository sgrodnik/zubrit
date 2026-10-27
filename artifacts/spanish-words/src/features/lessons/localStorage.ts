import type { Lesson, LessonState } from "./types";
import { isInverted, mergeLegacyTaps, normalizeStudySeconds, setInverted } from "./model";

const LESSONS_KEY = "spanish-vocab-lessons-v1";
const ACTIVE_LESSON_KEY = "spanish-vocab-active-lesson-v1";
const SETTINGS_KEY = "spanish-vocab-settings-v2";
const WORDS_KEY = "spanish-vocab-words";
const TAPS_KEY = "spanish-vocab-taps-v2";

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

function loadTaps(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TAPS_KEY) ?? "{}"); }
  catch { return {}; }
}

export function loadLessonState(): LessonState {
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
          lastStudiedAt: Number.isFinite(lesson.lastStudiedAt) ? lesson.lastStudiedAt : undefined,
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
    name: (typeof navigator !== "undefined" && navigator.language.startsWith("ru")) ? "Пример — поездка" : "Sample — travel",
    wordsText,
    randomize: false,
    createdAt: now,
    updatedAt: now,
    studySecondsByDate: {},
  };
  return { lessons: [lesson], activeId: lesson.id };
}

export function saveLessonState(state: LessonState): void {
  localStorage.setItem(LESSONS_KEY, JSON.stringify({ lessons: state.lessons }));
  localStorage.setItem(ACTIVE_LESSON_KEY, state.activeId);
}
