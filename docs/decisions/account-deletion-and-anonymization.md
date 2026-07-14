# 결정: 여행자 계정 탈퇴 — 구조화 계정 PII 익명화 + User identity tombstoning (1C-2B-1)

## 범위와 용어

이 기능은 **structured account PII anonymization**(User row의 구조화 개인정보
필드 제거)과 **User identity tombstoning**(row 보존 + 인증 identity 제거)이다.
메시지·리뷰·지원 티켓·예약 요청사항 등 **자유 입력 본문은 거래·분쟁·감사 기록으로
보존**되며, 이 안에 포함될 수 있는 개인정보의 정책(열람 제한·마스킹·보존 기한)은
Phase 8 후속 항목이다. 따라서 이 기능은 **전체 개인정보의 완전한 익명화나
특정 법령상 삭제 의무의 이행 완료를 주장하지 않는다** — 법률 준수 평가는 별도
검토 대상이다.

구현: `src/modules/users/` (eligibility·account-deletion·deletion-token-cookie),
`src/app/[locale]/settings/account/**`, `src/proxy.ts`.

## 왜 여행자(TRAVELER) self-service만 지원하는가

- **TRAVELER**: 자산이 본인 소유 데이터(프로필·관심·알림·설문)와 거래 참여 기록로
  한정되어, 활성 의무가 없다면 즉시 익명화해도 운영이 깨지지 않는다.
- **EXPERT**: 예약·정산(Payout)·심사(Credential)·프로그램이 걸려 있어 삭제 전
  정산 마감·프로그램 이관 등 운영 절차가 선행돼야 한다. self-service 범위 밖.
- **ADMIN**: 감사 로그·운영 책임 추적 때문에 self-service 삭제를 허용하지 않는다.

**fail-closed**: EXPERT/ADMIN은 요청 화면에서 폼 자체가 렌더되지 않고, 서비스도
`'unsupported'`로 거부한다(메일·토큰 미생성). 안내 문구는 내부 상태·보유 기록을
노출하지 않는 일반화 메시지만 사용한다. SUSPENDED/DELETED/미존재 사용자도 동일하게
일반화 거부한다.

## 인증 모델 — 로그인 세션 + 이메일 일회용 토큰

단순 세션 확인이나 "DELETE" 입력만으로 삭제하지 않는다. 모든 로그인 수단
(credentials·Google·Kakao)에서 동일하게 동작하도록 **본인 이메일로 발송되는
일회용 토큰**을 요구한다. "DELETE" 입력은 의사 확인용일 뿐 인증 수단이 아니다.

- 토큰: 256-bit 랜덤(base64url 43자), **DB에는 SHA-256 hash만 저장**
  (`AccountDeletionToken.tokenHash @unique`). TTL 30분, 단일 사용(`usedAt`).
- 요청 시 기존 미사용 토큰은 교체(User row `FOR UPDATE` 후 deleteMany→create,
  `replaceToken` 재사용) — 활성 토큰은 항상 최대 1개, 사용된 토큰은 감사용 보존.
- rate limit: 요청 user 3회/1h + IP 10회/1h, 확인 token 5회/15m + IP 10회/1h.
  복합 소비는 기존 정책과 동일하게 **IP 먼저**. limiter 키는 raw 값이 아니라
  `AUTH_SECRET` HMAC이며, token 키는 **raw token이 아닌 hash의 HMAC**이다.
  형식 불량 토큰은 hash·limiter·DB 접근 전에 거부된다.
- 로그: 토큰 원문·전체 이메일·userId를 남기지 않는다. console email provider는
  redacted 모드(개발 외 전체)에서 토큰·URL·본문·전체 주소를 출력하지 않는다.

## 스캐너 안전 GET / POST 소비 + 토큰 URL 노출 최소화

- 이메일 링크: `/settings/account/delete/confirm?token=...`
- **GET은 DB를 변경하지 않는다.** proxy(`src/proxy.ts`)가 서버 경계에서 토큰
  형식만 검증해 **HttpOnly cookie로 옮기고 쿼리 없는 URL로 303 redirect**한다
  — 토큰이 주소창·히스토리·Referer에 남지 않는다. cookie:
  `HttpOnly; SameSite=Lax; Secure(production); Max-Age=1800;
Path=<locale prefix>/settings/account/delete`.
- clean URL의 confirm 화면은 cookie 토큰으로 **읽기 전용 preflight**만 수행한다
  (유효/만료/차단 안내) — 이메일 스캐너가 링크를 열어도 토큰은 소비되지 않는다.
