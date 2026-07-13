import 'server-only';

import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterUser } from 'next-auth/adapters';

import type { PrismaClient } from '@/generated/prisma/client';
import { routing } from '@/i18n/routing';

import { CONSENT_TERMS_VERSION } from './constants';
import { getOAuthRequestContext } from './oauth-request-context';
import { emailSchema } from './validation';

/**
 * OAuth 전용 custom adapter — @auth/prisma-adapter를 기반으로
 * createUser/linkAccount만 교체한다 (docs/decisions/oauth-account-linking.md).
 *
 * 이 프로젝트에서 adapter.createUser/linkAccount가 호출되는 경로는
 * OAuth 신규 가입뿐이다(email/webauthn provider 없음 — @auth/core@0.41.2
 * handle-login.js 실측). Credentials 로그인은 adapter를 사용하지 않는다.
 *
 * 원자성 원칙: Auth.js core는 createUser → linkAccount를 별도 호출로 실행하므로
 * (handle-login.js:260→264, 원자성 없음) 각 단계를 자체 transaction으로 묶고,
 * linkAccount 실패 시 이번 요청에서 만든 provisional User를 보상 삭제한다.
 *
 * 로그 규칙: 이메일·토큰·프로필 값은 어떤 로그·오류 메시지에도 싣지 않는다.
 */

/** linkAccount 불변식 위반 — reason은 비민감 slug만 사용한다 (오류 페이지에는 일반화 메시지만 노출) */
export class OAuthLinkBlockedError extends Error {
  constructor(reason: string) {
    super(`[auth][oauth] linkAccount blocked: ${reason}`);
    this.name = 'OAuthLinkBlockedError';
  }
}

export interface OAuthAdapterHooks {
  /**
   * 테스트 전용 실패 주입 지점 — linkAccount transaction 안(Account 생성 직전)에서
   * 실행된다. throw하면 transaction 전체가 롤백되고 보상 정리가 동작한다.
   * production 구성(src/auth.ts)은 hooks를 전달하지 않는다.
   */
  beforeLinkAccountCommit?: () => void | Promise<void>;
}

