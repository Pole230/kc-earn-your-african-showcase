// Queue abstraction for video processing
// Provides two implementations:
// - PollingQueue: default implementation that polls the DB for videos with status='processing'
// - RedisQueue: scaffolding for a Redis/BullMQ-backed queue (disabled if REDIS_URL not provided)

import type { SupabaseClient } from '@supabase/supabase-js';
import { processVideoWithClient } from './worker';

export type Queue = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  enqueue: (videoId: string) => Promise<void>;
};

export class PollingQueue implements Queue {
  private supabase: SupabaseClient;
  private running = false;
  private intervalMs: number;

  constructor(supabase: SupabaseClient, intervalMs = 5000) {
    this.supabase = supabase;
    this.intervalMs = intervalMs;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.loop();
  }

  async stop() {
    this.running = false;
  }

  async enqueue(_videoId: string) {
    // Polling queue doesn't need to do anything to enqueue; it will pick up rows from DB
    return;
  }

  private async loop() {
    while (this.running) {
      try {
        const { data: rows, error } = await this.supabase
          .from('videos')
          .select('id')
          .eq('status', 'processing')
          .limit(5)
          .order('created_at', { ascending: true });

        if (error) {
          // log and continue
          // eslint-disable-next-line no-console
          console.error('PollingQueue: failed to fetch processing videos', error);
        } else if (rows && rows.length > 0) {
          for (const r of rows) {
            // @ts-ignore - assume id exists
            try {
              await processVideoWithClient(this.supabase as any, r.id as string);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error(`PollingQueue: failed to process ${r.id}`, err);
            }
            await new Promise((res) => setTimeout(res, 600));
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('PollingQueue loop error', err);
      }

      await new Promise((res) => setTimeout(res, this.intervalMs));
    }
  }
}

// RedisQueue scaffold - not implemented fully here, provided as a placeholder for production
export class RedisQueue implements Queue {
  constructor(_redisUrl?: string) {
    // TODO: Implement Redis-backed queue using BullMQ or similar
    // This is intentionally left as a scaffold: the project does not require Redis to run.
  }
  async start() {
    // TODO: connect to Redis and start processing
  }
  async stop() {
    // TODO: stop worker
  }
  async enqueue(videoId: string) {
    // TODO: push job to Redis queue
    // eslint-disable-next-line no-console
    console.log('RedisQueue.enqueue (scaffold) ', videoId);
  }
}
