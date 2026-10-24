const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = "adv@biomed.ai";
  
  // 1. Nettoyage
  await prisma.user.deleteMany({ where: { email } });

  // 2. Création de l'utilisateur ADV avec ses données de pilotage intégrées
  const user = await prisma.user.create({
    data: {
      email: email,
      password: "adv123",
      name: "Responsable ADV",
      role: "ADV",
      phone: "0601020304",
      mission: "Gestion administrative des ventes et pilotage SAV centralisé",
      stats: JSON.stringify({
        tickets_total: 12,
        pending_reclamations: 3,
        unassigned_count: 5
      })
    }
  });

  console.log(`Compte ADV créé avec succès (ID: ${user.id}).`);
  console.log(`Données de mission et stats intégrées directement dans la table 'user'.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
