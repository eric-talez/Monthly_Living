# DB 제약: Prisma로 표현 불가 — Phase 1B-2 migration SQL에서 추가

> Phase 1B-1은 스키마 계약만 정의하며 migration을 적용하지 않는다.
> 아래 제약은 initial migration 생성 시(1B-2A draft) SQL로 직접 추가하고,
> 이 문서와 migration 파일을 상호 참조로 유지한다.

**PostgreSQL 최소 버전: 15 이상 필수.** `UNIQUE ... NULLS NOT DISTINCT`(§2)를
사용하므로 PostgreSQL 15 미만은 지원하지 않는다. 로컬 검증 버전은 PostgreSQL 16.

**적용 대상 migration**: `prisma/migrations/20260712034631_init/migration.sql`
하단 "Custom SQL" 섹션 (1B-2A에서 draft 작성, 1B-2B에서 적용 예정).
CHECK는 NULL 결과 시 통과하므로 타입별 필수 필드에는 `IS NOT NULL`을 명시했다.

## 1. CHECK constraints

| 테이블                             | 제약                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AvailabilityRule`                 | `capacity > 0`, `slotDurationMinutes IS NULL OR slotDurationMinutes > 0`, `daysOfWeek <@ ARRAY[0,1,2,3,4,5,6]` (요일 0~6 범위), `startTimeLocal`/`endTimeLocal`은 `^([01][0-9]\|2[0-3]):[0-5][0-9]$` 고정 HH:mm 형식, `endTimeLocal > startTimeLocal` (고정폭 HH:mm → 사전순 = 시간순)                                 |
| `AvailabilitySlot`                 | `capacity > 0`, `reservedCount >= 0 AND reservedCount <= capacity`, `endsAt > startsAt`                                                                                                                                                                                                                                |
| `Program`                          | `basePrice >= 0`, `durationDays > 0`, `sessionCount > 0`, `maxParticipants > 0`                                                                                                                                                                                                                                        |
| `BookingQuote`                     | `unitPrice >= 0`, `subtotal >= 0`, `serviceFee >= 0`, `taxes >= 0`, `discount >= 0`, `total >= 0`, `participantCount > 0`, `expiresAt > createdAt`                                                                                                                                                                     |
| `Booking`                          | `subtotal >= 0`, `serviceFee >= 0`, `taxes >= 0`, `discount >= 0`, `total >= 0`, `participantCount > 0`, `endsAt > startsAt`                                                                                                                                                                                           |
| `BookingSlot`                      | `participantCount > 0`                                                                                                                                                                                                                                                                                                 |
| `Payment`                          | `amount >= 0`, `refundedAmount >= 0 AND refundedAmount <= amount`                                                                                                                                                                                                                                                      |
| `Payout`                           | `grossAmount >= 0`, `platformFee >= 0`, `payoutAmount >= 0`                                                                                                                                                                                                                                                            |
| `PayoutAdjustment`                 | `amount <> 0` — **의도적으로 음수 허용** (차감 조정), 0만 금지                                                                                                                                                                                                                                                         |
| `Review`                           | `rating BETWEEN 1 AND 5`                                                                                                                                                                                                                                                                                               |
| `Coupon`                           | `validUntil > validFrom`, `(type = 'PERCENTAGE' AND percentOff BETWEEN 1 AND 100 AND amountOff IS NULL AND currency IS NULL) OR (type = 'FIXED_AMOUNT' AND amountOff > 0 AND currency IS NOT NULL AND percentOff IS NULL)`, `maxRedemptions IS NULL OR maxRedemptions > 0`, `perUserLimit > 0`, `redemptionCount >= 0` |
| `TravelerProfile`                  | `groupSize > 0`                                                                                                                                                                                                                                                                                                        |
| `MatchRequest` (참가자 수량)       | `adultsCount >= 1`, `childrenCount >= 0`, `durationDays IS NULL OR durationDays > 0`                                                                                                                                                                                                                                   |
| `ExchangeRate`                     | `rate > 0`                                                                                                                                                                                                                                                                                                             |
| `ExpertProfile`                    | `responseRate IS NULL OR (responseRate BETWEEN 0 AND 100)`, `yearsOfExperience >= 0`                                                                                                                                                                                                                                   |
| `TravelerProfile` / `MatchRequest` | `budgetMin IS NULL OR budgetMin >= 0`, `budgetMax IS NULL OR budgetMax >= 0`, `(budgetMin IS NULL OR budgetMax IS NULL) OR budgetMax >= budgetMin`                                                                                                                                                                     |

## 2. NULL을 포함하는 unique 제약 (PG 기본 null-distinct 문제)

Prisma `@@unique`는 PostgreSQL 기본 동작(NULL끼리 서로 다름)을 따르므로
NULL 컬럼을 포함한 unique는 중복을 막지 못한다. 1B-2에서 다음으로 보완한다.

| 대상                                                                 | 문제                                                            | 1B-2 처리                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AvailabilitySlot @@unique([expertId, programId, startsAt, endsAt])` | `programId IS NULL`인 공통 슬롯이 중복 생성될 수 있음           | migration SQL에서 해당 unique index를 `NULLS NOT DISTINCT`로 재생성 (PG15+)                                                 |
| `Conversation @@unique([travelerId, expertId, bookingId])`           | `bookingId IS NULL`(일반 문의) 대화가 쌍당 여러 건 생길 수 있음 | partial unique index 추가: `CREATE UNIQUE INDEX ... ON "Conversation" ("travelerId", "expertId") WHERE "bookingId" IS NULL` |

