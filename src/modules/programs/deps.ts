import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * 공개 프로그램 목록 service 의존성 주입 컨테이너.
 * production 기본값은 싱글턴 prisma이고, 통합 테스트는 test DB 클라이언트를 주입한다.
 */
export interface ProgramsDeps {
  db: PrismaClient;
}

let cachedDefaults: ProgramsDeps | undefined;

export function getDefaultProgramsDeps(): ProgramsDeps {
  cachedDefaults ??= { db: prisma };
  return cachedDefaults;
}
