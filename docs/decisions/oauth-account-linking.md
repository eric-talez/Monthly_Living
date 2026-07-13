# OAuth 계정 생성·연결 정책 (Google/Kakao)

- 날짜: 2026-07-13 (Phase 1C-2A, 원자성 재검토 반영 개정)
- 상태: 채택
- 관련: `docs/decisions/authjs-session-strategy.md`, `docs/decisions/email-reuse-policy.md`
- 고정 버전 실측 근거: `next-auth@5.0.0-beta.31`, `@auth/core@0.41.2`, `oauth4webapi@3.8.6`
  (아래 파일:행 인용은 전부 이 버전의 실제 코드를 읽고 확인한 것 — 버전 업그레이드 시 재검증 필수)

## 결정 요약

1. **`allowDangerousEmailAccountLinking`는 사용하지 않는다** (양 provider).
2. OAuth 프로필 검증은 **signIn callback → `modules/auth/oauth.ts`**, identity 판정·생성은
   **`modules/auth/oauth-identity.ts`의 `ensureOAuthIdentity()`** 단일 지점에서 강제한다.
3. 신규 identity(User + ConsentRecord 3행 + Account)는 **하나의 Prisma transaction**에서
   전부 생성되거나 전부 rollback된다 — **부분 상태(고아 User)가 존재할 수 있는 창이 없다.**
4. adapter의 mutation(createUser/linkAccount/deleteUser/unlinkAccount)은 **전부 fail-closed**로
   차단한다 — 정상 flow에서 호출되지 않음이 구조적으로 보장되고, 통합 테스트가 이를 증명한다.
5. provider가 **검증한 이메일**만 신뢰하고, 미검증·누락 이메일은 로그인 자체를 거부한다.
6. 미등록 identity + **요청에 Auth.js 세션 쿠키 존재** 조합은 신규 identity 생성을 거부한다
   (세션 편승 연결 차단).
7. provider **token은 DB에 저장하지 않는다** (identity 로그인만 사용하는 Phase이므로).

## Auth.js 실행 순서와 원자적 사전 생성 (실측)

OAuth 콜백 1회의 실제 순서 — `@auth/core/lib/actions/callback/index.js`:

```
handleOAuth (토큰 교환 + 프로필 획득)            index.js:37
→ adapter.getUserByAccount (사전 조회)          index.js:58-61
→ callbacks.signIn({ user, account, profile })  index.js:63-67   ← 검증 + ensureOAuthIdentity()
→ handleLoginOrRegister                         index.js:70
   └ getUserByAccount **재조회**                 handle-login.js:175-178
     → Account 존재 → 기존 사용자 로그인 경로     handle-login.js:179-199 (isNewUser=false)
→ callbacks.jwt (null 반환 시 세션 쿠키 미발급)   index.js:78-89
→ events.signIn → callbackUrl redirect          index.js:114-129
```

핵심: **signIn callback은 handleLoginOrRegister보다 먼저 실행되고, handleLoginOrRegister는
Account를 새로 재조회한다.** 그래서 signIn callback 안에서 신규 identity를 transaction으로
사전 생성해 두면, core는 방금 만든 Account를 발견하고 **기존 사용자 로그인 경로**를 탄다 —
core의 비원자적 `createUser → linkAccount` 경로(handle-login.js:260→264)는 아예 실행되지 않는다.

이 구조의 귀결(온보딩 설계 제약): **최초 OAuth 로그인도 core 내부적으로는 `isNewUser=false`,
`trigger='signIn'`이다** (index.js:84). 향후 프로필 온보딩·신규 가입 후처리는 Auth.js의
isNewUser/trigger='signUp'에 **의존하면 안 되고**, `ensureOAuthIdentity()`의 반환값
(`kind: 'created' | 'existing'`) 또는 자체 도메인 상태(온보딩 완료 플래그 등)를 근거로 삼아야 한다.

### ensureOAuthIdentity() transaction

```
account = tx.account.findUnique(provider, providerAccountId)
├─ 존재: 소유 user가 ACTIVE ∧ deletedAt=null일 때만 허용 (기존 identity 반환).
│        provider 이메일이 바뀌었어도 User email·소유권은 절대 변경하지 않는다.
├─ 없음 ∧ 요청에 세션 쿠키 존재 → 거부 (세션 편승 차단, 아래 절)
├─ 없음 ∧ 동일 정규화 이메일 user 존재(상태 무관) → 거부 (자동 연결 금지)
└─ 신규: 같은 transaction에서
   User 생성(email, emailVerified=now, preferredLanguage=요청 locale, passwordHash=null,
             기본 TRAVELER/ACTIVE)
   + ConsentRecord 3행(TERMS/PRIVACY granted=true, MARKETING false, CONSENT_TERMS_VERSION)
   + Account 생성({userId, type, provider, providerAccountId}만 — token 컬럼 전부 null)
```

