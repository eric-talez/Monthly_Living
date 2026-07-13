# 진행 상황 (PROGRESS)

> 목표: production architecture를 갖춘 **staging-ready MVP**.
> 각 sub-phase는 독립적으로 완료·검증 후 다음으로 진행한다.
> 구현되지 않은 기능을 완료로 표시하지 않는다.

## Phase 현황

| Phase | 내용                                                                                      | 상태                   |
| ----- | ----------------------------------------------------------------------------------------- | ---------------------- |
| 1A    | Repository Foundation — scaffold, 디자인 토큰, i18n, env 검증, 공통 에러/응답, 레이아웃   | ✅ 완료 (2026-07-11)   |
| 1B-1  | Schema Contract — Prisma 7 도입, 전체 스키마 계약, 설계 결정 문서                         | ✅ 완료 (2026-07-11)   |
| 1B-2A | Migration SQL Draft — create-only draft + custom SQL(CHECK 등), 빈 DB, docker, reset 가드 | ✅ 완료 (2026-07-12)   |
| 1B-2B | Apply, Seed, Reset Verification — migration 적용, seed, reset 왕복 검증                   | ✅ 완료 (2026-07-12)   |
| 1C-1  | Authentication Core — 이메일/비밀번호 가입·로그인, 이메일 인증, 재설정, rate limit        | ✅ 완료 (2026-07-12)   |
| 1C-2A | Google/Kakao OAuth Identity — provider 구성, 계정 생성·연결 정책, custom adapter, UI      | ✅ 완료 (2026-07-13)\* |
| 1C-2B | Authentication 확장 잔여 — 계정 탈퇴(soft delete), 프로필 온보딩, 권한별 redirect         | ⬜ 미착수 (1C 진행 중) |
| 1D    | Verification — Phase 1 통합 점검, CI                                                      | ⬜ 미착수              |
| 2     | Public Marketplace                                                                        | ⬜ 미착수              |
| 3     | Recommendation                                                                            | ⬜ 미착수              |
| 4     | Expert Platform                                                                           | ⬜ 미착수              |
| 5     | Booking & Payment                                                                         | ⬜ 미착수              |
| 6     | Communication                                                                             | ⬜ 미착수              |
| 7     | Admin                                                                                     | ⬜ 미착수              |
| 8     | Quality & Deployment                                                                      | ⬜ 미착수              |

## Phase 1A 기록 (2026-07-11)

**구현 내용**

- Next.js 16.2.10 + React 19.2 + TypeScript strict scaffold (pnpm)
- 폴더 구조: `src/app · modules · adapters · lib · components · i18n · messages`
- Tailwind v4 디자인 토큰 (`src/app/globals.css`): 크림 화이트 배경, 웜 차콜 텍스트,
  세이지/네이비/테라코타 포인트, Noto Serif KR(헤드라인) + Noto Sans KR(본문),
  focus-visible·reduced-motion 접근성 기본값
- next-intl ko/en (`localePrefix: as-needed`, ko 기본) — proxy.ts, i18n/routing·request·navigation
- `lib/env.ts` — Zod 환경변수 검증 (실패 시 명확한 메시지와 함께 기동 중단)
- `lib/errors.ts` — AppError + ErrorCode enum, `lib/api-response.ts` — 통일 응답 규격
- 기본 layout: SiteHeader(브랜드 + 언어 전환), SiteFooter, 홈 placeholder, 로케일 404 페이지
- ESLint(next core-web-vitals + ts) / Prettier(+tailwind plugin), `.env.example`, README

**의도적으로 하지 않은 것 (범위 준수)**

- 인증, DB 스키마, 결제, 검색 등 이후 Phase 기능 일체
- 홈 화면에 동작하지 않는 검색 UI·메뉴를 만들지 않음 (Phase 2에서 실제 기능과 함께 구현)

**검증 결과** — 아래 명령 모두 통과 (2026-07-11)

```
pnpm lint / pnpm typecheck / pnpm build / pnpm format:check
```

**다음 (Phase 1B)**: Prisma 전체 스키마(계획서의 데이터 모델 결정 반영), 초기 migration,
seed 스크립트(도시 9, 카테고리 15, 테스트 계정 4종, 전문가 ~20·프로그램 ~40), docker-compose.yml

## Phase 1A 검증 패스 (2026-07-11, 사용자 지시)

**저장소 상태**: working tree clean, 브랜치 `main`, 추적 파일 35개.
`.next`/`node_modules`/실제 `.env`/스크린샷/로그/secret 추적 없음 확인.

