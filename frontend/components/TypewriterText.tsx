'use client';

import { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

export default function TypewriterText({
  text,
  speed = 10,
  className = '',
  onComplete,
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const textRef = useRef(text);

  useEffect(() => {
    // If the text changes significantly (new content), reset or jump ahead
    if (text !== textRef.current) {
        // If the new text is an extension of the old one, we continue
        // If it's totally different, we might want to reset
        if (!text.startsWith(textRef.current)) {
            setDisplayedText('');
            setCurrentIndex(0);
        }
        textRef.current = text;
    }
  }, [text]);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  return <div className={className}>{displayedText}</div>;
}
