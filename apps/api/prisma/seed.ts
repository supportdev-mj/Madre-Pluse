import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed data is added incrementally as each vertical slice introduces new
  // entities (see docs/MANAGEMENT.md). Slice 0 has nothing to seed yet.
  console.log('Nothing to seed yet — schema only has Organization/User/Membership.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
