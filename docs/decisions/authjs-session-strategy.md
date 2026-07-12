# 결정: Auth.js 모델 구성 — Account 포함, Session 미포함 (JWT 전략)

## 결정

- Phase 1C의 Auth.js v5는 **JWT session 전략**을 사용한다.
- 스키마에는 Auth.js 호환 **`Account` 모델만 포함**하고,
  **`Session` 모델은 포함하지 않는다.**
- Auth.js의 `VerificationToken`(매직링크 로그인용)도 사용하지 않는다.
  자체 이메일 인증은 **`EmailVerificationToken`**(토큰 해시 저장)으로 구현해
  이름 충돌과 의미 혼동을 피한다.

## 이유

1. **JWT 전략에서는 세션이 암호화된 쿠키에 저장**되므로 DB `Session` 테이블이
   필요 없다. Credentials provider는 Auth.js 제약상 database session과 함께
   쓸 수 없으므로(이메일+비밀번호가 1차 로그인 수단) JWT가 자연스러운 선택이다.
2. **`Account`는 JWT 전략에서도 필요**하다 — Google/Kakao OAuth 로그인 시
   Prisma adapter가 provider 계정 연결(`provider + providerAccountId`)을
   이 테이블에 영속화해야 같은 이메일의 소셜/비밀번호 계정이 하나로 연결된다.
3. 필드명은 `@auth/prisma-adapter` 기본 스키마(snake_case 토큰 필드)를 그대로
   유지해 adapter 커스텀 매핑을 피한다.
4. 향후 database session 전략으로 전환할 경우 `Session` 모델을 additive
   migration으로 추가하면 되므로, 지금 빈 테이블을 만들 이유가 없다.

## Phase 1C 구현 시 참고

- `session: { strategy: 'jwt' }` + JWT 콜백에 `role`, `userId` 클레임 포함.
- 로그인 시도 제한은 `LoginAttempt` + `RateLimitProvider`로 처리.
- 이메일 인증·비밀번호 재설정 토큰은 원문 미저장(해시만) — 각 모델 참조.
