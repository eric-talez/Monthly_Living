/**
 * media URL 안전 가드 — 순수 모듈(DB·env import 금지, unit 테스트 가능).
 *
 * 공개 상세는 신뢰할 수 있는 http(s) 이미지 URL만 표시한다. `javascript:`·`data:` 등
 * 비-http(s) 스킴이나 파싱 불가한 값이 client DOM(`<img src>`)에 들어가지 않도록
 * rendering 이전 service 경계에서 걸러낸다. 원격 fetch·health check는 하지 않는다.
 */
export function isDisplayableImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // 상대 경로·비정상 문자열은 절대 URL이 아니므로 제외
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}
