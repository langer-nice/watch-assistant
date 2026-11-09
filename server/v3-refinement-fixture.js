export const fixtureInstruction = 'french trains nice to monaco';

const accountId = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export const refinementFixtureEnabled = env =>
  env.VERCEL_ENV === 'preview'
  && env.VERCEL_PROJECT_ID === 'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF'
  && env.VERCEL_GIT_COMMIT_REF === 'codex/clarification-ux-flow'
  && env.V3_REFINEMENT_FIXTURE === 'true'
  && accountId.test(env.V3_REFINEMENT_FIXTURE_USER_ID || '')
  && Date.now() < Date.parse(env.V3_REFINEMENT_FIXTURE_EXPIRES_AT || '');

export async function refinementFixtureAccess(request, env, authenticate) {
  if (!refinementFixtureEnabled(env)) return false;
  try {
    // Verify the existing browser session against its Auth service only.
    const {user} = await authenticate(request, {env: {
      SUPABASE_URL: env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    }});
    return refinementFixtureEnabled(env) && user?.id === env.V3_REFINEMENT_FIXTURE_USER_ID;
  } catch {
    return false;
  }
}

const firstQuestion = 'What would you like to track?';
const fareQuestion = 'What fare changes matter to you?';
const clarify = (question, options) => ({
  status: 'NEEDS_CLARIFICATION', fixture: true,
  clarification_question: question, clarification_options: options,
});

export function refinementFixtureResponse(clarifications) {
  const fares = clarifications.some(({question,answer}) =>
    question === firstQuestion && answer.split('\n').some(part => part.trim().toLowerCase() === 'fares'));
  if (!fares) return clarify(firstQuestion, ['Fares', 'Delays & cancellations', 'Timetables', 'Service disruptions']);
  if (!clarifications.some(({question,answer}) => question === fareQuestion && answer.trim())) {
    return clarify(fareQuestion, ['Price drops', 'Price increases', 'Any fare change', 'Specific fare threshold']);
  }
  return {
    status: 'READY_TO_MONITOR', fixture: true, persisted: false,
    id: 'preview-fixture:nice-monaco-fares',
    title: 'Nice–Monaco train fares',
    summary: 'Monitor fare changes for trains between Nice and Monaco.',
  };
}
