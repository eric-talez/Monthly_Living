import 'server-only';

import { getEmailProvider } from '@/adapters/email';
import type { EmailProvider } from '@/adapters/email/types';
import type { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

import { createMemoryAuthRateLimiters, type AuthRateLimiters } from './rate-limit';
import { generateRawToken } from './tokens';

/**
 * auth service 의존성 주입 컨테이너.
 * production 기본값은 실제 어댑터(싱글턴 prisma, console email, memory limiter)이고,
 * 테스트는 capture email provider·고정 clock·결정적 token factory를 주입한다 —
 * console 출력을 테스트 oracle로 사용하지 않기 위한 구조다.
 */
export interface AuthServiceDeps {
  db: PrismaClient;
  emailProvider: EmailProvider;
  rateLimiters: AuthRateLimiters;
  now: () => Date;
  generateToken: () => string;
}

let cachedDefaults: AuthServiceDeps | undefined;

export function getDefaultAuthDeps(): AuthServiceDeps {
  cachedDefaults ??= {
    db: prisma,
    emailProvider: getEmailProvider(),
    // memory limiter 저장소는 globalThis에 있으므로 HMR로 이 모듈이 재평가돼도 카운터는 유지된다
    rateLimiters: createMemoryAuthRateLimiters(),
    now: () => new Date(),
    generateToken: generateRawToken,
  };
  return cachedDefaults;
}
