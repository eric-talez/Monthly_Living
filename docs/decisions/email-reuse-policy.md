# 결정: User.email 전역 unique — soft delete 후 이메일 재사용 불가 (초기 버전)

## 결정

- `User.email`은 **전역 unique**를 유지한다. soft delete(`deletedAt` 설정)된 계정의
  이메일도 unique 제약을 계속 점유하며, 같은 이메일로 재가입할 수 없다.
- `deletedAt IS NULL` 조건의 partial unique index는 사용하지 않는다.

## 이유

1. Auth.js identity는 email 기준으로 사용자를 식별·연결한다(OAuth Account 연결 포함).
   같은 이메일의 행이 여러 개 존재하면 adapter 조회(`getUserByEmail`)와 계정 연결이
   비결정적으로 동작할 수 있다.
2. partial unique index는 Prisma 스키마로 표현되지 않아 drift·마이그레이션 관리
   비용이 생기고, 삭제 계정 복구 시 충돌 시나리오가 복잡해진다.
3. 초기 서비스에서 이메일 재사용 요구는 드물고, 잘못 구현하면 이전 사용자의
   데이터(리뷰·예약 이력)가 새 사용자와 연결되는 개인정보 사고로 이어질 수 있다.

## 재사용이 필요해질 경우의 마이그레이션 경로 (별도 승인 필요)

1. **하드 익명화 방식(권장)**: 계정 삭제 확정 시점(유예 기간 후)에
   `email`을 `deleted+<userId>@deleted.invalid` 형태로 치환하고
   개인정보 필드를 익명화, 연결된 `Account`·토큰 행을 삭제한다.
   원 이메일은 즉시 재사용 가능해지며 unique는 그대로 유지된다.
2. 대안: PG15+ `NULLS NOT DISTINCT`/partial unique 전환 — Auth.js 조회 경로 전체에
   `deletedAt IS NULL` 필터를 강제해야 하므로 회귀 위험이 크다. 권장하지 않음.

계정 삭제·데이터 보존 정책 전체는 Phase 8 문서화와 연동한다.
