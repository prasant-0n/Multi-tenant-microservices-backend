import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const REDIS_URL_DEFAULT = 'redis://localhost:6379';

type Handler<T = unknown> = (payload: T) => void | Promise<void>;

interface ChannelState {
  handlers: Set<Handler>;
  unsubscribeFromRedis: () => void;
}

@Injectable()
export class RedisEventBus implements OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBus.name);
  private readonly url = process.env.REDIS_URL ?? REDIS_URL_DEFAULT;
  private publisher?: Redis;
  private subscriber?: Redis;
  private readonly channels = new Map<string, ChannelState>();

  private getPub(): Redis {
    if (!this.publisher) {
      this.publisher = new Redis(this.url);
      this.publisher.on('error', (err) =>
        this.logger.error(`redis publisher error: ${err.message}`),
      );
    }
    return this.publisher;
  }

  private getSub(): Redis {
    if (!this.subscriber) {
      this.subscriber = new Redis(this.url);
      this.subscriber.on('error', (err) =>
        this.logger.error(`redis subscriber error: ${err.message}`),
      );
    }
    return this.subscriber;
  }

  async publish<T>(channel: string, payload: T): Promise<void> {
    try {
      await this.getPub().publish(channel, JSON.stringify(payload));
    } catch (err) {
      this.logger.warn(`failed to publish to "${channel}": ${(err as Error).message}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.getPub().ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  subscribe<T>(channel: string, handler: Handler<T>): { unsubscribe: () => void } {
    let state = this.channels.get(channel);

    if (!state) {
      const sub = this.getSub();
      const listener = (received: string, message: string) => {
        if (received !== channel) return;
        let payload: unknown = message;
        try {
          payload = JSON.parse(message);
        } catch {
          /* raw messages pass through as-is */
        }
        for (const entry of state?.handlers ?? new Set<Handler>()) {
          Promise.resolve(entry(payload)).catch((err) =>
            this.logger.error(`handler error for "${channel}": ${err.message}`),
          );
        }
      };

      sub.subscribe(channel);
      sub.on('message', listener);

      state = {
        handlers: new Set(),
        unsubscribeFromRedis: () => {
          sub.unsubscribe(channel);
          sub.off('message', listener);
        },
      };
      this.channels.set(channel, state);
    }

    state.handlers.add(handler as Handler);

    return {
      unsubscribe: () => {
        state?.handlers.delete(handler as Handler);
        if (state && state.handlers.size === 0) {
          state.unsubscribeFromRedis();
          this.channels.delete(channel);
        }
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.channels.clear();
    const clients = [this.publisher, this.subscriber].filter((client): client is Redis => !!client);
    await Promise.allSettled(clients.map((client) => client.quit()));
  }
}
