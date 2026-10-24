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

  console.log(`User created: ${user.id}`);

  // Create ADV record without stats first to check
  const advRecord = await prisma.adv.create({
    data: {
      userId: user.id,
      mission: "Gestion administrative des ventes"
    }
  });

  console.log(`ADV record created: ${advRecord.id}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
