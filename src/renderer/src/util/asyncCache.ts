/** Keep only the current key, share concurrent work, and allow failed requests to retry. */
export default function createAsyncCache<T>(load: () => Promise<T>, maxAgeMs = Infinity) {
  let cached: { key: string, promise: Promise<T>, expiresAt: number } | undefined;
  return (key: string) => {
    if (cached?.key === key && Date.now() < cached.expiresAt) return cached.promise;
    const promise = load().catch((error: unknown) => {
      if (cached?.promise === promise) cached = undefined;
      throw error;
    });
    cached = { key, promise, expiresAt: Date.now() + maxAgeMs };
    return promise;
  };
}
