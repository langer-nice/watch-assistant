export const getCompanyReviewSummary = (siren, translate = () => '') => {
  const description = translate('newWatch.companyReviewSummary', { siren });
  const events = translate('newWatch.companyReviewEventsSummary');
  return [description, '', events].join('\n');
};
