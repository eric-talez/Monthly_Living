/**
 * 클라이언트 IP 추출 — 정책 전문: docs/decisions/client-ip-and-rate-limit.md
 *
 * 요약:
 * - Next.js dev/start는 직접 연결의 socket 주소로 x-forwarded-for를 채우고,
 *   프록시 뒤에서는 프록시가 이 헤더를 rewrite하는 배포 계약 하에서만 신뢰한다.
 * - leftmost 값은 프록시가 append 방식이면 클라이언트가 위조할 수 있다.
 *   따라서 IP 키 rate limit은 best-effort 보조 장치이며, 계정 보호는
 *   email 키 limit과 LoginAttempt 감사 기록이 담당한다.
 * - IP를 근거로 하는 보안 결정(인가 등)은 어디에도 두지 않는다.
 */
export const UNKNOWN_IP = 'unknown';

/** Headers와 next/headers의 ReadonlyHeaders를 모두 수용하는 최소 인터페이스 */
interface ReadableHeaders {
  get(name: string): string | null;
}

export function getClientIp(headers: ReadableHeaders): string {
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) {
    return UNKNOWN_IP;
  }
  const first = forwarded.split(',')[0]?.trim();
  return first || UNKNOWN_IP;
}
