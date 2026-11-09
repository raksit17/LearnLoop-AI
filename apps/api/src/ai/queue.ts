export const queueName = "learnloop-ai-v1";
export const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};
export interface Payload {
  userId: string;
  resourceId: string;
  section: number;
  minutes: number;
  word?: string;
}
