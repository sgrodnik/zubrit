import type { Word } from "./types";

export function setLineComplexity(text: string, lineId: number, complexity: number): string {
  const lines = text.split("\n");
  const index = lineId - 1;
  if (index < 0 || index >= lines.length) return text;
  const content = lines[index].replace(/\t\d+\s*$/, "");
  lines[index] = complexity > 0 ? `${content}\t${complexity}` : content;
  return lines.join("\n");
}

export function isInverted(text: string): boolean {
  return /^\s*#i\s*$/m.test(text);
}

export function setInverted(text: string, inverted: boolean): string {
  const lines = text.split(/\r?\n/).filter(line => !/^\s*#i\s*$/.test(line));
  if (inverted) {
    const languageDirective = lines.findIndex(line => /^\s*#lang\b/i.test(line));
    lines.splice(languageDirective >= 0 ? languageDirective + 1 : 0, 0, "#i");
  }
  return lines.join("\n");
}

export function withoutLessonFlags(text: string): string {
  return text.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join("\n");
}

export function normalizeStudySeconds(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([date, seconds]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(seconds) && (seconds as number) > 0
  )) as Record<string, number>;
}

export function parseWords(text: string): Word[] {
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

export function mergeLegacyTaps(text: string, taps: Record<string, number>): string {
  return parseWords(text).reduce((result, word) => {
    const score = taps[word.russian] ?? 0;
    return score > 0 && word.complexity === 0 ? setLineComplexity(result, word.id, score) : result;
  }, text);
}
