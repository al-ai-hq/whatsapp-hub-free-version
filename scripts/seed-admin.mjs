import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const existing = await prisma.user.count();
if (existing === 0) {
  await prisma.user.create({
    data: {
      email: process.env.ADMIN_EMAIL,
      passwordHash: process.env.ADMIN_PASSWORD_HASH,
    },
  });
  console.log("Admin seeded:", process.env.ADMIN_EMAIL);
} else {
  console.log("Users exist, skipping seed");
}
await prisma.$disconnect();
