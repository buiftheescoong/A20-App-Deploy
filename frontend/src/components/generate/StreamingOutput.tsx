'use client';

import { useEffect, useRef } from 'react';
import LessonPlanPreviewEditor from './LessonPlanPreviewEditor';

interface Props {
  markdown: string;
  isStreaming: boolean;
}

export default function StreamingOutput({ markdown, isStreaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [markdown, isStreaming]);

  return (
    <>
      <LessonPlanPreviewEditor
        markdown={markdown}
        isStreaming={isStreaming}
        canEdit={false}
        showToolbar={false}
      />
      <div ref={endRef} />
    </>
  );
}
