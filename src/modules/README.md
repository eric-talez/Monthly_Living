# modules/

도메인별 서비스 레이어. 모든 비즈니스 로직(권한·소유권 검증 포함)은 이 디렉토리의 모듈에 두고,
route handler와 server action은 여기의 서비스 함수를 호출하는 얇은 어댑터로만 유지한다.

Phase별로 추가 예정: `auth/ users/ experts/ programs/ destinations/ recommendation/ bookings/ payments/ payouts/ messaging/ reviews/ notifications/ favorites/ coupons/ support/ admin/`
