import { useEffect, useRef, useState } from 'react';

/** Long active text has a bounded Markdown parse cadence; completion always renders exact text. */
export function useStreamingText(content: string, streaming: boolean): string {
  const latest = useRef(content);
  useEffect(() => { latest.current = content; }, [content]);
  const [display, setDisplay] = useState(content);
  const interval = content.length > 40_000 ? 200 : content.length > 8_000 ? 100 : 16;
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setDisplay(latest.current), interval);
    return () => clearInterval(timer);
  }, [streaming, interval]);
  return streaming && content.startsWith(display) ? display : content;
}
