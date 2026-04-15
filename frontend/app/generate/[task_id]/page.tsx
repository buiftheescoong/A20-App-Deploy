'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { openSSEStream, getLessonPlan, sendChatMessage } from '@/lib/api';
import LessonPlanPreview from '@/components/LessonPlanPreview';
import BlankTemplateAlert from '@/components/BlankTemplateAlert';
import ExportButton from '@/components/ExportButton';
import ProgressTracker from '@/components/ProgressTracker';
import ChatPanel from '@/components/ChatPanel';

export default function GenerateProgressPage() {
  const params = useParams();
  const router = useRouter();
  const planId = (params.task_id || params.plan_id) as string;

  const [status, setStatus] = useState<any>({ status: 'pending', progress_step: 'started' });
  const [lessonPlan, setLessonPlan] = useState<any>(null);
  const [streamingMarkdown, setStreamingMarkdown] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState('');
  
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 1. Initial Load from DB (in case of page refresh)
    const loadExisting = async () => {
      try {
        const plan = await getLessonPlan(planId);
        setLessonPlan(plan);
        if (plan.status === 'completed') {
          setIsComplete(true);
          setStatus({ status: 'completed', progress_step: 'export_done' });
        }
      } catch (e) {
        console.error('Failed to load initial plan state:', e);
      }
    };

    loadExisting();

    // 2. Connect SSE for real-time updates
    const sse = openSSEStream(planId);
    eventSourceRef.current = sse;

    sse.addEventListener('progress', (e: any) => {
      const data = JSON.parse(e.data);
      setStatus((prev: any) => ({ ...prev, progress_step: data.step, label: data.label }));
    });

    sse.addEventListener('chunk', (e: any) => {
      const data = JSON.parse(e.data);
      if (data.type === 'markdown') {
        setStreamingMarkdown((prev) => prev + data.delta);
      }
    });

    sse.addEventListener('chat', (e: any) => {
      const data = JSON.parse(e.data);
      setChatMessages((prev) => [...prev, data]);
    });

    sse.addEventListener('chat_delta', (e: any) => {
      const data = JSON.parse(e.data);
      setChatMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.is_done) {
          const newMsg = { ...last, content: last.content + data.delta };
          return [...prev.slice(0, -1), newMsg];
        } else {
          return [...prev, { role: 'assistant', content: data.delta, is_done: false }];
        }
      });
    });

    sse.addEventListener('chat_done', () => {
      setChatMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last) return [...prev.slice(0, -1), { ...last, is_done: true }];
        return prev;
      });
    });

    sse.addEventListener('clarify', (e: any) => {
      const data = JSON.parse(e.data);
      setClarificationQuestions(data.questions);
      // Add a system-like message to chat panel
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', type: 'clarify', content: 'Tôi cần thêm một số thông tin để hoàn thiện giáo án.', questions: data.questions }
      ]);
    });

    sse.addEventListener('plan', (e: any) => {
      const data = JSON.parse(e.data);
      setLessonPlan((prev: any) => ({ ...prev, content_json: data }));
      // When full plan arrives, we stop showing streaming markdown
      setStreamingMarkdown('');
    });

    sse.addEventListener('done', (e: any) => {
      const data = JSON.parse(e.data);
      setIsComplete(true);
      setStatus({ status: 'completed', progress_step: 'export_done' });
      if (data.docx_url) {
        setLessonPlan((prev: any) => ({ ...prev, docx_url: data.docx_url }));
      }
    });

    sse.addEventListener('error', (e: any) => {
      // Native EventSource error events may not have data if it's just a connection drop
      if (!e.data) {
        console.warn("SSE connection error or drop.");
        return;
      }
      try {
        const data = JSON.parse(e.data);
        setError(data.message);
        if (!data.recoverable) {
          sse.close();
        }
      } catch (err) {
        console.warn("Failed to parse SSE error data:", e.data);
      }
    });

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [planId]);

  const handleSendMessage = async (message: string, files: File[]) => {
    try {
      // Optimistic update for UI
      setChatMessages((prev) => [...prev, { role: 'user', content: message, files: files.map(f => f.name) }]);
      setClarificationQuestions([]); // Clear current questions as user answered
      
      await sendChatMessage(planId, message, files);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi gửi tin nhắn');
    }
  };

  const isGenerating = !isComplete && !error && clarificationQuestions.length === 0;

  // Error State
  if (error && !isComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl p-10 shadow-xl border border-red-100 text-center animate-slide-up">
            <div className="text-6xl mb-6">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Đã có lỗi xảy ra</h2>
            <p className="text-gray-500 mb-8">{error}</p>
            <Link href="/generate" className="btn-primary inline-block w-full text-center">Thử lại</Link>
          </div>
        </main>
      </div>
    );
  }

  // Blank Template Check
  if (lessonPlan?.is_blank_template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <BlankTemplateAlert taskId={planId} onRetry={() => router.push('/generate')} />
      </div>
    );
  }

  const displayPlan = lessonPlan || {};

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
                    currentStep={status.progress_step}
                    status={status.status}
                    label={status.label}
                    minimal
                  />
               )}
            </div>
            {isComplete && lessonPlan?.docx_url && <ExportButton planId={planId} />}
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
        <aside className="w-[400px] border-r border-gray-200 bg-white flex flex-col shadow-xl z-10 transition-all duration-500 animate-slide-in-left">
          <div className="p-6 bg-gray-50/50 border-b border-gray-100">
             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Thông tin bài học</h3>
             <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
                  {isGenerating && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/20"><div className="h-full bg-blue-500 animate-[pulse_2s_ease-in-out_infinite]" style={{ width: '50%' }}></div></div>}
                  <p className="text-[10px] text-blue-500 font-bold uppercase mb-1">
                    {displayPlan.subject || 'Đang chuẩn bị...'} {displayPlan.grade ? `• Lớp ${displayPlan.grade}` : ''}
                  </p>
                  <p className={`font-bold text-gray-800 line-clamp-2 ${!displayPlan.topic && 'text-gray-400 animate-pulse'}`}>
                    {displayPlan.topic || 'Hệ thống đang chuẩn bị giáo án...'}
                  </p>
                </div>
             </div>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
              <ChatPanel 
                messages={chatMessages} 
                onSendMessage={handleSendMessage} 
                isLoading={isGenerating} 
                clarificationQuestions={clarificationQuestions}
              />
          </div>
        </aside>

        {/* Right Panel: Document Preview */}
        <main className="flex-1 bg-gray-100 p-8 overflow-y-auto overflow-x-hidden scrollbar-hide flex flex-col">
           {isGenerating && (
             <div className="max-w-4xl mx-auto w-full mb-6 relative z-10 animate-fade-in">
               <ProgressTracker
                 currentStep={status.progress_step}
                 status={status.status}
                 label={status.label}
               />
             </div>
           )}

           <div className={`max-w-4xl w-full mx-auto shadow-2xl rounded-xl transition-all duration-700 delay-150 ${(!displayPlan.content_json && !streamingMarkdown) ? 'opacity-50 scale-95' : 'opacity-100 scale-100'}`}>
               <LessonPlanPreview 
                  plan={displayPlan} 
                  streamingMarkdown={streamingMarkdown}
                  isStreaming={!!streamingMarkdown && !isComplete} 
               />
           </div>
        </main>
      </div>
    </div>
  );
}

