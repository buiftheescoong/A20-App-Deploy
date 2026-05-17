'use client';

import { useCallback, useEffect } from 'react';
import { Library, PenTool } from 'lucide-react';
import { SUBJECTS, GRADES } from '@/lib/types';
import { getPlans, deletePlan, isAbortError } from '@/lib/api';
import { useLibraryStore } from '@/lib/stores/library';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import PlanCard from '@/components/library/PlanCard';
import { toast } from '@/components/ui/Toaster';
import { Link } from 'react-router-dom';

export default function LibraryPage() {
  const store = useLibraryStore();
  const { page, filterSubject, filterGrade, sort, setLoading, setPlans } = store;
  const debouncedSubject = useDebouncedValue(filterSubject, 200);
  const debouncedGrade = useDebouncedValue(filterGrade, 200);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await getPlans({
        page,
        limit: 12,
        subject: debouncedSubject || undefined,
        grade: debouncedGrade || undefined,
        sort,
      }, { signal });
      setPlans(res.data, res.total);
    } catch (error) {
      if (!isAbortError(error)) {
        toast('Không thể tải danh sách giáo án', 'error');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, debouncedSubject, debouncedGrade, sort, setLoading, setPlans]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa giáo án này?')) return;
    try {
      await deletePlan(id);
      store.removePlan(id);
      toast('Đã xóa giáo án', 'success');
    } catch {
      toast('Xóa thất bại', 'error');
    }
  };

  const totalPages = Math.ceil(store.total / 12);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Library className="w-6 h-6 text-blue-600" /> Thư viện Giáo Án
          </h1>
          <p className="text-sm text-gray-500 mt-1">{store.total} giáo án</p>
        </div>
        <Link to="/generate" className="btn-primary flex items-center gap-2 text-sm">
          <PenTool className="w-4 h-4" /> Soạn mới
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select value={store.filterSubject} onChange={(e) => store.setFilterSubject(e.target.value)} className="select-field w-auto min-w-[140px] text-sm py-2">
          <option value="">Tất cả môn</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={store.filterGrade} onChange={(e) => store.setFilterGrade(e.target.value)} className="select-field w-auto min-w-[120px] text-sm py-2">
          <option value="">Tất cả lớp</option>
          {GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </select>
        <select value={store.sort} onChange={(e) => store.setSort(e.target.value === 'oldest' ? 'oldest' : 'newest')} className="select-field w-auto min-w-[130px] text-sm py-2">
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
        </select>
      </div>

      {/* Plan Grid */}
      {store.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
        </div>
      ) : store.plans.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📚</span>
          </div>
          <p className="text-gray-500 mb-2">Chưa có giáo án nào</p>
          <Link to="/generate" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            Bắt đầu soạn ngay →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {store.plans.map((p) => <PlanCard key={p.id} plan={p} onDelete={handleDelete} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => store.setPage(pg)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                    pg === store.page ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {pg}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
