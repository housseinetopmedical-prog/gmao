const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = "adv@biomed.ai";
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email: email,
      password: "adv123",
      name: "Responsable ADV",
      role: "ADV",
      phone: "0601020304"
    }
  });

  console.log(`User created ID: ${user.id}`);

  // Raw query to bypass Prisma client model validation
  await prisma.$executeRaw`INSERT INTO adv (userId, mission, lastAction, createdAt, updatedAt) VALUES (${user.id}, 'Pilotage SAV', NOW(), NOW(), NOW())`;

  console.log(`Table adv populated with raw SQL.`);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
