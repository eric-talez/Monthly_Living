import { afterAll, describe, expect, it } from 'vitest';

import { createOAuthAdapter, OAuthLinkBlockedError } from '@/modules/auth/adapter';
import { CONSENT_TERMS_VERSION } from '@/modules/auth/constants';
import {
  runWithOAuthRequestContext,
  type OAuthRequestContext,
} from '@/modules/auth/oauth-request-context';

import { cleanupOwnData, disconnect, runId, testEmail, testPrisma } from './helpers/db';
import { createRegisteredUser } from './helpers/users';

/**
 * custom adapter 단독 검증 — HTTP flow 없이 가드 분기·transaction 원자성·
 * 보상 정리 provenance를 결정적으로 확인한다. HTTP 전체 왕복은 oauth.test.ts.
 */

const adapter = createOAuthAdapter(testPrisma);

afterAll(async () => {
  await cleanupOwnData();
  await disconnect();
});

function adapterUserInput(email: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'ignored-by-adapter',
    email,
    emailVerified: null,
    ...overrides,
  } as Parameters<NonNullable<typeof adapter.createUser>>[0];
}

function linkInput(userId: string, label: string) {
  return {
    userId,
    type: 'oidc' as const,
    provider: 'google',
    providerAccountId: `${runId}-adapter-${label}`,
  };
}

describe('createUser', () => {
  it('정규화된 이메일·요청 locale·동의 3건을 한 번에 만들고 provisionalUserId를 기록한다', async () => {
    const email = testEmail('adapter-create');
    const context: OAuthRequestContext = { locale: 'en' };

    const created = await runWithOAuthRequestContext(context, () =>
      adapter.createUser!(adapterUserInput(`  ${email.toUpperCase()}  `, { name: 'N' })),
    );

    expect(created.email).toBe(email); // trim + lowercase
    expect(context.provisionalUserId).toBe(created.id);

    const record = await testPrisma.user.findUniqueOrThrow({
      where: { id: created.id },
      include: { consents: true },
    });
    expect(record.preferredLanguage).toBe('en');
    expect(record.emailVerified).toBeNull(); // emailVerified는 linkAccount transaction에서만
    expect(record.passwordHash).toBeNull();
    expect(record.consents).toHaveLength(3);
    expect(record.consents.every((c) => c.version === CONSENT_TERMS_VERSION)).toBe(true);
  });

  it('요청 컨텍스트가 없으면 기본 locale(ko)로 저장한다', async () => {
    const email = testEmail('adapter-create-noctx');
    const created = await adapter.createUser!(adapterUserInput(email));
    const record = await testPrisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(record.preferredLanguage).toBe('ko');
  });

  it('비정상 이메일은 거부한다 (User·동의 미생성)', async () => {
    await expect(adapter.createUser!(adapterUserInput('not-an-email'))).rejects.toThrow(
      /malformed email/,
    );
  });
});

