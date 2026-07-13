# DB 제약: Prisma로 표현 불가 — Phase 1B-2 migration SQL에서 추가

> Phase 1B-1은 스키마 계약만 정의하며 migration을 적용하지 않는다.
> 아래 제약은 initial migration 생성 시(1B-2A draft) SQL로 직접 추가하고,
> 이 문서와 migration 파일을 상호 참조로 유지한다.

**PostgreSQL 최소 버전: 15 이상 필수.** `UNIQUE ... NULLS NOT DISTINCT`(§2)를
사용하므로 PostgreSQL 15 미만은 지원하지 않는다. 로컬 검증 버전은 PostgreSQL 16.

**적용 대상 migration**: `prisma/migrations/20260712041838_init/migration.sql`
하단 "Custom SQL" 섹션 (1B-2A에서 draft 작성, PR #1 리뷰 반영으로 재생성, 1B-2B에서 적용 예정).
CHECK는 NULL 결과 시 통과하므로 타입별 필수 필드에는 `IS NOT NULL`을 명시했다.

## 1. CHECK constraints

| 테이블                             | 제약                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AvailabilityRule`                 | `capacity > 0`, `slotDurationMinutes IS NULL OR slotDurationMinutes > 0`, `daysOfWeek <@ ARRAY[0,1,2,3,4,5,6]` (요일 0~6 범위), `startTimeLocal`/`endTimeLocal`은 `^([01][0-9]\|2[0-3]):[0-5][0-9]$` 고정 HH:mm 형식, `endTimeLocal > startTimeLocal` (고정폭 HH:mm → 사전순 = 시간순)                                                                                                                                                           |
| `AvailabilitySlot`                 | `capacity > 0`, `reservedCount >= 0 AND reservedCount <= capacity`, `endsAt > startsAt`                                                                                                                                                                                                                                                                                                                                                          |
| `Program`                          | `basePrice >= 0`, `durationDays > 0`, `sessionCount > 0`, `maxParticipants > 0`, `reviewCount >= 0`, `averageRating IS NULL OR BETWEEN 0 AND 5`                                                                                                                                                                                                                                                                                                  |
| `BookingQuote`                     | `unitPrice >= 0`, `subtotal >= 0`, `serviceFee >= 0`, `taxes >= 0`, `discount >= 0`, `total >= 0`, `participantCount > 0`, `expiresAt > createdAt`, `feeRateBps BETWEEN 0 AND 10000`, `discount <= subtotal + serviceFee + taxes`, `total = subtotal + serviceFee + taxes - discount`                                                                                                                                                            |
| `Booking`                          | `subtotal >= 0`, `serviceFee >= 0`, `taxes >= 0`, `discount >= 0`, `total >= 0`, `participantCount > 0`, `endsAt > startsAt`, `discount <= subtotal + serviceFee + taxes`, `total = subtotal + serviceFee + taxes - discount`                                                                                                                                                                                                                    |
| `BookingSlot`                      | `participantCount > 0`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Payment`                          | `amount >= 0`, `refundedAmount >= 0 AND refundedAmount <= amount`                                                                                                                                                                                                                                                                                                                                                                                |
| `Payout`                           | `grossAmount >= 0`, `platformFee >= 0`, `payoutAmount >= 0`, `platformFee <= grossAmount`, `payoutAmount <= grossAmount`                                                                                                                                                                                                                                                                                                                         |
| `PayoutAdjustment`                 | `amount <> 0` — **의도적으로 음수 허용** (차감 조정), 0만 금지. **통화 컬럼 없음** — 항상 부모 `Payout.currency`를 따른다 (§3)                                                                                                                                                                                                                                                                                                                   |
| `ExpertCredential`                 | `fileSizeBytes IS NULL OR fileSizeBytes >= 0`, `expiresAt IS NULL OR issuedAt IS NULL OR expiresAt > issuedAt`                                                                                                                                                                                                                                                                                                                                   |
| `Destination`                      | `latitude BETWEEN -90 AND 90`, `longitude BETWEEN -180 AND 180`                                                                                                                                                                                                                                                                                                                                                                                  |
| `Conversation`                     | `travelerUnreadCount >= 0 AND expertUnreadCount >= 0`                                                                                                                                                                                                                                                                                                                                                                                            |
| `NotificationDelivery`             | `attemptCount >= 0`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Review`                           | `rating BETWEEN 1 AND 5`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Coupon`                           | `validUntil > validFrom`, `(type = 'PERCENTAGE' AND percentOff BETWEEN 1 AND 100 AND amountOff IS NULL AND currency IS NULL) OR (type = 'FIXED_AMOUNT' AND amountOff > 0 AND currency IS NOT NULL AND percentOff IS NULL)`, `maxRedemptions IS NULL OR maxRedemptions > 0`, `perUserLimit > 0`, `redemptionCount >= 0`, `minSubtotal IS NULL OR minSubtotal >= 0`, `maxRedemptions IS NULL OR redemptionCount <= maxRedemptions` (NULL = 무제한) |
| `TravelerProfile`                  | `groupSize > 0`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `MatchRequest` (참가자 수량)       | `adultsCount >= 1`, `childrenCount >= 0`, `durationDays IS NULL OR durationDays > 0`                                                                                                                                                                                                                                                                                                                                                             |
| `ExchangeRate`                     | `rate > 0`                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ExpertProfile`                    | `responseRate IS NULL OR (responseRate BETWEEN 0 AND 100)`, `yearsOfExperience >= 0`, `responseTimeMinutes IS NULL OR >= 0`, `reviewCount >= 0`, `completedBookingCount >= 0`, `averageRating IS NULL OR BETWEEN 0 AND 5`                                                                                                                                                                                                                        |
| `TravelerProfile` / `MatchRequest` | `budgetMin IS NULL OR budgetMin >= 0`, `budgetMax IS NULL OR budgetMax >= 0`, `(budgetMin IS NULL OR budgetMax IS NULL) OR budgetMax >= budgetMin`                                                                                                                                                                                                                                                                                               |

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

## 2.7 Quote → Booking 소비 프로토콜 (PR #1 리뷰 반영 — Phase 5 구현 시 준수)

Booking은 Quote를 FK로 참조하지만 traveler/program/금액 일치는 FK가 보장하지
않는다. **Booking 생성 transaction은 반드시 다음 순서를 지킨다**:

1. Quote 행을 `SELECT ... FOR UPDATE`(또는 동등한 잠금)로 잠근다.
2. `status = 'ACTIVE'`인지 확인한다 (아니면 CONFLICT).
3. `expiresAt > now()`인지 확인한다 (만료 시 EXPIRED 처리 후 거부).
4. `quote.travelerId = booking.travelerId` 확인.
5. `quote.programId = booking.programId` 확인.
6. Quote의 `currency, participantCount, subtotal, serviceFee, taxes, discount, total`을
   **Booking에 그대로 복사**한다 (재계산 금지 — 견적이 유일한 계약 금액).
7. Booking 생성 + Quote `status = 'CONSUMED'`, `consumedAt = now()` 갱신을
   **같은 transaction**에서 수행한다.
8. 중복 소비 방지: 잠금 하에서 status 재확인 + `Booking.quoteId @unique`가
   DB 차원의 최종 방어선.

**서비스 invariant**: `status = CONSUMED ↔ consumedAt IS NOT NULL`
(Phase 5 통합 테스트 필수 항목: 동시 소비 시 한쪽만 성공).

## 3. 기타 앱 레이어에서 보장하는 불변식 (DB 제약 아님)

- `User.email`은 저장 전 소문자 정규화 (Zod `.toLowerCase()`), CITEXT 미사용.
- `Report(targetType, targetId)`는 polymorphic 느슨 참조 — 존재 검증은 서비스 레이어.
- Booking 상태 전이 규칙은 `modules/bookings/state-machine.ts`가 단일 소스 (Phase 5).
- 슬롯 예약의 capacity 검증·잠금 순서·**소유권 일치**: [booking-slot-locking.md](booking-slot-locking.md).
- **Payout 생성 불변식 (Phase 5/7)**: `Payout.expertId = Booking.expertId`,
  `Payout.currency = Booking.currency`이며, Payout 생성은 Booking COMPLETED 처리와
  **같은 transaction**에서 수행한다. 복합 FK로 강제하지 않는 이유: Prisma 관계
  모델링이 과도하게 복잡해짐 — 통합 테스트 필수 항목으로 대체.
- **PayoutAdjustment 통화**: 통화 컬럼이 없으며 항상 부모 `Payout.currency`를 따른다.
  최종 지급액 = `payoutAmount + SUM(adjustments.amount)` — 조회 시 계산하며
  PAID 이후 Payout 원본 금액 컬럼은 갱신하지 않는다.
- **Quote 소비**: §2.7 프로토콜 준수. `CONSUMED ↔ consumedAt` 동시 설정.

## 4. Phase 1B-2 test DB reset 안전장치 (스크립트 설계)

reset 스크립트는 실행 전 다음을 모두 검사하고 하나라도 걸리면 즉시 거부한다.

1. 대상 DB 이름에 `_test`가 없으면 거부
2. `NODE_ENV=production`이면 거부
3. 접속 host가 localhost/127.0.0.1이 아니면 거부 (production/staging host 차단)

Docker Compose(1B-2)는 dev DB(`handalsalgi_dev`)와 test DB(`handalsalgi_test`)를
모두 생성하는 init SQL을 포함한다.
