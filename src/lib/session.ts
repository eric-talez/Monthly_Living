import 'server-only';

import { cache } from 'react';

import { auth } from '@/auth';

/**
 * 요청 단위 세션 조회 — React.cache로 dedupe한다.
 * JWT callback이 세션 읽기마다 DB 재검증(PK 조회)을 수행하므로,
 * 한 요청에서 여러 번 세션이 필요하면 반드시 auth() 대신 이 함수를 사용한다.
 */
export const getSession = cache(() => auth());
