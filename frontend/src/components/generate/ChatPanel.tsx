'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage, sendMessage, getMessages } from '@/lib/api';
import type { Message } from '@/lib/types';
import { toast } from '@/components/ui/Toaster';
import { usePlanStore } from '@/lib/stores/plan';
import type { ChatResponse } from '@/lib/types';

interface Props {
  planId: string;
  chatResponse?: string;
  isChatStreaming?: boolean;
  updatePlanStore?: boolean;
  onRefined?: (result: ChatResponse) => void;
}

export default function ChatPanel({
  planId,
  chatResponse = '',
  isChatStreaming = false,
  updatePlanStore = true,
  onRefined,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const setMarkdown = usePlanStore((s) => s.setMarkdown);
  const markContentEdited = usePlanStore((s) => s.markContentEdited);

  useEffect(() => {
    getMessages(planId).then(({ data }) => setMessages(data)).catch(() => {});
  }, [planId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatResponse]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);

    // Add user message to local state immediately
    const tempMsg: Message = {
      id: `temp-${Date.now()}`, planId, role: 'user',
      content: msg, messageType: 'chat', attachedFiles: [], createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const result = await sendMessage(planId, msg);

      if (result.message) {
        setMessages((prev) => [...prev, result.message!]);

        if (result.intent === 'refine' && result.updatedMarkdown) {
          if (updatePlanStore) {
            setMarkdown(result.updatedMarkdown);
            markContentEdited(result.qualityCheck);
          }
          onRefined?.(result);
        }
      } else {
        toast('AI chưa trả lời, vui lòng thử lại.', 'warning');
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(msg);
      toast(errorMessage(err, 'Gửi tin nhắn thất bại'), 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {messages.length === 0 && !chatResponse && (
          <p className="text-center text-sm text-gray-400 py-8">
            💬 Chat với AI để chỉnh sửa giáo án
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md',
              m.role === 'system' && 'bg-yellow-50 text-yellow-800 text-xs italic text-center max-w-full',
            )}>
              {m.content}
            </div>
          </div>
        ))}

        {/* Streaming AI response */}
        {chatResponse && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-gray-100 text-gray-800 text-sm leading-relaxed">
              {chatResponse}
              {isChatStreaming && <span className="streaming-cursor" />}
            </div>
          </div>
        )}

        {/* Typing indicator while waiting for AI */}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-gray-100 flex items-center gap-1.5">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhắn tin để chỉnh sửa..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm resize-none max-h-32 transition-all"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className={cn(
              'p-2.5 rounded-xl transition-all',
              input.trim() && !sending ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md' : 'bg-gray-100 text-gray-400',
            )}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {sending && (
          <p className="text-xs text-gray-400 mt-1.5 text-center">⏳ AI đang xử lý (~1 phút)...</p>
        )}
      </div>
    </div>
  );
}
