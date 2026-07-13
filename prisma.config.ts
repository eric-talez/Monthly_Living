import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7은 .env를 자동 로드하지 않는다 — .env.local 우선, .env 보조 (앞선 파일이 우선).
loadEnv({ path: ['.env.local', '.env'], quiet: true });

// fail-closed: DATABASE_URL fallback 없음.
// 미설정 상태에서 migrate 등 DB 연결이 필요한 CLI 명령은 명확하게 실패한다.
// (generate처럼 연결이 불필요한 명령은 URL 없이도 동작해야 하므로 조건부로만 전달)
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  // multi-file schema: prisma/schema.prisma(datasource·generator) + prisma/models/*.prisma
  schema: 'prisma',
  migrations: {
    // `prisma db seed`가 이 명령을 사용한다.
    // (Prisma 7.8 실측: `migrate reset`은 seed를 자동 실행하지 않는다 — scripts/db-reset.ts 참고)
    seed: 'tsx prisma/seed.ts',
  },
  // 런타임 연결은 src/lib/prisma.ts의 driver adapter가 담당한다.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
