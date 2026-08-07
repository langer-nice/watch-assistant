import assert from 'node:assert/strict';
import test from 'node:test';
import { rankStoryIdentifiers } from './story-identifier-ranking.js';

const benchmark = [
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
      ['Ultra-processed foods', 'phenomenon'], ['Nutrition', 'phenomenon'],
      ['Dietary advice', 'phenomenon'], ['Healthy eating', 'phenomenon'],
      ['Health', 'phenomenon'], ['Six easy swaps', 'event'],
    ],
    expected: ['Ultra-processed foods', 'Nutrition', 'Dietary advice'],
    rejected: ['Health', 'Six easy swaps'],
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
    });
    const labels = concepts.map(({ label }) => label);
    fixture.expected.forEach((label) => assert.ok(labels.includes(label), `${label}: ${labels.join(', ')}`));
    (fixture.rejected || []).forEach((label) => assert.equal(labels.includes(label), false));
  });
}
