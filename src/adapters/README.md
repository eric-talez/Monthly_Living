# adapters/

외부 서비스 연동을 인터페이스 뒤로 감추는 어댑터 레이어. 특정 벤더에 종속되지 않도록
각 어댑터는 공통 인터페이스를 구현하고 환경변수로 구현체를 선택한다.

Phase별로 추가 예정:

- `payment/` — `PaymentProvider`: Mock(기본, 서버 주도 서명 webhook) / Stripe
- `email/` — `EmailProvider`: Console(개발) / Resend
- `storage/` — `StorageProvider`: LocalFs(비공개 파일 안전 구현) / S3
- `rate-limit/` — `RateLimitProvider`: Memory(개발) / Redis
- `analytics/` — Sentry / PostHog (키 입력 시 활성화)
