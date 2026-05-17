'use client';

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { checkQuality, errorMessage, type ComplianceReportData } from '@/lib/api';
import ComplianceReport from '@/components/ComplianceReport';

export default function CheckPage() {
  const [lessonPlanId, setLessonPlanId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComplianceReportData | null>(null);
  const [error, setError] = useState('');

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonPlanId.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await checkQuality(lessonPlanId);
      setResult(res);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/library" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              GA
            </div>
            <span className="font-bold text-lg text-gray-800">Giáo Án Thông Minh</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              to="/library"
              className="text-gray-500 hover:text-gray-700 font-medium text-sm"
            >
              Thư viện
            </Link>
            <Link to="/check" className="text-blue-600 font-semibold text-sm">
              Kiểm tra
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🔍 Kiểm tra giáo án</h1>
          <p className="text-gray-500 mb-8">Kiểm tra tính compliance với chuẩn GDPT 2018</p>

          <form
            onSubmit={handleCheck}
            className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-6 mb-8"
          >
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">ID giáo án</label>
              <input
                type="text"
                value={lessonPlanId}
                onChange={(e) => setLessonPlanId(e.target.value)}
                className="input-field"
                placeholder="Nhập lesson plan ID (UUID)"
                required
                id="input-plan-id"
              />
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                ❌ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-3.5 disabled:opacity-50"
              id="btn-check"
            >
              {loading ? 'Đang kiểm tra...' : '🔍 Kiểm tra'}
            </button>
          </form>

          {/* Results */}
          {result && (
            <ComplianceReport
              isPassed={result.is_passed}
              errors={result.error_details}
              suggestions={result.suggestions}
            />
          )}
        </div>
      </main>
    </div>
  );
}
