# 결정: 클라이언트 IP 추출 정책과 rate limit 구조 (Phase 1C)

## 클라이언트 IP 추출 — `x-forwarded-for`를 조건부로만 신뢰

`src/lib/request-ip.ts`의 `getClientIp()`는 `x-forwarded-for`(XFF)의 **leftmost 값**을
사용하고, 헤더가 없으면 `'unknown'`을 돌려준다.

신뢰 조건과 한계:

1. **Next.js 자체 실행(`next dev`/`next start`)**: Next가 직접 연결의 socket 주소로
   XFF를 채우므로 로컬·단일 서버에서는 신뢰할 수 있다.
2. **역프록시/로드밸런서 뒤 배포**: 프록시가 클라이언트 제공 XFF를 **rewrite**(제거 후
   재설정)하는 배포 계약 하에서만 신뢰한다. 프록시가 append 방식이면 leftmost는
   클라이언트가 위조할 수 있다.
3. 따라서 **IP 키 rate limit은 best-effort 보조 장치**다. 계정 보호의 1차 수단은
   email 키 limit이며, `LoginAttempt`가 email·IP를 모두 감사 기록으로 남긴다.
4. **IP를 근거로 하는 보안 결정(인가·차단 목록 등)은 두지 않는다.**
5. **`UNKNOWN_IP('unknown')`는 모든 헤더 없는 요청의 공용 키가 된다**: XFF가 없으면
   전 요청이 단일 IP 버킷을 공유한다. IP limiter를 먼저 소비하는 현재 구조에서 이
   버킷이 소진되면 헤더 없는 정상 사용자 전원이 email limiter 도달 전에 차단되며,
   특히 재설정 완료(`resetPasswordByIp`)는 email 키 완화 장치도 없다. production
   배포에서는 신뢰 프록시가 XFF를 rewrite하는 위 2번 계약이 전제되어야 하고, 이
   계약 하에서 `'unknown'`은 예외 경로(직접 소켓 연결 등)로만 남는다 (MVP 수용).

## Rate limiter — port/adapter 구조, MVP는 memory 구현

- Port: `src/adapters/rate-limit/types.ts` (`limit(key) → { allowed, remaining, retryAfterMs }`,
  async — Redis 교체 대비). MVP 구현: `memory.ts` (sliding window log).
- **프로세스별 상태라는 한계**: 다중 인스턴스 production에서는 인스턴스 수만큼 한도가
  늘어나고 재시작 시 초기화된다 → production 전환 조건은 Redis adapter (README 출시 Gate).
- 정리는 setInterval 없이 수행한다(dev HMR 타이머 중복 방지): 접근 키 lazy prune +
  키 수 임계치 초과 시 전체 sweep. 저장소는 `globalThis` 레지스트리(HMR에도 카운터 유지).
  정상 형식의 무작위 token·위조 IP로 요청을 뿌리면 sweep 임계치(10k 키) 전까지 버킷이
  누적된다 — 무작위 email로 `loginByEmail`을 채우는 것과 동일한 기존 노출로, MVP 수용.
- 한도·window는 `src/modules/auth/constants.ts`의 `AUTH_RATE_LIMITS` 상수로만 관리한다:
  로그인(email·IP 각각), 회원가입(IP), 인증 메일 재전송(email·IP), 재설정 요청(email·IP),
  재설정 완료(IP·token 각각 — token 키는 raw token이 아니라 sha256 hash를 HMAC 처리).

## limiter 소비 순서 — 복합 flow는 IP를 먼저 소비한다

email·IP 두 limiter를 함께 쓰는 flow(로그인, 인증 메일 재전송, 재설정 요청)는
**IP limiter → email limiter** 순서로 소비한다. email을 먼저 소비하면, 이미 IP 한도에
걸린 공격자가 피해자 이메일로 요청을 반복해 **피해자의 email 한도를 대신 소진**시키는
계정 잠금(DoS)이 가능하기 때문이다. IP 단계에서 차단된 요청은 email limiter를 건드리지
않는다(첫 차단에서 즉시 throw). 재설정 완료는 같은 원칙으로 **IP → token** 순서다.
회귀 테스트: login/password-reset/verify-email 통합 테스트의 "IP limiter가 email
limiter보다 먼저 소비된다" 케이스.

## limiter 키 — raw 값 대신 HMAC

limiter 메모리에 raw 이메일·IP가 남지 않도록 키는
`HMAC-SHA256(AUTH_SECRET, 정규화된 값)`으로 치환한다 (`modules/auth/tokens.ts
hashRateLimitKey`). 감사가 필요한 raw 값은 `LoginAttempt`(DB)가 담당한다.

## `LoginAttempt` vs rate limiter — 역할 분리

- `LoginAttempt`는 **감사·보안 기록**(성공·실패, email·IP, 시각)이다. limiter는 이
  테이블을 읽지 않고, 자체 메모리 window로만 판단한다.
- **limiter에 차단된 시도는 `LoginAttempt`에 기록하지 않는다** — 해머링 중 쓰기 증폭을
  막기 위한 경계다. 차단 이전의 실패 시도들은 이미 기록되어 있다.

## credentialVersion — 비밀번호 재설정 시 기존 JWT 세션 무효화

JWT 전략에는 서버측 세션 저장소가 없으므로, Credentials 로그인 시
`HMAC-SHA256(AUTH_SECRET, passwordHash)` digest를 `credentialVersion` 클레임으로
JWT에 싣는다 (raw passwordHash는 어디에도 싣지 않는다). JWT callback이 세션 읽기마다
현재 passwordHash로 digest를 재계산해 비교하고, 불일치(=비밀번호 재설정 발생)면
`null`을 반환해 세션 쿠키를 제거한다. OAuth 계정(passwordHash 없음)에는 적용하지
않는다. 검증: `tests/integration/session.test.ts`.
