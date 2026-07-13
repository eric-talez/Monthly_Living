import bcrypt from 'bcryptjs';

import { BCRYPT_COST } from './constants';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

/**
 * 타이밍 균등화용 고정 더미 hash (cost 12, 사전 생성 — module load 시 재계산 금지).
 * 미존재 계정·소셜 전용(passwordHash null) 계정의 로그인 시도에도 bcrypt 비교를
 * 정확히 1회 수행해, 응답 시간으로 계정 존재 여부를 구분하기 어렵게 한다.
 * 생성에 쓴 평문은 무작위 값으로 즉시 폐기되었고 비교 결과는 항상 버려진다.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$/s3GDmdtDgqj44/ENzFYPORAQmy7O6kEIPkEJAF0rmqHa8uFVopVe';
