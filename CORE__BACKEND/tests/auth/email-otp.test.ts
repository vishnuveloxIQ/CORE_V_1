import { describe, expect, it } from 'vitest';
import { createEmailOtpDelivery, type EmailMessage } from '../../src/modules/auth/email-otp.js';
import type { OtpMessage } from '../../src/modules/auth/password-reset.js';

// Email channel for reset codes (decision 4). Example data is fictional.

function resetMessage(overrides: Partial<OtpMessage> = {}): OtpMessage {
  return {
    tenantId: 'acme',
    userId: '00000000-0000-4000-8000-000000000001',
    loginId: 'example.user',
    purpose: 'password_reset',
    code: '048213',
    expiresAt: new Date(Date.now() + 5 * 60_000),
    email: 'example.user@example.test',
    phone: null,
    ...overrides,
  };
}

function recordingTransport(): { sent: EmailMessage[]; send: (m: EmailMessage) => Promise<void> } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: async (m) => {
      sent.push(m);
    },
  };
}

describe('email one-time codes (decision 4)', () => {
  it('sends the code to the user email address, with the expiry in the text', async () => {
    const transport = recordingTransport();
    const delivery = createEmailOtpDelivery(transport);

    await delivery.send(resetMessage());

    expect(transport.sent).toHaveLength(1);
    const email = transport.sent[0]!;
    expect(email.to).toBe('example.user@example.test');
    expect(email.subject).toBe('Your password reset code');
    expect(email.text).toContain('048213');
    expect(email.text).toMatch(/about \d+ minutes/);
  });

  it('sends nothing and does not throw when the user has no email address', async () => {
    const transport = recordingTransport();
    const delivery = createEmailOtpDelivery(transport);

    await expect(delivery.send(resetMessage({ email: null, phone: '+10000000000' }))).resolves.toBe(
      undefined,
    );
    expect(transport.sent).toHaveLength(0);
  });

  it('passes a transport failure up, so the route can answer 503', async () => {
    const delivery = createEmailOtpDelivery({
      send: async () => {
        throw new Error('provider unreachable');
      },
    });

    await expect(delivery.send(resetMessage())).rejects.toThrow('provider unreachable');
  });

  it('never puts the login id into the email text', async () => {
    const transport = recordingTransport();
    await createEmailOtpDelivery(transport).send(resetMessage({ loginId: 'secret.login.id' }));

    expect(transport.sent[0]!.text).not.toContain('secret.login.id');
  });
});
