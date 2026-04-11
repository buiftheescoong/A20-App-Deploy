'use client';

import { useState } from 'react';
import { getClarificationQuestions, submitClarificationAnswers } from '@/lib/api';

interface ClarificationDialogProps {
  taskId: string;
  questions: string[];
  onSubmitted: () => void;
}

export default function ClarificationDialog({
  taskId,
  questions,
  onSubmitted,
}: ClarificationDialogProps) {
  const [answers, setAnswers] = useState<string[]>(new Array(questions.length).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const formattedAnswers = questions.map((q, i) => ({
        question: q,
        answer: answers[i],
      }));

      await submitClarificationAnswers(taskId, formattedAnswers);
      setSubmitted(true);
      onSubmitted();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 animate-slide-up">
      <div className="flex gap-3 items-start mb-6">
        <span className="text-2xl">💬</span>
        <div>
          <h3 className="font-bold text-amber-800 text-lg">Cần bổ sung thông tin</h3>
          <p className="text-amber-700 text-sm">
            Vui lòng trả lời để AI soạn giáo án chính xác hơn
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {questions.map((question, index) => (
          <div key={index}>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {index + 1}. {question}
            </label>
            <textarea
              value={answers[index]}
              onChange={(e) => {
                const newAnswers = [...answers];
                newAnswers[index] = e.target.value;
                setAnswers(newAnswers);
              }}
              className="input-field min-h-[70px] resize-y"
              placeholder="Nhập câu trả lời..."
              disabled={submitting || submitted}
            />
          </div>
        ))}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || submitted}
          className="btn-primary w-full !py-3 disabled:opacity-50"
        >
          {submitted
            ? '✅ Đã gửi — đang tiếp tục tạo giáo án...'
            : submitting
              ? 'Đang gửi...'
              : '📤 Gửi và tiếp tục'}
        </button>
      </form>
    </div>
  );
}
