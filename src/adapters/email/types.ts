/**
 * Email port — 구현체(console/resend)는 이 인터페이스 뒤에 숨긴다.
 * MVP는 console, production은 Resend 전환 (README 출시 Gate).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** 평문 본문 — Phase 1C는 텍스트 메일만 사용한다 */
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