- **실제 소비는 확인 화면의 POST server action에서만** 일어난다. token은 hidden
  input이 아니라 서버가 cookie에서 읽고, `sessionUserId`는 세션에서만 얻는다.
- cookie는 rate-limit을 제외한 모든 결과(성공/invalid/expired/blocked/error)
  처리 후 제거된다. GET만 하고 떠난 경우 Max-Age(≤30분)로 소멸한다.
- 탈퇴 하위 화면 응답에는 `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`를 부여한다.
- 비로그인으로 링크를 열면 cookie를 유지한 채 localized login으로 보내고,
  로그인 후 whitelist 키(`next=delete-confirm`)로만 clean confirm URL에 복귀한다
  — 임의 경로를 운반하지 않아 open redirect가 불가능하다. **토큰만 가진 비로그인
  사용자는 탈퇴할 수 없고**, 토큰 소유 User와 세션 User가 일치해야 한다(소비
  where절의 `userId` 조건이 원자적으로 강제).

## 탈퇴 가능 여부 — 단일 정책 지점

`classifyDeletionEligibility` + `loadDeletionObligations`
(`src/modules/users/eligibility.ts`). 요청 시점과 탈퇴 transaction 내부에서
같은 로직으로 두 번 검사한다.

**허용**: role=TRAVELER ∧ status=ACTIVE ∧ deletedAt=null ∧ 세션-토큰 사용자 일치
∧ 유효·미사용 토큰 ∧ 아래 차단 기록 없음.

**활성 의무(차단) 기준** — "탈퇴 후 운영 처리가 필요한 상태"는 모두 차단(fail-closed):

| 대상                                               | 차단(active)                                                                                              | terminal(비차단·보존)                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Booking (`travelerId`)                             | **DRAFT**, PENDING, ACCEPTED, PAYMENT_PENDING, CONFIRMED, IN_PROGRESS, CANCELLATION_REQUESTED, DISPUTED   | REJECTED, COMPLETED, CANCELLED, REFUNDED                   |
| Payment (User FK 없음 — `booking.travelerId` 경유) | PENDING, PROCESSING                                                                                       | SUCCEEDED, FAILED, CANCELLED, REFUNDED, PARTIALLY_REFUNDED |
| Dispute                                            | OPEN, UNDER_REVIEW ∧ (**raisedById=본인 ∨ booking.travelerId=본인**) — 타인이 제기해도 본인 예약이면 차단 | RESOLVED, CLOSED                                           |
| SupportTicket                                      | OPEN, IN_PROGRESS, WAITING ∧ (**작성자=본인 ∨ booking.travelerId=본인**)                                  | RESOLVED, CLOSED                                           |
| BookingQuote                                       | ACTIVE ∧ **Booking 연결(비정상 상태)** — 정상은 CONSUMED이므로 fail-closed 차단                           | EXPIRED, CONSUMED                                          |
| ExpertProfile                                      | TRAVELER인데 존재(전문가 전환 진행 중 등 비정상) — fail-closed 차단                                       | —                                                          |

DRAFT Booking은 "완료된" 상태가 아니므로 차단에 포함한다. 차단 사유는 UI에
일반화 메시지로만 표시하고 상세(어떤 예약·몇 건)는 노출하지 않는다.

비차단(존재해도 탈퇴 가능): 종결 상태의 위 레코드들, Report(제기·피제기 불문),
CouponRedemption, Review, Conversation/Message, MatchRequest,
미연결 ACTIVE quote(아래 매트릭스 참조 — tx에서 삭제).

## 전체 User relation 삭제·보존 matrix

User FK를 가진 26개 모델 전수(스키마 41개 모델 중 User 미참조 15개는 해당 없음).
**Booking·Payment·Payout·Dispute·SupportTicket을 cascade delete하지 않는다** —
User row가 hard delete되지 않으므로 DB cascade는 발동하지 않고, 아래 "삭제" 항목만
transaction이 명시적으로 지운다.

