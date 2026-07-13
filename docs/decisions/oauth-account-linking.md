# OAuth 계정 생성·연결 정책 (Google/Kakao)

- 날짜: 2026-07-13 (Phase 1C-2A)
- 상태: 채택
- 관련: `docs/decisions/authjs-session-strategy.md`, `docs/decisions/email-reuse-policy.md`
- 고정 버전 실측 근거: `next-auth@5.0.0-beta.31`, `@auth/core@0.41.2`, `oauth4webapi@3.8.6`
  (아래 파일:행 인용은 전부 이 버전의 실제 코드를 읽고 확인한 것 — 버전 업그레이드 시 재검증 필수)

## 결정 요약

1. **`allowDangerousEmailAccountLinking`는 사용하지 않는다** (양 provider).
2. OAuth 로그인 정책은 **signIn callback → `modules/auth/oauth.ts` 단일 지점**에서 강제한다.
3. Account 연결·User 생성은 **custom adapter**(`modules/auth/adapter.ts`)가 transaction으로 처리하고,
   연결은 "**이번 flow에서 방금 생성된 OAuth 전용 신규 user**"에게만 허용한다 (엄격 차단).
4. provider가 **검증한 이메일**만 신뢰하고, 미검증·누락 이메일은 로그인 자체를 거부한다.
5. provider **token은 DB에 저장하지 않는다** (identity 로그인만 사용하는 Phase이므로).

## Auth.js 실행 순서 (실측)

OAuth 콜백 1회의 실제 순서 — `@auth/core/lib/actions/callback/index.js`:

```
handleOAuth (토큰 교환 + 프로필 획득)            index.js:37
→ adapter.getUserByAccount                      index.js:58-61
→ callbacks.signIn({ user, account, profile })  index.js:63-67   ← 정책 거부 지점 (false → AccessDenied)
→ handleLoginOrRegister                         index.js:70      ← 생성·연결 (handle-login.js)
→ callbacks.jwt (null 반환 시 세션 쿠키 미발급)   index.js:78-89
→ events.signIn → callbackUrl redirect          index.js:114-129
```

`handleLoginOrRegister`(handle-login.js:174-274)의 OAuth 분기:

- **Account 행 존재** → 그 소유 user로 로그인. Account가 다른 user로 재지정되는 경로는 없다 (175-199행).
- **Account 없음 + 유효한 세션 쿠키** → 세션 user에게 **무조건** linkAccount (206-213행, 이메일 비교 없음).
  이 경로는 아래 adapter 가드가 차단한다.
- **Account 없음 + 동일 이메일 user 존재** → `allowDangerousEmailAccountLinking`가 아니면
  `OAuthAccountNotLinked` throw (234-251행) — **자동 연결 없음, 중복 User 생성 없음** (기본 fail-safe).
- **아무 매치 없음** → `createUser({ ...profile, emailVerified: null })`(260행 — emailVerified 강제 null)
  → `linkAccount`(264행). **두 호출 사이에 원자성이 없다** → custom adapter의 보상 정리가 필요한 이유.

adapter.linkAccount 호출 지점 전수: handle-login.js 133·161(webauthn — 미구성), 209(세션 편승 — 가드 차단),
264(신규 생성 직후 — 유일한 정상 경로).

## provider별 이메일 신뢰 조건

정책 함수 `evaluateOAuthSignIn`이 **원본 프로필**(매핑 전)을 검사한다. boolean `true`만 인정한다
(truthy 문자열·숫자 불인정). 이 검사는 신규 가입뿐 아니라 **재로그인에도** 적용된다.

| provider       | 프로필 출처 (실측)                                 | 신뢰 조건                                               |
| -------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Google (OIDC)  | id_token claims만 사용 (oauth/callback.js:167-169) | `email_verified === true`                               |
| Kakao (OAuth2) | userinfo JSON (kakao_account)                      | `is_email_valid === true && is_email_verified === true` |

추가 강제 사항:

- `String(profile.sub)`(google) / `String(profile.id)`(kakao)가 `account.providerAccountId`와
  **정확히 일치**해야 한다. `getUserAndAccount`(oauth/callback.js:216-234)는 profile().id가 없으면
  **임의 UUID**를 providerAccountId로 쓰므로(→ 로그인마다 새 계정이 생기는 위험) 식별자 누락은 거부한다.
  Google은 oauth4webapi가 id_token 필수 클레임(sub) 검증으로 정책 지점 이전에 거부하고(구조적 보장),
  Kakao는 라이브러리 검증이 없어 정책이 유일한 방어선이다.
- 이메일은 기존 `emailSchema`(trim/lowercase/형식/254자)로 정규화한다. core도 소문자화를 하지만
  (oauth/callback.js:225 — trim은 하지 않음) 정규화의 최종 권위는 우리 스키마다. Credentials 가입과
  같은 스키마를 쓰므로 대소문자 차이로 중복 계정이 생기지 않는다.

