import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7은 .env를 자동 로드하지 않는다 — .env.local 우선, .env 보조 (앞선 파일이 우선).
loadEnv({ path: ['.env.local', '.env'], quiet: true });

// 미설정 시 로컬 dev DB로만 기본 연결한다. production/staging은 반드시 명시적으로 설정할 것.
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/handalsalgi_dev';

export default defineConfig({
  // multi-file schema: prisma/schema.prisma(datasource·generator) + prisma/models/*.prisma
  schema: 'prisma',
  // Prisma 7: CLI(migrate/validate 등)가 사용하는 연결 URL은 schema가 아니라 여기서 공급한다.
  // 런타임 연결은 src/lib/prisma.ts의 driver adapter가 담당한다.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
