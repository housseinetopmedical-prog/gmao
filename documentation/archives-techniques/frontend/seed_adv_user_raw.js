const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = "adv@biomed.ai";
  
  // Clean up existing test user
  await prisma.user.deleteMany({ where: { email } });

  // Use Raw SQL to insert the ADV user with all fields including mission and stats
  const stats = JSON.stringify({
    tickets_total: 12,
    pending_reclamations: 3,
    unassigned_count: 5
  });

  await prisma.$executeRaw`
    INSERT INTO user (email, password, name, role, phone, mission, stats, createdAt, updatedAt) 
    VALUES (${email}, 'adv123', 'Responsable ADV', 'ADV', '0601020304', 'Gestion administrative des ventes et pilotage SAV centralisé', ${stats}, NOW(), NOW())
  `;

  console.log(`Compte ADV créé avec succès directement dans la table 'user'.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
