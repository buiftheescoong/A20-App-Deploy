'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, CheckCircle, FileText } from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';
import { errorMessage, uploadResource } from '@/lib/api';
import { useResourceStore } from '@/lib/stores/resource';
import { toast } from '@/components/ui/Toaster';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UploadDialog({ open, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const addResource = useResourceStore((s) => s.addResource);

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) setFile(files[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadResource(file);
      addResource(res);
      setDone(true);
      toast('Upload thành công!', 'success');
      setTimeout(() => { onClose(); setFile(null); setDone(false); }, 1000);
    } catch (err: unknown) {
      toast(errorMessage(err, 'Upload thất bại'), 'error');
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Upload tài liệu</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {!file ? (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400',
              )}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Kéo thả hoặc click để chọn file</p>
              <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT — Tối đa 50MB</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <FileText className="w-8 h-8 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                </div>
                {done && <CheckCircle className="w-5 h-5 text-green-500" />}
                {!uploading && !done && (
                  <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading || done}
                className={cn('w-full btn-primary flex items-center justify-center gap-2', (uploading || done) && 'opacity-60')}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Đang upload...</>
                ) : done ? (
                  <><CheckCircle className="w-4 h-4" /> Hoàn tất</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
