'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, Undo, Redo, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
  onSave: (newContent: string) => void;
  onCancel: () => void;
}

export default function InlineEditor({ content, onSave, onCancel }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Nhập nội dung...' }),
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[100px] p-3',
      },
    },
  });

  if (!editor) return null;

  const handleSave = () => {
    onSave(editor.getHTML());
  };

  return (
    <div className="border-2 border-blue-500 rounded-xl overflow-hidden bg-white shadow-lg animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} icon={<Bold className="w-4 h-4" />} />
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} icon={<Italic className="w-4 h-4" />} />
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={<List className="w-4 h-4" />} />
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarBtn active={false} onClick={() => editor.chain().focus().undo().run()} icon={<Undo className="w-4 h-4" />} />
        <ToolbarBtn active={false} onClick={() => editor.chain().focus().redo().run()} icon={<Redo className="w-4 h-4" />} />
        <div className="flex-1" />
        <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <X className="w-3 h-3" /> Hủy
        </button>
        <button onClick={handleSave} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1">
          <Save className="w-3 h-3" /> Lưu
        </button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarBtn({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100',
      )}
    >
      {icon}
    </button>
  );
}
