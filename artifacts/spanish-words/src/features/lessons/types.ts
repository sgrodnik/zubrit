export type Lesson = {
  id: string;
  name: string;
  wordsText: string;
  randomize: boolean;
  createdAt: number;
  updatedAt: number;
  lastStudiedAt?: number;
  studySecondsByDate: Record<string, number>;
};

export type LessonState = { lessons: Lesson[]; activeId: string };

export interface Word {
  id: number;
  russian: string;
  spanish: string;
  complexity: number;
  group: number;
  key?: string;
  sourceLessonId?: string;
  sourceLineId?: number;
}