**버전 일관성**: Node v22.23.1, pnpm 11.9.0, lockfileVersion '9.0'.
`package.json`에 `packageManager: pnpm@11.9.0`, `engines.node >=22` 추가 (기존 누락 보완).
※ 이전 보고의 "pnpm 10 정책"은 pnpm v10에서 도입되어 v11에도 유지되는
빌드 스크립트 차단 기본 정책을 가리키는 부정확한 표현이었음 — 실사용 버전은 11.9.0.

**i18n 라우팅 (production `next start`에서 실측)**:

| 경로                        | 결과                                                  |
| --------------------------- | ----------------------------------------------------- |
| `/`                         | 200, `<html lang="ko">` (기본 한국어)                 |
| `/ko`                       | 307 → `/` (중복 URL 방지 canonical redirect)          |
| `/en`                       | 200, `<html lang="en">`, `Set-Cookie: NEXT_LOCALE=en` |
| `/invalid-locale`           | 404, 기본 로케일(ko) not-found 페이지 렌더            |
| 쿠키 `NEXT_LOCALE=en` + `/` | 307 → `/en` (재방문 언어 유지)                        |
| 쿠키 `en` + `/ko`           | 307 → `/` (명시 경로가 쿠키보다 우선, canonical 유지) |

**범위 준수**: 홈에 버튼/폼/링크/CTA/검색/mock 엔티티 없음(정적 i18n 텍스트만).
앱 전체 링크는 헤더 브랜드→홈, 404→홈, 언어 전환 3곳뿐이며 모두 동작함.

**정리**: `.claude/launch.json` 추적 제거 + `.claude/` gitignore 추가
(pnpm dev 한 줄을 감싼 도구 전용 설정 — README로 충분).

## Phase 1B-1 기록 (2026-07-11) — Schema Contract

**구현 내용**

- Prisma 7.8.0 (+ @prisma/client, @prisma/adapter-pg, pg, bcryptjs / dev: tsx, dotenv, @types/pg)
- `"type": "module"` 전환 (Prisma 7 ESM) — Next/ESLint/Prettier/빌드 정상 동작 확인
- multi-file schema: `prisma/schema.prisma`(datasource·generator) + `prisma/models/*.prisma` 13개
  — 모델 41개, enum 29종. 연결 URL은 Prisma 7 규칙에 따라 `prisma.config.ts`로 이동
  (schema 내 `url = env(...)`은 7.8에서 검증 오류)
- Prisma Client 명시적 output: `src/generated/prisma` (git·lint·prettier 제외, `pnpm db:generate`)
- `src/lib/prisma.ts` — PrismaPg driver adapter + global singleton
- 설계 결정 문서: database-constraints(1B-2 CHECK·NULLS NOT DISTINCT 목록),
  email-reuse-policy, booking-slot-locking(잠금 순서 프로토콜), authjs-session-strategy
  (Account 포함·Session 미포함·EmailVerificationToken 명명)
- 스크립트: `db:format` / `db:validate` / `db:generate` (migrate/seed 스크립트는 1B-2에서 추가)

**하지 않은 것 (범위 준수)**: migration 생성·적용 없음, seed 없음, 실제 DB 변경 없음
(`psql -lqt`에 handalsalgi DB 미존재 확인)

**검증 결과 (2026-07-11)**: prisma format/validate/generate ✅,
format:check·lint·typecheck·build 모두 exit 0 ✅

**다음 (Phase 1B-2)**: 스키마 검토 승인 후 initial migration + CHECK 제약 SQL,
seed(도시 9·카테고리 15·계정 4종·전문가 ~20·프로그램 ~40), docker-compose(dev+test DB init),
안전장치 있는 test DB reset 스크립트

## Phase 1B-2A 기록 (2026-07-12) — Migration SQL Draft

**최소 수정 (사용자 지시 6건)**: DATABASE_URL fail-closed(fallback 전면 제거,
env는 `server-only` 가드), guarded reset 스크립트(scripts/db-reset.ts — production/비
localhost/`_test` 미포함/파싱 실패 거부, Prisma 7 reset의 자동 generate+seed 전제로
중복 호출 없음), PostgreSQL 15+ 명시(README·constraints 문서), constraint 문서 보강
(요일 범위·HH:mm 형식·자정 미초과 MVP 정책 등), schema key audit 12항목 확인(수정 불필요),
clean checkout 순서 문서화.

