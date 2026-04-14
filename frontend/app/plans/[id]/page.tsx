'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { LessonPlanResponse } from '@/lib/types';
import LessonPlanPreview from '@/components/LessonPlanPreview';
import ExportButton from '@/components/ExportButton';

import RefinementChatUI from '@/components/RefinementChatUI';

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

  const handleRefine = (message: string) => {
    console.log('Refinement requested for existing plan:', message);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
             <div className="absolute inset-0 bg-blue-500 rounded-full opacity-10 animate-ping"></div>
             <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-gray-500 font-medium animate-pulse">Đang tải giáo án...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-10 rounded-3xl shadow-xl border border-gray-100 max-w-md w-full text-center">
          <div className="text-6xl mb-6">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Lỗi</h1>
          <p className="text-gray-500 mb-8">{error || 'Không tìm thấy giáo án'}</p>
          <Link href="/dashboard" className="btn-primary inline-block w-full text-center">
            Quay lại Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Global Header */}
      <header className="bg-white border-b border-gray-200 z-50">
        <div className="max-w-full mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                GA
              </div>
              <span className="font-bold text-base text-gray-800">Giáo Án Thông Minh</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <ExportButton planId={plan.id} />
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Details & Chat */}
        <aside className="w-[380px] border-r border-gray-200 bg-white flex flex-col shadow-xl z-10 animate-slide-in-left">
          <div className="p-6 bg-gray-50/50 border-b border-gray-100">
             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Thông tin bài học</h3>
             <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                   <p className="text-[10px] text-blue-500 font-bold uppercase mb-1">{plan.subject} • Lớp {plan.grade}</p>
                   <p className="font-bold text-gray-800">{plan.topic}</p>
                   <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                      <span>Đã tạo: {new Date(plan.created_at).toLocaleDateString('vi-VN')}</span>
                   </div>
                </div>
             </div>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 pb-2">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Hiệu chỉnh với AI</h3>
              </div>
              <RefinementChatUI onSendMessage={handleRefine} />
          </div>
        </aside>

        {/* Right Panel: Scrollable Preview */}
        <main className="flex-1 bg-gray-100 p-8 overflow-y-auto overflow-x-hidden scrollbar-hide">
           <div className="max-w-4xl mx-auto shadow-2xl rounded-xl">
               <LessonPlanPreview plan={plan} />
           </div>
           <div className="mt-8 text-center pb-8">
              <p className="text-gray-400 text-xs italic">Nội dung được tạo bởi Hệ thống AI Multi-Agent chuẩn GDPT 2018</p>
           </div>
        </main>
      </div>
    </div>
  );
}
