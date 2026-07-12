# 한달살기

제주 · 태국(방콕/치앙마이/푸껫/코사무이) · 베트남(다낭/호찌민/하노이/나트랑)에서 목적 기반
한달살기 프로그램을 찾고, 현지 전문가와 연결·예약·결제·메시지까지 이어지는 프리미엄 플랫폼.

> **현재 상태: 개발 진행 중 (Phase 1A 완료 — 저장소 기반 구축)**
> 이 프로젝트의 목표 산출물은 **"production architecture를 갖춘 staging-ready MVP"** 입니다.
> Mock Payment / Console Email / Local FS Storage 상태에서는 production launch 완료로
> 간주하지 않으며, 실제 출시 조건은 아래 [출시 Gate](#출시-gate)를 따릅니다.
> 진행 상황은 [PROGRESS.md](PROGRESS.md)를 참고하세요.

## 기술 스택

- **Next.js 16 (App Router)** + React 19 + TypeScript (strict)
- **Tailwind CSS v4** — 커스텀 디자인 토큰 (크림 화이트 / 웜 차콜 / 세이지·네이비·테라코타)
- **next-intl** — 한국어(기본)·영어, `/en` prefix 방식 (`localePrefix: as-needed`)
- **Zod** — 환경변수·입력 검증
- Prisma + PostgreSQL 16, Auth.js v5, Vitest/Playwright — _이후 Phase에서 도입 예정_

## 로컬 개발 실행

요구사항: Node.js 22+, pnpm 11+

```bash
pnpm install
cp .env.example .env.local   # 값은 파일 내 안내 참고 (기본값으로도 동작)
pnpm db:generate             # Prisma Client 생성 (src/generated/ — git 미추적)
pnpm dev                     # http://localhost:3000
```

> DB migration·seed는 Phase 1B-2에서 추가됩니다. 현재는 스키마 계약(Prisma schema)만
> 존재하며 실제 데이터베이스 연결 없이 개발 서버·빌드가 동작합니다.

### 품질 검증 명령

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm build         # production build
pnpm format:check  # Prettier 검사 (자동 수정: pnpm format)
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
└── proxy.ts           # locale 라우팅 proxy (Next.js 16)
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
