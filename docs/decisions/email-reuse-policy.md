# 결정: User.email 전역 unique — 하드 익명화로 이메일 재사용 (1C-2B-1 구현)

## 결정

- `User.email`은 **전역 unique**를 유지한다. `deletedAt IS NULL` 조건의
  partial unique index는 사용하지 않는다.
- **삭제 전**: soft delete 여부와 무관하게 이메일은 unique 제약을 점유하며,
  같은 이메일로 재가입할 수 없다.
- **탈퇴 commit 후(1C-2B-1 구현)**: 탈퇴 transaction이 `email`을
  `deleted+<userId>@deleted.invalid` tombstone으로 치환하므로 **원 이메일은
  commit 즉시 재사용 가능**하다. unique 제약은 그대로 유지된다.
- **신규 가입은 반드시 새로운 User ID**로 생성된다. 원 이메일 재가입
  (credentials·OAuth 모두)은 새 User row를 만들며, 이전 사용자의 예약·리뷰·
  결제 기록은 tombstone User id에 남는다 — **새 User와 절대 연결되지 않는다**
  (통합 테스트로 고정: credentials 재가입·동일 provider identity OAuth 재가입
  모두 새 id, 과거 기록 비연결).

전체 탈퇴·익명화 설계:
[account-deletion-and-anonymization.md](account-deletion-and-anonymization.md).

## 이유

1. Auth.js identity는 email 기준으로 사용자를 식별·연결한다(OAuth Account 연결 포함).
   같은 이메일의 행이 여러 개 존재하면 adapter 조회(`getUserByEmail`)와 계정 연결이
   비결정적으로 동작할 수 있다.
2. partial unique index는 Prisma 스키마로 표현되지 않아 drift·마이그레이션 관리
   비용이 생기고, 삭제 계정 복구 시 충돌 시나리오가 복잡해진다.
3. 잘못 구현하면 이전 사용자의 데이터(리뷰·예약 이력)가 새 사용자와 연결되는
   개인정보 사고로 이어질 수 있다 — tombstone id 분리가 이를 구조적으로 차단한다.

## 공식 PrismaAdapter `deleteUser()`와의 충돌 (PR #1 리뷰 반영)

공식 `@auth/prisma-adapter`의 `deleteUser()`는 **hard delete**를 수행하므로
이 프로젝트의 soft delete 정책과 충돌한다. **계정 탈퇴는 adapter의 `deleteUser()`를
직접 호출하지 않고**(custom adapter가 fail-closed로 차단), `modules/users`의
탈퇴 서비스가 단일 transaction에서 `status=DELETED`·`deletedAt` 설정과
구조화 계정 PII 익명화를 수행한다.
상세: [authjs-session-strategy.md](authjs-session-strategy.md).

## 기각한 대안

- PG15+ `NULLS NOT DISTINCT`/partial unique 전환 — Auth.js 조회 경로 전체에
  `deletedAt IS NULL` 필터를 강제해야 하므로 회귀 위험이 크다. 권장하지 않음.

자유 입력 본문(메시지·리뷰 등) 보존 데이터의 개인정보 정책 전체는 Phase 8
문서화와 연동한다.
