export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
}

export function parseRedisConnection(url: string): RedisConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}