**drift 주의**: 위 raw SQL 인덱스는 Prisma 스키마에 나타나지 않으므로
`prisma migrate diff` 기준으로 drift처럼 보일 수 있다. migration 파일에
주석으로 이 문서를 참조시키고, 이후 스키마 변경 시 해당 인덱스를 덮어쓰지
않는지 migration SQL 리뷰로 확인한다 (1B-2 검증 항목).

## 2.5 MVP 정책: 반복 규칙은 자정을 넘지 않는다

`AvailabilityRule`의 `endTimeLocal > startTimeLocal` CHECK는 의도된 **MVP 정책**이다:
단일 반복 규칙은 하루(local 달력) 안에서 끝나야 하며 자정을 넘는 세션
(예: 22:00~01:00)은 지원하지 않는다. 자정을 넘는 일정이 필요해지면
규칙을 이틀로 분리하거나 CHECK 완화 + 슬롯 생성 로직 확장을 별도 승인으로 진행한다.

## 3. 기타 앱 레이어에서 보장하는 불변식 (DB 제약 아님)

- `User.email`은 저장 전 소문자 정규화 (Zod `.toLowerCase()`), CITEXT 미사용.
- `Report(targetType, targetId)`는 polymorphic 느슨 참조 — 존재 검증은 서비스 레이어.
- Booking 상태 전이 규칙은 `modules/bookings/state-machine.ts`가 단일 소스 (Phase 5).
- 슬롯 예약의 capacity 검증·잠금 순서: [booking-slot-locking.md](booking-slot-locking.md).
- Payout 최종 지급액 = `payoutAmount + SUM(PayoutAdjustment.amount)` — 조회 시 계산하며
  PAID 이후 Payout 원본 금액 컬럼은 갱신하지 않는다.

## 4. Phase 1B-2 test DB reset 안전장치 (스크립트 설계)

reset 스크립트는 실행 전 다음을 모두 검사하고 하나라도 걸리면 즉시 거부한다.

1. 대상 DB 이름에 `_test`가 없으면 거부
2. `NODE_ENV=production`이면 거부
3. 접속 host가 localhost/127.0.0.1이 아니면 거부 (production/staging host 차단)

Docker Compose(1B-2)는 dev DB(`handalsalgi_dev`)와 test DB(`handalsalgi_test`)를
모두 생성하는 init SQL을 포함한다.