describe('linkAccount 가드', () => {
  it('정상: 방금 만든 OAuth 전용 user에 연결되고 emailVerified가 같은 transaction에서 설정된다', async () => {
    const email = testEmail('adapter-link-ok');
    const context: OAuthRequestContext = { locale: 'ko' };
    const created = await runWithOAuthRequestContext(context, () =>
      adapter.createUser!(adapterUserInput(email)),
    );

    await runWithOAuthRequestContext(context, () =>
      adapter.linkAccount!(linkInput(created.id, 'ok')),
    );

    const record = await testPrisma.user.findUniqueOrThrow({
      where: { id: created.id },
      include: { accounts: true },
    });
    expect(record.accounts).toHaveLength(1);
    expect(record.emailVerified).not.toBeNull();
  });

  it('이미 인증된 emailVerified는 덮어쓰지 않는다', async () => {
    const email = testEmail('adapter-link-preverified');
    const verifiedAt = new Date('2026-01-01T00:00:00Z');
    const user = await testPrisma.user.create({
      data: { email, passwordHash: null, emailVerified: verifiedAt },
    });

    await adapter.linkAccount!(linkInput(user.id, 'preverified'));

    const record = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(record.emailVerified?.getTime()).toBe(verifiedAt.getTime());
  });

  it('passwordHash가 있는(credentials) user에는 연결을 거부한다', async () => {
    const { email } = await createRegisteredUser('adapter-link-credentials');
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email } });

    await expect(adapter.linkAccount!(linkInput(user.id, 'credentials'))).rejects.toThrow(
      OAuthLinkBlockedError,
    );
    expect(await testPrisma.account.count({ where: { userId: user.id } })).toBe(0);
    // 컨텍스트 provenance가 없으므로 보상 삭제도 일어나지 않는다
    expect(await testPrisma.user.count({ where: { id: user.id } })).toBe(1);
  });

  it('Account가 이미 있는 user에는 추가 연결을 거부한다 (0개 불변식)', async () => {
    const email = testEmail('adapter-link-second');
    const context: OAuthRequestContext = { locale: 'ko' };
    const created = await runWithOAuthRequestContext(context, () =>
      adapter.createUser!(adapterUserInput(email)),
    );
    await runWithOAuthRequestContext(context, () =>
      adapter.linkAccount!(linkInput(created.id, 'first')),
    );

    await expect(adapter.linkAccount!(linkInput(created.id, 'second'))).rejects.toThrow(
      OAuthLinkBlockedError,
    );
    expect(await testPrisma.account.count({ where: { userId: created.id } })).toBe(1);
  });

  it('SUSPENDED·soft-deleted·미존재 user에는 연결을 거부한다', async () => {
    const suspendedEmail = testEmail('adapter-link-suspended');
    const suspended = await testPrisma.user.create({
      data: { email: suspendedEmail, passwordHash: null, status: 'SUSPENDED' },
    });
    await expect(adapter.linkAccount!(linkInput(suspended.id, 'suspended'))).rejects.toThrow(
      OAuthLinkBlockedError,
    );

    const deletedEmail = testEmail('adapter-link-deleted');
    const deleted = await testPrisma.user.create({
      data: { email: deletedEmail, passwordHash: null, deletedAt: new Date() },
    });
    await expect(adapter.linkAccount!(linkInput(deleted.id, 'deleted'))).rejects.toThrow(
      OAuthLinkBlockedError,
    );

    await expect(
      adapter.linkAccount!(linkInput('missing-user-id-000000000', 'missing')),
    ).rejects.toThrow(OAuthLinkBlockedError);

    expect(await testPrisma.account.count({ where: { userId: suspended.id } })).toBe(0);
    expect(await testPrisma.account.count({ where: { userId: deleted.id } })).toBe(0);
  });
});

describe('linkAccount 보상 정리 provenance', () => {
  it('이번 요청이 만든 provisional user만 삭제한다 (동의 cascade 포함)', async () => {
    let inject = true;
    const failingAdapter = createOAuthAdapter(testPrisma, {
      beforeLinkAccountCommit: () => {
        if (inject) {
          inject = false;
          throw new Error('injected');
        }
      },
    });

    const email = testEmail('adapter-cleanup');
    const context: OAuthRequestContext = { locale: 'ko' };

    await runWithOAuthRequestContext(context, async () => {
      const created = await failingAdapter.createUser!(adapterUserInput(email));
      await expect(failingAdapter.linkAccount!(linkInput(created.id, 'cleanup'))).rejects.toThrow(
        'injected',
      );
    });

    expect(await testPrisma.user.count({ where: { email } })).toBe(0);
    expect(context.provisionalUserId).toBeUndefined(); // 재사용 방지를 위해 비워진다
  });

  it('다른 요청의 user(컨텍스트 불일치)는 연결이 실패해도 삭제하지 않는다', async () => {
    const email = testEmail('adapter-cleanup-foreign');
    const foreign = await testPrisma.user.create({
      data: { email, passwordHash: null, status: 'SUSPENDED' }, // 가드가 확실히 실패하도록
    });

    // provisionalUserId가 다른 값인 컨텍스트에서 실패 — foreign user는 보존되어야 한다
    await runWithOAuthRequestContext({ locale: 'ko', provisionalUserId: 'someone-else' }, () =>
      expect(adapter.linkAccount!(linkInput(foreign.id, 'foreign'))).rejects.toThrow(
        OAuthLinkBlockedError,
      ),
    );

    expect(await testPrisma.user.count({ where: { id: foreign.id } })).toBe(1);
  });
});
