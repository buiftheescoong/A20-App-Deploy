'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStatus, getLessonPlan } from '@/lib/api';
import { StatusResponse } from '@/lib/types';
import LessonPlanPreview from '@/components/LessonPlanPreview';
import BlankTemplateAlert from '@/components/BlankTemplateAlert';
import ExportButton from '@/components/ExportButton';
import ProgressTracker from '@/components/ProgressTracker';
import RefinementChatUI from '@/components/RefinementChatUI';

export default function GenerateProgressPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.task_id as string;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [lessonPlan, setLessonPlan] = useState<any>(null);
  const [error, setError] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    pollStatus();
    intervalRef.current = setInterval(pollStatus, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [taskId]);

  async function pollStatus() {
    try {
      const result = await getStatus(taskId);
      setStatus(result);

      if (result.status === 'clarifying') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.push(`/generate/${taskId}/clarify`);
        return;
      }

      if (result.status === 'completed' || result.status === 'failed') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (result.lesson_plan_id) {
          try {
            const plan = await getLessonPlan(result.lesson_plan_id);
            setLessonPlan(plan);
          } catch (e) {
            console.error('Failed to load lesson plan:', e);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }

  const isGenerating = status?.status !== 'completed' && status?.status !== 'failed' && status?.status !== 'clarifying';
  const isComplete = status?.status === 'completed';

  const handleRefine = (message: string) => {
    console.log('Refinement requested:', message);
    // In actual implementation, this would call the /api/edit endpoint
  };

  // If there's an unrecoverable error or blank template, we show a simplified state
  if (error || (status?.status === 'failed' && !status.is_blank_template)) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl p-10 shadow-xl border border-red-100 text-center animate-slide-up">
            <div className="text-6xl mb-6">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Đã có lỗi xảy ra</h2>
            <p className="text-gray-500 mb-8">{error || status?.error || 'Không xác định.'}</p>
            <Link href="/generate" className="btn-primary inline-block w-full text-center">Thử lại</Link>
          </div>
        </main>
      </div>
    );
  }

  if (status?.is_blank_template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <BlankTemplateAlert taskId={taskId} onRetry={() => router.push('/generate')} />
      </div>
    );
  }

  // Split-Screen Default State
  const displayPlan = lessonPlan || {
    ...status?.draft_content?.metadata,
    content_json: status?.draft_content,
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Global Header */}
      <header className="bg-white border-b border-gray-200 z-50">
        <div className="max-w-full mx-auto px-6 py-3 flex justify-between items-center">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
              GA
            </div>
            <span className="font-bold text-base text-gray-800">Giáo Án Thông Minh</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden md:block">
               {isComplete ? (
                 <div className="px-3 py-1 bg-green-50 text-green-600 border border-green-200 rounded-full text-xs font-bold flex items-center gap-1">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                   Hoàn thành
                 </div>
               ) : (
                 <ProgressTracker
                    currentStep={status?.progress_step || 'started'}
                    status={status?.status || 'pending'}
                    minimal
                  />
               )}
            </div>
            {isComplete && lessonPlan && <ExportButton planId={lessonPlan.id} />}
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Context & Chat */}
        <aside className="w-[380px] border-r border-gray-200 bg-white flex flex-col shadow-xl z-10 transition-all duration-500 animate-slide-in-left">
          <div className="p-6 bg-gray-50/50 border-b border-gray-100">
             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Thông tin bài học</h3>
             <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
                  {isGenerating && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/20"><div className="h-full bg-blue-500 animate-[pulse_2s_ease-in-out_infinite]" style={{ width: '50%' }}></div></div>}
                  <p className="text-[10px] text-blue-500 font-bold uppercase mb-1">
                    {displayPlan.subject || 'Đang phân tích...'} {displayPlan.grade ? `• Lớp ${displayPlan.grade}` : ''}
                  </p>
                  <p className={`font-bold text-gray-800 line-clamp-2 ${!displayPlan.topic && 'text-gray-400 animate-pulse'}`}>
                    {displayPlan.topic || 'Hệ thống đang chuẩn bị giáo án...'}
                  </p>
                </div>
             </div>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 pb-2">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Hiệu chỉnh với AI</h3>
              </div>
              <RefinementChatUI onSendMessage={handleRefine} isLoading={isGenerating} />
          </div>
        </aside>

        {/* Right Panel: Document Preview */}
        <main className="flex-1 bg-gray-100 p-8 overflow-y-auto overflow-x-hidden scrollbar-hide flex flex-col">
           {isGenerating && (
             <div className="max-w-4xl mx-auto w-full mb-6 relative z-10 animate-fade-in">
               <ProgressTracker
                 currentStep={status?.progress_step || 'started'}
                 status={status?.status || 'pending'}
               />
             </div>
           )}

           <div className={`max-w-4xl w-full mx-auto shadow-2xl rounded-xl transition-all duration-700 delay-150 ${(!displayPlan.content_json && !displayPlan.topic) ? 'opacity-50 scale-95' : 'opacity-100 scale-100'}`}>
               <LessonPlanPreview plan={displayPlan} isStreaming={isGenerating} />
           </div>
        </main>
      </div>
    </div>
  );
}
