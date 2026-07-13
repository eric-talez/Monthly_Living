import { describe, expect, it } from 'vitest';

import { BCRYPT_COST } from '@/modules/auth/constants';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '@/modules/auth/passwords';

describe('hashPassword / verifyPassword', () => {
  it('seed와 동일한 cost 12의 bcrypt hash를 생성한다', async () => {
    expect(BCRYPT_COST).toBe(12);
    const hash = await hashPassword('Test1234!');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toBe('Test1234!');
  });

  it('round-trip: 올바른 비밀번호는 통과, 다른 비밀번호는 거부', async () => {
    const hash = await hashPassword('Test1234!');
    await expect(verifyPassword('Test1234!', hash)).resolves.toBe(true);
    await expect(verifyPassword('Wrong1234!', hash)).resolves.toBe(false);
  });
});

describe('DUMMY_PASSWORD_HASH', () => {
  it('cost 12의 사전 생성 상수다', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$12\$/);
  });

  it('어떤 입력도 통과시키지 않는다 (타이밍 균등화 전용)', async () => {
    await expect(verifyPassword('Test1234!', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
    await expect(verifyPassword('', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
