import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';
import { env } from '@/lib/env';

function createPrismaClient() {
  // env.DATABASE_URL은 zod 검증을 통과한 값만 온다 — 미설정이면 env 로드 시점에 실패 (fail-closed)
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// dev 핫리로드 시 커넥션 풀 누수를 막기 위한 global singleton
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
