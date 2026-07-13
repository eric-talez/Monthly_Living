import { afterAll, describe, expect, it } from 'vitest';

import { requestPasswordReset, resetPassword } from '@/modules/auth/service';

import { cleanupOwnData, disconnect, testPrisma } from './helpers/db';
import { extractTokenFromEmail } from './helpers/deps';
import {
  CookieJar,
  fetchSession,
  SESSION_COOKIE,
  sessionUser,
  signInWithCredentials,
} from './helpers/session';
import { createRegisteredUser, TEST_CTX } from './helpers/users';

/**
 * 고정된 next-auth 5.0.0-beta.31의 실제 handlers를 구동하는 실세션 수준 테스트.
 * getSessionClaims 단위 검증만으로 세션 차단을 완료로 판단하지 않기 위한 것 —
 * 실제 쿠키 발급 → 상태 변경 → session endpoint에서 세션 소멸·쿠키 제거까지 확인한다.
 * (기본 deps 경유이므로 DB는 setup.ts가 덮어쓴 TEST_DATABASE_URL만 사용한다)
 */
afterAll(async () => {
  await cleanupOwnData();
  await disconnect();
});

describe('실세션: Credentials 로그인 → session endpoint', () => {
  it('로그인 성공 시 세션 쿠키가 발급되고 session에 id/role/status가 실린다', async () => {
    const { email, password } = await createRegisteredUser('session-ok');
    const jar = new CookieJar();

    const response = await signInWithCredentials(jar, email, password);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(400);
    expect(jar.has(SESSION_COOKIE)).toBe(true);

    const { body } = await fetchSession(jar);
    const user = sessionUser(body);
    expect(user?.email).toBe(email);

    const record = await testPrisma.user.findUniqueOrThrow({ where: { email } });
    expect(body).toMatchObject({
      user: { id: record.id, role: 'TRAVELER', status: 'ACTIVE' },
    });
  });

  it('잘못된 비밀번호는 세션 쿠키를 발급하지 않는다', async () => {
    const { email } = await createRegisteredUser('session-wrongpw');
    const jar = new CookieJar();

    await signInWithCredentials(jar, email, 'Wrong1234!');
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    const { body } = await fetchSession(jar);
    expect(sessionUser(body)).toBeNull();
  });

  it('SUSPENDED로 변경되면 기존 세션 쿠키가 무효화되고 제거된다', async () => {
    const { email, password } = await createRegisteredUser('session-suspend');
    const jar = new CookieJar();
    await signInWithCredentials(jar, email, password);

    const before = await fetchSession(jar);
    expect(sessionUser(before.body)?.email).toBe(email);

    await testPrisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });

    const after = await fetchSession(jar);
    expect(sessionUser(after.body)).toBeNull();
    // jwt callback의 null 반환 → sessionStore.clean()이 만료 쿠키를 내려보낸다
    const cleanCookies = after.response.headers
      .getSetCookie()
      .filter((line) => line.startsWith(`${SESSION_COOKIE}=`));
    expect(cleanCookies.length).toBeGreaterThan(0);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('DELETED(+deletedAt)로 변경되어도 기존 세션이 차단된다', async () => {
    const { email, password } = await createRegisteredUser('session-delete');
    const jar = new CookieJar();
    await signInWithCredentials(jar, email, password);
    expect(sessionUser((await fetchSession(jar)).body)?.email).toBe(email);

    await testPrisma.user.update({
      where: { email },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    const { body } = await fetchSession(jar);
    expect(sessionUser(body)).toBeNull();
  });

  it('비밀번호 재설정 이전에 발급된 세션은 재설정 후 무효화된다 (credentialVersion)', async () => {
    const { email, password, testDeps } = await createRegisteredUser('session-reset');
    const jar = new CookieJar();
    await signInWithCredentials(jar, email, password);
    expect(sessionUser((await fetchSession(jar)).body)?.email).toBe(email);

    await requestPasswordReset({ email }, TEST_CTX, testDeps.deps);
    const rawToken = extractTokenFromEmail(testDeps.sentEmails[testDeps.sentEmails.length - 1]);
    await expect(
      resetPassword({ rawToken, newPassword: 'AfterReset1234!' }, testDeps.deps),
    ).resolves.toBe('success');

    // 재설정 전 쿠키로는 더 이상 세션을 얻을 수 없다
    const { body } = await fetchSession(jar);
    expect(sessionUser(body)).toBeNull();
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    // 새 비밀번호로는 다시 로그인된다
    const freshJar = new CookieJar();
    await signInWithCredentials(freshJar, email, 'AfterReset1234!');
    expect(sessionUser((await fetchSession(freshJar)).body)?.email).toBe(email);
  });
});