## 동일 이메일 연결 정책 — allowDangerous를 켜지 않은 근거

비로그인 상태에서 "OAuth 프로필 이메일 = 기존 계정 이메일"일 때 자동 연결을 **증명할 수 없어** 기본
fail-safe(OAuthAccountNotLinked)를 유지한다:

1. **선점 계정 탈취(pre-registration takeover)**: 공격자가 피해자 이메일로 credentials 계정을 먼저
   만들어 두면(이메일 미인증이라 로그인은 불가), 피해자의 OAuth 로그인이 그 계정에 자동 연결되는 순간
   공격자의 비밀번호가 유효한 로그인 수단으로 살아남는다.
2. **검증의 이력성**: provider의 이메일 검증은 과거 시점의 사실이다. 이메일 소유권이 이전된 경우
   (재활용 주소) 비밀번호 재설정(현재 소유자에게 메일 발송)보다 신뢰 수준이 낮다.

결과 UX: 기존 credentials 사용자가 같은 이메일로 OAuth를 시도하면 `/login?error=OAuthAccountNotLinked`
→ 일반화 메시지("소셜 로그인을 완료할 수 없습니다…")만 표시. 계정 존재 여부·내부 사유는 노출하지 않는다.
명시적 계정 연결은 후속 phase에서 **로그인된 상태 + 재인증(비밀번호/기존 provider) + 전용 UI**로 도입한다.

## Account 연결 불변식 (custom adapter — 엄격 차단)

`createOAuthAdapter`의 `linkAccount`는 **하나의 transaction** 안에서 (user row `FOR UPDATE` 잠금 후):

```
user 존재 ∧ status=ACTIVE ∧ deletedAt=null ∧ passwordHash=null ∧ 기존 Account 0개
→ Account 생성({userId, type, provider, providerAccountId}만 명시적 pick)
→ emailVerified가 null이면 now로 설정
```

하나라도 어긋나면 throw(→ 일반화 오류 페이지). 이 불변식이 DB 접근 계층에서 하드 차단하는 것:

- **SUSPENDED/DELETED/soft-deleted 계정에 대한 연결** (signIn callback 거부와 이중 방어 —
  세션 편승 경로는 signIn callback의 이메일 조회로는 잡히지 않으므로 adapter 가드가 최종 방어선).
- **세션 편승 연결**: 로그인된 세션이 있는 브라우저에서 OAuth를 완료하면 Auth.js는 그 세션 user에게
  연결한다(handle-login.js:209 — 이메일 비교 없음). 이번 phase에는 계정 연결 UI가 없어 이 경로를 쓰는
  정상 흐름이 없으므로, 공용 PC의 남은 세션에 공격자 OAuth identity가 붙는 것을 원천 차단한다.
- **설정 회귀**: 실수로 `allowDangerousEmailAccountLinking`가 켜져도 기존 계정(passwordHash 보유 또는
  Account 보유)에는 연결이 물리적으로 불가능하다.
- **providerAccountId 탈취**: DB `@@unique([provider, providerAccountId])` + core가 기존 Account를
  절대 재지정하지 않음 + 동시 생성 race는 unique 위반으로 정확히 한쪽만 성공 (통합 테스트로 증명).

`emailVerified`는 Account 생성과 **같은 transaction**에서만 설정한다 — signIn callback이 provider 검증
이메일만 통과시켰으므로 이 시점의 설정은 안전하고, "Account는 생겼는데 emailVerified 갱신은 실패"
같은 부분 상태가 불가능하다. (이미 인증된 timestamp는 덮어쓰지 않는다.)

## 신규 가입 원자성·보상 정리

