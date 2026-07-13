import 'server-only';

import { env } from '@/lib/env';

import { createConsoleEmailProvider } from './console';
import type { EmailProvider } from './types';

/**
 * 환경변수로 선택된 email provider를 돌려준다.
 * Phase 1C는 console만 지원한다 — 개발에서는 본문(인증 URL 포함)을 출력하고,
 * 그 외 환경에서는 token/URL/본문이 로그에 남지 않도록 redacted로 동작한다.
 */
export function getEmailProvider(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'console':
      return createConsoleEmailProvider(env.NODE_ENV === 'development' ? 'verbose' : 'redacted');
  }
}
