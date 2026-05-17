'use client';

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Columns3,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import { errorMessage, updatePlan } from '@/lib/api';
import { cleanMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import type { Plan } from '@/lib/types';
import { toast } from '@/components/ui/Toaster';

export type LessonPlanEditorMode = 'preview' | 'edit' | 'split';

const MARKDOWN_PLUGINS = [remarkGfm];
const MARKDOWN_COMPONENTS: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="markdown-table-scroll">
      <table {...props} />
    </div>
  ),
};

interface Props {
  markdown: string;
  planId?: string;
  isStreaming?: boolean;
  canEdit?: boolean;
  mode?: LessonPlanEditorMode;
  defaultMode?: LessonPlanEditorMode;
  onModeChange?: (mode: LessonPlanEditorMode) => void;
  onSaved?: (plan: Plan) => void;
  className?: string;
  bodyClassName?: string;
  showToolbar?: boolean;
  emptyMessage?: string;
}

export default function LessonPlanPreviewEditor({
  markdown,
  planId,
  isStreaming = false,
  canEdit = false,
  mode,
  defaultMode = 'preview',
  onModeChange,
  onSaved,
  className,
  bodyClassName,
  showToolbar = true,
  emptyMessage = 'Giáo án sẽ hiển thị tại đây...',
}: Props) {
  const normalizedMarkdown = useMemo(
    () => (isStreaming ? markdown.replace(/\r\n?/g, '\n') : cleanMarkdown(markdown)),
    [isStreaming, markdown],
  );
  const [internalMode, setInternalMode] = useState<LessonPlanEditorMode>(defaultMode);
  const [draft, setDraft] = useState(normalizedMarkdown);
  const [saving, setSaving] = useState(false);
  const [followOutput, setFollowOutput] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const activeMode = mode ?? internalMode;
  const isEditMode = activeMode !== 'preview';
  const effectiveCanEdit = Boolean(canEdit && planId && normalizedMarkdown.trim() && !isStreaming);
  const isDirty = draft !== normalizedMarkdown;

  const setActiveMode = (nextMode: LessonPlanEditorMode) => {
    if (nextMode !== 'preview' && !effectiveCanEdit) return;
    onModeChange?.(nextMode);
    if (mode === undefined) setInternalMode(nextMode);
  };

  useEffect(() => {
    if (!isEditMode && !saving) {
      setDraft(normalizedMarkdown);
    }
  }, [isEditMode, normalizedMarkdown, saving]);

  useEffect(() => {
    if (!effectiveCanEdit && activeMode !== 'preview') {
      setActiveMode('preview');
    }
    // setActiveMode intentionally omitted because it is derived from props/state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, effectiveCanEdit]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleCancel = () => {
    if (isDirty && !window.confirm('Bỏ thay đổi chưa lưu?')) return;
    setDraft(normalizedMarkdown);
    setActiveMode('preview');
  };

  const handleSave = async () => {
    if (!planId || saving) return;

    const nextMarkdown = draft.trim();
    if (!nextMarkdown) {
      toast('Nội dung giáo án không được trống', 'warning');
      return;
    }

    setSaving(true);
    try {
      const updatedPlan = await updatePlan(planId, { content_markdown: nextMarkdown });
      const savedMarkdown = updatedPlan.contentMarkdown || nextMarkdown;

      setDraft(cleanMarkdown(savedMarkdown));
      onSaved?.(updatedPlan);
      setActiveMode('preview');
      toast('Đã lưu chỉnh sửa', 'success');
    } catch (error: unknown) {
      toast(errorMessage(error, 'Lưu chỉnh sửa thất bại'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const previewMarkdown = isEditMode ? draft : normalizedMarkdown;
  const showEmptyState = !previewMarkdown.trim() && !isStreaming;

  useEffect(() => {
    if (isStreaming) {
      setFollowOutput(true);
    }
  }, [planId, isStreaming]);

  useEffect(() => {
    if (!isStreaming || !followOutput || isEditMode) return;
    const target = bodyRef.current;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      target.scrollTop = target.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [followOutput, isEditMode, isStreaming, previewMarkdown]);

  const handleBodyScroll = () => {
    if (!isStreaming || !bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const shouldFollowOutput = scrollHeight - scrollTop - clientHeight < 120;
    setFollowOutput((current) => current === shouldFollowOutput ? current : shouldFollowOutput);
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      {showToolbar && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <ModeButton
              active={activeMode === 'preview'}
              icon={<Eye className="h-4 w-4" />}
              label="Xem"
              onClick={() => setActiveMode('preview')}
            />
            <ModeButton
              active={activeMode === 'edit'}
              disabled={!effectiveCanEdit}
              icon={<Pencil className="h-4 w-4" />}
              label="Sửa"
              onClick={() => setActiveMode('edit')}
            />
            <ModeButton
              active={activeMode === 'split'}
              disabled={!effectiveCanEdit}
              icon={<Columns3 className="h-4 w-4" />}
              label="Tách"
              onClick={() => setActiveMode('split')}
            />
          </div>

          <div className="flex-1" />

          {isEditMode && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Lưu
              </button>
            </div>
          )}

          {isStreaming && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang tạo
            </span>
          )}
        </div>
      )}

      <div
        ref={bodyRef}
        onScroll={handleBodyScroll}
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto bg-slate-50/40',
          activeMode === 'split' ? 'p-3 sm:p-4' : 'px-4 py-5 sm:px-6 lg:px-8',
          bodyClassName,
        )}
      >
        {showEmptyState ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-gray-400">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <FileText className="h-7 w-7" />
            </div>
            <p className="text-sm">{emptyMessage}</p>
          </div>
        ) : activeMode === 'edit' ? (
          <MarkdownTextarea value={draft} onChange={setDraft} disabled={saving} />
        ) : activeMode === 'split' ? (
          <div className="grid h-full min-h-[520px] gap-4 lg:grid-cols-2">
            <MarkdownTextarea
              value={draft}
              onChange={setDraft}
              disabled={saving}
              className="h-full resize-none lg:min-h-0"
            />
            <div className="min-h-[520px] overflow-y-auto rounded-lg border border-gray-200 bg-white px-4 py-5 shadow-inner lg:min-h-0 sm:px-5">
              <MarkdownPreview markdown={previewMarkdown} isStreaming={isStreaming} variant="split" />
            </div>
          </div>
        ) : (
          <article className="mx-auto min-w-0 max-w-3xl rounded-lg border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8 lg:max-w-4xl lg:px-10">
            <MarkdownPreview markdown={previewMarkdown} isStreaming={isStreaming} />
          </article>
        )}

        {isStreaming && !followOutput && !isEditMode && (
          <button
            type="button"
            onClick={() => {
              setFollowOutput(true);
              if (bodyRef.current) {
                bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
              }
            }}
            className="sticky bottom-3 left-1/2 mt-4 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700"
          >
            Theo dõi đầu ra
          </button>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold transition-colors',
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-white',
        disabled && 'cursor-not-allowed text-gray-300 hover:bg-transparent',
      )}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MarkdownTextarea({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      spellCheck
      className={cn(
        'min-h-[520px] w-full resize-y rounded-lg border border-gray-200 bg-white p-4 font-mono text-sm leading-6 text-gray-800 shadow-inner outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-50',
        className,
      )}
    />
  );
}

const MarkdownPreview = memo(function MarkdownPreview({
  markdown,
  isStreaming,
  variant = 'document',
}: {
  markdown: string;
  isStreaming: boolean;
  variant?: 'document' | 'split';
}) {
  return (
    <div className={cn('markdown-output min-w-0', variant === 'split' && 'markdown-output-compact')}>
      <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
        {markdown}
      </ReactMarkdown>
      {isStreaming && <span className="streaming-cursor" />}
    </div>
  );
});
