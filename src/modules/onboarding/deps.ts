import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * 온보딩 service 의존성 주입 컨테이너.
 * production 기본값은 싱글턴 prisma이고, 테스트는 test DB 클라이언트를 주입한다.
 */
export interface OnboardingDeps {
  db: PrismaClient;
}

let cachedDefaults: OnboardingDeps | undefined;

export function getDefaultOnboardingDeps(): OnboardingDeps {
  cachedDefaults ??= { db: prisma };
  return cachedDefaults;
}
