import { refreshTrainCache, type CacheBucket } from "../src/lib/train-cache.ts"

type Env = {
  TRAIN_CACHE: CacheBucket
  ASSETS: { fetch(input: Request): Promise<Response> }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request)
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    console.log("refresh trains")
    await refreshTrainCache(env.TRAIN_CACHE, fetch)
    console.log("refresh trains done")
  },
}

export default worker
