# 결정: 프로필 온보딩 & 역할별 redirect (1C-2B-2)

## 범위와 용어

인증을 마친 사용자를 역할·프로필 상태에 맞는 화면으로 보내고, TRAVELER가 예약·추천
기능을 쓰기 전 최소 프로필을 수집한다. 이 문서는 **완료 판정 계약**, **post-login
dispatch 구조**, **역할·gate matrix**, **curated 화이트리스트**, **schema 무변경 근거**를
고정한다.

- **온보딩 완료(complete)**: TRAVELER가 아래 완료 계약을 모두 만족한 상태.
- **dispatcher**: `/[locale]/post-login` — UI가 없는 server 라우트. 세션 userId로 DB 상태를
  조회해 목적지를 결정하고 redirect만 한다.
- **resolver**: `resolvePostLoginDestination` — DB 상태 → 목적지(whitelist union) 순수 함수.

## 완료 판정 계약 (단일 소스)

`modules/onboarding/completion.ts`의 `isTravelerOnboardingComplete(facts)`가 유일한 기준이다.
dispatcher·onboarding gate·저장 후 재판정·테스트가 모두 이 함수를 재사용한다(조건 복제 금지).

완료 = 아래 **모두** 만족:

1. `User.fullName` trim 후 비어있지 않음
2. `User.country`가 지원 국가 목록(`SUPPORTED_COUNTRIES`)의 유효 값
3. `TravelerProfile` row 존재
4. `travelPurposes.length ≥ 1`
5. `preferredCountries.length ≥ 1` **또는** `preferredCities.length ≥ 1`
6. `travelStyles.length ≥ 1`

완료 필수 아님(선택 — 추천 품질용): `budgetMin/Max`, `groupSize`, `preferredLanguages`,
`hasChildren`, `hasPet`, `accessibilityNeeds`, `nickname`, `phone`, `timezone`(기본값 존재).

결과: seed traveler(fullName·country·완전 프로필)=**완료**, 신규 Credentials/OAuth
traveler(fullName·country null·프로필 없음)=**미완료**로 자연 분리된다.

## Post-login dispatch 구조

Credentials 로그인 성공·OAuth 로그인 성공·이미 로그인한 `/login`·`/register` 접근이 모두
`/post-login`을 경유한다. 진입점(`login/actions.ts`·`oauth-actions.ts`·`login/page.tsx`·
`register/page.tsx`)은 일반 목적지를 `/post-login`으로만 보내고 역할 판정을 복제하지 않는다.

- **OAuth 최초 로그인은 `isNewUser=false`**일 수 있으므로(identity를 signIn callback에서
  선생성 → core는 기존 사용자 경로) 신규 여부 신호를 쓰지 않고 **DB 상태로만** 판정한다.
- **세션·DB만 신뢰**한다. query·hidden input의 role/userId를 신뢰하지 않는다.
- 목적지는 resolver의 whitelist union(`/onboarding`·`/`·`/login`)으로만 제한된다 —
  임의 `next` URL/pathname을 만들지 않는다(open redirect 방지).
- 향후 dashboard가 생기면 **resolver 반환값만 교체**하면 진입점 코드는 불변이다.

`delete-confirm` 로그인 복귀와 `?deleted=1` 흐름은 **별도 예외로 그대로 유지**한다: 진입점은
`next===delete-confirm`이면 post-login을 우회해 기존 confirm 경로로 직접 보낸다.

## 역할별 redirect matrix

| 상태                                                   | 목적지        | 근거                   |
| ------------------------------------------------------ | ------------- | ---------------------- |
| 세션 없음 / `status!=='ACTIVE'` / `deletedAt!=null`    | `/login`      | fail-closed            |
| TRAVELER · 미완료                                      | `/onboarding` | 온보딩 필요            |
| TRAVELER · 완료                                        | `/` (홈)      | 현재 안전한 기본 경로  |
| EXPERT (프로필 없음/PENDING/APPROVED 공개·비공개 무관) | `/` (홈)      | expert 대시보드는 후속 |
| ADMIN                                                  | `/` (홈)      | admin 대시보드는 후속  |

SUSPENDED/DELETED는 `jwt` callback이 세션을 차단하므로 대개 세션이 null이며, resolver가
DB 재조회로도 fail-closed를 이중 보장한다.

