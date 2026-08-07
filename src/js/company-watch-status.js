export const COMPANY_STATUS_VALUES = Object.freeze([
  'active',
  'judicial_proceedings',
  'receivership',
  'judicial_liquidation',
  'dissolved',
  'struck_off',
  'unknown',
]);

const COMPANY_STATUS_SET = new Set(COMPANY_STATUS_VALUES);

const STATUS_BY_EVENT_TYPE = Object.freeze({
  company_created: 'active',
  judicial_proceedings: 'judicial_proceedings',
  receivership: 'receivership',
  judicial_liquidation: 'judicial_liquidation',
  company_dissolved: 'dissolved',
  company_struck_off: 'struck_off',
});

const STATUS_TONES = Object.freeze({
  active: 'stable',
  judicial_proceedings: 'company-warning',
  receivership: 'company-warning',
  judicial_liquidation: 'error',
  dissolved: 'error',
  struck_off: 'error',
  unknown: 'watching',
});

export const normalizeCompanyStatus = (value) => (
  COMPANY_STATUS_SET.has(value) ? value : 'unknown'
);

export const deriveCompanyStatus = (items, previousStatus = 'unknown') => {
  const fallback = normalizeCompanyStatus(previousStatus);
  if (!Array.isArray(items)) return fallback;

  for (const item of items) {
    const status = STATUS_BY_EVENT_TYPE[item?.eventType];
    if (status) return status;
  }
  return fallback;
};

export const isTerminalCompanyStatus = (value) => (
  ['dissolved', 'struck_off'].includes(normalizeCompanyStatus(value))
);

export const getCompanyStatusPresentation = (value, translate = () => '') => {
  const status = normalizeCompanyStatus(value);
  return {
    status,
    label: translate(`companyStatus.labels.${status}`),
    description: translate(`companyStatus.descriptions.${status}`),
    followUp: translate(`companyStatus.followUps.${status}`),
    tone: STATUS_TONES[status],
    warningTitle: isTerminalCompanyStatus(status)
      ? translate(`companyStatus.reviewWarnings.${status}`)
      : '',
  };
};
