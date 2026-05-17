import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import type { ComplianceReportData } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  isPassed?: boolean;
  errors?: string[];
  suggestions?: string[];
  report?: ComplianceReportData;
  className?: string;
}

export default function ComplianceReport({ isPassed, errors = [], suggestions = [], report, className }: Props) {
  const resolvedPassed = report ? report.is_passed : Boolean(isPassed);
  const resolvedErrors = report?.error_details ?? errors;
  const resolvedSuggestions = report?.suggestions ?? suggestions;
  const issues = report?.issues ?? [];

  return (
    <div className={cn(
      'rounded-2xl border p-6',
      resolvedPassed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
      className,
    )}>
      <div className="mb-4 flex items-center gap-3">
        {resolvedPassed ? (
          <CheckCircle2 className="h-6 w-6 text-green-600" />
        ) : (
          <XCircle className="h-6 w-6 text-red-600" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className={`text-lg font-bold ${resolvedPassed ? 'text-green-700' : 'text-red-700'}`}>
            {resolvedPassed ? 'Giáo án đạt chuẩn GDPT 2018' : 'Giáo án chưa đạt chuẩn'}
          </h2>
          {(report?.score !== undefined || report?.summary) && (
            <p className="mt-1 text-sm text-gray-600">
              {report.score !== undefined ? `${report.score}/100` : ''}
              {report.score !== undefined && report.summary ? ' - ' : ''}
              {report.summary}
            </p>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="mb-4 space-y-2">
          {issues.map((issue, i) => (
            <div key={`${issue.section}-${i}`} className="rounded-xl border border-white/70 bg-white/70 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                {issue.severity} · {issue.section}
              </div>
              <p className="text-sm text-gray-700">{issue.problem}</p>
              {issue.suggestion && <p className="mt-1 text-sm text-gray-500">{issue.suggestion}</p>}
            </div>
          ))}
        </div>
      )}

      {resolvedErrors.length > 0 && issues.length === 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-red-700">Lỗi cần sửa:</h3>
          <ul className="space-y-1">
            {resolvedErrors.map((err, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-600">
                <span className="mt-0.5">•</span>
                <span>{err}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolvedSuggestions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Gợi ý cải thiện:</h3>
          <ul className="space-y-1">
            {resolvedSuggestions.map((suggestion, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-0.5">•</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
