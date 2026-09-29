export const getProfileFirstName = (state) => {
  if (state?.status !== 'authenticated') return null;
  const metadata = state.session?.user?.user_metadata;
  if (!metadata || typeof metadata !== 'object') return null;

  for (const key of ['first_name', 'given_name', 'preferred_name', 'full_name', 'name']) {
    const value = metadata[key];
    if (typeof value !== 'string') continue;
    const name = value.trim().split(/\s+/u)[0];
    if (name && name.length <= 80 && !name.includes('@')) return name;
  }
  return null;
};
