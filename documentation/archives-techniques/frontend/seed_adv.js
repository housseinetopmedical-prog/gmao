const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = "adv@biomed.ai";
  
  // 1. Suppression si déjà existant pour éviter les doublons
  await prisma.user.deleteMany({ where: { email } });

  // 2. Création de l'utilisateur ADV
  const user = await prisma.user.create({
    data: {
      email: email,
      password: "adv123",
      name: "Responsable ADV",
      role: "ADV",
      phone: "0601020304"
    }
  });

  console.log(`Utilisateur ADV créé : ${user.email}`);

  // 3. Liaison avec la table physique 'adv'
  const advRecord = await prisma.adv.create({
    data: {
      userId: user.id,
      mission: "Gestion administrative des ventes et pilotage SAV",
      stats: JSON.stringify({
        tickets_total: 12,
        pending_reclamations: 3,
        unassigned_count: 5
      })
    }
  });

  console.log(`Table 'adv' initialisée pour l'utilisateur ID: ${user.id}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
