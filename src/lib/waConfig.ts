import { prisma } from "./db";
import { env } from "./env";

export interface WaConfig {
  phoneNumberId: string;
  businessAccountId: string;
  appId: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
}

export async function getWaConfig(): Promise<WaConfig> {
  const row = await prisma.whatsAppConfig.findUnique({ where: { id: "default" } }).catch(() => null);
  return {
    phoneNumberId: row?.phoneNumberId || env.WA_PHONE_NUMBER_ID,
    businessAccountId: row?.businessAccountId || env.WA_BUSINESS_ACCOUNT_ID,
    appId: row?.appId || env.WA_APP_ID,
    accessToken: row?.accessToken || env.WA_ACCESS_TOKEN,
    appSecret: row?.appSecret || env.META_APP_SECRET,
    webhookVerifyToken: row?.webhookVerifyToken || env.WA_WEBHOOK_VERIFY_TOKEN,
    graphApiVersion: row?.graphApiVersion || env.GRAPH_API_VERSION,
  };
}

export async function saveWaConfig(
  patch: Partial<Record<keyof WaConfig, string | undefined>>,
): Promise<void> {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string" && v.trim()) data[k] = v.trim();
  }
  await prisma.whatsAppConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
}

export async function getWaConfigStatus(): Promise<{
  phoneNumberId: string;
  businessAccountId: string;
  appId: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  savedAt: string | null;
}> {
  const row = await prisma.whatsAppConfig.findUnique({ where: { id: "default" } }).catch(() => null);
  const cfg = await getWaConfig();
  return {
    phoneNumberId: row?.phoneNumberId ?? "",
    businessAccountId: row?.businessAccountId ?? "",
    appId: row?.appId ?? "",
    webhookVerifyToken: row?.webhookVerifyToken ?? "",
    graphApiVersion: row?.graphApiVersion || env.GRAPH_API_VERSION,
    hasAccessToken: Boolean(cfg.accessToken),
    hasAppSecret: Boolean(cfg.appSecret),
    savedAt: row?.updatedAt.toISOString() ?? null,
  };
}
