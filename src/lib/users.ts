import { prisma } from "./db";
import { type AccessClaims } from "./auth";
import bcrypt from "bcryptjs";

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, tokenVersion: user.tokenVersion };
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
}

export async function changePassword(userId: string, newPassword: string) {
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash, tokenVersion: { increment: 1 } },
  });
}

export async function getAccessContext(claims: AccessClaims) {
  const user = await prisma.user.findUnique({ where: { email: claims.sub } });
  if (!user) return null;
  return { email: user.email, id: user.id };
}
