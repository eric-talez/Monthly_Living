import { afterAll, describe, expect, it, vi } from 'vitest';

import { CONSENT_TERMS_VERSION } from '@/modules/auth/constants';

import { cleanupOwnData, disconnect, runId, testEmail, testPrisma } from './helpers/db';
import {
  completeOAuthCallback,
  createOAuthTestApp,
  expectErrorRedirect,
  expectSuccessRedirect,
  FAKE_GOOGLE_ACCESS_TOKEN_PREFIX,
  FAKE_GOOGLE_REFRESH_TOKEN_PREFIX,
  FAKE_KAKAO_ACCESS_TOKEN_PREFIX,
  FAKE_KAKAO_REFRESH_TOKEN_PREFIX,
  nextAuthorizationCode,
  performGoogleLogin,
  performKakaoLogin,
  startOAuthSignIn,
} from './helpers/oauth';
import {
  CookieJar,
  fetchSession,
  SESSION_COOKIE,
  sessionUser,
  signInWithCredentials,
} from './helpers/session';
import { createRegisteredUser } from './helpers/users';

/**
 * 실제 next-auth handlers(고정 5.0.0-beta.31)로 OAuth 전체 왕복을 구동하는
 * 통합 테스트 — provider 네트워크만 fake fetch로 대체한다 (helpers/oauth.ts).
 * helper mock이 아니라 csrf → signin → authorization redirect → callback →
 * session까지 쿠키 왕복 전부를 지나며, DB는 TEST_DATABASE_URL만 사용한다.
 */

const app = createOAuthTestApp();

/** providerAccountId도 runId를 붙여 test DB 재사용 시 충돌을 방지한다 */
const providerSub = (label: string) => `${runId}-${label}`;

afterAll(async () => {
  await cleanupOwnData();
  await disconnect();
});

async function loadUserWithRelations(email: string) {
  return testPrisma.user.findUnique({
    where: { email },
    include: { accounts: true, consents: true },
  });
}

