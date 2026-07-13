# 한달살기

제주 · 태국(방콕/치앙마이/푸껫/코사무이) · 베트남(다낭/호찌민/하노이/나트랑)에서 목적 기반
한달살기 프로그램을 찾고, 현지 전문가와 연결·예약·결제·메시지까지 이어지는 프리미엄 플랫폼.

> **현재 상태: 개발 진행 중 (Phase 1C-2B-1 완료 — 여행자 계정 탈퇴\* / Phase 1C-2B 진행 중)**
> \* 코드·자동 테스트 완료 기준 — OAuth 실제 provider credential 왕복 E2E와 실 email
> provider(탈퇴 확인 메일 포함)는 등록·도입 후 별도 검증 대기 (PROGRESS 참고).
> 이 프로젝트의 목표 산출물은 **"production architecture를 갖춘 staging-ready MVP"** 입니다.
> Mock Payment / Console Email / Local FS Storage 상태에서는 production launch 완료로
> 간주하지 않으며, 실제 출시 조건은 아래 [출시 Gate](#출시-gate)를 따릅니다.
> 진행 상황은 [PROGRESS.md](PROGRESS.md)를 참고하세요.

## 기술 스택

- **Next.js 16 (App Router)** + React 19 + TypeScript (strict)
- **Tailwind CSS v4** — 커스텀 디자인 토큰 (크림 화이트 / 웜 차콜 / 세이지·네이비·테라코타)
- **next-intl** — 한국어(기본)·영어, `/en` prefix 방식 (`localePrefix: as-needed`)
- **Zod** — 환경변수·입력 검증
- **Prisma 7 + PostgreSQL 15+** — multi-file schema, pg driver adapter, 안전장치 있는 DB 스크립트
- **Auth.js v5 (JWT 세션)** — 이메일/비밀번호 Credentials, 이메일 인증·비밀번호 재설정(해시 저장
  단일 사용 토큰), memory rate limit, Google/Kakao OAuth(선택 활성화 — env 쌍 필수, provider
  검증 이메일만 신뢰, 자동 계정 연결 없음·token 미저장:
  [결정 문서](docs/decisions/oauth-account-linking.md)), 여행자 계정 탈퇴(이메일 토큰 확인 +
  구조화 계정 PII 익명화·tombstone, EXPERT/ADMIN 미지원:
  [결정 문서](docs/decisions/account-deletion-and-anonymization.md)) — 온보딩·역할별 redirect는
  Phase 1C-2B 잔여
- **Vitest 4** — unit + DB 통합 테스트(`TEST_DATABASE_URL` 전용) / Playwright·CI — _Phase 1D 예정_

## 로컬 개발 실행

요구사항: Node.js 22+, pnpm 11+, **PostgreSQL 15 이상**
(`UNIQUE ... NULLS NOT DISTINCT` 사용으로 PostgreSQL 15 미만 미지원 — 로컬 검증 버전은 16)

clean checkout 설치 순서:

```bash
pnpm install
cp .env.example .env.local   # DATABASE_URL·AUTH_SECRET 필수 — fallback 없음 (fail-closed)
# AUTH_SECRET을 직접 생성해 .env.local에 채운다 (저장소 커밋 금지):
#   openssl rand -base64 32
pnpm db:generate             # Prisma Client 생성 (src/generated/ — git 미추적)
pnpm lint
pnpm typecheck
pnpm build

# ── 데이터베이스 준비 (PostgreSQL 15+) ──
createdb handalsalgi_dev && createdb handalsalgi_test   # 또는: docker compose up -d
pnpm db:deploy               # migration 적용 (dev)
pnpm db:seed                 # 개발용 seed 데이터
pnpm db:test:prepare         # 통합 테스트 DB에 migration만 적용 (seed 없음)
pnpm test                    # unit + integration (integration은 TEST_DATABASE_URL 필수)

pnpm dev                     # http://localhost:3000
```

> 이메일 발송은 ConsoleEmailProvider가 대신한다: development에서는 인증/재설정 URL이
> 서버 콘솔에 출력되고, production에서는 토큰·본문이 출력되지 않는다(마스킹된 수신자만).
> 프록시 뒤 self-host production 배포는 `AUTH_TRUST_HOST=true`가 필요하다 (.env.example).

### DB 스크립트

| 명령                              | 동작                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm db:deploy`                  | pending migration 적용 (`migrate deploy` — shadow DB 없음)                        |
| `pnpm db:seed`                    | idempotent seed (재실행 시 동일 상태로 수렴)                                      |
| `pnpm db:test:prepare`            | TEST_DATABASE_URL 대상에 migration만 적용 (가드 경유)                             |
| `pnpm db:reset` / `db:reset:test` | 안전장치 경유 `migrate reset` — dev는 reset 후 seed 재적용, test는 빈 스키마 유지 |
| `pnpm db:migrate:draft`           | 새 migration draft 생성 (`--create-only`)                                         |

> **migration 워크플로 주의**: 새 migration은 반드시 `db:migrate:draft`로 draft만 만들고
> 생성된 SQL을 리뷰한 뒤(custom index/CHECK를 drop하려 하지 않는지 —
> [database-constraints.md](docs/decisions/database-constraints.md) §2 drift 주의) `db:deploy`로 적용합니다.
> `prisma migrate dev`를 직접 적용 모드로 실행하지 않습니다.
>
> **reset 안전장치** — 다음은 항상 거부됩니다: production 환경, localhost 이외 host,
> 시스템 DB(postgres/template0/template1), dev 대상인데 `handalsalgi_dev`/`*_dev`가 아닌 이름,
> test 대상인데 `*_test`로 끝나지 않는 이름, `?schema=`가 public 이외, URL 파싱 실패.

### 테스트 계정 (seed, 비밀번호 `Test1234!`)

| 이메일                    | 역할                                      |
| ------------------------- | ----------------------------------------- |
| `traveler@test.com`       | 일반 사용자 (여행 선호 프로필 포함)       |
| `expert@test.com`         | 승인된 전문가 (공개 프로필·프로그램 2개)  |
| `expert-pending@test.com` | 승인 대기 전문가 (비공개, DRAFT 프로그램) |
| `admin@test.com`          | 관리자                                    |

> seed 데이터는 개발·스테이징 전용입니다: 이미지는 placeholder(picsum)이고,
> 전문가·프로그램의 평점/완료 수는 Review 없이 채운 표시용 가정치입니다
> (Phase 5에서 실제 데이터 기반 재계산으로 대체). production 전 교체 필수.

### 품질 검증 명령

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm build         # production build
pnpm format:check  # Prettier 검사 (자동 수정: pnpm format)
pnpm test          # Vitest 전체 (unit + integration)
pnpm test:unit     # 순수 로직 unit 테스트 (DB 불필요)
pnpm test:integration  # DB 통합 테스트 — TEST_DATABASE_URL 전용, dev DB 무접촉
pnpm db:format     # Prisma schema 포맷
pnpm db:validate   # Prisma schema 검증
pnpm db:generate   # Prisma Client 생성
```

## 프로젝트 구조

```
prisma/
├── schema.prisma      # datasource·generator (연결 URL은 prisma.config.ts)
└── models/*.prisma    # 도메인별 모델·enum (multi-file schema)
docs/decisions/        # 설계 결정 기록 (DB 제약, 이메일 정책, 잠금 프로토콜 등)
src/
├── app/               # 라우트 (얇게 유지 — 비즈니스 로직 금지)
│   └── [locale]/      # ko(기본, prefix 없음) / en
├── modules/           # 도메인 서비스 레이어 (비즈니스 로직·권한 검증)
├── adapters/          # 외부 서비스 어댑터 (payment/email/storage/rate-limit)
├── lib/               # env 검증, AppError, API 응답 규격, prisma client
├── generated/         # Prisma Client 생성물 (git 미추적 — pnpm db:generate)
├── components/        # layout/ + ui/ 공용 컴포넌트
├── i18n/              # next-intl 라우팅·요청 설정
├── messages/          # ko.json / en.json — UI 문자열 하드코딩 금지
├── auth.ts            # Auth.js v5 구성 (JWT 전략, Credentials+OAuth, 세션 재검증 callback)
├── types/             # 모듈 타입 증강 (next-auth Session/JWT)
└── proxy.ts           # locale 라우팅 proxy (Next.js 16)
tests/
├── unit/              # 순수 로직 테스트 (DB 불필요)
└── integration/       # DB 통합 + 실세션 테스트 — TEST_DATABASE_URL 전용
```

핵심 규칙:

- 모든 UI 문자열은 `src/messages/*.json`을 통해서만 사용한다 (컴포넌트 하드코딩 금지).
- 내부 링크는 `next/link`가 아니라 `@/i18n/navigation`의 `Link`를 사용한다.
- 새 환경변수는 `src/lib/env.ts` 스키마와 `.env.example`에 함께 추가한다.
- API·server action의 응답은 `src/lib/api-response.ts` 규격을 따른다.

## 출시 Gate

아래 gate를 모두 통과하기 전까지 이 서비스는 **staging-ready MVP**로만 표기한다.

| Gate       | MVP 상태                          | production 출시 조건                             |
| ---------- | --------------------------------- | ------------------------------------------------ |
| 결제       | MockPaymentProvider               | Stripe 실 키 + 운영 webhook 검증 완료            |
| 정산       | 정산 원장 + 관리자 수동 지급 관리 | 실 송금 수단(Stripe Connect 등) — 현재 범위 제외 |
| 이메일     | ConsoleEmailProvider              | Resend + 발신 도메인 인증                        |
| 파일 저장  | LocalFsStorageProvider            | S3/R2 + 버킷 정책 검증                           |
| Rate limit | memory adapter                    | Redis adapter 전환                               |
| 모니터링   | 코드 준비만                       | Sentry/PostHog 연동 + 알림 수신 확인             |
| 인프라     | 로컬 PostgreSQL                   | managed PostgreSQL + 백업 자동화                 |
| 법적 고지  | 템플릿 약관                       | 법률 검토 완료 약관/개인정보처리방침             |

## 라이선스

Private — All rights reserved.
