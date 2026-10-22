# Clickable Watch Detail check result — Staging

The complete positive result area is a native anchor, replacing the separate Review update action. Completed-check identities from the existing `getLatestCheckUpdates` projection select cloned cards from the existing complete-history renderer. One result targets that exact card; multiple results target a list containing only those identities, preserving headline, available summary and source links. No Watch record is edited. If the exact cards are missing, navigation falls back to existing developments/history without inventing content.

The destination receives visible focus and smooth scrolling (instant scrolling with reduced-motion preference). Native link keyboard/modified-click behavior is retained, as are deep links. Empty, loading, currency and failure messages remain non-actions. Monitoring, matching, notification capture, emails, reports and settings are unchanged.

17 focused UI checks passed; Vite build passed (non-blocking bundle-size warning). Local browser fixture at 390×844 confirmed Enter activation, focus on the exact result, exclusion of unrelated historical cards, no horizontal overflow and a 56px result link. Evidence: `docs/evidence/check-result-click-mobile-2026-10-22.png`. No monitoring checks, real Watch mutations, emails or AI calls were triggered.
