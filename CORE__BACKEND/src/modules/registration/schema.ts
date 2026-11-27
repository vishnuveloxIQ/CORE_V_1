import { z } from 'zod';

/** Registration codes are six digits. */
const sixDigits = z.string().regex(/^\d{6}$/, 'Enter the six-digit code.');

/** POST /auth/register/otp: send a code to an email address or a mobile number. */
export const registrationOtpBody = z
  .object({
    channel: z.enum(['email', 'mobile']),
    target: z.string().trim().min(3).max(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.target)) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'Enter a valid email address.' });
    }
    if (v.channel === 'mobile' && !/^\+?\d{8,15}$/.test(v.target.replace(/[\s-]/g, ''))) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'Enter a valid mobile number.' });
    }
  });

/** POST /auth/register: the company, its first administrator, and both codes. */
export const registerBody = z
  .object({
    company: z.string().trim().min(2, 'Enter your company name.').max(100),
    email: z.string().trim().max(200).email('Enter a valid email address.'),
    mobile: z.string().trim().min(8).max(20),
    emailCode: sixDigits,
    mobileCode: sixDigits,
    loginId: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3,6}\d{4}$/, 'Use 3 to 6 letters and 4 digits, for example ACME1234.'),
    password: z.string().min(12, 'Use at least 12 characters.').max(128),
  })
  .strict();

export type RegistrationOtpInput = z.infer<typeof registrationOtpBody>;
export type RegisterInput = z.infer<typeof registerBody>;
