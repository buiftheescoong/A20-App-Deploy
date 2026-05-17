'use client';

import { Eye, Download, Trash2, PenTool } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { Plan } from '@/lib/types';
import { useRouter } from '@/lib/navigation';
import { downloadDocx } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

interface Props {
  plan: Plan;
  onDelete: (id: string) => void;
}

export default function PlanCard({ plan, onDelete }: Props) {
  const router = useRouter();
  const canDownloadDocx = plan.status === 'completed' || Boolean(plan.docxUrl);

  const handleDownload = async () => {
    try { await downloadDocx(plan.id); } catch { toast('Tải thất bại', 'error'); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 truncate">{plan.topic}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">{plan.subject}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">Lớp {plan.grade}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{plan.teachingModel}</span>
          </div>
        </div>
        {plan.complianceStatus === 'PASSED' && <span className="badge-passed text-[10px] px-2 py-0.5">✅ Đạt</span>}
        {plan.complianceStatus === 'FAILED' && <span className="badge-failed text-[10px] px-2 py-0.5">⚠️ Xem lại</span>}
        {plan.complianceStatus === 'PENDING' && <span className="badge-pending text-[10px] px-2 py-0.5">⏳ Đang xử lý</span>}
      </div>

      <p className="text-xs text-gray-400 mb-4">{formatDate(plan.createdAt)}</p>

      <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
        <button onClick={() => router.push(`/plans/${plan.id}`)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
          <Eye className="w-3.5 h-3.5" /> Xem
        </button>
        {canDownloadDocx && (
          <button onClick={handleDownload} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors">
            <Download className="w-3.5 h-3.5" /> DOCX
          </button>
        )}
        <button onClick={() => onDelete(plan.id)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
