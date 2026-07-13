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
| 1C-2  | Authentication 확장 — Google/Kakao OAuth, 계정 탈퇴(soft delete), 프로필 온보딩           | ⬜ 미착수 (1C 진행 중) |
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
  `authorize()` → `modules/auth/service.loginWithCredentials()`에서만 수행된다.
  server action을 거치지 않는 직접 `POST /api/auth/callback/credentials`도 같은 경로
  (브라우저 실측: 직접 POST 6회 → LoginAttempt 5건 + 6번째 limiter 차단).
  미존재/비밀번호 불일치/미인증/정지/삭제는 전부 동일한 일반화 오류로 수렴,
  미존재 계정에도 고정 더미 hash로 bcrypt 비교 1회 수행(타이밍 균등화).
- **세션 클레임·차단**: JWT에 userId/role/status + `credentialVersion`
  (= HMAC-SHA256(AUTH_SECRET, passwordHash) — raw hash 미탑재). jwt callback이
  세션 읽기마다 DB 재확인(PK 1회, 요청당 `lib/session.ts`의 React.cache로 dedupe):
  미존재/SUSPENDED/DELETED/deletedAt → `null` 반환으로 세션 쿠키 제거,
  digest 불일치(비밀번호 재설정) → 기존 세션 무효화.
- **회원가입**: Zod 검증(이메일 trim+lowercase 정규화 내장, 비밀번호 8자+영문·숫자
  - **UTF-8 72바이트 제한** — bcrypt silent truncation 거부), 기본 TRAVELER,
    가입·필수 약관(TERMS/PRIVACY)·선택 마케팅 ConsentRecord·인증 토큰 생성이 단일
    transaction. 중복 이메일은 계정 상태와 무관하게 **동일 성공 응답 + 메일 미발송**
    (열거 방지; unique race는 P2002 처리).
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
  가입 IP 5/1h, 재전송 email 3/15m + IP 10/1h, 재설정 요청 email 3/1h + IP 10/1h
  — 상수 `AUTH_RATE_LIMITS`. **limiter 키는 raw 값 대신 HMAC** 처리.
  LoginAttempt(감사)와 limiter(제어) 역할 분리 — 차단된 시도는 기록하지 않음.
  XFF 신뢰 정책 문서화: [client-ip-and-rate-limit.md](docs/decisions/client-ip-and-rate-limit.md).
- **Email port**: `adapters/email` + ConsoleEmailProvider — development만 본문(인증 URL)
  출력, **production은 마스킹된 수신자+미구성 경고만**(토큰/URL/본문/전체 주소 미출력,
  production 서버 stdout 실측). 문구는 `messages/{ko,en}.json` auth.emails
  (JSON 직접 import — next-intl 요청 컨텍스트 불필요). URL은 `new URL(path, APP_URL)`.
- **UI (ko/en)**: `(auth)` 라우트 그룹 — 로그인 / 회원가입 / 인증 안내(sent, 재전송 폼) /
  인증 확인(verify-email?token=) / 인증 결과(result?status=enum) / 비밀번호 찾기 / 재설정.
  서버 액션 + React 19 useActionState, 오류 요약 role="alert"+focus 이동,
  필드 aria-invalid/aria-describedby, 문자열 전부 messages, 링크는 `@/i18n/navigation`.
  헤더에 최소 세션 표시(로그인 링크 ↔ 이메일+로그아웃) — 사용자 승인 범위.
- **의존성 주입**: 서비스는 `{ db, emailProvider, rateLimiters, now, generateToken }`
  deps 객체(기본값 실제 어댑터) — 테스트는 capture email·고정 clock·결정적 토큰 주입.
- **Vitest 4** 도입(unit/integration 분리): unit 33 + integration 38 = **71개 통과**.
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
pnpm test        # 71 passed (unit 33, integration 38)
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

**알려진 한계 (1C-1 시점)**

- memory limiter는 프로세스별 상태(다중 인스턴스에서 한도 배수) — production은
  Redis 전환(출시 Gate). 세션 재검증이 세션 읽기마다 PK 조회 1회(요청당 dedupe) —
  필요 시 재확인 간격 클레임으로 최적화 여지.
- 가입 응답은 동일하지만 bcrypt 해시 비용으로 인한 미세한 타이밍 부채널은 잔존(MVP 수용).
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

## 알려진 문제

- **CI 순서 제약**: `src/generated/`(Prisma Client)는 git 미추적이므로 CI에서
  `pnpm db:generate`가 **typecheck·build보다 먼저** 실행되어야 한다
  (`pnpm install → db:generate → lint → typecheck → build`). Phase 1D CI 워크플로에 반영할 것.
- **Google Fonts 빌드 시 네트워크 의존**: `next/font/google`이 빌드 시점에
  Noto Sans KR/Noto Serif KR을 내려받아 self-host함(런타임 의존 없음).
  네트워크 없는 CI/오프라인 빌드는 실패 위험 → 향후 CI 캐시 또는
  OFL 라이선스 확인 후 `next/font/local` self-host로 전환 검토 (Phase 8).
