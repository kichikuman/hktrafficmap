import { refreshTrainCache, type CacheBucket } from "../src/lib/train-cache.ts"

type Env = {
  TRAIN_CACHE: CacheBucket
}

const worker = {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await refreshTrainCache(env.TRAIN_CACHE, fetch)
  },
}

export default worker
