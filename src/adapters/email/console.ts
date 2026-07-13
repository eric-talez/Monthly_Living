import type { EmailMessage, EmailProvider } from './types';

/**
 * Console email provider — 실제 발송 없이 로그로만 확인하는 개발용 구현.
 *
 * - verbose(개발 전용): 수신자·제목·본문 전체를 출력한다. 인증/재설정 URL이
 *   본문에 포함되므로 개발 환경에서 이 출력이 메일함을 대신한다.
 * - redacted(그 외 전체): token·URL·본문·전체 이메일 주소를 절대 출력하지 않는다.
 *   마스킹된 수신자와 제목, provider 미구성 경고만 남긴다.
 */
export type ConsoleEmailMode = 'verbose' | 'redacted';

/** `traveler@test.com` → `t***@t***` — local/domain 첫 글자만 남긴다. */
export function maskEmailAddress(address: string): string {
  const [local = '', domain = ''] = address.split('@');
  const maskPart = (part: string) => (part ? `${part[0]}***` : '***');
  return `${maskPart(local)}@${maskPart(domain)}`;
}

let warnedMissingRealProvider = false;

export function createConsoleEmailProvider(mode: ConsoleEmailMode): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<void> {
      if (mode === 'verbose') {
        console.log(
          [
            '[email:console] ──────────────────────────────────────',
            `To: ${message.to}`,
            `Subject: ${message.subject}`,
            '',
            message.text,
            '───────────────────────────────────────────────────────',
          ].join('\n'),
        );
        return;
      }

      if (!warnedMissingRealProvider) {
        warnedMissingRealProvider = true;
        console.warn(
          '[email:console] 실제 이메일 provider가 구성되지 않았습니다 — ' +
            '메일은 발송되지 않으며 본문은 기록되지 않습니다 (README 출시 Gate 참고).',
        );
      }
      console.log(`[email:console] send (redacted) to=${maskEmailAddress(message.to)}`);
    },
  };
}
