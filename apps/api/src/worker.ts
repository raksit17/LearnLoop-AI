import "reflect-metadata";
import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { Payload, connection, queueName } from "./ai/queue";
import { processJob } from "./process-job";
const db = new PrismaClient();
const worker = new Worker<Payload>(queueName, (job) => processJob(db, job), {
  connection,
  concurrency: 2,
  lockDuration: 120000,
});
process.on("SIGTERM", async () => {
  await worker.close();
  await db.$disconnect();
});
