const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    console.log("Reset workflow test: suppression demandes intervention/tickets/historiques...");

    // Child tables first to respect FK constraints.
    await prisma.message_ticket_interne.deleteMany();
    await prisma.ticket_interne.deleteMany();
    await prisma.sav_history.deleteMany();

    // Keep stock/purchase history not linked to tickets.
    await prisma.stock_movement.deleteMany({
        where: { ticketId: { not: null } }
    });
    await prisma.purchase_item.deleteMany({
        where: { ticketId: { not: null } }
    });

    // Main business workflow tables.
    await prisma.reclamation.deleteMany();
    await prisma.ticket.deleteMany();

    // Restart numbering for fresh tests.
    await prisma.$executeRawUnsafe("ALTER TABLE tickets AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE demandes_intervention AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE historiques_sav AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE conversations_messagerie AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE messagerie AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE pieces_utilisees AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE main_oeuvre AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE mises_a_jour AUTO_INCREMENT = 1");
    await prisma.$executeRawUnsafe("ALTER TABLE nouvelles_installations AUTO_INCREMENT = 1");

    console.log("Reset termine. Le prochain ticket sera #1.");
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error("Reset workflow error:", error);
        await prisma.$disconnect();
        process.exit(1);
    });
