'use client';

import { useEffect, useRef } from 'react';

/**
 * 접근 가능한 오류 요약 — 실패 상태가 도착하면 포커스를 이동시켜
 * 스크린리더·키보드 사용자가 바로 오류를 인지할 수 있게 한다.
 */
export function ErrorSummary({ title, messages }: { title: string; messages: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      ref.current?.focus();
    }
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="border-terracotta bg-terracotta/5 text-foreground border px-4 py-3 text-sm"
    >
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-inside list-disc">
        {messages.map((message, index) => (
          // 같은 문구가 여러 필드에서 나올 수 있다 (예: 약관·개인정보 동의 오류) — index 결합 key
          <li key={`${index}-${message}`}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
