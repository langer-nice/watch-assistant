// Register cleanup as soon as a fixture is acquired, including before setup SQL.
export const testResources = (context) => {
  const releases = [];
  const dispose = async () => {
    const errors = [];
    while (releases.length) {
      try { await releases.pop()(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Test fixture cleanup failed');
  };
  context.after(dispose);
  return { defer: release => releases.push(release), dispose };
};