describe('Google OAuth: 신규 가입', () => {
  it('신규 사용자·Account·동의 3건이 생성되고 세션에 id/role/status가 실린다', async () => {
    const email = testEmail('g-new');
    const sub = providerSub('g-new');
    const jar = new CookieJar();

    const response = await performGoogleLogin(app, jar, {
      sub,
      email,
      email_verified: true,
      name: 'Google User',
      picture: 'https://example.com/avatar.png',
    });
    expectSuccessRedirect(response);
    expect(jar.has(SESSION_COOKIE)).toBe(true);

    const { body } = await fetchSession(jar, app.auth);
    const su = sessionUser(body);
    expect(su?.email).toBe(email);

    const record = await loadUserWithRelations(email);
    expect(record).not.toBeNull();
    expect(body).toMatchObject({
      user: { id: record!.id, role: 'TRAVELER', status: 'ACTIVE' },
    });

    // provider 검증 이메일 → 연결 transaction에서 emailVerified 설정
    expect(record!.emailVerified).not.toBeNull();
    expect(record!.passwordHash).toBeNull();
    expect(record!.status).toBe('ACTIVE');
    expect(record!.role).toBe('TRAVELER');
    expect(record!.preferredLanguage).toBe('ko');
    expect(record!.name).toBe('Google User');

    // Account에는 identity 최소 필드만 — provider token은 저장하지 않는다
    expect(record!.accounts).toHaveLength(1);
    const account = record!.accounts[0];
    expect(account.provider).toBe('google');
    expect(account.providerAccountId).toBe(sub);
    expect(account.type).toBe('oidc');
    expect(account.access_token).toBeNull();
    expect(account.refresh_token).toBeNull();
    expect(account.id_token).toBeNull();
    expect(account.session_state).toBeNull();
    expect(account.scope).toBeNull();
    expect(account.token_type).toBeNull();
    expect(account.expires_at).toBeNull();

    // 필수 동의 2건 granted=true + 마케팅 미동의 1건 — 정확히 3행
    expect(record!.consents).toHaveLength(3);
    const byType = Object.fromEntries(record!.consents.map((c) => [c.type, c]));
    expect(byType.TERMS).toMatchObject({ granted: true, version: CONSENT_TERMS_VERSION });
    expect(byType.PRIVACY).toMatchObject({ granted: true, version: CONSENT_TERMS_VERSION });
    expect(byType.MARKETING).toMatchObject({ granted: false, version: CONSENT_TERMS_VERSION });

    // 세션 응답(클라이언트 노출)에 token·secret이 없다
    const sessionText = JSON.stringify(body);
    expect(sessionText).not.toContain(FAKE_GOOGLE_ACCESS_TOKEN_PREFIX);
    expect(sessionText).not.toContain(FAKE_GOOGLE_REFRESH_TOKEN_PREFIX);
    expect(sessionText).not.toContain('vitest-google-client-secret');
  });

  it('같은 provider/account 재로그인은 같은 User·Account를 재사용한다 (동의 중복 없음)', async () => {
    const email = testEmail('g-repeat');
    const sub = providerSub('g-repeat');

    const first = new CookieJar();
    expectSuccessRedirect(
      await performGoogleLogin(app, first, { sub, email, email_verified: true }),
    );
    const created = await loadUserWithRelations(email);

    const second = new CookieJar();
    expectSuccessRedirect(
      await performGoogleLogin(app, second, { sub, email, email_verified: true }),
    );
    const { body } = await fetchSession(second, app.auth);
    expect(sessionUser(body)?.id).toBe(created!.id);

    const after = await loadUserWithRelations(email);
    expect(after!.id).toBe(created!.id);
    expect(after!.accounts).toHaveLength(1);
    expect(after!.consents).toHaveLength(3); // 반복 로그인이 동의를 다시 만들지 않는다
    expect(await testPrisma.user.count({ where: { email } })).toBe(1);
  });

  it('provider 쪽 이메일이 바뀐 재로그인도 기존 소유자로만 로그인된다 (재지정·이메일 갱신 없음)', async () => {
    const emailA = testEmail('g-email-a');
    const emailB = testEmail('g-email-b');
    const sub = providerSub('g-email-change');

    const first = new CookieJar();
    expectSuccessRedirect(
      await performGoogleLogin(app, first, { sub, email: emailA, email_verified: true }),
    );
    const owner = await testPrisma.user.findUniqueOrThrow({ where: { email: emailA } });

    // 같은 providerAccountId, 다른(검증된) 이메일 — 계정 탈취 시나리오
    const second = new CookieJar();
    const response = await performGoogleLogin(app, second, {
      sub,
      email: emailB,
      email_verified: true,
    });
    expectSuccessRedirect(response);

    const { body } = await fetchSession(second, app.auth);
    expect(sessionUser(body)?.id).toBe(owner.id); // 기존 소유자로 로그인될 뿐

    expect(await testPrisma.user.count({ where: { email: emailB } })).toBe(0); // 새 user 없음
    const unchanged = await testPrisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(unchanged.email).toBe(emailA); // 이메일 재지정 없음
    expect(
      await testPrisma.account.count({ where: { provider: 'google', providerAccountId: sub } }),
    ).toBe(1);
  });
});

describe('Kakao OAuth: 신규 가입', () => {
  it('숫자 id·nickname 프로필로 가입되고 token 컬럼은 전부 null이다', async () => {
    const email = testEmail('k-new');
    const jar = new CookieJar();

    const response = await performKakaoLogin(app, jar, {
      id: 9_900_000_001,
      email,
      is_email_valid: true,
      is_email_verified: true,
      nickname: '카카오사용자',
    });
    expectSuccessRedirect(response);

    const record = await loadUserWithRelations(email);
    expect(record).not.toBeNull();
    expect(record!.emailVerified).not.toBeNull();
    expect(record!.name).toBe('카카오사용자');
    expect(record!.preferredLanguage).toBe('ko');
    expect(record!.consents).toHaveLength(3);

    expect(record!.accounts).toHaveLength(1);
    const account = record!.accounts[0];
    expect(account.provider).toBe('kakao');
    expect(account.providerAccountId).toBe('9900000001');
    expect(account.type).toBe('oauth');
    // Kakao 실서버가 보내는 refresh_token_expires_in 포함 — 어떤 token도 저장되지 않는다
    expect(account.access_token).toBeNull();
    expect(account.refresh_token).toBeNull();
    expect(account.id_token).toBeNull();
    expect(account.session_state).toBeNull();

    const { body } = await fetchSession(jar, app.auth);
    expect(body).toMatchObject({ user: { id: record!.id, role: 'TRAVELER', status: 'ACTIVE' } });

    // 같은 계정 재로그인 idempotency
    const again = new CookieJar();
    expectSuccessRedirect(
      await performKakaoLogin(app, again, {
        id: 9_900_000_001,
        email,
        is_email_valid: true,
        is_email_verified: true,
      }),
    );
    const after = await loadUserWithRelations(email);
    expect(after!.accounts).toHaveLength(1);
    expect(after!.consents).toHaveLength(3);
  });
});

