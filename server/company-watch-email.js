import { getWatchEmailConfig, normalizeWatchEmailSender } from './watch-email-config.js';
import { createHash } from 'node:crypto';

const EVENT_LABELS = {
  en: {
    capital_increase: 'Capital increased',
    capital_reduction: 'Capital reduced',
    director_change: 'Director changed',
    registered_office_change: 'Registered office changed',
    accounts_filed: 'Accounts filed',
    company_created: 'Company created',
    company_dissolved: 'Company dissolved',
    judicial_proceedings: 'Judicial proceedings opened',
    judicial_liquidation: 'Judicial liquidation opened',
    receivership: 'Receivership opened',
    business_sale: 'Business sold',
    company_struck_off: 'Company struck off',
  },
  fr: {
    capital_increase: 'Augmentation du capital',
    capital_reduction: 'Réduction du capital',
    director_change: 'Changement de dirigeant',
    registered_office_change: 'Transfert du siège social',
    accounts_filed: 'Dépôt des comptes',
    company_created: 'Création de l’entreprise',
    company_dissolved: 'Dissolution de l’entreprise',
    judicial_proceedings: 'Ouverture d’une procédure judiciaire',
    judicial_liquidation: 'Ouverture d’une liquidation judiciaire',
    receivership: 'Ouverture d’un redressement judiciaire',
    business_sale: 'Cession de l’entreprise',
    company_struck_off: 'Radiation de l’entreprise',
  },
};

const MESSAGES = {
  en: {
    subject: (company) => `New official event detected for ${company}`,
    preheader: (company) => `Watch Assistant detected a new BODACC event for ${company}.`,
    heading: 'A new official event was detected',
    intro: (company) => `Your Watch for ${company} detected a new matching official event.`,
    date: 'Publication date',
    source: 'Source',
    summary: 'Official summary',
    action: 'View Watch details',
    notice: 'This announcement concerns an event recorded for the company or one of its establishments. It does not necessarily mean that the company has ceased trading.',
  },
  fr: {
    subject: (company) => `Nouvel événement officiel détecté pour ${company}`,
    preheader: (company) => `Watch Assistant a détecté un nouvel événement BODACC pour ${company}.`,
    heading: 'Un nouvel événement officiel a été détecté',
    intro: (company) => `Votre Watch pour ${company} a détecté un nouvel événement officiel correspondant.`,
    date: 'Date de publication',
    source: 'Source',
    summary: 'Résumé officiel',
    action: 'Voir les détails de la Watch',
    notice: 'Cette annonce concerne un événement enregistré pour l’entreprise ou l’un de ses établissements. Elle ne signifie pas nécessairement que l’entreprise a cessé son activité.',
  },
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const cleanText = (value, maxLength) => {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  return text ? text.slice(0, maxLength) : '';
};

const normalizeLocale = (value) => (value === 'fr' ? 'fr' : 'en');
const RESEND_TIMEOUT_MS = 10_000;

const formatDate = (value, locale) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value, 40);
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date);
};

export const getCompanyWatchEmailConfig = (env = process.env) => getWatchEmailConfig(env, 'WATCH_EMAIL_NOTIFICATIONS_ENABLED');

export const createNotificationIdempotencyKey = ({ watchId, userId, sourceEventId }) => (
  `watch-bodacc-${createHash('sha256')
    .update(`${watchId}\u0000${userId}\u0000${sourceEventId}`)
    .digest('hex')}`
);