**1B-2A 산출물**: PostgreSQL 16.13 실측, 빈 DB `handalsalgi_dev`/`handalsalgi_test` 생성,
docker-compose.yml + docker/postgres/init/01-create-test-db.sql,
`prisma migrate dev --name init --create-only`로 draft 생성
(`prisma/migrations/20260712034631_init/` — 적용 안 함), custom SQL 수동 추가:
CHECK 38건 + AvailabilitySlot unique NULLS NOT DISTINCT 재생성 + Conversation partial
unique. CHECK의 NULL 통과 시맨틱 대응으로 쿠폰 타입 필드에 IS NOT NULL 명시.

**투명성 기록**: `--create-only` 실행이 dev DB에 빈 `_prisma_migrations` 테이블을
생성함(Prisma의 문서화된 bookkeeping 동작, 기록 0행 = 어떤 migration도 미적용).
확인 후 DROP하여 dev DB를 완전 초기 상태로 복구. application 테이블 생성 0건,
test DB 무변경. 최종 재확인: 두 DB 모두 public 테이블 0개.

**검증**: db:format/validate/generate, format:check, lint, typecheck, build 모두 exit 0.
migration은 적용되지 않았고 seed는 실행되지 않음.

**다음 (1B-2B)**: migration.sql 검토 승인 후 dev DB 적용 → seed 작성·실행 →
reset 왕복 → CHECK 위반 spot test.

### PR #1 리뷰 반영 (2026-07-12)

- **Auth.js 호환성**: User에 adapter 표준 필드 `name`/`image`/`emailVerified`(nullable)
  채택, `fullName`은 nullable 실명 필드로 분리, `profileImageUrl`/`emailVerifiedAt` 제거.
  공식 PrismaAdapter `deleteUser()`는 hard delete → Phase 1C 탈퇴는 별도 서비스 로직
  (soft delete + 익명화)로 결정, 문서화.
- **Payout 통화 무결성**: `PayoutAdjustment.currency` 제거 — 항상 부모 Payout.currency.
  `platformFee <= grossAmount`, `payoutAmount <= grossAmount` CHECK 추가.
  Payout.expertId/currency = Booking 일치는 앱 레이어 invariant로 문서화.
- **Quote→Booking**: `BookingQuote.consumedAt` 추가, 8단계 소비 프로토콜 문서화
  (FOR UPDATE 잠금→검증→복사→CONSUMED 동일 tx), feeRateBps 0~10000·discount cap·
  total 등식 CHECK를 Quote/Booking 양쪽에 추가.
- **Availability 소유권**: Rule/Slot/BookingSlot/Booking 간 expertId·programId 일치
  invariant 4종을 booking-slot-locking.md에 기록 (복합 FK 대신 서비스 검증+통합 테스트).
- **추가 CHECK**: ExpertProfile(응답시간·카운트·평점), Program(카운트·평점),
  Coupon(minSubtotal·redemption cap), Conversation(미읽음), NotificationDelivery,
  ExpertCredential(파일 크기·유효기간), Destination(좌표 범위) — 총 CHECK 58건.
- **reset 안전장치 강화**: 시스템 DB 거부, dev는 `handalsalgi_dev`/`*_dev` 강제,
  test는 `*_test` suffix 강제, `?schema=` public 이외 거부.
- **migration 재생성**: `prisma migrate diff --from-empty --to-schema --script`로
  DB 무접촉 재생성 (`20260712041838_init` — 기존 폴더 교체, initial migration 1개 유지).

## Phase 1B-2B 기록 (2026-07-12) — Apply, Seed, Reset Verification

**적용**: `prisma migrate deploy`로 dev·test DB에 initial migration 적용
(41 테이블·58 CHECK·NULLS NOT DISTINCT·partial unique 실측 확인).
`migrate dev` 적용 모드는 사용하지 않음 — shadow drift가 custom index를
drop 제안할 수 있어 draft(--create-only) + deploy 워크플로를 표준으로 채택 (README).

**CHECK 위반 spot test**: 트랜잭션 내 SAVEPOINT 방식으로 8종 위반 전부
정확한 제약 이름으로 거부됨을 실측(위도 범위, 환율>0, 쿠폰 NULL 우회, 참가자 수,
reservedCount≤capacity, slot NULLS NOT DISTINCT 중복, 일반 대화 partial unique,
quote total 등식) + 정상 대조군 성공. 전체 ROLLBACK — 잔여 데이터 0.

