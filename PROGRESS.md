# 진행 상황 (PROGRESS)

> 목표: production architecture를 갖춘 **staging-ready MVP**.
> 각 sub-phase는 독립적으로 완료·검증 후 다음으로 진행한다.
> 구현되지 않은 기능을 완료로 표시하지 않는다.

## Phase 현황

| Phase | 내용                                                                                      | 상태                 |
| ----- | ----------------------------------------------------------------------------------------- | -------------------- |
| 1A    | Repository Foundation — scaffold, 디자인 토큰, i18n, env 검증, 공통 에러/응답, 레이아웃   | ✅ 완료 (2026-07-11) |
| 1B-1  | Schema Contract — Prisma 7 도입, 전체 스키마 계약, 설계 결정 문서                         | ✅ 완료 (2026-07-11) |
| 1B-2A | Migration SQL Draft — create-only draft + custom SQL(CHECK 등), 빈 DB, docker, reset 가드 | ✅ 완료 (2026-07-12) |
| 1B-2B | Apply, Seed, Reset Verification — migration 적용, seed, reset 왕복 검증                   | ⬜ 미착수            |
| 1C    | Authentication — Auth.js v5, 이메일 인증, rate limit                                      | ⬜ 미착수            |
| 1D    | Verification — Phase 1 통합 점검, CI                                                      | ⬜ 미착수            |
| 2     | Public Marketplace                                                                        | ⬜ 미착수            |
| 3     | Recommendation                                                                            | ⬜ 미착수            |
| 4     | Expert Platform                                                                           | ⬜ 미착수            |
| 5     | Booking & Payment                                                                         | ⬜ 미착수            |
| 6     | Communication                                                                             | ⬜ 미착수            |
| 7     | Admin                                                                                     | ⬜ 미착수            |
| 8     | Quality & Deployment                                                                      | ⬜ 미착수            |

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

## 알려진 문제

- **CI 순서 제약**: `src/generated/`(Prisma Client)는 git 미추적이므로 CI에서
  `pnpm db:generate`가 **typecheck·build보다 먼저** 실행되어야 한다
  (`pnpm install → db:generate → lint → typecheck → build`). Phase 1D CI 워크플로에 반영할 것.
- **Google Fonts 빌드 시 네트워크 의존**: `next/font/google`이 빌드 시점에
  Noto Sans KR/Noto Serif KR을 내려받아 self-host함(런타임 의존 없음).
  네트워크 없는 CI/오프라인 빌드는 실패 위험 → 향후 CI 캐시 또는
  OFL 라이선스 확인 후 `next/font/local` self-host로 전환 검토 (Phase 8).
