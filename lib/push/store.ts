import { Redis } from "@upstash/redis";
import type { PlanState } from "@/lib/push/diff";

export type PushSubscriptionData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type Subscriber = {
  /** Derived from the endpoint, see `subscriberId`. */
  id: string;
  subscription: PushSubscriptionData;
  schoolClass: string;
  teachers: string[];
  createdAt: string;
  updatedAt: string;
  /** Last test notification (ms), to limit how often one can be sent. */
  lastTestAt?: number;
};

export interface PushStore {
  getSubscriber(id: string): Promise<Subscriber | null>;
  saveSubscriber(subscriber: Subscriber): Promise<void>;
  deleteSubscriber(id: string): Promise<void>;
  listSubscribers(): Promise<Subscriber[]>;
  countSubscribers(): Promise<number>;
  getPlanState(): Promise<PlanState | null>;
  savePlanState(state: PlanState): Promise<void>;
  /** True if the lock was free; it expires by itself after `seconds`. */
  acquireLock(name: string, seconds: number): Promise<boolean>;
  releaseLock(name: string): Promise<void>;
}

const SUBSCRIBERS_KEY = "push:subscribers";
const PLAN_KEY = "push:plan";
const LOCK_PREFIX = "push:lock:";

/** Upstash may return stored JSON already parsed. */
function parse<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

class RedisStore implements PushStore {
  constructor(private readonly redis: Redis) {}

  async getSubscriber(id: string) {
    return parse<Subscriber>(await this.redis.hget(SUBSCRIBERS_KEY, id));
  }

  async saveSubscriber(subscriber: Subscriber) {
    await this.redis.hset(SUBSCRIBERS_KEY, { [subscriber.id]: JSON.stringify(subscriber) });
  }

  async deleteSubscriber(id: string) {
    await this.redis.hdel(SUBSCRIBERS_KEY, id);
  }

  async listSubscribers() {
    const all = (await this.redis.hgetall<Record<string, unknown>>(SUBSCRIBERS_KEY)) ?? {};
    return Object.values(all)
      .map((value) => parse<Subscriber>(value))
      .filter((value): value is Subscriber => value !== null);
  }

  async countSubscribers() {
    return this.redis.hlen(SUBSCRIBERS_KEY);
  }

  async getPlanState() {
    return parse<PlanState>(await this.redis.get(PLAN_KEY));
  }

  async savePlanState(state: PlanState) {
    await this.redis.set(PLAN_KEY, JSON.stringify(state));
  }

  async acquireLock(name: string, seconds: number) {
    return (await this.redis.set(LOCK_PREFIX + name, "1", { nx: true, ex: seconds })) === "OK";
  }

  async releaseLock(name: string) {
    await this.redis.del(LOCK_PREFIX + name);
  }
}

/** Keeps everything in memory. Only for tests: serverless instances do not share memory. */
export class MemoryStore implements PushStore {
  subscribers = new Map<string, Subscriber>();
  plan: PlanState | null = null;
  locks = new Map<string, number>();

  async getSubscriber(id: string) {
    return structuredClone(this.subscribers.get(id) ?? null);
  }
  async saveSubscriber(subscriber: Subscriber) {
    this.subscribers.set(subscriber.id, structuredClone(subscriber));
  }
  async deleteSubscriber(id: string) {
    this.subscribers.delete(id);
  }
  async listSubscribers() {
    return [...this.subscribers.values()].map((value) => structuredClone(value));
  }
  async countSubscribers() {
    return this.subscribers.size;
  }
  async getPlanState() {
    return structuredClone(this.plan);
  }
  async savePlanState(state: PlanState) {
    this.plan = structuredClone(state);
  }
  async acquireLock(name: string, seconds: number) {
    const now = Date.now();
    if ((this.locks.get(name) ?? 0) > now) {
      return false;
    }
    this.locks.set(name, now + seconds * 1000);
    return true;
  }
  async releaseLock(name: string) {
    this.locks.delete(name);
  }
}

const globalStore = globalThis as typeof globalThis & { __pushMemoryStore?: MemoryStore };

/**
 * Upstash Redis, configured by the Vercel integration (KV_REST_API_* or
 * UPSTASH_REDIS_REST_*). PUSH_STORE=memory is for local tests only.
 * Null when nothing is configured: notifications are then switched off.
 */
export function getPushStore(): PushStore | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new RedisStore(new Redis({ url, token }));
  }
  if (process.env.PUSH_STORE === "memory") {
    return (globalStore.__pushMemoryStore ??= new MemoryStore());
  }
  return null;
}
