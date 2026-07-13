/**
 * 토큰 형식 검증 — crypto-free 순수 모듈.
 * proxy.ts(미들웨어)가 계정 탈퇴 토큰 교환 시 형식만 선검증해야 하므로
 * node:crypto를 import하는 tokens.ts에서 분리했다. tokens.ts가 re-export하므로
 * 서버 코드는 기존처럼 tokens.ts에서 import해도 된다.
 */

/**
 * generateRawToken 출력의 정확한 형식 — 32바이트 base64url은 항상 43자다.
 * 소비 경로(resetPassword/verifyEmail/deleteAndAnonymizeTravelerAccount)가
 * hash·DB 조회·bcrypt 전에 이 형식으로 선검증해 임의 길이 입력으로
 * 비용을 유발하는 것을 차단한다.
 */
export const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedAuthToken(rawToken: string): boolean {
  return AUTH_TOKEN_PATTERN.test(rawToken);
}
