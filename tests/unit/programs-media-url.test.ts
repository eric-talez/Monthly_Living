import { describe, expect, it } from 'vitest';

import { isDisplayableImageUrl } from '@/modules/programs/media';

/**
 * media URL 가드 — http(s) 절대 URL만 허용하는 순수 함수.
 * javascript:/data: 등 비-http(s) 스킴이 <img src>로 흘러 들어가지 않도록 rendering 경계에서 건다.
 */
describe('isDisplayableImageUrl', () => {
  it('http/https 절대 URL은 허용한다', () => {
    expect(isDisplayableImageUrl('https://picsum.photos/seed/x-1/1600/1000')).toBe(true);
    expect(isDisplayableImageUrl('http://example.test/a.jpg')).toBe(true);
  });

  it('javascript:·data:·ftp: 등 비-http(s) 스킴은 거부한다', () => {
    expect(isDisplayableImageUrl('javascript:alert(1)')).toBe(false);
    expect(isDisplayableImageUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isDisplayableImageUrl('ftp://example.test/a.jpg')).toBe(false);
  });

  it('상대 경로·파싱 불가·빈 문자열은 거부한다', () => {
    expect(isDisplayableImageUrl('/local/a.jpg')).toBe(false);
    expect(isDisplayableImageUrl('not a url')).toBe(false);
    expect(isDisplayableImageUrl('')).toBe(false);
  });
});
