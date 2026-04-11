'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { LessonPlanResponse } from '@/lib/types';
import LessonPlanPreview from '@/components/LessonPlanPreview';
import ExportButton from '@/components/ExportButton';

export default function PlanDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [plan, setPlan] = useState<LessonPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadPlan();
    }
  }, [id]);

  async function loadPlan() {
    try {
      setLoading(true);
      const data = await api.getLessonPlan(id as string);
      setPlan(data);
    } catch (err: any) {
      console.error('Failed to load plan:', err);
      setError(err.message || 'Không thể tải giáo án');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải giáo án...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Lỗi</h1>
          <p className="text-gray-500 mb-6">{error || 'Không tìm thấy giáo án'}</p>
          <Link href="/dashboard" className="btn-primary inline-block">
            Quay lại Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <h1 className="font-bold text-lg text-gray-800 line-clamp-1">{plan.topic}</h1>
          </div>
          <ExportButton planId={plan.id} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <LessonPlanPreview plan={plan} />

        <div className="mt-8 flex justify-center">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-gray-600 flex items-center gap-2 text-sm transition-colors"
          >
            Quay lại Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
