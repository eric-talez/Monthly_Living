import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

/**
 * 통합 테스트 전용 Prisma client + 데이터 규칙.
 *
 * - 연결은 항상 TEST_DATABASE_URL (setup.ts가 가드 통과를 보장).
 * - 테스트가 만드는 모든 사용자·LoginAttempt는 runId prefix 이메일을 사용하고,
 *   cleanup은 그 prefix 데이터만 삭제한다. seed 계정 이메일(traveler@test.com 등)을
 *   test DB에 literal로 생성하지 않는다.
 */
export const runId = `it${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function testEmail(label: string): string {
  return `${runId}-${label}@auth-it.test`.toLowerCase();
}

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }),
});

/** 이 테스트 실행(runId)이 만든 데이터만 삭제한다 — token/consent는 user cascade */
export async function cleanupOwnData(): Promise<void> {
  await testPrisma.user.deleteMany({ where: { email: { startsWith: `${runId}-` } } });
  await testPrisma.loginAttempt.deleteMany({ where: { email: { startsWith: `${runId}-` } } });
}

export async function disconnect(): Promise<void> {
  await testPrisma.$disconnect();
}
