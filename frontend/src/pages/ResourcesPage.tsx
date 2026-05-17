'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { BookOpen, FolderOpen, Upload, Search, ChevronDown, ChevronRight, FileText, PenTool } from 'lucide-react';
import { useRouter } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { SUBJECTS, GRADES } from '@/lib/types';
import { getSystemResources, getResources, deleteResource, isAbortError } from '@/lib/api';
import { useSystemResourceStore } from '@/lib/stores/system-resource';
import { useResourceStore } from '@/lib/stores/resource';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { buildSystemLessonGenerateParams, buildSystemResourceFolders, type SystemLesson, type SystemResourceFolder } from '@/lib/resources/system-resource-folders';
import ResourceCard from '@/components/resources/ResourceCard';
import UploadDialog from '@/components/resources/UploadDialog';
import { toast } from '@/components/ui/Toaster';
import type { ResourceCategory, SystemResourceSummary } from '@/lib/types';

export default function ResourcesPage() {
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📚 Thư viện Tài nguyên</h1>
          <p className="text-sm text-gray-500 mt-1">Tài liệu SGK, SGV và tài liệu cá nhân</p>
        </div>
        <button onClick={() => setUploadOpen(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Upload className="w-4 h-4" /> Upload mới
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border border-gray-200 rounded-xl overflow-hidden mb-6">
        <button
          onClick={() => setActiveTab('system')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all',
            activeTab === 'system' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          <BookOpen className="w-4 h-4" /> Tài liệu hệ thống
        </button>
        <button
          onClick={() => setActiveTab('user')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all',
            activeTab === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          <FolderOpen className="w-4 h-4" /> Tài liệu của tôi
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'system' ? <SystemTab /> : <UserTab />}

      {/* Upload Dialog */}
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

// ════════════════════════════════════════════
//  Tab 1: Tài liệu hệ thống
// ════════════════════════════════════════════
function SystemTab() {
  const store = useSystemResourceStore();
  const { filterSubject, filterGrade, filterCategory, searchQuery } = store;
  const [resources, setResources] = useState<SystemResourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const folders = useMemo(() => buildSystemResourceFolders(resources), [resources]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await getSystemResources({
        subject: filterSubject || undefined,
        grade: filterGrade || undefined,
        category: (filterCategory as ResourceCategory) || undefined,
        search: debouncedSearchQuery || undefined,
      }, { signal });
      setResources(data);
    } catch (error) {
      if (!isAbortError(error)) {
        toast('Không thể tải tài liệu hệ thống', 'error');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filterSubject, filterGrade, filterCategory, debouncedSearchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return (
    <div>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select value={store.filterSubject} onChange={(e) => store.setFilterSubject(e.target.value)} className="select-field w-auto min-w-[140px] text-sm py-2">
          <option value="">Tất cả môn</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={store.filterGrade} onChange={(e) => store.setFilterGrade(e.target.value)} className="select-field w-auto min-w-[120px] text-sm py-2">
          <option value="">Tất cả lớp</option>
          {GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </select>
        <select value={store.filterCategory} onChange={(e) => store.setFilterCategory(e.target.value)} className="select-field w-auto min-w-[130px] text-sm py-2">
          <option value="">Tất cả loại</option>
          <option value="sgk">SGK</option>
          <option value="sgv">SGV</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={store.searchQuery}
            onChange={(e) => store.setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm SGK hoặc bài..."
            className="input-field pl-10 text-sm py-2"
          />
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map((i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
        </div>
      ) : folders.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500">Đang chuẩn bị tài liệu hệ thống...</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((folder) => <SystemResourceFolderCard key={folder.key} folder={folder} />)}
        </div>
      )}
    </div>
  );
}

function SystemResourceFolderCard({ folder }: { folder: SystemResourceFolder }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const isSgk = folder.category === 'sgk';
  const categoryLabel = getCategoryLabel(folder.category);

  const openLesson = (lesson: SystemLesson) => {
    const params = buildSystemLessonGenerateParams(lesson);
    router.push(`/generate?${params.toString()}`);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden card-hover">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={cn(
          'w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm',
          isSgk ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600',
        )}>
          <FolderOpen className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900 truncate">{folder.title}</h3>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-semibold',
              isSgk ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
            )}>
              {categoryLabel}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
              Lớp {folder.grade}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-1">{folder.subtitle}</p>
          <p className="text-xs text-gray-400 mt-2">{folder.lessons.length} bài</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 mt-1" /> : <ChevronRight className="w-4 h-4 text-gray-400 mt-1" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 max-h-80 overflow-y-auto">
          {folder.lessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => openLesson(lesson)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0"
            >
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{lesson.title}</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 flex-shrink-0">
                <PenTool className="w-3.5 h-3.5" />
                Soạn
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function extractLessonTitle(text: string): string | null {
  const match = text.match(/Bài\s*\d+[:.\s][^()]+/i);
  return match?.[0]?.trim() ?? null;
}

function getCategoryLabel(category: ResourceCategory): string {
  if (category === 'sgk') return 'SGK';
  if (category === 'sgv') return 'SGV';
  if (category === 'khung_chuong_trinh') return 'Khung CT';
  return 'Tài liệu';
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
}

// ════════════════════════════════════════════
//  Tab 2: Tài liệu của tôi
// ════════════════════════════════════════════
function UserTab() {
  const store = useResourceStore();
  const { setLoading, setResources } = store;
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await getResources(debouncedSearch || undefined, { signal });
      setResources(data);
    } catch (error) {
      if (!isAbortError(error)) {
        toast('Không thể tải tài liệu', 'error');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [debouncedSearch, setLoading, setResources]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa tài liệu này?')) return;
    try {
      await deleteResource(id);
      store.removeResource(id);
      toast('Đã xóa tài liệu', 'success');
    } catch {
      toast('Xóa thất bại', 'error');
    }
  };

  return (
    <div>
      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm theo tên file..."
          className="input-field pl-10 text-sm py-2"
        />
      </div>

      {/* Results */}
      {store.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : store.resources.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📂</span>
          </div>
          <p className="text-gray-500 mb-2">Chưa có tài liệu nào</p>
          <p className="text-sm text-gray-400">Upload tài liệu để bắt đầu!</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {store.resources.map((r) => <ResourceCard key={r.id} resource={r} onDelete={handleDelete} />)}
        </div>
      )}
    </div>
  );
}
