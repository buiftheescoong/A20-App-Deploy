'use client';

import { FileText, PenTool, Trash2 } from 'lucide-react';
import { cn, formatFileSize, formatDate } from '@/lib/utils';
import type { Resource } from '@/lib/types';
import { useRouter } from '@/lib/navigation';

interface Props {
  resource: Resource;
  onDelete: (id: string) => void;
}

export default function ResourceCard({ resource, onDelete }: Props) {
  const router = useRouter();
  const ext = resource.filename.split('.').pop()?.toUpperCase() || 'FILE';
  const extColor = ext === 'PDF' ? 'from-red-500 to-pink-500' : ext === 'DOCX' ? 'from-blue-500 to-indigo-500' : 'from-gray-500 to-slate-500';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
      <div className="flex items-start gap-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md bg-gradient-to-br', extColor)}>
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 truncate mb-1">{resource.filename}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{ext}</span>
            {resource.fileSize && <span>{formatFileSize(resource.fileSize)}</span>}
            <span>• {formatDate(resource.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
        <button
          onClick={() => router.push(`/generate?resource_id=${resource.id}`)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"
        >
          <PenTool className="w-3.5 h-3.5" /> Soạn giáo án
        </button>
        <button
          onClick={() => onDelete(resource.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Xóa
        </button>
      </div>
    </div>
  );
}
