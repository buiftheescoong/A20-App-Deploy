'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { downloadDocx, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toaster';

interface Props {
  planId: string;
  docxUrl: string | null;
  isPreparing?: boolean;
}

export default function ExportButton({ planId, docxUrl, isPreparing = false }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (isPreparing) {
      toast('File DOCX đang được chuẩn bị, vui lòng chờ thêm một chút.', 'info');
    }

    setDownloading(true);
    try {
      if (!docxUrl) {
        toast('Đang chuẩn bị file DOCX...', 'info');
      }
      await downloadDocx(planId);
      toast('Đang tải file DOCX...', 'success');
    } catch (err: unknown) {
      toast(errorMessage(err, 'Tải file thất bại'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm',
        isPreparing
          ? 'rounded-xl border border-blue-200 bg-blue-50 font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-100'
          : 'btn-primary',
      )}
      title={isPreparing ? 'DOCX đang được chuẩn bị' : undefined}
    >
      {downloading || isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {downloading ? 'Đang tải DOCX' : isPreparing ? 'Đang chuẩn bị DOCX' : 'Tải DOCX'}
    </button>
  );
}
