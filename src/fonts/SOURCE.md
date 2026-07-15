# Self-hosted fonts — 출처·라이선스

`src/app/[locale]/layout.tsx`가 `next/font/local`로 로드하는 self-host 폰트 파일이다.
Phase 1D-1에서 기존 `next/font/google`(빌드 시 fonts.gstatic.com 다운로드)을 대체해
**빌드가 네트워크 없이 재현**되도록 했다.

## 폰트

| 파일                            | family        | weight | subset |
| ------------------------------- | ------------- | ------ | ------ |
| `noto-sans-kr-latin-400.woff2`  | Noto Sans KR  | 400    | latin  |
| `noto-sans-kr-latin-500.woff2`  | Noto Sans KR  | 500    | latin  |
| `noto-sans-kr-latin-700.woff2`  | Noto Sans KR  | 700    | latin  |
| `noto-serif-kr-latin-400.woff2` | Noto Serif KR | 400    | latin  |
| `noto-serif-kr-latin-600.woff2` | Noto Serif KR | 600    | latin  |
| `noto-serif-kr-latin-700.woff2` | Noto Serif KR | 700    | latin  |

- weight 구성은 기존 `next/font/google` 계약과 동일(Sans 400/500/700, Serif 400/600/700).
- **subset은 `latin`만** 포함한다 — 기존 설정(`subsets: ['latin']`)과 동일 범위. 한글 등
  비-latin 글리프는 기존과 동일하게 CSS 변수 폰트 스택의 시스템 폴백으로 렌더된다.
  (한글 글리프를 Noto로 실제 렌더링하는 것은 수십 MB의 별도 typography 변경으로 Phase 1D 범위 밖.)

## 출처 (provenance)

- 획득 경로: npm `@fontsource/noto-sans-kr@5.2.9`, `@fontsource/noto-serif-kr@5.2.9`
  (Fontsource가 재배포하는 Google Noto 폰트의 `files/*-latin-{weight}-normal.woff2`).
- 상위 폰트 버전(Fontsource metadata 기준): Noto Sans KR **v39**, Noto Serif KR **v31**
  (lastModified 2026-01-07).
- 상위 소스: https://github.com/google/fonts

## 라이선스

- **SIL Open Font License, Version 1.1** (OFL-1.1), © Google Inc. — 전문은 같은 폴더 `OFL.txt`.
- OFL은 임베딩·재배포를 허용하므로 이 저장소에 woff2 바이너리를 커밋해도 무방하다.

## 갱신 방법

폰트를 갱신하려면 위 Fontsource 패키지를 다시 받아 `files/`에서 해당 `latin-{weight}` woff2를
같은 파일명으로 교체하고, 이 문서의 버전 정보를 갱신한다. weight/파일명이 바뀌면
`src/app/[locale]/layout.tsx`의 `localFont` src 목록도 함께 수정한다.
