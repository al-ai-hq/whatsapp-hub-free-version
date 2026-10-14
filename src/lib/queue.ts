import { Queue } from "bullmq";
import { connection } from "./redis";

export interface SendJob {
  broadcastId: string;
  recipientId: string;
  to: string;
  templateName: string;
  language: string;
  bodyParams: string[];
  headerFormat?: string | null;
  headerMediaUrl?: string | null;
  couponCode?: string | null;
  carouselCards?: { format: string; mediaUrl: string }[] | null;
  ltoExpiryMs?: number | null;
}

export const SEND_QUEUE = "wa-send";

export const sendQueue = new Queue<SendJob, any, string>(SEND_QUEUE, {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
