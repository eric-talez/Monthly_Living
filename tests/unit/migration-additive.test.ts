import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * add_account_deletion_token migration이 additive 전용인지 회귀 검증한다 —
 * 기존 object DROP/ALTER가 섞이면 안 된다 (사용자 지시: trim 금지, 발견 즉시 중단).
 */
const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
const migrationDirName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_add_account_deletion_token'),
);

if (!migrationDirName) {
  throw new Error('add_account_deletion_token migration 디렉터리를 찾지 못했습니다');
}

const sql = readFileSync(join(migrationsDir, migrationDirName, 'migration.sql'), 'utf8');

describe('add_account_deletion_token migration — additive 전용', () => {
  it('DROP 문이 없다', () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it('ALTER는 AccountDeletionToken FK 추가뿐이다 — 기존 테이블을 건드리지 않는다', () => {
    const alterStatements = sql.match(/ALTER TABLE[^;]+;/gi) ?? [];
    expect(alterStatements).toHaveLength(1);
    expect(alterStatements[0]).toContain('"AccountDeletionToken"');
    expect(alterStatements[0]).toContain('ADD CONSTRAINT "AccountDeletionToken_userId_fkey"');
    expect(alterStatements[0]).toContain('REFERENCES "User"("id") ON DELETE CASCADE');
  });

  it('허용된 additive 문만 포함한다 — CREATE TABLE 1 + INDEX 2 + FK 1', () => {
    expect(sql.match(/CREATE TABLE/gi)).toHaveLength(1);
    expect(sql).toContain('CREATE TABLE "AccountDeletionToken"');
    expect(sql.match(/CREATE (?:UNIQUE )?INDEX/gi)).toHaveLength(2);
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "AccountDeletionToken_tokenHash_key" ON "AccountDeletionToken"("tokenHash")',
    );
    expect(sql).toContain(
      'CREATE INDEX "AccountDeletionToken_userId_idx" ON "AccountDeletionToken"("userId")',
    );
    // AccountDeletionToken 외 다른 테이블 식별자가 등장하면 안 된다 (FK 대상 User 제외)
    const mentionedTables = [...sql.matchAll(/"([A-Z][A-Za-z]+)"/g)].map((match) => match[1]);
    expect(new Set(mentionedTables)).toEqual(new Set(['AccountDeletionToken', 'User']));
  });
});
