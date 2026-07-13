import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // 'server-only'는 react-server 조건 밖(Node/vitest)에서 import 시 throw하는
      // 패키지다 — 테스트에서는 빈 stub으로 대체한다.
      'server-only': resolvePath('./tests/stubs/server-only.ts'),
      '@': resolvePath('./src'),
    },
  },
  test: {
    server: {
      deps: {
        // next-auth ESM은 확장자 없는 'next/server' 등을 import한다 — Node 기본
        // 해석으로는 실패하므로 vite 파이프라인(인라인)으로 export map을 해석시킨다.
        inline: ['next-auth'],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          // 통합 테스트는 하나의 test DB를 공유한다 — 파일 단위 직렬 실행
          fileParallelism: false,
        },
      },
    ],
  },
});