- `createUser`: 정규화 이메일 + `preferredLanguage`(아래 locale 전파) + **ConsentRecord 3행**
  (TERMS/PRIVACY granted=true, MARKETING granted=false, 버전 `CONSENT_TERMS_VERSION`)을 한 transaction에
  기록한다. 근거 고지는 로그인/회원가입 화면 OAuth 섹션에 상시 표시된다("소셜 로그인으로 계속하면 …
  동의하는 것으로 간주됩니다"). 반복 로그인은 createUser를 타지 않으므로 동의가 중복 기록되지 않는다.
  이 프로젝트에서 adapter.createUser 경로는 OAuth 신규 가입뿐이다(email/webauthn provider 없음) —
  **magic link 등 도입 시 이 전제를 재검토할 것.**
- core가 createUser → linkAccount를 별도 호출로 실행하므로, linkAccount 실패 시 **보상 정리**가
  provisional user(+cascade ConsentRecord)를 제거한다. 증명은 이중이다:
  1. **provenance** — 같은 요청의 AsyncLocalStorage 컨텍스트에 createUser가 기록한 `provisionalUserId`와
     일치할 때만 시도 (다른 요청·기존 사용자는 대상이 될 수 없음)
  2. **상태** — `deleteMany({ id, passwordHash: null, accounts: { none: {} } })` 조건부 삭제
     기존 사용자가 hard delete되는 경로는 없다 (실패 주입·race 통합 테스트로 증명).

## locale 전파 (preferredLanguage)

OAuth 버튼 서버 액션이 현재 locale의 홈 경로를 `redirectTo`로 전달하면 Auth.js가 이를
`callback-url` 쿠키(기본 redirect callback이 same-origin 검증)로 콜백까지 운반한다. handler 래퍼
(`withOAuthRequestContext`)가 콜백 요청의 쿠키에서 locale을 복원해 AsyncLocalStorage로 adapter에
전달한다 → `/en`에서 시작한 가입은 `preferredLanguage=en`, 기본 경로는 `ko` (통합 테스트로 증명).
쿠키가 없는 경우(UI를 거치지 않은 직접 API 호출)만 기본 locale로 fallback한다.

## provider token 미저장

이번 phase는 identity 로그인만 사용하므로 Account에 `access_token/refresh_token/id_token/expires_at/
scope/token_type/session_state`를 저장하지 않는다. 이중 강제: ① provider `account: () => ({})` mapper
② adapter linkAccount의 명시적 4필드 pick. Kakao의 비표준 `refresh_token_expires_in`도 저장되지 않는다
(스키마 컬럼 자체가 없고 defaultAccount 필터(providers.js:92-102)로도 걸러진다 — schema 변경 불필요의
근거). 향후 provider API(캘린더 등)가 필요해지면 **별도 보안 검토 후** 최소 범위·암호화 저장을 도입한다.
`debug` 옵션은 어떤 환경에서도 켜지 않는다 — @auth/core는 debug 수준에서 token이 포함된 adapter 인자를
로그로 출력한다(lib/init.js).

## checks 구성 (실측 근거)

@auth/core 기본 checks는 `['pkce']`뿐이라 **state 검증이 생략**된다(providers.js:52, callback은
`skipStateCheck`). 명시적으로 설정한다: Google `['pkce','state','nonce']`, Kakao `['pkce','state']`.
Kakao(OAuth2)에 nonce를 지정하면 oauth4webapi가 id_token을 요구해 flow가 깨지므로 지정하지 않는다.

## 알려진 한계

- **동일 이메일 다중 provider 미지원**: Google로 가입한 사용자가 같은 이메일로 Kakao를 시도하면
  OAuthAccountNotLinked(일반화 메시지). 명시적 연결 UI는 후속 phase.
- **소셜 전용 계정의 비밀번호 경로 부재**: passwordHash가 null이므로 비밀번호 재설정 요청은 조용한
  성공으로 수렴한다(1C-1 기존 결정). 비밀번호 설정 기능은 계정 관리 phase에서.
- **OAuth 세션과 credentialVersion**: OAuth 발급 세션은 credentialVersion이 null이라 비밀번호
  재설정으로 무효화되지 않는다 — OAuth 세션은 provider identity 기반이므로 의미상 올바르다.
  상태 차단(SUSPENDED/DELETED)은 jwt callback의 세션 재검증이 동일하게 적용된다.
- **OAuth 경로에 LoginAttempt/rate limit 미적용**: 시도 기록·한도는 credentials 전용이다. OAuth는
  state+PKCE(CSRF 방어)와 provider 측 봇/부정 사용 방어에 의존한다. 필요 시 후속 phase에서 callback
  IP 한도 검토.
- **보상 정리 불가 창**: createUser 커밋 후 linkAccount 시작 전에 프로세스가 죽으면 provisional user가
  남는다(Account 0·passwordHash null·emailVerified null — 로그인 불가 상태라 위험은 없음). 운영 정리
  작업은 계정 탈퇴/정리 phase에서 함께 다룬다.
- **오류 redirect의 locale 손실**: Auth.js `pages` 값은 정적 문자열이라 오류 redirect가 항상 `/login`
  (기본 ko 렌더)으로 간다 — `/en` 사용자는 오류 화면에서 locale이 풀린다(1C-1의 pages.signIn과 동일한
  기존 제약). 로그인된 사용자가 오류로 `/login`에 오면 홈으로 재이동되어 메시지를 보지 못한다(드묾).
- **Kakao id 정밀도**: userinfo JSON의 숫자 id가 2^53을 넘으면 JS 파싱에서 정밀도가 손실될 수 있다.
  현재 Kakao id 자릿수(10~11자리)에서는 발생하지 않는다 — 수용한 위험으로 기록.
- **실 credential E2E 미수행**: 이 문서의 모든 동작은 고정 버전 코드 실측 + fake provider network
  통합 테스트로 검증했다. 실제 Google Cloud Console/Kakao Developers 앱 등록·동의 화면·실 왕복은
  credential 발급 후 별도 검증 항목이다 (PROGRESS 참고).
