# 결정: Auth.js 모델 구성 — Account 포함, Session 미포함 (JWT 전략)

## 결정

- Phase 1C의 Auth.js v5는 **JWT session 전략**을 사용한다.
- 스키마에는 Auth.js 호환 **`Account` 모델만 포함**하고,
  **`Session` 모델은 포함하지 않는다.**
- Auth.js의 `VerificationToken`(매직링크 로그인용)도 사용하지 않는다.
  자체 이메일 인증은 **`EmailVerificationToken`**(토큰 해시 저장)으로 구현해
  이름 충돌과 의미 혼동을 피한다.

## User 모델 필드 — 공식 PrismaAdapter 표준 준수 (PR #1 리뷰 반영)

공식 `@auth/prisma-adapter`는 provider가 준 사용자 데이터를 **변환 없이**
`prisma.user.create()` / `prisma.user.update()`에 전달한다. 따라서 User 모델은
adapter가 기대하는 표준 필드명을 그대로 노출해야 한다.

| Auth.js 표준 필드 | 스키마                                       | 비고                                             |
| ----------------- | -------------------------------------------- | ------------------------------------------------ |
| `name`            | `name String?`                               | OAuth 표시명 — provider가 안 줄 수 있어 nullable |
| `image`           | `image String?`                              | 프로필 이미지 URL                                |
| `emailVerified`   | `emailVerified DateTime? @db.Timestamptz(6)` | adapter 표준 의미 유지                           |

- 서비스에서 필요한 **실명은 `fullName String?`로 분리** 보관한다.
  OAuth provider는 실명을 보장하지 않으므로 nullable이며, 예약 전 온보딩에서
  수집·검증한다 (Phase 1C 서비스 로직).
- `@map`은 사용하지 않았다 — DB가 아직 없으므로(1B-2B 전) 컬럼명 자체를
  표준명으로 생성하는 편이 단순하다. generated client에는 `name`/`image`/
  `emailVerified`가 그대로 노출된다.
- `Account` 필드명도 adapter 기본 스키마(snake_case 토큰 필드)를 그대로 유지한다.

## deleteUser() 충돌 — soft delete 정책과의 불일치 (PR #1 리뷰 반영)

공식 PrismaAdapter의 `deleteUser()`는 **hard delete**(`prisma.user.delete`)를
수행하므로, 이 프로젝트의 soft delete 정책(`status=DELETED` + `deletedAt`)과
충돌한다.

**Phase 1C 결정**: 계정 탈퇴 기능은 adapter의 `deleteUser()`를 **직접 호출하지
않는다.** 별도 서비스 로직(`modules/users`)에서 같은 transaction으로:

1. `status = DELETED`, `deletedAt = now()` 설정
2. 개인정보 익명화(이메일 치환·이름/전화/이미지 제거 — [email-reuse-policy.md](email-reuse-policy.md)의 하드 익명화 절차)
3. `Account`·토큰 행 삭제 (소셜 재로그인 차단)

Auth.js 설정에서 `deleteUser`가 호출될 경로(이벤트/자동 정리)는 만들지 않으며,
JWT 콜백에서 `status=DELETED` 사용자는 세션을 무효화한다.

## 이유

1. **JWT 전략에서는 세션이 암호화된 쿠키에 저장**되므로 DB `Session` 테이블이
   필요 없다. Credentials provider는 Auth.js 제약상 database session과 함께
   쓸 수 없으므로(이메일+비밀번호가 1차 로그인 수단) JWT가 자연스러운 선택이다.
2. **`Account`는 JWT 전략에서도 필요**하다 — Google/Kakao OAuth 로그인 시
   Prisma adapter가 provider 계정 연결(`provider + providerAccountId`)을
   이 테이블에 영속화해야 같은 이메일의 소셜/비밀번호 계정이 하나로 연결된다.
3. 향후 database session 전략으로 전환할 경우 `Session` 모델을 additive
   migration으로 추가하면 되므로, 지금 빈 테이블을 만들 이유가 없다.

## Phase 1C 구현 시 참고

- `session: { strategy: 'jwt' }` + JWT 콜백에 `role`, `userId` 클레임 포함.
- 로그인 시도 제한은 `LoginAttempt` + `RateLimitProvider`로 처리.
- 이메일 인증·비밀번호 재설정 토큰은 원문 미저장(해시만) — 각 모델 참조.
- 자체 이메일 인증 완료 시 서비스 로직이 `emailVerified`를 직접 설정한다
  (adapter의 의미와 호환 — 인증 완료 시각).
