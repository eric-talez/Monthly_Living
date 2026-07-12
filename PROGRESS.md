# 진행 상황 (PROGRESS)

> 목표: production architecture를 갖춘 **staging-ready MVP**.
> 각 sub-phase는 독립적으로 완료·검증 후 다음으로 진행한다.
> 구현되지 않은 기능을 완료로 표시하지 않는다.

## Phase 현황

| Phase | 내용                                                                                    | 상태                 |
| ----- | --------------------------------------------------------------------------------------- | -------------------- |
| 1A    | Repository Foundation — scaffold, 디자인 토큰, i18n, env 검증, 공통 에러/응답, 레이아웃 | ✅ 완료 (2026-07-11) |
| 1B    | Database Foundation — Prisma 전체 스키마, migration, seed                               | ⬜ 미착수            |
| 1C    | Authentication — Auth.js v5, 이메일 인증, rate limit                                    | ⬜ 미착수            |
| 1D    | Verification — Phase 1 통합 점검, CI                                                    | ⬜ 미착수            |
| 2     | Public Marketplace                                                                      | ⬜ 미착수            |
| 3     | Recommendation                                                                          | ⬜ 미착수            |
| 4     | Expert Platform                                                                         | ⬜ 미착수            |
| 5     | Booking & Payment                                                                       | ⬜ 미착수            |
| 6     | Communication                                                                           | ⬜ 미착수            |
| 7     | Admin                                                                                   | ⬜ 미착수            |
| 8     | Quality & Deployment                                                                    | ⬜ 미착수            |

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
