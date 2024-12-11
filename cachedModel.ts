import type {
  LanguageModelV1,
  Experimental_LanguageModelV1Middleware as LanguageModelV1Middleware
} from 'ai';

import { KVS } from 'sqlite-kvs';

export const db = new KVS();
await db.open('cache.sqlite');

export const getCacheMiddleware = (model: string): LanguageModelV1Middleware => (
  {
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify({...params, model });

    const cached = (await db.get(cacheKey)) as Awaited<
      ReturnType<LanguageModelV1['doGenerate']>
    > | null;

    if (cached !== null && cached !== undefined) {
      return {
        ...cached,
        response: {
          ...cached.response,
          timestamp: cached?.response?.timestamp
            ? new Date(cached?.response?.timestamp)
            : undefined,
        },
      };
    }

    const result = await doGenerate();

    await db.put(cacheKey, result as {});

    return result;
  }
});
