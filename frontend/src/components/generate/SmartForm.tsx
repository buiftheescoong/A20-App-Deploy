'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from '@/lib/navigation';
import { useDropzone } from 'react-dropzone';
import {
  BookOpen, GraduationCap, PenTool, Upload, X, FileText,
  ChevronDown, ChevronUp, Sparkles, Loader2, FolderOpen,
} from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';
import { SUBJECTS, GRADES, TEACHING_MODELS } from '@/lib/types';
import { createPlan, errorMessage, getSystemResource, getResources } from '@/lib/api';
import { usePlanStore } from '@/lib/stores/plan';
import type { TeachingModel } from '@/lib/types';
import { toast } from '@/components/ui/Toaster';
import { buildSelectedSystemResourceName } from '@/lib/resources/system-resource-folders';
import { buildCreatePlanPayload } from '@/lib/plans/create';

interface SelectedResource {
  id: string;
  name: string;
  type: 'system' | 'user' | 'upload';
  lessonTitle?: string;
}

export default function SmartForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startSubmitting = usePlanStore((s) => s.startSubmitting);
  const startStreaming = usePlanStore((s) => s.startStreaming);
  const setGenerationError = usePlanStore((s) => s.setError);

  // ── Form State ──
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [teachingModel, setTeachingModel] = useState<TeachingModel>('5E');

  // Optional fields
  const [objectives, setObjectives] = useState('');
  const [emphasis, setEmphasis] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [optionalOpen, setOptionalOpen] = useState(true);

  // Files & Resources
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedResources, setSelectedResources] = useState<SelectedResource[]>([]);

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── URL Params — pre-fill resources ──
  useEffect(() => {
    const sysId = searchParams.get('system_resource_id');
    const userId = searchParams.get('resource_id');
    const selectedLessonTitle = searchParams.get('system_lesson_title') || searchParams.get('lesson');
    const selectedTopic = searchParams.get('topic') || selectedLessonTitle;

    if (selectedTopic) {
      setTopic(selectedTopic);
    }

    if (sysId) {
      getSystemResource(sysId).then((res) => {
        setSelectedResources((prev) => [
          ...prev.filter((r) => r.id !== sysId),
          {
            id: sysId,
            name: buildSelectedSystemResourceName(res.filename, selectedLessonTitle),
            type: 'system',
            lessonTitle: selectedLessonTitle || undefined,
          },
        ]);
        if (res.subject) setSubject(res.subject);
        if (res.grade) setGrade(res.grade);
      }).catch(() => {});
    }
    if (userId) {
      getResources().then(({ data }) => {
        const found = data.find((r) => r.id === userId);
        if (found) {
          setSelectedResources((prev) => [
            ...prev.filter((r) => r.id !== userId),
            { id: userId, name: found.filename, type: 'user' },
          ]);
        }
      }).catch(() => {});
    }
  }, [searchParams]);

  // ── Dropzone ──
  const onDrop = useCallback((files: File[]) => {
    setUploadedFiles((prev) => [...prev, ...files]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const removeFile = (idx: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeResource = (id: string) => {
    setSelectedResources((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !grade || !topic) {
      toast('Vui lòng điền đầy đủ thông tin bắt buộc', 'warning');
      return;
    }

    setIsSubmitting(true);
    startSubmitting();
    try {
      const { plan_id } = await createPlan(buildCreatePlanPayload({
        subject,
        grade,
        topic,
        teachingModel,
        objectives,
        emphasis,
        specialRequests,
        selectedResources,
      }), uploadedFiles);

      toast('Đang tạo giáo án...', 'success');
      startStreaming(plan_id, 'queued');
      router.push(`/generate/${plan_id}`);
    } catch (err: unknown) {
      const message = errorMessage(err, 'Có lỗi xảy ra');
      setGenerationError(message);
      toast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
      {/* Section 1: Thông tin cơ bản */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          Thông tin cơ bản
          <span className="text-red-500 text-sm">*</span>
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Môn học */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Môn học</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="select-field"
              required
            >
              <option value="">-- Chọn môn --</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Lớp */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Lớp</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="select-field"
              required
            >
              <option value="">-- Chọn lớp --</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>Lớp {g}</option>
              ))}
            </select>
          </div>

          {/* Tên bài */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên bài học</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: Hàm số bậc nhất"
              className="input-field"
              required
              maxLength={500}
            />
          </div>

          {/* Mô hình dạy học */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mô hình dạy học</label>
            <div className="grid sm:grid-cols-3 gap-3">
              {TEACHING_MODELS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setTeachingModel(m.value)}
                  className={cn(
                    'px-4 py-3 rounded-xl border text-left transition-all text-sm',
                    teachingModel === m.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300',
                  )}
                >
                  <span className="font-semibold">{m.value}</span>
                  <span className="block text-xs mt-0.5 opacity-70">{m.label.split('(')[1]?.replace(')', '') || m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Tài liệu tham khảo */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-600" />
          Tài liệu tham khảo
          <span className="text-xs text-gray-400 font-normal ml-1">(tùy chọn)</span>
        </h2>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/50',
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {isDragActive ? 'Thả file tại đây...' : 'Kéo thả hoặc click để chọn file PDF, DOCX, TXT'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Tối đa 50MB</p>
        </div>

        {/* File List */}
        {uploadedFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            {uploadedFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 flex-1 truncate">{file.name}</span>
                <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Selected Resources */}
        {selectedResources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedResources.map((r) => (
              <span
                key={r.id}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                  r.type === 'system' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200',
                )}
              >
                {r.type === 'system' ? '📕' : '📁'} {r.name}
                <button type="button" onClick={() => removeResource(r.id)} className="hover:text-red-500 ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Link to library */}
        <button
          type="button"
          onClick={() => router.push('/resources')}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          Chọn từ Thư viện tài nguyên
        </button>
      </div>

      {/* Section 3: Thông tin bổ sung (collapsible) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setOptionalOpen(!optionalOpen)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-green-600" />
            Thông tin bổ sung
            <span className="text-xs text-gray-400 font-normal ml-1">(tùy chọn)</span>
          </h2>
          {optionalOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {optionalOpen && (
          <div className="px-6 pb-6 space-y-4 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mục tiêu bài học</label>
              <textarea
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                placeholder="Mỗi mục tiêu trên một dòng&#10;VD: Nhận diện được dạng hàm số bậc nhất&#10;Vẽ được đồ thị..."
                className="input-field min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nội dung muốn nhấn mạnh</label>
              <textarea
                value={emphasis}
                onChange={(e) => setEmphasis(e.target.value)}
                placeholder="VD: Phần ứng dụng thực tế, thí nghiệm minh họa..."
                className="input-field min-h-[60px] resize-y"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Yêu cầu đặc biệt</label>
              <textarea
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="VD: Dùng Kahoot khởi động, nhóm 4 HS, thời gian 45 phút..."
                className="input-field min-h-[60px] resize-y"
                rows={2}
              />
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting || !subject || !grade || !topic}
        className={cn(
          'w-full btn-primary flex items-center justify-center gap-2 text-lg py-4',
          (isSubmitting || !subject || !grade || !topic) && 'opacity-60 cursor-not-allowed',
        )}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Đang gửi yêu cầu...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Tạo Giáo Án
          </>
        )}
      </button>
    </form>
  );
}
