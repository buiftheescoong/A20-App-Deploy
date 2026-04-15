'use client';

import { useState, useRef, useEffect } from 'react';

interface FileMeta {
  name: string;
  size: number;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: 'chat' | 'clarify' | 'refinement';
  questions?: string[];
  files?: string[];
  is_done?: boolean;
}

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (message: string, files: File[]) => void;
  isLoading?: boolean;
  clarificationQuestions?: string[];
}

export default function ChatPanel({ 
  messages, 
  onSendMessage, 
  isLoading, 
  clarificationQuestions = [] 
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || isLoading) return;

    onSendMessage(input, selectedFiles);
    setInput('');
    setSelectedFiles([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth scrollbar-hide"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-5.062C3.583 13.387 3 11.77 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium">Bạn có thể đặt câu hỏi hoặc yêu cầu AI chỉnh sửa giáo án tại đây.</p>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div className="max-w-[90%] space-y-2">
              <div
                className={`p-4 rounded-2xl text-sm shadow-sm ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : m.type === 'clarify' 
                      ? 'bg-yellow-50 text-gray-800 border border-yellow-100 rounded-tl-none'
                      : 'bg-gray-100 text-gray-800 rounded-tl-none'
                }`}
              >
                {m.type === 'clarify' && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center text-white">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" />
                      </svg>
                    </div>
                    <span className="font-bold text-xs uppercase tracking-wider text-yellow-700">AI cần làm rõ</span>
                  </div>
                )}
                
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>

                {m.questions && m.questions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {m.questions.map((q, qIdx) => (
                      <div key={qIdx} className="p-3 bg-white/50 rounded-lg border border-yellow-200/50 text-xs font-medium italic">
                        "{q}"
                      </div>
                    ))}
                  </div>
                )}

                {m.files && m.files.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/20 flex flex-wrap gap-2">
                    {m.files.map((filename, fIdx) => (
                      <div key={fIdx} className="flex items-center gap-1.5 px-2 py-1 bg-black/10 rounded text-[10px] font-bold">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        {filename}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-100">
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
             {selectedFiles.map((file, idx) => (
               <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                 <span className="truncate max-w-[150px]">{file.name}</span>
                 <button onClick={() => removeFile(idx)} className="hover:text-red-500 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
               </div>
             ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative group">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
            accept=".pdf,.docx,.doc,.txt"
          />
          
          <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-1 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all">
            <button
               type="button"
               onClick={() => fileInputRef.current?.click()}
               className="p-3 text-gray-400 hover:text-blue-500 hover:bg-white rounded-xl transition-all"
               title="Đính kèm tài liệu"
            >
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
               </svg>
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Hỏi đáp hoặc yêu cầu AI sửa giáo án..."
              className="flex-1 py-3 px-2 bg-transparent focus:outline-none text-sm min-h-[48px] max-h-[120px] resize-none"
              disabled={isLoading}
              rows={1}
            />

            <button
              type="submit"
              disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
              className={`p-3 rounded-xl transition-all ${
                (!input.trim() && selectedFiles.length === 0) || isLoading
                  ? 'text-gray-300'
                  : 'text-white bg-blue-600 shadow-lg shadow-blue-500/30'
              }`}
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
                   <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