export const renderCompanyWatchEmail = ({ locale, watchId, companyName, event, baseUrl }) => {
  const language = normalizeLocale(locale);
  const messages = MESSAGES[language];
  const company = cleanText(companyName, 200) || 'Company Watch';
  const rawTitle = cleanText(event?.title, 300);
  const eventTitle = EVENT_LABELS[language][event?.eventType] || rawTitle || 'BODACC';
  const source = cleanText(event?.source, 100) || 'BODACC';
  const summary = cleanText(event?.summary, 500);
  const publishedAt = formatDate(event?.publishedAt, language);
  const detailUrl = new URL('/watch-detail.html', baseUrl);
  detailUrl.searchParams.set('id', watchId);

  const textLines = [
    messages.heading,
    '',
    messages.intro(company),
    '',
    eventTitle,
    `${messages.date}: ${publishedAt}`,
    `${messages.source}: ${source}`,
    ...(summary ? ['', `${messages.summary}: ${summary}`] : []),
    '',
    messages.notice,
    '',
    `${messages.action}: ${detailUrl.href}`,
  ];
  const summaryHtml = summary
    ? `<p style="margin:20px 0 6px;font-size:13px;color:#667085;">${escapeHtml(messages.summary)}</p><p style="margin:0;color:#344054;line-height:1.6;">${escapeHtml(summary)}</p>`
    : '';
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(messages.subject(company))}</title></head><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b;"><span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(messages.preheader(company))}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;"><tr><td style="padding:32px;"><p style="margin:0 0 20px;font-size:12px;font-weight:bold;letter-spacing:.08em;">WATCH ASSISTANT</p><h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;">${escapeHtml(messages.heading)}</h1><p style="margin:0 0 24px;color:#344054;line-height:1.6;">${escapeHtml(messages.intro(company))}</p><div style="border:1px solid #e4e4e7;border-radius:10px;padding:20px;"><h2 style="margin:0 0 14px;font-size:20px;">${escapeHtml(eventTitle)}</h2><p style="margin:6px 0;color:#344054;"><strong>${escapeHtml(messages.date)}:</strong> ${escapeHtml(publishedAt)}</p><p style="margin:6px 0;color:#344054;"><strong>${escapeHtml(messages.source)}:</strong> ${escapeHtml(source)}</p>${summaryHtml}</div><p style="margin:20px 0;color:#667085;font-size:13px;line-height:1.55;">${escapeHtml(messages.notice)}</p><p style="margin:24px 0 0;"><a href="${escapeHtml(detailUrl.href)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;border-radius:8px;padding:13px 18px;font-weight:bold;">${escapeHtml(messages.action)}</a></p></td></tr></table></td></tr></table></body></html>`;

  return { subject: messages.subject(company), html, text: textLines.join('\n'), detailUrl: detailUrl.href };
};

export const sendWithResend = async ({ apiKey, from, to, subject, html, text, idempotencyKey }, {
  fetchImpl = fetch,
  timeoutMs = RESEND_TIMEOUT_MS,
} = {}) => {
  if (process.env.NODE_ENV === 'test' && fetchImpl === globalThis.fetch) {
    throw Object.assign(new Error('Real email transport is disabled in tests.'), { code: 'TEST_EMAIL_TRANSPORT_DISABLED' });
  }
  from = normalizeWatchEmailSender(from);
  if (!from || typeof apiKey !== 'string' || !apiKey.trim() || /\s/u.test(apiKey)) {
    throw Object.assign(new Error('Email configuration is invalid.'), { code: 'EMAIL_CONFIGURATION_INVALID' });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  let response; let body;
  try {
    response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: controller.signal,
    });
    body = await response.json().catch(() => null);
  } catch {
    const error = new Error('Transactional email provider outcome is unknown.');
    error.code = 'EMAIL_DELIVERY_OUTCOME_UNKNOWN';
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok || (typeof body?.id !== 'string' || !body.id.trim())) {
    const error = new Error('Transactional email provider rejected the request.');
    error.code = response.ok ? 'EMAIL_DELIVERY_OUTCOME_UNKNOWN'
      : response.status === 422 ? 'EMAIL_PROVIDER_REJECTED_422'
        : response.status === 429 ? 'EMAIL_RATE_LIMITED'
          : response.status >= 500 || response.status === 408 ? 'EMAIL_PROVIDER_RETRYABLE'
            : 'EMAIL_PROVIDER_REJECTED';
    throw error;
  }
  return { id: body.id.slice(0, 200) };
};