| 모델 (User FK)                                                                                                                                                                                                               | onDelete | 처리                                              | 근거                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Account                                                                                                                                                                                                                      | Cascade  | **삭제**                                          | 소셜 재로그인 차단 — 인증 identity 제거                                                  |
| EmailVerificationToken                                                                                                                                                                                                       | Cascade  | **삭제**                                          | 인증 토큰 전부 제거(사용분 포함)                                                         |
| PasswordResetToken                                                                                                                                                                                                           | Cascade  | **삭제**                                          | 〃                                                                                       |
| AccountDeletionToken                                                                                                                                                                                                         | Cascade  | **삭제**                                          | 〃 (소비된 자기 토큰 포함)                                                               |
| LoginAttempt (FK 없음, raw email)                                                                                                                                                                                            | —        | **삭제(원 이메일 exact)**                         | 이메일이 정규화 저장되므로 exact match 안전. cascade가 없어 명시 삭제 필수               |
| TravelerProfile                                                                                                                                                                                                              | Cascade  | **삭제**                                          | 사용자 소유 선호 프로필                                                                  |
| ProgramFavorite / ExpertFavorite                                                                                                                                                                                             | Cascade  | **삭제**                                          | 사용자 소유 북마크                                                                       |
| Notification (→NotificationDelivery)                                                                                                                                                                                         | Cascade  | **삭제** (delivery는 DB cascade)                  | 사용자 전용 ephemeral 알림·발송 기록                                                     |
| MatchRequest                                                                                                                                                                                                                 | Cascade  | **삭제**                                          | 사용자 소유 설문 스냅샷, 자식 FK 없음 확인                                               |
| BookingQuote (`travelerId`)                                                                                                                                                                                                  | Cascade  | **ACTIVE ∧ 미연결만 삭제**, EXPIRED/CONSUMED 보존 | 미소비·비계약성 임시 데이터만 제거. 탈퇴 후 tombstone의 ACTIVE quote 0건을 테스트로 고정 |
| ConsentRecord                                                                                                                                                                                                                | Cascade  | **보존**                                          | 법적 동의 이력 — User row가 살아 있어 cascade 미발동                                     |
| Booking (`travelerId`)                                                                                                                                                                                                       | Restrict | **보존**                                          | 계약 스냅샷·역사 기록, tombstone id에 연결 유지                                          |
| Review (`travelerId`)                                                                                                                                                                                                        | Restrict | **보존**                                          | 커뮤니티·거래 기록 (본문은 자유 입력 — Phase 8)                                          |
| Conversation (`travelerId`) / Message (`senderId`)                                                                                                                                                                           | Restrict | **보존**                                          | 분쟁·감사 근거 (본문은 자유 입력 — Phase 8)                                              |
| SupportTicket (작성자)                                                                                                                                                                                                       | Restrict | **보존**                                          | 운영 기록                                                                                |
| Report (`reporterId`)                                                                                                                                                                                                        | Restrict | **보존**                                          | 신고 감사 기록                                                                           |
| Dispute (`raisedById`)                                                                                                                                                                                                       | Restrict | **보존**                                          | 분쟁 기록                                                                                |
| CouponRedemption                                                                                                                                                                                                             | Restrict | **보존**                                          | 거래 기록                                                                                |
| AdminAuditLog (`adminId`)                                                                                                                                                                                                    | Restrict | **보존** (TRAVELER에겐 없음)                      | 감사 로그                                                                                |
| ExpertProfile                                                                                                                                                                                                                | Cascade  | 해당 없음 — 존재 시 탈퇴 차단                     | 비정상 상태 fail-closed                                                                  |
| SetNull 계열 9종 (ExpertCredential.reviewedBy, SupportTicket.assignedAdmin, Report.resolvedBy, Dispute.resolvedBy, Coupon.createdBy, GuidePost.author, Payout.paidBy, PayoutAdjustment.createdBy, PlatformSetting.updatedBy) | SetNull  | **미조작**                                        | admin/작성자 참조 — TRAVELER 탈퇴와 무관, row 보존이므로 null 처리도 불필요              |

Payment/Payout은 User 직접 FK가 없다(각각 Booking·ExpertProfile 경유) —
예약·정산 기록으로 그대로 보존된다.