- **원자성**: 세 레코드는 전부 생성되거나 전부 rollback된다. transaction 내부 어느 지점에서
  실패해도(테스트가 User 생성 후/동의 생성 후/Account 생성 후 commit 직전 3지점에 실패를 주입해
  증명) DB에는 아무것도 남지 않는다. commit **이후** core 후속 처리(세션 발급 등)가 실패하면
  완전한 identity 1세트가 남고, 재시도는 기존 identity 로그인으로 성공한다 — 어떤 시점에 프로세스가
  죽어도 "Account 없는 User가 unique email을 점유"하는 상태는 만들어질 수 없다.
- **emailVerified=now의 근거**: 이 transaction에 도달한 flow는 validateOAuthProfile이 provider
  검증 이메일(boolean 엄격)만 통과시켰다.
- **동의 기록 근거**: OAuth 버튼 UI에 상시 고지("소셜 로그인으로 계속하면 이용약관과
  개인정보처리방침에 동의하는 것으로 간주됩니다"). 반복 로그인은 신규 생성 분기를 타지 않으므로
  동의가 중복 기록되지 않는다.

### unique 충돌(race) 처리

동시 callback이 경합하면 P2002가 발생하고 **transaction 전체가 이미 rollback된 상태**다 —
User를 hard delete하는 보상 로직은 존재하지 않으며 필요하지도 않다. rollback 후 재조회로 분류한다:

- 동일 (provider, providerAccountId) Account가 존재 → 같은 identity의 동시 로그인이 먼저 성공한
  것 — 활성 소유자 확인 후 **기존 identity로 로그인 허용** (양쪽 모두 같은 사용자로 수렴).
- 동일 이메일 user만 존재(요청 provider Account 없음) → 다른 provider 가입이 먼저 성공 —
  **일반화 OAuth 오류**.
- 그 외 → 일반화 오류.

barrier 주입 통합 테스트가 두 시나리오를 결정적으로 재현해 증명한다(운에 기대는 인터리빙 없음).

## adapter mutation fail-closed

`createOAuthAdapter`는 조회 메서드만 base(@auth/prisma-adapter)를 그대로 쓰고, mutation은
전부 비민감 오류로 차단한다:

- `createUser` / `linkAccount`: 정상 flow에서 도달 불가(위 실행 순서) — 도달했다는 것은 설정
  회귀(예: `allowDangerousEmailAccountLinking` 활성화), 미구성 provider 유형(email/webauthn)
  추가, core 동작 변화를 뜻하므로 부분 상태를 만들지 않고 즉시 실패시킨다. **성공한 OAuth flow는
  곧 "사전 생성 경로만 지났다"는 lifecycle 증명이다** (호출됐다면 flow가 실패했을 것).
- `deleteUser` / `unlinkAccount`: 계정 탈퇴는 별도 soft delete 서비스가 담당한다(기존 결정) —
  adapter 경유 hard delete 경로를 남기지 않는다.

## 세션 편승 연결 차단 (미등록 identity + 세션 쿠키)

Auth.js는 유효한 세션이 있는 상태에서 미등록 OAuth identity가 콜백되면 **세션 사용자에게
무조건 linkAccount**한다(handle-login.js:206-213, 이메일 비교 없음). 이번 phase에는 계정 연결
UI가 없어 이 경로를 쓰는 정상 흐름이 없으므로, handler 래퍼가 요청 쿠키에서
`authjs.session-token`/`__Secure-authjs.session-token`(+4KB 초과 시의 chunk 변형
`…session-token.0`, `.1` …) 존재를 감지해 컨텍스트로 전달하고, `ensureOAuthIdentity()`는
**미등록 identity + 세션 쿠키 존재**면 신규 생성을 거부한다. 쿠키 **유효성은 검사하지 않는다**
(존재만) — 컨텍스트가 없는 비정상 호출 경로도 세션 존재로 간주한다(fail-closed).

**문서화된 fail-safe UX 한계**: 만료·손상된 stale 세션 쿠키가 남아 있으면 신규 OAuth 가입이
거부된다(로그아웃 또는 쿠키 제거로 해소). 이미 등록된 identity의 재로그인은 영향받지 않는다.
명시적 계정 연결은 후속 phase에서 **로그인 상태 + 재인증 + 전용 UI**로 도입한다.

## provider별 이메일·식별자 신뢰 조건

`validateOAuthProfile`(순수 모듈)이 **원본 프로필**을 검사한다. boolean `true`만 인정하며
(truthy 문자열·숫자 불인정) 신규 가입뿐 아니라 **재로그인에도** 적용된다.

| provider       | 프로필 출처 (실측)                                 | 신뢰 조건                                               |
| -------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Google (OIDC)  | id_token claims만 사용 (oauth/callback.js:167-169) | `email_verified === true`                               |
| Kakao (OAuth2) | userinfo JSON (kakao_account)                      | `is_email_valid === true && is_email_verified === true` |

추가 강제 사항:

- **식별자 정확 일치**: 정규화된 프로필 id(google `sub`, kakao 회원번호)가
  `account.providerAccountId`와 정확히 동일해야 한다. `getUserAndAccount`
  (oauth/callback.js:216-234)는 profile().id가 없으면 **임의 UUID**를 providerAccountId로
  쓰므로(→ 로그인마다 새 계정이 생기는 위험) 식별자 누락·불일치는 거부한다. Google은
  oauth4webapi가 id_token 필수 클레임(sub) 검증으로 정책 지점 이전에 거부하고(구조적 보장),
  Kakao는 라이브러리 검증이 없어 이 정책이 유일한 방어선이다.
- **Kakao 회원번호 검증**: number면 `Number.isSafeInteger(id) && id >= 0`만 인정 — NaN, ±Infinity,
  소수, 음수, `MAX_SAFE_INTEGER` 초과(JSON 파싱 정밀도 손실 위험)는 전부 거부. string이면 trim 후
  비어 있지 않은 숫자만 1~20자리(`/^[0-9]{1,20}$/`)만 인정. profile() 매핑도 동일 함수를 사용해
  두 경로가 어긋날 수 없다.
- **이메일 정규화**: 기존 `emailSchema`(trim/lowercase/형식/254자)로 정규화한다. core도
  소문자화를 하지만(oauth/callback.js:225 — trim은 하지 않음) 정규화의 최종 권위는 우리 스키마다.
  Credentials 가입과 같은 스키마를 쓰므로 대소문자 차이로 중복 계정이 생기지 않는다.

## 동일 이메일 연결 정책 — allowDangerous를 켜지 않은 근거

비로그인 상태에서 "OAuth 프로필 이메일 = 기존 계정 이메일"일 때 자동 연결을 **증명할 수 없어**
거부한다(`ensureOAuthIdentity`가 상태 무관 거부 — core의 OAuthAccountNotLinked보다 먼저):

1. **선점 계정 탈취(pre-registration takeover)**: 공격자가 피해자 이메일로 credentials 계정을 먼저
   만들어 두면(이메일 미인증이라 로그인은 불가), 피해자의 OAuth 로그인이 그 계정에 자동 연결되는 순간
   공격자의 비밀번호가 유효한 로그인 수단으로 살아남는다.
2. **검증의 이력성**: provider의 이메일 검증은 과거 시점의 사실이다. 이메일 소유권이 이전된 경우
   (재활용 주소) 비밀번호 재설정(현재 소유자에게 메일 발송)보다 신뢰 수준이 낮다.

결과 UX: 기존 credentials 사용자가 같은 이메일로 OAuth를 시도하면 `/login?error=AccessDenied`
→ 일반화 메시지("소셜 로그인을 완료할 수 없습니다…")만 표시. 계정 존재 여부·내부 사유는 노출하지
않는다.

## locale 전파 (preferredLanguage)

OAuth 버튼 서버 액션이 현재 locale의 홈 경로를 `redirectTo`로 전달하면 Auth.js가 이를
`callback-url` 쿠키(기본 redirect callback이 same-origin 검증)로 콜백까지 운반한다. handler 래퍼
(`withOAuthRequestContext`)가 콜백 요청의 쿠키에서 locale을 복원해 AsyncLocalStorage로
`ensureOAuthIdentity`에 전달한다 → `/en`에서 시작한 가입은 `preferredLanguage=en`, 기본 경로는
`ko` (통합 테스트로 증명). 쿠키가 없는 경우(UI를 거치지 않은 직접 API 호출)만 기본 locale로
fallback한다.

## provider token 미저장

이번 phase는 identity 로그인만 사용하므로 Account에 `access_token/refresh_token/id_token/
expires_at/scope/token_type/session_state`를 저장하지 않는다. 이중 강제: ① provider
`account: () => ({})` mapper ② `ensureOAuthIdentity`의 Account 생성이 4필드만 명시한다.
Kakao의 비표준 `refresh_token_expires_in`도 저장되지 않는다(스키마 컬럼 자체가 없고
defaultAccount 필터(providers.js:92-102)로도 걸러진다 — schema 변경 불필요의 근거). 향후
provider API(캘린더 등)가 필요해지면 **별도 보안 검토 후** 최소 범위·암호화 저장을 도입한다.
`debug` 옵션은 어떤 환경에서도 켜지 않는다 — @auth/core는 debug 수준에서 token이 포함된 인자를
로그로 출력한다(lib/init.js).

## checks 구성 (실측 근거)

@auth/core 기본 checks는 `['pkce']`뿐이라 **state 검증이 생략**된다(providers.js:52, callback은
`skipStateCheck`). 명시적으로 설정한다: Google `['pkce','state','nonce']`, Kakao `['pkce','state']`.
Kakao(OAuth2)에 nonce를 지정하면 oauth4webapi가 id_token을 요구해 flow가 깨지므로 지정하지 않는다.

## 테스트 하네스가 검증하는 것과 하지 않는 것

통합 테스트는 실제 next-auth handlers로 csrf → signin → authorization redirect → callback →
session 왕복 전체를 구동하되, provider 네트워크만 customFetch 주입 fake로 대체한다. Google
id_token은 **서명 없는 well-formed JWS**를 사용한다 — 이 고정 스택(@auth/core 0.41.2 +
oauth4webapi 3.8.6)이 이 flow에서 id_token 서명을 검증하지 않음(JWKS fetch 부재)을 실측했기
때문이다. 따라서 이 테스트가 증명하는 것은 **handler lifecycle·claim 검증(iss/aud/exp/nonce)·
PKCE/state 왕복·DB 상태 전이**이며, **실제 Google 서명 검증·TLS·실 endpoint 동작 검증이 아니다.**
실제 provider 왕복은 credential 발급 후 별도 E2E 항목이다.

## 알려진 한계

- **동일 이메일 다중 provider 미지원**: Google로 가입한 사용자가 같은 이메일로 Kakao를 시도하면
  일반화 오류. 명시적 연결 UI는 후속 phase.
- **stale 세션 쿠키로 신규 가입 차단**: 위 "세션 편승 연결 차단" 절의 fail-safe UX 한계 —
  로그아웃(쿠키 제거)으로 해소되며, 기존 identity 로그인은 영향 없다.
- **소셜 전용 계정의 비밀번호 경로 부재**: passwordHash가 null이므로 비밀번호 재설정 요청은 조용한
  성공으로 수렴한다(1C-1 기존 결정). 비밀번호 설정 기능은 계정 관리 phase에서.
- **OAuth 세션과 credentialVersion**: OAuth 발급 세션은 credentialVersion이 null이라 비밀번호
  재설정으로 무효화되지 않는다 — OAuth 세션은 provider identity 기반이므로 의미상 올바르다.
  상태 차단(SUSPENDED/DELETED)은 jwt callback의 세션 재검증이 동일하게 적용된다.
- **OAuth 경로에 LoginAttempt/rate limit 미적용**: 시도 기록·한도는 credentials 전용이다. OAuth는
  state+PKCE(CSRF 방어)와 provider 측 봇/부정 사용 방어에 의존한다. 필요 시 후속 phase에서 callback
  IP 한도 검토.
- **오류 redirect의 locale 손실**: Auth.js `pages` 값은 정적 문자열이라 오류 redirect가 항상 `/login`
  (기본 ko 렌더)으로 간다 — `/en` 사용자는 오류 화면에서 locale이 풀린다(1C-1의 pages.signIn과 동일한
  기존 제약). 로그인된 사용자가 오류로 `/login`에 오면 홈으로 재이동되어 메시지를 보지 못한다(드묾).
- **실 credential E2E 미수행**: 위 "테스트 하네스" 절 참고 — Google Cloud Console/Kakao Developers
  앱 등록·동의 화면·실 왕복은 credential 발급 후 별도 검증 항목이다 (PROGRESS 참고).
