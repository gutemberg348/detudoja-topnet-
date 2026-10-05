// Keep account changes and logout safe even when registration is still waiting
// for a network response. Cleanup must use the original account's credentials.
export async function persistPushRegistration({ accessToken, token, platform, channels = [], storage, register, unregister, isCurrent }) {
  const cleanup = () => unregister(accessToken, token, { refreshAuth: false }).catch(() => {});
  if (!isCurrent()) return false;
  await register(accessToken, { platform, token, channels });
  if (!isCurrent()) { await cleanup(); return false; }
  try {
    const oldToken = await storage.get();
    if (!isCurrent()) { await cleanup(); return false; }
    await storage.set(token);
    if (!isCurrent()) { await cleanup(); return false; }
    if (oldToken && oldToken !== token) await unregister(accessToken, oldToken, { refreshAuth: false }).catch(() => {});
    return true;
  } catch (error) { await cleanup(); throw error; }
}

export async function withPushTimeout(operation, milliseconds = 15_000) {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Não foi possível preparar os avisos agora.")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
