'use client';

import { BookOpen, Download, PenTool } from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';
import type { SystemResourceSummary } from '@/lib/types';
import { useRouter } from '@/lib/navigation';
import { downloadSystemResource } from '@/lib/api';

interface Props {
  resource: SystemResourceSummary;
}

export default function SystemResourceCard({ resource }: Props) {
  const router = useRouter();
  const issgk = resource.category === 'sgk';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
      <div className="flex items-start gap-4">
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md',
          issgk ? 'bg-gradient-to-br from-red-500 to-orange-500' : 'bg-gradient-to-br from-green-500 to-emerald-500',
        )}>
          <BookOpen className="w-6 h-6 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-bold text-gray-900 truncate">{resource.filename}</h3>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-semibold',
              issgk ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
            )}>
              {issgk ? 'SGK' : 'SGV'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
              Lớp {resource.grade}
            </span>
          </div>
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{resource.description}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {resource.pageCount && <span>{resource.pageCount} trang</span>}
            {resource.fileSize && <span>• {formatFileSize(resource.fileSize)}</span>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
        <button
          onClick={() => router.push(`/generate?system_resource_id=${resource.id}`)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"
        >
          <PenTool className="w-3.5 h-3.5" /> Soạn giáo án
        </button>
        <button
          onClick={() => downloadSystemResource(resource.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Tải về
        </button>
      </div>
    </div>
  );
}
