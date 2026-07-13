import type { DefaultSession } from 'next-auth';

import type { UserRole, UserStatus } from '@/generated/prisma/client';

/**
 * Auth.js 타입 증강 — JWT/session에 싣는 최소 클레임(userId, role, status).
 * credentialVersion은 passwordHash의 HMAC digest다 (raw hash 아님 — modules/auth/tokens.ts).
 */
declare module 'next-auth' {
  interface User {
    role?: UserRole;
    status?: UserStatus;
    credentialVersion?: string;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      status: UserStatus;
    } & DefaultSession['user'];
  }
}

// JWT 인터페이스는 next-auth/jwt이 아니라 @auth/core/jwt에 선언되어 있다
// (next-auth/jwt는 순수 re-export라 augmentation이 병합되지 않는다).
// @auth/core는 next-auth·@auth/prisma-adapter가 0.41.2로 고정한 것과 동일 버전을
// devDependency로 두어 타입 해석 경로를 확보한다 — next-auth 업그레이드 시 함께 올린다.
declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string;
    role?: UserRole;
    status?: UserStatus;
    credentialVersion?: string | null;
  }
}
