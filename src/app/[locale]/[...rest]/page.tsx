import { notFound } from 'next/navigation';

// [locale] 이하에서 매칭되지 않는 모든 경로를 로케일이 적용된 not-found로 보낸다.
export default function CatchAllPage() {
  notFound();
}
