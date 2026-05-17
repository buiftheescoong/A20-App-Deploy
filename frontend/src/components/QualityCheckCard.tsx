'use client';

import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import ComplianceReport from '@/components/ComplianceReport';
import type { ComplianceStatus, QualityCheckSnapshot } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  qualityCheck?: QualityCheckSnapshot | null;
  compliance?: ComplianceStatus | null;
  className?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  inline_edit: 'Sau chỉnh sửa',
  chat_refine: 'Sau tinh chỉnh chat',
  manual: 'Kiểm tra thủ công',
};

export default function QualityCheckCard({ qualityCheck, compliance, className }: Props) {
  if (qualityCheck?.status === 'running') {
    return (
      <div className={cn('rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800', className)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang kiểm tra chất lượng
        </div>
        <p className="mt-1 text-sm text-blue-700">
          {SOURCE_LABELS[qualityCheck.source] || 'Kiểm tra tự động'} đang chạy. Bạn vẫn có thể xuất DOCX trong lúc chờ kết quả.
        </p>
      </div>
    );
  }

  if (qualityCheck?.status === 'error') {
    return (
      <div className={cn('rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800', className)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4" />
          Chưa kiểm tra được chất lượng
        </div>
        <p className="mt-1 text-sm text-amber-700">
          {qualityCheck.error || 'Dịch vụ kiểm tra tạm thời chưa phản hồi.'}
        </p>
      </div>
    );
  }

  if (qualityCheck?.status === 'completed' && qualityCheck.report) {
    return <ComplianceReport report={qualityCheck.report} className={className} />;
  }

  if (compliance === 'PASSED' || compliance === 'FAILED') {
    const passed = compliance === 'PASSED';
    return (
      <div className={cn(
        'rounded-xl border px-4 py-3',
        passed ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800',
        className,
      )}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {passed ? 'Đạt chuẩn GDPT 2018' : 'Cần xem lại chất lượng'}
        </div>
      </div>
    );
  }

  if (compliance === 'PENDING') {
    return (
      <div className={cn('rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800', className)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Đang chờ kiểm tra chất lượng
        </div>
      </div>
    );
  }

  return null;
}
