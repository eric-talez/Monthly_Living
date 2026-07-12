import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

// 내부 링크·라우팅은 반드시 이 모듈의 Link/redirect/usePathname/useRouter를 사용한다.
// (locale prefix를 자동으로 처리하기 위해 next/link 직접 사용 금지)
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
