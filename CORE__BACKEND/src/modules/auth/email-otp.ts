import type { OtpDelivery, OtpMessage } from './password-reset.js';

// Email channel for one-time codes (Phase 4b decision 4: channel is email; the provider is chosen later).
// The adapter knows nothing about a vendor. A provider is plugged in as an EmailTransport.

/** One email as the adapter builds it. A transport turns it into a provider call. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends one email through whatever provider the deployment chooses. Not chosen yet. */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Message wording for a password reset code. The template is not decided yet (decision 4), so this text is
 * provisional and kept in one place. It carries the code and the expiry only: no tenant, no user details.
 */
export function passwordResetEmail(message: OtpMessage): EmailMessage {
  const minutes = Math.max(1, Math.round((message.expiresAt.getTime() - Date.now()) / 60_000));
  return {
    to: message.email ?? '',
    subject: 'Your password reset code',
    text: [
      `Your password reset code is ${message.code}.`,
      `It works for about ${minutes} minutes and can be used once.`,
      'If you did not ask for a reset, ignore this email.',
    ].join('\n\n'),
  };
}

/**
 * Builds the OtpDelivery port on top of an email transport. A user without an email address gets no message
 * and no error: the caller already answers 202 for every login id, so a delivery error here would reveal
 * that the account exists. The code itself is never logged.
 */
export function createEmailOtpDelivery(transport: EmailTransport): OtpDelivery {
  return {
    async send(message: OtpMessage): Promise<void> {
      if (message.email === null) {
        return;
      }
      await transport.send(passwordResetEmail(message));
    },
  };
}
