import assert from 'node:assert/strict';
import test from 'node:test';
import { rankStoryIdentifiers } from './story-identifier-ranking.js';

const benchmark = [
  {
    name: 'legal case — Ivan Toney Soho nightclub assault charge',
    evidence: {
      title: 'Footballer Ivan Toney charged with assault at Soho nightclub',
      description: 'Ivan Toney was charged with assault causing actual bodily harm after an incident at a Soho nightclub.',
      articleText: 'Ivan Toney has been charged with assault after an incident at a Soho nightclub. He will appear in court. He previously played at the World Cup and in England’s final.',
    },
    proposals: [
      ['Ivan Toney assault charge', 'event'], ['Ivan Toney', 'person'],
      ['Soho nightclub assault case', 'event'],
    ],
    expected: ['Ivan Toney assault charge', 'Ivan Toney', 'Soho nightclub assault case'],
    rejected: ['World Cup', 'England’s final'],
    includeEvidenceCandidates: false,
  },
  {
    name: 'politics — Abdul El-Sayed and the Michigan Senate primary',
    evidence: {
      title: 'Abdul El-Sayed wins Michigan Senate primary',
      description: 'The Democratic Party candidate won the Senate primary in Michigan.',
      articleText: 'Abdul El-Sayed won the Michigan Senate primary. The Democratic Party confirmed the result.',
    },
    proposals: [
      ['Abdul El-Sayed', 'person'], ['Michigan Senate primary', 'event'],
      ['Democratic Party', 'organization'], ['Politics', 'phenomenon'],
    ],
    expected: ['Abdul El-Sayed', 'Michigan Senate primary'],
    rejected: ['Politics'],
  },
  {
    name: 'university — Jason Arday plagiarism investigation and resignation',
    evidence: {
      title: 'Cambridge professor Jason Arday resigns after plagiarism investigation',
      description: 'Jason Arday resigned from the University of Cambridge.',
      articleText: 'Professor Jason Arday resigned from the University of Cambridge after a plagiarism investigation.',
    },
    proposals: [
      ['Professor Jason Arday', 'person'], ['University of Cambridge', 'organization'],
      ['Plagiarism investigation', 'event'], ['Jason Arday resignation', 'event'],
    ],
    expected: ['Jason Arday', 'University of Cambridge', 'Plagiarism investigation'],
  },
  {
    name: 'politics — Murkowski opposition to the Blanche nomination',
    evidence: {
      title: 'Lisa Murkowski opposes Todd Blanche nomination for US attorney general',
      description: 'Murkowski cited concerns about politicisation of the US Justice Department.',
      articleText: 'Todd Blanche was nominated for US attorney general. Lisa Murkowski opposed the nomination and warned against politicisation of the US Justice Department.',
    },
    proposals: [
      ['Lisa Murkowski’s opposition to Todd Blanche’s attorney general nomination', 'relationship'],
      ['Todd Blanche’s nomination for US attorney general', 'event'],
      ['Politicisation of the US Justice Department', 'phenomenon'],
    ],
    expected: [
      'Lisa Murkowski’s opposition to Todd Blanche’s attorney general nomination',
      'Todd Blanche’s nomination for US attorney general',
      'Politicisation of the US Justice Department',
    ],
    includeEvidenceCandidates: false,
  },
  {
    name: 'conflict — Odesa and the Russian Black Sea strike campaign',
    evidence: {
      title: 'Russian Black Sea strike campaign expands in Odesa',
      description: 'Russian strikes targeted civilian infrastructure in Odesa, Ukraine.',
      articleText: 'The Black Sea strike campaign expanded in Odesa. Russian strikes damaged civilian infrastructure in Ukraine. Yaroslav Petrenko was quoted later.',
    },
    proposals: [
      ['Black Sea strike campaign', 'event'], ['Russian strikes', 'event'],
      ['Odesa', 'location'], ['Ukraine', 'location'], ['Yaroslav Petrenko', 'person'],
    ],
    expected: ['Black Sea strike campaign', 'Odesa'],
    rejected: ['Yaroslav Petrenko'],
  },
  {
    name: 'health and lifestyle — ultra-processed foods',
    evidence: {
      title: 'Six easy swaps to help avoid ultra-processed foods',
      description: 'Nutrition specialists offer dietary advice for healthy eating.',
      articleText: 'Ultra-processed foods are the central nutrition subject. The dietary advice supports healthy eating and discusses public health evidence.',
    },
    proposals: [
      ['Ultra-processed foods', 'phenomenon'],
    ],
    expected: ['Ultra-processed foods'],
    rejected: ['Health', 'Six easy swaps'],
    includeEvidenceCandidates: false,
  },
  {
    name: 'profile — Carol Ruckdeschel conservation and distinctive island life',
    evidence: {
      title: 'The snake-wrangling 84-year-old who lives on a remote barrier island',
      description: 'Naturalist Carol Ruckdeschel has lived off the land for 53 years while fighting to preserve Cumberland Island.',
      articleText: 'Carol Ruckdeschel is known for her snake-wrangling naturalist island life on Cumberland Island. Cumberland Island conservation and development conflicts define her activism. She founded Wild Cumberland.',
    },
    proposals: [
      ['Carol Ruckdeschel', 'person'],
      ['Cumberland Island conservation and development conflicts', 'phenomenon'],
      ['Snake-wrangling naturalist island life', 'phenomenon'],
      ['Wild Cumberland', 'organization'],
    ],
    expected: [
      'Carol Ruckdeschel',
      'Cumberland Island conservation and development conflicts',
    ],
    semanticExpectations: [
      {
        description: 'distinctive naturalist, snake-wrangling or island-life context',
        pattern: /(?:naturalist|snake|island life)/iu,
      },
    ],
    includeEvidenceCandidates: false,
  },
  {
    name: 'business and policy — RWE offshore wind agreement',
    evidence: {
      title: 'US strikes $1.2bn deal to pay German firm to halt offshore wind projects',
      description: 'RWE agreed to relinquish US offshore wind leases under a deal with the Trump administration.',
      articleText: 'RWE reached the RWE offshore wind lease agreement worth $1.2bn. The Trump administration offshore wind policy seeks to halt projects. US offshore wind project cancellations are expected.',
    },
    proposals: [
      ['RWE offshore wind lease agreement', 'relationship'], ['RWE', 'organization'],
      ['Trump administration offshore wind policy', 'relationship'],
      ['US offshore wind project cancellations', 'phenomenon'],
    ],
    expected: [
      'RWE', 'RWE offshore wind lease agreement',
      'Trump administration offshore wind policy', 'US offshore wind project cancellations',
    ],
    rejected: ['Germany'],
    includeEvidenceCandidates: false,
  },
  {
    name: 'business — merger and antitrust investigation',
    evidence: {
      title: 'Northstar merger faces antitrust investigation',
      description: 'Northstar Corporation plans a merger with Helios Company.',
      articleText: 'Northstar Corporation and Helios Company agreed the merger. Regulators opened an antitrust investigation.',
    },
    proposals: [
      ['Northstar Corporation', 'organization'], ['Helios Company', 'organization'],
      ['Merger', 'event'], ['Antitrust investigation', 'event'], ['Business', 'phenomenon'],
    ],
    expected: ['Northstar Corporation', 'Antitrust investigation'],
    rejected: ['Business'],
  },
  {
    name: 'sport — specific World Cup Final',
    evidence: {
      title: 'Spain beat Brazil in the 2030 World Cup Final',
      description: 'Spain won the competition after extra time against Brazil.',
      articleText: 'Spain defeated Brazil in the 2030 World Cup Final. The tournament result was confirmed.',
    },
    proposals: [
      ['2030 World Cup Final', 'event'], ['Spain', 'location'],
      ['Brazil', 'location'], ['Sports', 'phenomenon'],
    ],
    expected: ['2030 World Cup Final', 'Spain', 'Brazil'],
    rejected: ['Sports'],
  },
  {
    name: 'French local news — Nice administrative closure',
    evidence: {
      title: 'Une boulangerie visée par une fermeture administrative à Nice',
      description: 'La boulangerie Azur fait l’objet d’une fermeture administrative.',
      articleText: 'La boulangerie Azur, située à Nice, fait l’objet d’une fermeture administrative après un contrôle de police.',
    },
    proposals: [
      ['Boulangerie Azur', 'organization'], ['Fermeture administrative', 'event'],
      ['Nice', 'location'], ['Je m’abonne', 'phenomenon'],
    ],
    expected: ['Boulangerie Azur', 'Fermeture administrative', 'Nice'],
    rejected: ['Je m’abonne'],
  },
  {
    name: 'French international — Le Monde fuel-price article',
    evidence: {
      title: 'En Russie, là où Poutine passe, le prix de l’essence baisse',
      description: 'Une enquête sur les déplacements de Vladimir Poutine et le prix de l’essence.',
      articleText: 'À Iaroslavl, le prix de l’essence baisse avant la visite de Vladimir Poutine. La tendance contraste avec le reste de la Russie.',
      author: 'Marie Dupont',
    },
    proposals: [
      ['Vladimir Poutine', 'person'], ['Prix de l’essence', 'phenomenon'],
      ['Russie', 'location'], ['Marie Dupont', 'person'], ['World', 'phenomenon'],
    ],
    expected: ['Vladimir Poutine', 'Prix de l’essence', 'Russie'],
    rejected: ['Marie Dupont', 'World'],
  },
];

for (const fixture of benchmark) {
  test(`semantic benchmark: ${fixture.name}`, () => {
    const concepts = rankStoryIdentifiers({
      selected: fixture.proposals.map(([label, type]) => ({ label, type })),
      evidence: fixture.evidence,
      limit: 6,
      includeEvidenceCandidates: fixture.includeEvidenceCandidates ?? true,
    });
    const labels = concepts.map(({ label }) => label);
    fixture.expected.forEach((label) => assert.ok(labels.includes(label), `${label}: ${labels.join(', ')}`));
    (fixture.rejected || []).forEach((label) => assert.equal(labels.includes(label), false));
    (fixture.semanticExpectations || []).forEach(({ description, pattern }) => {
      assert.ok(labels.some((label) => pattern.test(label)), `${description}: ${labels.join(', ')}`);
    });
  });
}