## User tombstone — 구조화 PII 익명화

User row는 **절대 hard delete하지 않는다** (역사 FK 무결성). `id`·`role`·
`createdAt`은 유지하고 다음으로 update한다:

```
email: `deleted+${user.id}@deleted.invalid`   // userId 파생 — 충돌 사실상 불가
passwordHash/name/image/emailVerified: null
fullName/nickname/phone/country: null
preferredLanguage 'ko' / preferredCurrency 'KRW' / timezone 'Asia/Seoul'
status 'DELETED' / deletedAt now
```

- **원 이메일은 commit 즉시 재사용 가능** — [email-reuse-policy.md](email-reuse-policy.md).
- **identity 분리**: 원 이메일(credentials)·동일 provider identity(OAuth) 재가입은
  항상 **새 User id**로 생성되고, 과거 예약·리뷰·결제는 tombstone id에 남는다.
  OAuth 재로그인이 과거 계정에 연결되지 않는 이유: Account 행이 삭제됐고
  `ensureOAuthIdentity`는 신규 가입 경로로 새 User를 만든다.
- 세션: jwt callback이 매 조회마다 `status!=='ACTIVE' || deletedAt!==null`을
  검사하므로 **기존 JWT는 다음 session 조회에서 즉시 무효화**되고 쿠키가 제거된다
  (1C-1 구현 재사용 — 신규 코드 없음).

## 단일 transaction·잠금 순서·원자성

`deleteAndAnonymizeTravelerAccount` — 모든 DB 변경이 하나의 Prisma interactive
transaction 안에 있다:

1. `SELECT id FROM "User" WHERE id = $sessionUserId FOR UPDATE` —
   **유일한 직렬화 지점**. `replaceToken`(토큰 발급)과 같은 잠금 순서(User 단일
   row)라 교착이 없다. 동시 confirm·탈퇴 중 재발급·탈퇴-로그인 race가 모두 이
   잠금 뒤에서 순차 처리된다.
2. 잠금 아래 재검증: ACTIVE·미삭제(아니면 invalid)·TRAVELER(아니면 blocked).
3. **토큰 원자적 소비**: `updateMany({ tokenHash, userId, usedAt: null,
expiresAt > now } → { usedAt: now })`, `count === 1`만 통과 — 동일 토큰 동시
   POST는 정확히 한 요청만 성공한다(패자는 invalid).
4. eligibility 재검사 — 실패 시 **전체 rollback**(sentinel throw). 요청과 확인
   사이에 생긴 활성 의무를 잡아내고, **토큰 소비까지 되돌리므로** 사용자는 의무
   해소 후 TTL 내 같은 링크로 재시도할 수 있다(남용은 token limiter 5회/15m 제한).
5. ephemeral 삭제 → 6. Account·토큰 3종 삭제 → 7. tombstone update → 8. commit.

실패 시 부분 상태가 없다: tombstone email unique 충돌(P2002)·중간 실패 모두
transaction 전체가 rollback된다. 테스트 전용 hook 4지점(토큰 소비 후 / Account
삭제 후 / PII update 직전 / commit 직전)의 실패 주입으로 각각 완전 복원을
통합 테스트로 고정했다. custom adapter의 `deleteUser()` fail-closed 차단은
1C-2A 그대로 유지된다.

## 알려진 한계·후속

- **자유 입력 본문 보존**: Message/Review/SupportTicket/Booking.specialRequest/
  BookingParticipant.note 등에 사용자가 직접 적은 개인정보는 이번 범위에서
  제거하지 않는다 — Phase 8 개인정보 정책 항목.
- **실제 email provider 미검증**: console provider만 존재한다. Resend 등 실
  provider 도입 시 탈퇴 메일 E2E 재검증 필요(출시 Gate).
- 유예 기간·복구·background 삭제 작업·storage object 삭제는 범위 외.
- EXPERT/ADMIN 탈퇴는 운영 절차 설계와 함께 별도 Phase에서 다룬다.
- 법령(개인정보 보호법·GDPR 등) 준수 완료를 주장하지 않는다 — 보존 기록·기한
  정책과 함께 별도 법률 검토가 필요하다.
