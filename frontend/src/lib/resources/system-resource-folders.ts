import type { ResourceCategory, SystemResourceSummary } from '../types';

export interface SystemLesson {
  id: string;
  title: string;
  resource: SystemResourceSummary;
  order: number;
}

export interface SystemResourceFolder {
  key: string;
  title: string;
  subtitle: string;
  category: ResourceCategory;
  subject: string;
  grade: string;
  lessons: SystemLesson[];
  resources: SystemResourceSummary[];
}

export function buildSystemResourceFolders(resources: SystemResourceSummary[]): SystemResourceFolder[] {
  const folderMap = new Map<string, SystemResourceFolder>();
  const orderedResources = [...resources].sort((a, b) => {
    const rawPathCompare = naturalCompare(getMetadataString(a, 'raw_path'), getMetadataString(b, 'raw_path'));
    if (rawPathCompare !== 0) return rawPathCompare;
    return naturalCompare(a.filename, b.filename);
  });

  orderedResources.forEach((resource) => {
    const curriculum = getMetadataString(resource, 'curriculum');
    const categoryLabel = getCategoryLabel(resource.category);
    const key = [resource.category, resource.subject, resource.grade, curriculum || resource.filename].join('|');
    const folderTitle = `${categoryLabel} ${resource.subject} ${resource.grade}${curriculum ? ` - ${curriculum}` : ''}`;
    const folder = folderMap.get(key) ?? {
      key,
      title: folderTitle,
      subtitle: curriculum || resource.description || resource.filename,
      category: resource.category,
      subject: resource.subject,
      grade: resource.grade,
      lessons: [],
      resources: [],
    };

    const resourceOrder = folder.resources.length;
    folder.resources.push(resource);
    getLessonTitles(resource).forEach((title, index) => {
      folder.lessons.push({
        id: `${resource.id}-${index}`,
        title,
        resource,
        order: resourceOrder * 1000 + index,
      });
    });
    folder.lessons.sort((a, b) => a.order - b.order);
    folderMap.set(key, folder);
  });

  return Array.from(folderMap.values()).sort((a, b) => naturalCompare(a.title, b.title));
}

export function getLessonTitles(resource: SystemResourceSummary): string[] {
  const lessons = resource.metadata?.lessons;
  if (Array.isArray(lessons)) {
    const lessonTitles = lessons
      .filter((lesson): lesson is string => typeof lesson === 'string' && lesson.trim().length > 0)
      .map((lesson) => lesson.trim());
    if (lessonTitles.length > 0) return lessonTitles;
  }

  const titleFromFilename = extractLessonTitle(resource.filename);
  if (titleFromFilename) return [titleFromFilename];

  return [resource.description || resource.filename];
}

export function buildSystemLessonGenerateParams(lesson: SystemLesson): URLSearchParams {
  return new URLSearchParams({
    system_resource_id: lesson.resource.id,
    system_lesson_title: lesson.title,
    topic: lesson.title,
  });
}

export function buildSelectedSystemResourceName(filename: string, lessonTitle?: string | null): string {
  const cleanLessonTitle = lessonTitle?.trim();
  if (!cleanLessonTitle) return filename;

  const baseName = filename
    .replace(/\s+-\s+B(?:\u00e0i|ai)\s*\d+[:.\s][\s\S]*?(?:\s+\(\+\d+\s+b(?:\u00e0i|ai)\))?\s*$/i, '')
    .trim();

  return `${baseName || filename} - ${cleanLessonTitle}`;
}

export function extractLessonTitle(text: string): string | null {
  const match = text.match(/B\u00e0i\s*\d+[:.\s][^()]+/i);
  return match?.[0]?.trim() ?? null;
}

export function getMetadataString(resource: SystemResourceSummary, key: string): string {
  const value = resource.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

export function getCategoryLabel(category: ResourceCategory): string {
  if (category === 'sgk') return 'SGK';
  if (category === 'sgv') return 'SGV';
  if (category === 'khung_chuong_trinh') return 'Khung CT';
  return 'T\u00e0i li\u1ec7u';
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
}
