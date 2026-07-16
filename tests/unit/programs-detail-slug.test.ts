import { describe, expect, it } from 'vitest';

import { parseProgramSlug } from '@/modules/programs/validation';

/**
 * 공개 상세 slug 파서 — 형식·길이·정규화만 검증하는 순수 함수(DB 조회 없음).
 * malformed는 throw 없이 null로 수렴해 라우트가 즉시 notFound()로 처리할 수 있어야 한다.
 */
describe('parseProgramSlug', () => {
  it('허용 형식(소문자·숫자·하이픈)의 slug는 그대로 반환한다', () => {
    expect(parseProgramSlug('kim-minjun-monthly-pt')).toBe('kim-minjun-monthly-pt');
    expect(parseProgramSlug('a')).toBe('a');
    expect(parseProgramSlug('program-123')).toBe('program-123');
  });

  it('앞뒤 공백 제거 + 소문자 정규화 후 매칭한다', () => {
    expect(parseProgramSlug('  Kim-Minjun-Monthly-PT  ')).toBe('kim-minjun-monthly-pt');
    expect(parseProgramSlug('JEJU-YOGA')).toBe('jeju-yoga');
  });

  it('허용 문자 밖(밑줄·공백·점·경로·이모지)은 null', () => {
    expect(parseProgramSlug('bad_slug')).toBeNull();
    expect(parseProgramSlug('has space')).toBeNull();
    expect(parseProgramSlug('dot.slug')).toBeNull();
    expect(parseProgramSlug('../etc/passwd')).toBeNull();
    expect(parseProgramSlug('slug/child')).toBeNull();
    expect(parseProgramSlug('emoji-😀')).toBeNull();
  });

  it('빈 문자열·공백만은 null', () => {
    expect(parseProgramSlug('')).toBeNull();
    expect(parseProgramSlug('   ')).toBeNull();
  });

  it('SLUG_MAX(64) 경계값은 통과, 초과는 null', () => {
    expect(parseProgramSlug('a'.repeat(64))).toBe('a'.repeat(64));
    expect(parseProgramSlug('a'.repeat(65))).toBeNull();
  });
});