describe('locale 전파 (callback-url 쿠키 → preferredLanguage)', () => {
  it('/en에서 시작한 신규 가입은 preferredLanguage=en', async () => {
    const email = testEmail('g-en');
    const jar = new CookieJar();
    expectSuccessRedirect(
      await performGoogleLogin(
        app,
        jar,
        { sub: providerSub('g-en'), email, email_verified: true },
        { callbackUrl: '/en' },
      ),
    );
    const record = await testPrisma.user.findUniqueOrThrow({ where: { email } });
    expect(record.preferredLanguage).toBe('en');
  });

  it('기본(한국어) 경로에서 시작한 신규 가입은 preferredLanguage=ko', async () => {
    const email = testEmail('k-ko');
    const jar = new CookieJar();
    expectSuccessRedirect(
      await performKakaoLogin(
        app,
        jar,
        { id: providerSub('k-ko'), email, is_email_valid: true, is_email_verified: true },
        { callbackUrl: '/' },
      ),
    );
    const record = await testPrisma.user.findUniqueOrThrow({ where: { email } });
    expect(record.preferredLanguage).toBe('ko');
  });
});

describe('거부 정책: 이메일·식별자', () => {
  it('이메일이 없는 Google 프로필은 거부된다 (user/Account 미생성)', async () => {
    const sub = providerSub('g-no-email');
    const jar = new CookieJar();
    const response = await performGoogleLogin(app, jar, { sub, email_verified: true });
    expect(expectErrorRedirect(response)).toBe('AccessDenied');
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(
      await testPrisma.account.count({ where: { provider: 'google', providerAccountId: sub } }),
    ).toBe(0);
  });

  it('email_verified가 boolean true가 아니면 거부된다 (false·문자열 "true")', async () => {
    for (const [label, emailVerified] of [
      ['false', false],
      ['string', 'true'],
    ] as const) {
      const email = testEmail(`g-unverified-${label}`);
      const jar = new CookieJar();
      const response = await performGoogleLogin(app, jar, {
        sub: providerSub(`g-unverified-${label}`),
        email,
        email_verified: emailVerified,
      });
      expect(expectErrorRedirect(response)).toBe('AccessDenied');
      expect(await testPrisma.user.count({ where: { email } })).toBe(0);
    }
  });

  it('Kakao is_email_valid/is_email_verified가 boolean true가 아니면 거부된다', async () => {
    for (const [label, overrides] of [
      ['invalid', { is_email_valid: false, is_email_verified: true }],
      ['unverified', { is_email_valid: true, is_email_verified: false }],
      ['numeric', { is_email_valid: true, is_email_verified: 1 }],
      ['missing-email', { is_email_valid: true, is_email_verified: true, email: undefined }],
    ] as const) {
      const email = testEmail(`k-deny-${label}`);
      const jar = new CookieJar();
      const response = await performKakaoLogin(app, jar, {
        id: providerSub(`k-deny-${label}`),
        email,
        ...overrides,
      });
      expect(expectErrorRedirect(response)).toBe('AccessDenied');
      expect(await testPrisma.user.count({ where: { email } })).toBe(0);
    }
  });

  it('비정상 형식 이메일은 거부된다', async () => {
    const jar = new CookieJar();
    const response = await performGoogleLogin(app, jar, {
      sub: providerSub('g-bad-email'),
      email: 'not-an-email',
      email_verified: true,
    });
    expect(expectErrorRedirect(response)).toBe('AccessDenied');
  });

  it('프로필 식별자(sub/id)가 없으면 거부된다 — 임의 UUID 계정 생성 차단', async () => {
    // Google(OIDC): sub는 id_token 필수 클레임이라 oauth4webapi가 정책 지점 이전에
    // 거부한다(구조적 보장) — 오류 코드는 고정하지 않고 거부 자체만 확인한다.
    const googleJar = new CookieJar();
    const googleResponse = await performGoogleLogin(app, googleJar, {
      email: testEmail('g-no-sub'),
      email_verified: true,
    });
    expectErrorRedirect(googleResponse);
    expect(googleJar.has(SESSION_COOKIE)).toBe(false);

    // Kakao(OAuth2 userinfo)는 라이브러리 검증이 없다 — 정책(signIn callback)이 거부한다
    const kakaoJar = new CookieJar();
    const kakaoResponse = await performKakaoLogin(app, kakaoJar, {
      email: testEmail('k-no-id'),
      is_email_valid: true,
      is_email_verified: true,
    });
    expect(expectErrorRedirect(kakaoResponse)).toBe('AccessDenied');
    expect(await testPrisma.user.count({ where: { email: testEmail('g-no-sub') } })).toBe(0);
    expect(await testPrisma.user.count({ where: { email: testEmail('k-no-id') } })).toBe(0);
  });
});

