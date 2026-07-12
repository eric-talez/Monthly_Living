-- dev DB(handalsalgi_dev)는 POSTGRES_DB 환경변수로 생성되고,
-- 이 init 스크립트가 test DB를 추가로 생성한다 (컨테이너 최초 초기화 시 1회 실행).
CREATE DATABASE handalsalgi_test;
