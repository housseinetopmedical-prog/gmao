const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    try {
        console.log("Fetching reclamations...");
        const data = await prisma.reclamation.findMany({
            include: { ticket: true }
        });
        console.log("Success! Count:", data.length);
        console.log(JSON.stringify(data[0] || {}, null, 2));
    } catch (e) {
        console.error("Prisma Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