**Seed**: `prisma/seed.ts` + `seed-data/` 7개 모듈. idempotent(2회 실행 카운트 동일):
users 22 · travelerProfiles 1 · expertProfiles 20 · serviceAreas 27 · destinations 9 ·
categories 15 · programs 40(공개 38+DRAFT 2) · programMedia 80 · exchangeRates 12 ·
platformSettings 5 · consentRecords 8. 테스트 계정 4종(`Test1234!`) README 문서화.

**Prisma 7.8 실측 불일치 (중요)**: 이전 전제("migrate reset이 generate+seed 자동
실행")와 달리 **reset은 둘 다 자동 실행하지 않음**을 실측으로 확인 → `db:reset`이
dev 대상에 한해 reset 성공 후 `prisma db seed`를 명시 실행하도록 수정
(test 대상은 빈 스키마 유지). 왕복 재검증: reset→migration→seed→카운트 동일.

**Prisma AI 안전장치**: `migrate reset`이 AI 에이전트 호출을 차단
(PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION 요구) → 사용자에게 대상
(localhost/handalsalgi_dev)·비가역성·위험 평가를 보고하고 **명시 동의를 받은 뒤**
동의 문구를 환경변수로 전달해 실행함 (2026-07-12).

**가드 거부 실증**: 비 localhost host / 시스템 DB / dev 이름 규칙 위반 /
test `_test` 미포함 / schema≠public / NODE_ENV=production / URL 파싱 실패
— 7종 모두 거부 메시지와 함께 exit 1 확인. `db:test:prepare`(migrate deploy,
가드 경유) 추가 — test DB는 스키마만 적용, 데이터 0 유지.

**검증**: db:format/validate/generate, format:check, lint, typecheck, build 모두 exit 0.

## Phase 1C-1 기록 (2026-07-12) — Authentication Core

**구현 내용**

- **Auth.js v5** `next-auth@5.0.0-beta.31`(peer `next ^16` 확인) + `@auth/prisma-adapter@2.11.2`
  (양쪽 모두 `@auth/core 0.41.2` 고정 — 타입 증강용 devDep로 동일 버전 명시).
  `session: { strategy: 'jwt' }` **명시 필수** — adapter가 있으면 기본값이 database 전략이라
  Session 모델이 없는 이 스키마에서는 로그인이 즉시 실패한다 (@auth/core lib/init.js 실측).
  adapter `deleteUser()`는 어떤 경로에서도 호출하지 않음 (결정 문서).
- **Credentials 로그인 단일 강제 지점**: rate limit·LoginAttempt 기록·모든 검증이
  `authorize()` → `modules/auth/service.authorizeLogin()`(스키마 검증 본체) →
  `loginWithCredentials()`에서만 수행된다. server action을 거치지 않는 직접
  `POST /api/auth/callback/credentials`도 같은 경로
  (브라우저 실측: 직접 POST 6회 → LoginAttempt 5건 + 6번째 limiter 차단).
  미존재/비밀번호 불일치/미인증/정지/삭제는 **응답 내용·오류 메시지 기준으로** 동일한
  일반화 오류로 수렴, 미존재 계정에도 고정 더미 hash로 bcrypt 비교 1회 수행
  (타이밍 차이 완화 — 완전 제거는 아님, 알려진 한계 참조).
- **세션 클레임·차단**: JWT에 userId/role/status + `credentialVersion`
  (= HMAC-SHA256(AUTH_SECRET, passwordHash) — raw hash 미탑재). jwt callback이
  세션 읽기마다 DB 재확인(PK 1회, 요청당 `lib/session.ts`의 React.cache로 dedupe):
  미존재/SUSPENDED/DELETED/deletedAt → `null` 반환으로 세션 쿠키 제거,
  digest 불일치(비밀번호 재설정) → 기존 세션 무효화.
- **회원가입**: Zod 검증(이메일 trim+lowercase 정규화 내장, 비밀번호 8자+영문·숫자
  - **UTF-8 72바이트 제한** — bcrypt silent truncation 거부), 기본 TRAVELER,
    가입·필수 약관(TERMS/PRIVACY)·선택 마케팅 ConsentRecord·인증 토큰 생성이 단일
    transaction. 중복 이메일은 계정 상태와 무관하게 **동일 성공 응답 + 메일 미발송**
    (응답 내용 기준 열거 방지; unique race는 P2002 처리).
- **이메일 인증/비밀번호 재설정 토큰**: `crypto.randomBytes(32)` base64url 원문은
  메일 링크로만 전달, DB에는 sha256 hash만 저장. 소비는
  `updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: now } } })`
  **원자적 1회**(count=1일 때만 같은 tx에서 사용자 상태 변경). 재발급은 User row
  `FOR UPDATE` 잠금 후 기존 미사용 토큰 삭제+신규 생성(활성 토큰 항상 ≤1).
  인증 24h / 재설정 30m TTL. 재설정 성공 시 잔여 미사용 재설정 토큰 삭제.
  인증 링크는 GET에서 DB 무변경(스캐너 prefetch 안전) — 버튼 POST로만 소비,
  결과는 비민감 enum(`?status=`)으로만 전달.
- **Rate limit**: port(`adapters/rate-limit`) + memory 구현(sliding window log,
  setInterval 없음, globalThis 저장소). 로그인 email 5/15m + IP 20/15m,
  가입 IP 5/1h, 재전송 email 3/15m + IP 10/1h, 재설정 요청 email 3/1h + IP 10/1h,
  재설정 완료 IP 10/1h + token 5/15m — 상수 `AUTH_RATE_LIMITS`.
  **limiter 키는 raw 값 대신 HMAC** 처리(token 키는 raw token이 아닌 sha256 hash를 HMAC).
  **복합 flow는 IP limiter를 먼저 소비**(IP 차단된 공격자가 피해자 email 한도를
  대신 소진시키는 계정 잠금 방지). LoginAttempt(감사)와 limiter(제어) 역할 분리 —
  차단된 시도는 기록하지 않음. XFF 신뢰 정책·UNKNOWN_IP 공용 키 한계·소비 순서
  문서화: [client-ip-and-rate-limit.md](docs/decisions/client-ip-and-rate-limit.md).
- **Email port**: `adapters/email` + ConsoleEmailProvider — development만 본문(인증 URL)
  출력, **production은 마스킹된 수신자+미구성 경고만**(토큰/URL/본문/전체 주소 미출력,
  production 서버 stdout 실측). 문구는 `messages/{ko,en}.json` auth.emails
  (JSON 직접 import — next-intl 요청 컨텍스트 불필요). URL은 `new URL(path, APP_URL)`.
- **UI (ko/en)**: `(auth)` 라우트 그룹 — 로그인 / 회원가입 / 인증 안내(sent, 재전송 폼) /
  인증 확인(verify-email?token=) / 인증 결과(result?status=enum) / 비밀번호 찾기 / 재설정.
  서버 액션 + React 19 useActionState, 오류 요약 role="alert"+focus 이동,
  필드 aria-invalid/aria-describedby, 문자열 전부 messages, 링크는 `@/i18n/navigation`.
  헤더에 최소 세션 표시(로그인 링크 ↔ 이메일+로그아웃) — 사용자 승인 범위.
- **의존성 주입**: 서비스는 `{ db, emailProvider, rateLimiters, now, generateToken,
hashPassword, verifyPassword }` deps 객체(기본값 실제 어댑터) — 테스트는 capture
  email·고정 clock·결정적 토큰·카운팅 hasher 주입("bcrypt 미호출" 관측용).
- **Vitest 4** 도입(unit/integration 분리): unit 42 + integration 48 = **90개 통과**.
  통합 테스트는 setup에서 TEST_DATABASE_URL 필수+기존 db-url-guard 재사용 후
  `DATABASE_URL`을 test DB로 덮어씀(이중 안전). runId prefix 데이터만 생성·정리,
  reset 명령 미사용, dev DB 무변경 실측(User 22 유지). **실세션 테스트**: 고정
  beta.31의 실제 handlers를 쿠키 왕복으로 구동 — 로그인→세션 발급→SUSPENDED/DELETED
  변경→session null+쿠키 제거, 재설정 전 세션이 재설정 후 무효화(credentialVersion),
  동시 인증/재발급/재설정 race 각 1승자 검증.
- 기타: `prisma/seed.ts`·`prisma.config.ts`의 "migrate reset이 seed 자동 실행" 낡은 주석을
  1B-2B 실측과 일치하게 수정(동작 무변경). `AUTH_SECRET`(필수)·`EMAIL_PROVIDER`
  env.ts+.env.example 등록. schema 변경·migration 없음.

**하지 않은 것 (범위 준수 — Phase 1C-2)**

- Google/Kakao OAuth, 계정 탈퇴(soft delete + 익명화), 프로필 온보딩(fullName 등),
  권한별 대시보드/리다이렉트, Playwright/CI(1D)

**검증 결과 (2026-07-12)** — 모두 exit 0

```
pnpm db:generate / db:format / db:validate / format:check / lint / typecheck
pnpm test        # 90 passed (unit 42, integration 48) — 보안 재검토 반영 후 재실행
pnpm build
```

수동 브라우저 검증(dev): 가입(빈 폼 오류 요약·필드 오류 포함)→console 인증 URL→
GET 무소비 확인→버튼 인증→verified/already-verified, 잘못된 비밀번호 vs 미존재
이메일 **동일 메시지**, 정상 로그인→헤더 세션 표시→로그아웃, 재설정 왕복
(`/login?reset=1`)+새 비밀번호 로그인+**기존 세션 즉시 무효화**, rate limit 발동
(raw 엔드포인트 직접 6회 → 기록 5건+차단, UI 메시지 구분 표시),
`traveler@test.com / Test1234!` seed 로그인, 전용 계정 SUSPENDED→리로드 즉시 세션
소멸(seed 계정 미변경, 검증 데이터 전부 삭제 후 baseline 복구 확인), /en 전 흐름.
production(`next start` + AUTH_TRUST_HOST=true): 인증 페이지 전부 200,
`/api/auth/session|csrf|providers` 정상, **console에 토큰/URL/본문 미노출** 실측.

**보안 재검토 반영 (2026-07-12, PR #2 추가 커밋)**

- **재설정 완료 bcrypt DoS 방어**: `resetPassword()`가 임의 토큰에도 cost-12 bcrypt를
  먼저 계산하던 문제 수정. 순서: IP limiter → 토큰 형식(정확 43자 base64url) 선검증 →
  token limiter(sha256 hash를 HMAC 키로) → 저비용 preflight 조회(존재/usedAt/expiresAt)
  → 그때만 bcrypt → 기존 원자적 updateMany(**최종 권위 불변** — preflight는 DoS 방어용
  선별일 뿐, 동시 소비 race 판정은 기존과 동일). `verifyEmail()`에도 형식 선검증 적용.
  reset 액션은 `getClientIp` 전달 + RATE_LIMITED를 타 인증 액션과 동일 메시지로 처리.
  잘못된 형식·미존재 토큰에서 bcrypt 미호출을 카운팅 hasher 스파이로 검증
  (positive control: 유효 토큰은 정확히 1회).
- **복합 limiter IP 우선 순서**: 로그인·재전송·재설정 요청이 email limiter를 먼저
  소비하던 것을 IP 우선으로 교체. 회귀 테스트 3종은 IP·email 모두 max 1로 낮춰
  old/new 순서가 다른 결과를 내도록 구성(차단된 요청이 피해자 email 한도를 태우지
  않고, 다른 IP에서 피해자의 첫 요청이 허용됨을 판별).
- **로그인 비밀번호 UTF-8 72바이트 상한**: `loginPasswordSchema`(비어 있지 않음 +
  72바이트만 — 최소 8자·영문/숫자 복잡도 정책은 기존 계정 호환을 위해 가입·재설정
  전용 유지). 상한이 없으면 "정상 72바이트 비밀번호+접미사"가 bcrypt truncation으로
  일치해 버린다 — authorize 경로(authorizeLogin)에서 bcrypt 미도달 테스트로 증명.
  이메일 254자(RFC 5321) 상한, 폼 maxLength 정렬(email 254·password 72 — UTF-16
  문자 수 기준 편의 기능일 뿐, 서버 검증이 최종 기준).
- 신규 테스트 19개(unit +9, integration +10). schema/migration 변경 없음,
  dev/test DB reset 미실행.

**알려진 한계 (1C-1 시점)**

- memory limiter는 프로세스별 상태(다중 인스턴스에서 한도 배수) — production은
  Redis 전환(출시 Gate). 세션 재검증이 세션 읽기마다 PK 조회 1회(요청당 dedupe) —
  필요 시 재확인 간격 클레임으로 최적화 여지.
- 계정 열거 방지는 **응답 내용·오류 메시지 기준**이다. 처리 시간 기반 side channel은
  완전히 제거되지 않았다: 가입·로그인의 bcrypt 비용 차이(미세)와 재설정 요청·인증
  재전송의 DB 조회/메일 발송 처리 시간차가 ConsoleEmailProvider MVP에서 잔존.
  production email provider 도입 시 queue/outbox 또는 일정 응답 지연 정책 검토.
- SUSPENDED는 정지 기간 동안 모든 세션 읽기를 차단하는 방식 — 계정을 다시 ACTIVE로
  되돌리면 만료 전 JWT는 다시 유효해진다(영구 강제 로그아웃이 필요하면 1C-2에서
  credentialVersion bump 또는 세션 maxAge 단축 검토). RSC 렌더 중에는 Next 제약상
  무효 쿠키 삭제가 적용되지 않아 route handler/action 접근 시점에 정리된다
  (서버는 매 요청 세션을 거부하므로 보안 영향 없음).
- self-host production은 `AUTH_TRUST_HOST=true` 필요(.env.example 문서화, 실측 확인).
- 헤더 세션 표시로 `[locale]` 페이지가 SSG에서 동적 렌더링(ƒ)으로 전환됨.

**다음 (Phase 1C-2)**: Google/Kakao OAuth(Account 연결·이메일 정규화 일관성),
계정 탈퇴(soft delete+하드 익명화, adapter deleteUser 미사용), 프로필 온보딩,
로그인 후 권한별 리다이렉트.

## Phase 1C-2A 기록 (2026-07-13) — Google/Kakao OAuth Identity

> \* 완료 범위 구분: **코드·자동 테스트(결정적 fake provider network 통합 테스트 포함)·데모 env
> 브라우저 검증까지 완료**. 실제 Google Cloud Console/Kakao Developers credential을 사용한
> 외부 provider 왕복 E2E는 **credential 발급 대기 항목**이며 완료로 간주하지 않는다 (아래 참고).

**구현 내용**

- **Provider 구성 (fail-closed)**: `AUTH_GOOGLE_ID/SECRET`, `AUTH_KAKAO_ID/SECRET` env 쌍이 모두
  설정된 provider만 활성화. 부분 설정·빈 값·공백만인 값은 명확한 메시지로 기동 실패
  (`src/lib/env.ts` superRefine). checks 명시: Google `pkce+state+nonce`, Kakao `pkce+state`
  (@auth/core 기본값은 pkce뿐이라 state 검증이 생략됨 — 실측 후 보강).
- **계정 생성·연결 정책** (`docs/decisions/oauth-account-linking.md` — @auth/core@0.41.2 실행
  순서 파일:행 실측 인용 포함):
  - `allowDangerousEmailAccountLinking` 미사용 — 동일 이메일 자동 연결은 안전을 증명할 수 없어
    (선점 계정 탈취·검증 이력성) 기본 fail-safe(OAuthAccountNotLinked→일반화 메시지) 유지.
  - signIn callback → `modules/auth/oauth.ts` 단일 정책 지점: provider 검증 이메일만 신뢰
    (Google `email_verified===true`, Kakao `is_email_valid&&is_email_verified===true` — boolean
    엄격), `String(sub/id) === providerAccountId` 정확 일치(누락 시 임의 UUID 계정 생성 차단),
    emailSchema 정규화, SUSPENDED/DELETED/soft-deleted 차단(신규·재로그인 모두).
  - **custom adapter** (`modules/auth/adapter.ts`): createUser는 User+ConsentRecord 3행
    (TERMS/PRIVACY true·MARKETING false)+`preferredLanguage`를 한 transaction에; linkAccount는
    FOR UPDATE 재검증(ACTIVE·미삭제·passwordHash null·**기존 Account 0개** — 엄격 차단) +
    명시적 4필드 pick + emailVerified 설정을 한 transaction에. 실패 시 보상 정리가
    AsyncLocalStorage provenance+조건부 deleteMany 이중 증명으로 이번 시도의 provisional user만
    제거(기존 사용자 hard delete 불가능). 세션 편승 연결(handle-login.js:209)도 가드가 차단.
  - **provider token 미저장**: `account: () => ({})` + adapter 명시 pick 이중 강제 —
    access/refresh/id_token/scope 등 전 token 컬럼 null (identity 로그인만 사용하는 phase).
- **locale 전파**: OAuth 버튼 액션의 localized redirectTo → Auth.js callback-url 쿠키(같은
  origin 검증) → handler 래퍼(AsyncLocalStorage) → adapter. `/en` 가입=en, 기본=ko (테스트 증명).
- **UI**: 로그인·회원가입 화면에 활성 provider 버튼만 렌더(비활성 미표시, 액션에서도 거부) +
  "또는" 구분선 + 동의 고지(ko/en). `?error=` 값은 CredentialsSignin 외 전부 신규 `oauthError`
  일반화 메시지로 표시(내부 오류·계정 존재 비노출). `pages.error='/login'`으로 AccessDenied류도
  기본 영문 페이지 대신 일반화 메시지.
- schema/migration **변경 없음** (defaultAccount 필터 실측으로 현 Account 스키마 충분 확인),
  신규 의존성 없음, DB reset 미실행.

**검증**

- 8종 전부 통과: `db:generate`/`db:format`/`db:validate`/`format:check`/`lint`/`typecheck`/
  `test`/`build`. 테스트 **169개 통과** (기존 90개 전부 무수정 회귀 통과 + 신규 79개:
  unit 31 — env fail-closed 매트릭스·정책 결정 매트릭스·profile 매핑·locale 복원/ALS 격리,
  integration 48 중 신규 32 — 실제 handlers로 csrf→signin→authorization redirect(state/PKCE
  파싱)→callback→session 왕복).
- 통합 테스트는 helper mock이 아니라 **고정 next-auth handlers 전체 flow**를 구동 — provider
  네트워크만 customFetch 주입 fake(discovery/token/userinfo, 서명 없는 id_token은 이 고정
  스택이 서명을 검증하지 않음을 실측 확인, PKCE S256은 fake token endpoint가 실제 검증).
- 핵심 시나리오: 신규 가입(양 provider — TRAVELER/ACTIVE/emailVerified/동의 정확 3행/token
  컬럼 전부 null), 재로그인 idempotency(동의 중복 없음·provider 이메일 변경 시에도 소유자
  재지정 없음), 이메일 누락/미검증(boolean 아님 포함)/비정상 형식/식별자 누락 거부, 기존
  credentials 동일 이메일(중복 User 없음+credentials 로그인 회귀 없음), SUSPENDED/DELETED
  차단(최초·재로그인), 세션 편승 연결 차단 2종, **linkAccount 강제 실패 주입 → 고아 0건+기존
  사용자 무손상+재시도 정상**, **동시성 race 2종**(동일 providerAccountId barrier-hook 결정적
  race → Account 1행+패자 정리; 동일 이메일 google/kakao 동시 → User 1·Account 1·동의 3),
  ko/en preferredLanguage, 세션 JSON·콘솔 스파이에 token/secret 문자열 부재.
- 브라우저 실측(데모 env dev 서버): 버튼·구분선·고지 렌더(ko/en), `?error=` 일반화 메시지,
  버튼 클릭 → 실제 `accounts.google.com` authorization redirect 도달(데모 client id라
  `invalid_client` — 예상된 한계 지점), OAuth env 미설정 시 섹션 전체 미렌더, 서버 로그에
  token/secret 문자열 없음.

**실제 credential 없이 검증하지 못한 항목 (대기)**

- Google Cloud Console/Kakao Developers 앱 등록, redirect URI 등록, Kakao 동의항목
  (카카오계정 이메일) 활성화, 실제 동의 화면 왕복, 실 프로필 payload 형태 차이.
- staging/production 도메인에서의 `__Secure-` 쿠키 동작(코드는 두 이름 모두 처리 — 단위 테스트만).

**알려진 한계 (1C-2A 시점 — 상세는 결정 문서)**

- 동일 이메일 다중 provider 로그인 미지원(일반화 오류) — 명시적 연결 UI+재인증은 후속 phase.
- OAuth 경로에 LoginAttempt/rate limit 미적용(state+PKCE·provider측 방어 의존).
- OAuth 세션은 credentialVersion null — 비밀번호 재설정과 독립(상태 차단은 동일 적용).
- createUser 커밋 후 crash 시 보상 불가 창(로그인 불가 상태의 provisional user 잔존 가능).
- 오류 redirect가 항상 `/login`(ko 기본)으로 가 locale이 풀림 — pages 정적 문자열 제약(기존과 동일).

## 알려진 문제

- **CI 순서 제약**: `src/generated/`(Prisma Client)는 git 미추적이므로 CI에서
  `pnpm db:generate`가 **typecheck·build보다 먼저** 실행되어야 한다
  (`pnpm install → db:generate → lint → typecheck → build`). Phase 1D CI 워크플로에 반영할 것.
- **Google Fonts 빌드 시 네트워크 의존**: `next/font/google`이 빌드 시점에
  Noto Sans KR/Noto Serif KR을 내려받아 self-host함(런타임 의존 없음).
  네트워크 없는 CI/오프라인 빌드는 실패 위험 → 향후 CI 캐시 또는
  OFL 라이선스 확인 후 `next/font/local` self-host로 전환 검토 (Phase 8).
