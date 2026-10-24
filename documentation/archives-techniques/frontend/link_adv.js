const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const advUser = await prisma.user.findFirst({
    where: { role: 'ADV' }
  });

  if (advUser) {
    console.log(`Found ADV user: ${advUser.email}`);
    const exists = await prisma.adv.findUnique({
      where: { userId: advUser.id }
    });
    if (!exists) {
      await prisma.adv.create({
        data: {
          userId: advUser.id,
          mission: "Pilotage centralisé du SAV",
          stats: { tickets_total: 0, pending: 0 }
        }
      });
      console.log("Linked ADV user to new 'adv' table.");
    }
  } else {
    console.log("No ADV user found. Please create one to use the table.");
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
