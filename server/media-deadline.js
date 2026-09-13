export const withinMediaDeadline = async (operation, deadline, maxMs = 8000) => {
  const remaining = Math.min(maxMs, deadline - Date.now());
  if (remaining <= 0) throw Object.assign(new Error('Media operation deadline reached.'), { code: 'MEDIA_DEADLINE_EXCEEDED' });
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Media operation deadline reached.'), { code: 'MEDIA_DEADLINE_EXCEEDED' })), remaining); }),
    ]);
  } finally { clearTimeout(timer); }
};
