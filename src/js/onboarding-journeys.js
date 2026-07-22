const DEFAULT_JOURNEY_ID = 'general';
const DEFAULT_FLOW_ID = '1';
const FLOW_QUERY_PARAMETER = 'flow';

const journeys = [
  {
    id: DEFAULT_JOURNEY_ID,
    label: 'General',
    examples: {
      en: [
        'When EasyJet releases Christmas flights to London.',
        'A property matching your criteria is listed.',
        "Updates to a news story you're following.",
        'An Amazon product drops below your target price.',
        'Metallica announces a European tour.',
        'Changes to tax or business regulations.',
        'A competitor launches a new product.',
      ],
      fr: [
        'Quand EasyJet ouvre les vols de Noël vers Londres.',
        'Un bien correspondant à vos critères est mis en vente.',
        'Les développements d’une actualité que vous suivez.',
        'Un produit Amazon passe sous votre prix cible.',
        'Metallica annonce une tournée européenne.',
        'Les changements fiscaux ou réglementaires.',
        'Le lancement d’un nouveau produit par un concurrent.',
      ],
    },
  },
  {
    id: 'sales-marketing',
    label: 'Sales & Marketing',
    examples: {
      en: [
        'A competitor launches a new product.',
        'Your company is mentioned in the news or on social media.',
        'A competitor changes their pricing.',
        'EasyJet opens Christmas flights to London.',
        'An Amazon product drops below your target price.',
        'The euro reaches $1.05 against the US dollar.',
        "A concert or event you're interested in is announced.",
      ],
      fr: [
        'Un concurrent lance un nouveau produit.',
        'Votre entreprise est mentionnée dans l’actualité ou sur les réseaux sociaux.',
        'Un concurrent modifie ses tarifs.',
        'EasyJet ouvre les vols de Noël vers Londres.',
        'Un produit Amazon passe sous votre prix cible.',
        'L’euro atteint 1,05 $ face au dollar américain.',
        'Un concert ou un événement qui vous intéresse est annoncé.',
      ],
    },
  },
];

const journeysById = new Map(journeys.map((journey) => [journey.id, journey]));

// Public flow IDs stay neutral while internal journey IDs remain descriptive.
const flowMappings = [
  {
    id: '1',
    journeyId: 'general',
    description: 'Default onboarding experience.',
  },
  {
    id: '2',
    journeyId: 'sales-marketing',
    description: 'Personalized onboarding for Sales & Marketing users.',
  },
];
const flowsById = new Map(flowMappings.map((flow) => [flow.id, flow]));

export const getOnboardingJourneys = () => journeys;

export const getOnboardingFlows = () => flowMappings.map((flow) => ({
  ...flow,
  label: journeysById.get(flow.journeyId).label,
}));

export const getOnboardingJourney = (id) => (
  journeysById.get(id) || journeysById.get(DEFAULT_JOURNEY_ID)
);

export const getJourneyFromLocation = () => {
  const params = new URLSearchParams(window.location.search);
  const requestedFlowId = params.get(FLOW_QUERY_PARAMETER);
  const flow = flowsById.get(requestedFlowId) || flowsById.get(DEFAULT_FLOW_ID);

  if (requestedFlowId && !flowsById.has(requestedFlowId)) {
    console.warn(`Unknown onboarding flow "${requestedFlowId}"; using the default flow.`);
  }

  return getOnboardingJourney(flow.journeyId);
};

export const getJourneyExamples = (journey, language) => {
  const generalJourney = journeysById.get(DEFAULT_JOURNEY_ID);
  const candidates = [
    journey?.examples?.[language],
    journey?.examples?.en,
    generalJourney.examples[language],
    generalJourney.examples.en,
  ];
  const examples = candidates.find((candidate) => (
    Array.isArray(candidate) && candidate.length > 0
  ));

  if (!Array.isArray(journey?.examples?.[language]) || journey.examples[language].length === 0) {
    console.warn(`Missing onboarding examples for "${journey?.id || 'unknown'}" (${language}); using fallback content.`);
  }

  return examples;
};

export const getFlowUrl = (flow) => {
  const flowId = flowsById.has(flow?.id) ? flow.id : DEFAULT_FLOW_ID;
  const params = new URLSearchParams({
    [FLOW_QUERY_PARAMETER]: flowId,
  });
  return `flow-3.html?${params.toString()}`;
};

export { DEFAULT_FLOW_ID, DEFAULT_JOURNEY_ID, FLOW_QUERY_PARAMETER };