describe('기존 Credentials 계정과 동일 이메일', () => {
  it('자동 연결하지 않고 OAuthAccountNotLinked로 중단한다 (중복 User·Account 없음, credentials 로그인 회귀 없음)', async () => {
    const { email, password } = await createRegisteredUser('oauth-conflict');

    const jar = new CookieJar();
    const response = await performGoogleLogin(app, jar, {
      sub: providerSub('g-conflict'),
      email,
      email_verified: true,
    });
    expect(expectErrorRedirect(response)).toBe('OAuthAccountNotLinked');
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    expect(await testPrisma.user.count({ where: { email } })).toBe(1);
    const record = await loadUserWithRelations(email);
    expect(record!.accounts).toHaveLength(0);
    expect(record!.passwordHash).not.toBeNull();

    // 기존 credentials 로그인은 그대로 동작한다
    const credentialsJar = new CookieJar();
    await signInWithCredentials(credentialsJar, email, password, app.auth);
    expect(credentialsJar.has(SESSION_COOKIE)).toBe(true);
  });
});

describe('SUSPENDED/DELETED 계정 차단', () => {
  it('동일 이메일의 정지 계정이 있으면 신규 OAuth 로그인도 거부된다 (Account 미연결)', async () => {
    const { email } = await createRegisteredUser('oauth-suspended-email');
    await testPrisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });

    const jar = new CookieJar();
    const response = await performGoogleLogin(app, jar, {
      sub: providerSub('g-suspended-email'),
      email,
      email_verified: true,
    });
    expect(expectErrorRedirect(response)).toBe('AccessDenied');
    expect(await testPrisma.user.count({ where: { email } })).toBe(1);
    const record = await loadUserWithRelations(email);
    expect(record!.accounts).toHaveLength(0);
  });

  it('OAuth 사용자가 SUSPENDED되면 재로그인이 거부된다', async () => {
    const email = testEmail('g-suspend-repeat');
    const sub = providerSub('g-suspend-repeat');
    expectSuccessRedirect(
      await performGoogleLogin(app, new CookieJar(), { sub, email, email_verified: true }),
    );
    await testPrisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });

    const jar = new CookieJar();
    const response = await performGoogleLogin(app, jar, { sub, email, email_verified: true });
    expect(expectErrorRedirect(response)).toBe('AccessDenied');
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    const record = await loadUserWithRelations(email);
    expect(record!.accounts).toHaveLength(1); // 기존 연결은 유지, 새 로그인만 차단
  });

  it('DELETED(deletedAt 설정) OAuth 사용자도 재로그인이 거부된다', async () => {
    const email = testEmail('k-deleted-repeat');
    const id = providerSub('k-deleted-repeat');
    expectSuccessRedirect(
      await performKakaoLogin(app, new CookieJar(), {
        id,
        email,
        is_email_valid: true,
        is_email_verified: true,
      }),
    );
    await testPrisma.user.update({
      where: { email },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    const jar = new CookieJar();
    const response = await performKakaoLogin(app, jar, {
      id,
      email,
      is_email_valid: true,
      is_email_verified: true,
    });
    expect(expectErrorRedirect(response)).toBe('AccessDenied');
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe('linkAccount 엄격 가드 — 로그인된 세션 편승 연결 차단', () => {
  it('credentials 세션이 있는 상태의 OAuth 완료도 기존 계정에 연결되지 않는다', async () => {
    const { email, password } = await createRegisteredUser('session-ride');
    const jar = new CookieJar();
    await signInWithCredentials(jar, email, password, app.auth);
    expect(jar.has(SESSION_COOKIE)).toBe(true);

    // 같은 브라우저(jar)에서 다른 이메일의 Google 계정으로 OAuth 완료 — Auth.js 기본은
    // 세션 사용자에게 연결하지만(@auth/core handle-login.js:209) adapter 가드가 차단한다
    const response = await performGoogleLogin(app, jar, {
      sub: providerSub('g-session-ride'),
      email: testEmail('g-session-ride-other'),
      email_verified: true,
    });
    expectErrorRedirect(response);

    const record = await loadUserWithRelations(email);
    expect(record!.accounts).toHaveLength(0); // 연결되지 않음
    expect(
      await testPrisma.user.count({ where: { email: testEmail('g-session-ride-other') } }),
    ).toBe(0);
  });

  it('OAuth 사용자 세션에서 다른 provider 완료도 추가 연결되지 않는다 (Account 0개 불변식)', async () => {
    const email = testEmail('g-then-kakao');
    const jar = new CookieJar();
    expectSuccessRedirect(
      await performGoogleLogin(app, jar, {
        sub: providerSub('g-then-kakao'),
        email,
        email_verified: true,
      }),
    );

    const response = await performKakaoLogin(app, jar, {
      id: providerSub('k-second-link'),
      email: testEmail('k-second-link'),
      is_email_valid: true,
      is_email_verified: true,
    });
    expectErrorRedirect(response);

    const record = await loadUserWithRelations(email);
    expect(record!.accounts).toHaveLength(1); // google 하나만 유지
    expect(record!.accounts[0].provider).toBe('google');
    expect(
      await testPrisma.account.count({
        where: { provider: 'kakao', providerAccountId: providerSub('k-second-link') },
      }),
    ).toBe(0);
  });
});

describe('실패 주입 — provisional user 보상 정리', () => {
  it('Account 연결 강제 실패 시 이번 시도의 User/ConsentRecord가 남지 않고, 기존 사용자는 보존된다', async () => {
    const bystander = await createRegisteredUser('cleanup-bystander');

    let failNext = false;
    const failingApp = createOAuthTestApp({
      beforeLinkAccountCommit: () => {
        if (failNext) {
          failNext = false;
          throw new Error('injected-link-failure');
        }
      },
    });

    const email = testEmail('g-cleanup');
    const sub = providerSub('g-cleanup');

    failNext = true;
    const jar = new CookieJar();
    const response = await performGoogleLogin(failingApp, jar, {
      sub,
      email,
      email_verified: true,
    });
    expectErrorRedirect(response);
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    // 고아 데이터 0건 — User가 cascade로 지워지므로 ConsentRecord도 남지 않는다
    expect(await testPrisma.user.count({ where: { email } })).toBe(0);
    expect(
      await testPrisma.account.count({ where: { provider: 'google', providerAccountId: sub } }),
    ).toBe(0);

    // 기존 사용자는 삭제되지 않았다
    expect(await testPrisma.user.count({ where: { email: bystander.email } })).toBe(1);

    // 주입 없이 재시도하면 잔여물 없이 정상 가입된다 (Account+emailVerified 부분 상태 불가 증명)
    const retryJar = new CookieJar();
    expectSuccessRedirect(
      await performGoogleLogin(failingApp, retryJar, { sub, email, email_verified: true }),
    );
    const record = await loadUserWithRelations(email);
    expect(record!.accounts).toHaveLength(1);
    expect(record!.consents).toHaveLength(3);
    expect(record!.emailVerified).not.toBeNull();
  });
});

describe('동시성 race', () => {
  it('동일 providerAccountId 동시 callback — 한쪽만 성공하고 패자 provisional user는 정리된다', async () => {
    // 두 flow가 반드시 linkAccount transaction 안에서 만나도록 hook을 barrier로
    // 사용한다 — 인터리빙 운에 기대지 않는 결정적 race: 둘 다 신규 user를 만든 뒤
    // 같은 (provider, providerAccountId)를 INSERT해 정확히 한쪽이 P2002로 진다.
    let releaseFirst: (() => void) | null = null;
    let arrivals = 0;
    const barrierApp = createOAuthTestApp({
      beforeLinkAccountCommit: async () => {
        arrivals += 1;
        if (arrivals === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
            setTimeout(resolve, 2000); // 안전 타임아웃 — Prisma tx timeout(5s)보다 짧게
          });
        } else {
          releaseFirst?.();
        }
      },
    });

    const sub = providerSub('g-race-account');
    const emailA = testEmail('g-race-a');
    const emailB = testEmail('g-race-b');

    const jarA = new CookieJar();
    const jarB = new CookieJar();
    const authzA = await startOAuthSignIn(barrierApp, jarA, 'google');
    const authzB = await startOAuthSignIn(barrierApp, jarB, 'google');

    const codeA = nextAuthorizationCode('race-a');
    const codeB = nextAuthorizationCode('race-b');
    barrierApp.network.registerGoogleFlow(codeA, {
      claims: { sub, email: emailA, email_verified: true },
      expectedCodeChallenge: authzA.searchParams.get('code_challenge'),
      nonce: authzA.searchParams.get('nonce'),
    });
    barrierApp.network.registerGoogleFlow(codeB, {
      claims: { sub, email: emailB, email_verified: true },
      expectedCodeChallenge: authzB.searchParams.get('code_challenge'),
      nonce: authzB.searchParams.get('nonce'),
    });

    const [responseA, responseB] = await Promise.all([
      completeOAuthCallback(barrierApp, jarA, 'google', codeA, authzA),
      completeOAuthCallback(barrierApp, jarB, 'google', codeB, authzB),
    ]);

    expect(arrivals).toBe(2); // 둘 다 linkAccount까지 도달했다 (진짜 race였음을 보증)
    const locations = [responseA, responseB].map((r) => r.headers.get('location') ?? '');
    const successCount = locations.filter((l) => !l.includes('error=')).length;
    expect(successCount).toBe(1); // 정확히 한쪽만 성공

    // Account는 정확히 1행, 어느 쪽이 이겼든 승자 user만 남는다 (패자 orphan 0)
    expect(
      await testPrisma.account.count({ where: { provider: 'google', providerAccountId: sub } }),
    ).toBe(1);
    const survivors = await testPrisma.user.findMany({
      where: { email: { in: [emailA, emailB] } },
      include: { accounts: true, consents: true },
    });
    expect(survivors).toHaveLength(1);
    expect(survivors[0].accounts).toHaveLength(1);
    expect(survivors[0].consents).toHaveLength(3);
    expect(survivors[0].emailVerified).not.toBeNull();
  });

  it('동일 이메일 동시 Google/Kakao 신규 가입 — User 1·Account 1·동의 3건으로 수렴한다', async () => {
    const email = testEmail('race-same-email');

    const googleJar = new CookieJar();
    const kakaoJar = new CookieJar();
    const googleAuthz = await startOAuthSignIn(app, googleJar, 'google');
    const kakaoAuthz = await startOAuthSignIn(app, kakaoJar, 'kakao');

    const googleCode = nextAuthorizationCode('race-google');
    const kakaoCode = nextAuthorizationCode('race-kakao');
    app.network.registerGoogleFlow(googleCode, {
      claims: { sub: providerSub('race-google'), email, email_verified: true },
      expectedCodeChallenge: googleAuthz.searchParams.get('code_challenge'),
      nonce: googleAuthz.searchParams.get('nonce'),
    });
    app.network.registerKakaoFlow(kakaoCode, {
      profile: {
        id: providerSub('race-kakao'),
        kakao_account: {
          email,
          is_email_valid: true,
          is_email_verified: true,
          profile: { nickname: 'race' },
        },
      },
      expectedCodeChallenge: kakaoAuthz.searchParams.get('code_challenge'),
    });

    const [googleResponse, kakaoResponse] = await Promise.all([
      completeOAuthCallback(app, googleJar, 'google', googleCode, googleAuthz),
      completeOAuthCallback(app, kakaoJar, 'kakao', kakaoCode, kakaoAuthz),
    ]);

    const locations = [googleResponse, kakaoResponse].map((r) => r.headers.get('location') ?? '');
    const successCount = locations.filter((l) => !l.includes('error=')).length;
    expect(successCount).toBe(1);

    const users = await testPrisma.user.findMany({
      where: { email },
      include: { accounts: true, consents: true },
    });
    expect(users).toHaveLength(1);
    expect(users[0].accounts).toHaveLength(1);
    expect(users[0].consents).toHaveLength(3);
  });
});

describe('token/secret 비노출', () => {
  it('전체 OAuth 왕복 동안 콘솔에 token·client secret이 출력되지 않는다', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    try {
      expectSuccessRedirect(
        await performGoogleLogin(app, new CookieJar(), {
          sub: providerSub('g-log-scan'),
          email: testEmail('g-log-scan'),
          email_verified: true,
        }),
      );
      expectSuccessRedirect(
        await performKakaoLogin(app, new CookieJar(), {
          id: providerSub('k-log-scan'),
          email: testEmail('k-log-scan'),
          is_email_valid: true,
          is_email_verified: true,
        }),
      );
      // 실패 경로의 오류 로그에도 token이 없어야 한다
      expectErrorRedirect(
        await performGoogleLogin(app, new CookieJar(), {
          sub: providerSub('g-log-scan-deny'),
          email: testEmail('g-log-scan-deny'),
          email_verified: false,
        }),
      );

      const allOutput = [logSpy, warnSpy, errorSpy]
        .flatMap((spy) => spy.mock.calls)
        .map((args) =>
          args
            .map((arg) => {
              if (typeof arg === 'string') return arg;
              if (arg instanceof Error) return `${arg.message}\n${String(arg.cause ?? '')}`;
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            })
            .join(' '),
        )
        .join('\n');

      for (const forbidden of [
        FAKE_GOOGLE_ACCESS_TOKEN_PREFIX,
        FAKE_GOOGLE_REFRESH_TOKEN_PREFIX,
        FAKE_KAKAO_ACCESS_TOKEN_PREFIX,
        FAKE_KAKAO_REFRESH_TOKEN_PREFIX,
        'vitest-google-client-secret',
        'vitest-kakao-client-secret',
      ]) {
        expect(allOutput).not.toContain(forbidden);
      }
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('authorization redirect에 state·PKCE(+Google nonce)가 포함된다', async () => {
    const googleAuthz = await startOAuthSignIn(app, new CookieJar(), 'google');
    expect(googleAuthz.origin + googleAuthz.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(googleAuthz.searchParams.get('state')).toBeTruthy();
    expect(googleAuthz.searchParams.get('nonce')).toBeTruthy();
    expect(googleAuthz.searchParams.get('code_challenge')).toBeTruthy();
    expect(googleAuthz.searchParams.get('code_challenge_method')).toBe('S256');

    const kakaoAuthz = await startOAuthSignIn(app, new CookieJar(), 'kakao');
    expect(kakaoAuthz.origin + kakaoAuthz.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(kakaoAuthz.searchParams.get('state')).toBeTruthy();
    expect(kakaoAuthz.searchParams.get('code_challenge')).toBeTruthy();
    expect(kakaoAuthz.searchParams.get('nonce')).toBeNull(); // OAuth2 — nonce 없음
  });
});
