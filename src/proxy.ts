import createIntlProxy from 'next-intl/middleware';

import { routing } from './i18n/routing';

export default createIntlProxy(routing);

export const config = {
  // api 라우트, Next 내부 경로, 정적 파일은 locale 라우팅에서 제외한다.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