## Onboarding gate (`/onboarding` 접근)

`/onboarding` 페이지는 동일 resolver를 재사용한다: `dest = resolve(...)`가 `/onboarding`이
아니면 그 목적지로 redirect, 맞으면 폼을 렌더한다.

| 접근자                 | 처리                            |
| ---------------------- | ------------------------------- |
| 비로그인               | `/login`                        |
| 미완료 TRAVELER        | 폼 렌더                         |
| 완료 TRAVELER (재진입) | `/` (홈) — 편집 화면 아님(후속) |
| EXPERT / ADMIN         | `/` (홈)                        |
| SUSPENDED / DELETED    | 세션 차단 → `/login`            |

## 저장 계약 (트랜잭션·동시성)

`completeTravelerOnboarding`는 단일 `$transaction`에서:

1. `SELECT … FOR UPDATE`로 대상 User row를 잠가 **동일 사용자 동시 submit을 직렬화**.
2. 잠금 아래 ACTIVE·TRAVELER·`deletedAt=null` 재검증(아니면 `not-authorized`).
3. `travelPurposes`→active Category slug, `preferredCities`→active Destination slug,
   `preferredCountries`→active Destination countryCode 집합으로 검증(불일치→field error).
4. `User.update`(fullName·country·timezone·preferredLanguage·preferredCurrency·nickname·phone)
   - `TravelerProfile.upsert`(userId unique).
5. 완료 재판정(방어선) 후 commit.

- **userId는 세션에서만** 오고 upsert는 `where:{userId}` 고정 — 타 사용자 profile 수정 불가.
- **last-write-wins**: 두 submit은 잠금으로 직렬화되고 각자 전체 필드를 쓴다(부분 병합 없음).
- 검증 실패·주입 실패·인프라 오류는 **전체 rollback**(부분 저장 없음). 인프라 오류는 호출자가
  일반화하며, 로그는 고정 문구(입력 body·PII 미기록).

## Curated 화이트리스트 (schema 무변경)

- **country**(거주지): `SUPPORTED_COUNTRIES` = KR/US/CA/TH/VN — 서비스 대상국(Destination)과
  분리된 거주 국가 목록. 필요 시 소폭 확장.
- **timezone**: `SUPPORTED_COUNTRY_TIMEZONES` — 선택 country에 허용된 IANA만(교차 검증).
- **locale**: `routing.locales`(ko/en) 재사용. **currency**: Prisma `Currency` enum 부분집합.
- **travelStyles**: `TRAVEL_STYLES` curated enum. **preferredLanguages**: BCP-47 subset.
- **travelPurposes·preferredCountries·preferredCities**: 상수 아닌 **active Destination/
  Category row**로 검증(느슨 참조지만 저장 시 존재·active 강제).

### schema 무변경 근거

완료 신호가 모두 기존 필드(`User.fullName`·`country` nullable + `TravelerProfile` optional
1:1)로 도출 가능하고, **단일 화면·원자 저장**이라 "중간 저장 상태"가 없어 `onboardingCompleted`
같은 플래그가 불필요하다(플래그는 partial save일 때만 필요). `UserStatus`·`Currency`·
`Destination.active`·`Category.active`는 이미 존재한다 → migration/새 컬럼/enum 없음.

## 알려진 한계·후속

- **완료 traveler는 `/`(홈)에 머무를 수 있다**: gate는 `/onboarding` 접근과 post-login
  dispatch에만 적용되고, 로그인 후 임의로 `/`로 이동한 미완료 traveler를 홈에서 강제하지는
  않는다(현재 홈은 마케팅 페이지·제품 기능 없음). 제품 라우트 도입 시 그 라우트가 resolver를
  재사용해 gate한다.
- **프로필 편집 UI 없음**: 완료 후 재진입은 홈으로 보낸다. service upsert·완료 함수는 편집
  재사용을 대비해 설계했으나 설정 내 편집 화면은 후속 Phase.
- **EXPERT/ADMIN 목적지**: 현재 모두 `/`. 대시보드 구현 시 resolver 반환값만 교체.
- **페이지-렌더 redirect 테스트 없음**: 역할별 matrix는 순수 resolver 단위테스트가 단일
  권위이고, 실제 페이지 배선은 dev 수동 E2E로 확인했다(레포 관례 유지, RTL 미도입).
