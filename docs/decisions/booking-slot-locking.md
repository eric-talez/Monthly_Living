# 결정: 예약 동시성 — BookingSlot과 slot 잠금 프로토콜

## 구조

- 한 예약(`Booking`)은 여러 concrete 슬롯(`AvailabilitySlot`)을 확보할 수 있다
  (다회차 프로그램). 연결은 `BookingSlot`이 담당한다:
  `bookingId + availabilitySlotId` unique, `participantCount`는 해당 슬롯에서
  차지하는 인원으로 capacity 검증의 단위가 된다.
- 중복 예약 방지·정원 검증은 **전부 slot 행 기준**으로 수행한다.
  (Booking 날짜 범위 겹침 검사가 아니라 slot 잔여 수량 검사)

## 잠금 프로토콜 (Phase 5 구현 시 준수)

예약 생성 transaction은 다음 순서를 지킨다.

1. 확보할 `availabilitySlotId` 목록을 **ID 오름차순으로 정렬**한다.
2. 정렬된 순서 그대로 `SELECT ... FROM "AvailabilitySlot" WHERE id = ANY(...)
ORDER BY id FOR UPDATE`로 행 잠금을 획득한다.
   → 모든 트랜잭션이 같은 순서로 잠그므로 **deadlock이 구조적으로 방지**된다.
3. 잠금 획득 후 각 슬롯에 대해 검증한다:
   `status = 'OPEN'` AND `reservedCount + 요청 인원 <= capacity`.
4. 전부 통과하면 `reservedCount` 증가 + `BookingSlot` 생성 + `Booking` 생성을
   같은 트랜잭션에서 커밋한다. 하나라도 실패하면 전체 롤백하고
   `CONFLICT` 오류(booking conflict UX 상태)로 응답한다.
5. 취소·환불 시 동일 프로토콜로 잠근 뒤 `reservedCount`를 감소시킨다.

## 격리 수준과 재시도

- PostgreSQL 기본 `READ COMMITTED` + 행 잠금(FOR UPDATE)으로 충분하다:
  검증과 갱신이 같은 잠금 구간 안에서 원자적으로 일어나므로 lost update가 없다.
- deadlock(40P01)·serialization(40001) 오류 발생 시 **1회 재시도**하고,
  재실패 시 사용자에게 재시도 가능한 오류로 반환한다.
- DB의 최종 방어선: `reservedCount <= capacity` CHECK
  ([database-constraints.md](database-constraints.md) — 1B-2에서 추가).

## 소유권 일치 invariant (PR #1 리뷰 반영)

Rule/Slot/Booking의 expertId·programId는 FK로 개별 참조만 되고 **서로의 일치는
DB가 보장하지 않는다**. 복합 FK(`(expertId, programId)` 참조)를 추가하면 Prisma
관계 모델링과 사용성이 과도하게 복잡해지므로 **DB constraint 대신 서비스 레이어
invariant + 통합 테스트 요구사항**으로 강제한다.

**invariant 목록** — 각 생성 transaction 안에서 검증한다:

1. `AvailabilityRule.programId`가 있으면
   `Program(programId).expertId = Rule.expertId`여야 한다. (Rule 생성/수정 시)
2. Rule에서 생성된 `AvailabilitySlot`의 `expertId`/`programId`는
   **Rule의 값과 동일**해야 한다. (슬롯 생성 job)
3. 수동 생성 Slot에 `programId`가 있으면
   `Program(programId).expertId = Slot.expertId`여야 한다. (수동 슬롯 생성 시)
4. `BookingSlot`이 연결하는 Slot의 `expertId`/`programId`는
   **Booking의 `expertId`/`programId`와 동일**해야 한다.
   (Booking 생성 transaction — slot 잠금 획득 직후 검증)

**통합 테스트 요구사항 (Phase 4·5)**: 위 4개 invariant 각각에 대해
불일치 데이터로 생성 시도가 거부되는 테스트를 작성한다.

## 슬롯 생성 idempotency

- 규칙 기반 슬롯 생성 job은 `@@unique([expertId, programId, startsAt, endsAt])`
  upsert로 중복 생성을 막는다. `programId IS NULL` 케이스의 null-distinct 문제와
  보완책은 [database-constraints.md](database-constraints.md) §2 참고.