export function createOAuthAdapter(db: PrismaClient, hooks?: OAuthAdapterHooks): Adapter {
  const base = PrismaAdapter(db);

  return {
    ...base,

    /**
     * 신규 OAuth 사용자 생성 — User와 필수 동의 기록(ConsentRecord 3행)을
     * 같은 transaction에서 만든다. OAuth 화면의 고지("계속하면 이용약관과
     * 개인정보처리방침에 동의합니다")에 근거해 TERMS/PRIVACY는 granted=true,
     * MARKETING은 명시 동의가 없으므로 granted=false로 기록한다.
     * preferredLanguage는 flow를 시작한 locale(요청 컨텍스트)이다.
     * emailVerified는 여기서 설정하지 않는다 — Account 연결과 같은
     * transaction(linkAccount)에서만 설정해 부분 상태를 차단한다.
     */
    createUser: async (user: AdapterUser) => {
      // signIn callback(단일 정책 지점)이 이미 검증·정규화 가능한 이메일만 통과시켰다.
      // 여기 도달한 비정상 값은 방어적으로 기동을 중단한다 (값은 로그에 싣지 않는다).
      const parsedEmail = emailSchema.safeParse(user.email);
      if (!parsedEmail.success) {
        throw new Error('[auth][oauth] createUser rejected: malformed email input');
      }

      const context = getOAuthRequestContext();
      const locale = context?.locale ?? routing.defaultLocale;

      const created = await db.$transaction(async (tx) => {
        const row = await tx.user.create({
          data: {
            email: parsedEmail.data,
            name: user.name ?? null,
            image: user.image ?? null,
            preferredLanguage: locale,
          },
        });
        await tx.consentRecord.createMany({
          data: [
            { userId: row.id, type: 'TERMS', version: CONSENT_TERMS_VERSION, granted: true },
            { userId: row.id, type: 'PRIVACY', version: CONSENT_TERMS_VERSION, granted: true },
            { userId: row.id, type: 'MARKETING', version: CONSENT_TERMS_VERSION, granted: false },
          ],
        });
        return row;
      });

      if (context) {
        context.provisionalUserId = created.id;
      }
      return created;
    },

    /**
     * Account 연결 — 검증·Account 생성·emailVerified 갱신을 한 transaction에서 처리한다.
     *
     * 불변식(사용자 확정: 엄격 차단): Account 행은 "이번 flow에서 방금 생성된
     * OAuth 전용 신규 user"에게만 붙는다. 즉 대상 user는 ACTIVE·미삭제·
     * passwordHash null·기존 Account 0개여야 한다. 이 불변식이 정지/삭제 계정
     * 연결, 로그인된 세션에 편승한 연결(@auth/core handle-login.js:209),
     * 설정 회귀로 인한 동일 이메일 자동 연결을 DB 접근 계층에서 전부 차단한다.
     *
     * 입력은 허용 필드만 명시적으로 pick한다 — provider token
     * (access_token/refresh_token/id_token/session_state 등)은 이번 Phase에서
     * 저장하지 않는다(§ provider token 최소 저장, 결정 문서).
     */
    linkAccount: async (account) => {
      const data = {
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      };

      try {
        await db.$transaction(async (tx) => {
          // 동일 user에 대한 동시 연결을 직렬화한다 (service.ts replaceToken과 동일 패턴)
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${data.userId} FOR UPDATE`;

          const user = await tx.user.findUnique({
            where: { id: data.userId },
            select: { status: true, deletedAt: true, passwordHash: true, emailVerified: true },
          });
          if (!user) {
            throw new OAuthLinkBlockedError('user-missing');
          }
          if (user.status !== 'ACTIVE' || user.deletedAt !== null) {
            throw new OAuthLinkBlockedError('user-not-active');
          }
          if (user.passwordHash !== null) {
            throw new OAuthLinkBlockedError('user-has-credentials');
          }
          const linkedAccounts = await tx.account.count({ where: { userId: data.userId } });
          if (linkedAccounts !== 0) {
            throw new OAuthLinkBlockedError('user-already-linked');
          }

          await hooks?.beforeLinkAccountCommit?.();

          await tx.account.create({ data });

          // provider가 검증한 이메일만 signIn callback을 통과하므로(단일 정책 지점),
          // 연결이 확정되는 이 transaction에서만 emailVerified를 설정한다.
          if (user.emailVerified === null) {
            await tx.user.update({
              where: { id: data.userId },
              data: { emailVerified: new Date() },
            });
          }
        });
      } catch (error) {
        await cleanupProvisionalUser(db, data.userId);
        throw error;
      }
    },
  };
}

/**
 * linkAccount 실패 시 보상 정리 — 이번 OAuth 시도에서 방금 생성된 provisional
 * User(와 cascade되는 ConsentRecord)만 제거한다. 증명은 이중이다:
 * 1) provenance: 같은 요청 컨텍스트의 provisionalUserId와 일치할 때만 시도
 * 2) 상태: passwordHash null + Account 0개인 row만 조건부 삭제 (deleteMany)
 * 둘 중 하나라도 어긋나면 아무것도 지우지 않는다 — 기존 사용자는 어떤 경로로도
 * hard delete되지 않는다. (프로세스 중단 등으로 보상 자체가 못 도는 창은
 * 알려진 한계로 결정 문서에 기록.)
 */
async function cleanupProvisionalUser(db: PrismaClient, userId: string): Promise<void> {
  const context = getOAuthRequestContext();
  if (!context || context.provisionalUserId !== userId) {
    return;
  }

  try {
    await db.user.deleteMany({
      where: { id: userId, passwordHash: null, accounts: { none: {} } },
    });
  } catch (cleanupError) {
    // 보상 실패는 원 오류를 가리지 않는다 — 식별자만 없는 메시지로 기록
    console.error(
      '[auth][oauth] provisional user cleanup failed',
      cleanupError instanceof Error ? cleanupError.message : cleanupError,
    );
  } finally {
    context.provisionalUserId = undefined;
  }
}
