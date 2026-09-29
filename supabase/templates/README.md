# Authentication emails

## Signup confirmation failures

If signup fails, check the Railway backend logs for `/api/auth/register`.
`AuthApiError: Error sending confirmation email` means Supabase failed to send
the verification email. Changing the frontend, profile schema, or public error
text will not restore email delivery.

1. Open the failed `/signup` event in Supabase **Logs > Auth** and inspect its
   delivery error. Do not copy passwords or tokens into issue reports.
2. In **Authentication > Email > SMTP Settings**, check the configured mail
   provider's host, port, credentials, allowed sender, and recipient restrictions
   against that provider's settings. Customer email requires custom SMTP;
   Supabase's default sender only supports project team addresses.
3. Correct the provider setting reported by the log, then retry signup with an
   email address you control and confirm that its verification link arrives.

Keep email confirmation enabled. Signup and resend return a specific temporary
email delivery error when sending fails; they must not report that a link was
sent or mark an account as verified.

### Gmail rejects the SMTP login (535 5.7.8)

`535 5.7.8 Username and Password not accepted` means Gmail rejected the sender's
SMTP credentials. To repair the hosted email configuration:

1. Sign in to the Google account used as the sender and enable **2-Step
   Verification**.
2. Create a fresh password at [Google App Passwords](https://myaccount.google.com/apppasswords).
3. In Supabase **Authentication > Email > SMTP Settings**, set the host to
   `smtp.gmail.com`, port to `465` (SSL), username to that account's full email
   address, password to the fresh App Password, and sender email to the same
   account.
4. Save, then retry signup with an email address you control and confirm that
   the verification link arrives.

Google password changes revoke existing App Passwords, so create a replacement
after changing the sender account's password. These settings belong in the
hosted Supabase dashboard; local `.env` edits do not update them. See Google's
[App Password guidance](https://support.google.com/accounts/answer/185833) and
[Gmail SMTP connection settings](https://developers.google.com/workspace/gmail/imap/imap-smtp).

## Password reset OTP

The frontend is configured with `VITE_PASSWORD_RECOVERY_MODE=code`. It requests
recovery emails using `resetPasswordForEmail` and verifies the emailed code
using `verifyOtp` with `type: 'recovery'` before changing the password.

For the hosted Supabase project:

1. Open Authentication > Email > Reset Password (Email Templates).
2. Set the subject to `Your V&G password reset code`.
3. Replace the body with the contents of `reset-password.html` and save.

The body uses `{{ .Token }}` to show the code. It contains no reset link.
Saving this local file or rebuilding the frontend does not update the hosted
Supabase email template; apply it in the dashboard.

If requesting recovery returns `Error sending recovery email`, inspect the
failed `/recover` event under Logs > Auth. Template content alone does not fix
SMTP authentication, sender verification, recipient restrictions, or delivery
limits. Supabase's default mail service is restricted to project team email
addresses and has a low sending limit. Customer delivery requires a configured
custom SMTP provider. Never put SMTP credentials in frontend environment files.

References:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/troubleshooting/resolving-500-status-authentication-errors-7bU5U8
