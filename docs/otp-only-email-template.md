# Code-only sign-in email

The signed-out Watch draft is kept in the original browser page until the user
enters the email code there. An email confirmation link opens a separate page
and cannot safely adopt that draft. The production email should therefore
contain the code without a link.

## Hosted template change

The hosted Supabase Auth template is not deployed from this repository. In the
project used by production, back up the current **Authentication → Email
Templates → Magic Link** subject and body. Set the subject to:

`Your Watch Assistant code / Votre code Watch Assistant`

Replace its body with `supabase/email-templates/otp-only.html`. The body uses
`{{ .Token }}` and intentionally has no `{{ .ConfirmationURL }}`. Check whether
the first-time sign-in path uses **Confirm sign up**; if it does, back up that
template and apply the same code-only body there as well. Do not alter other
authentication or Watch notification templates.

Test a fresh user and an existing user: start a Watch while signed out, submit,
receive the email, enter the code on the original page, and confirm that the
exact request becomes an owned Watch. Check the header sign-in route too.
Revert by restoring the backed-up subject/body. A previously loaded Magic Link
client still needs the old link, so deploy the OTP-capable application before
switching the hosted template and ask active testers to refresh.
