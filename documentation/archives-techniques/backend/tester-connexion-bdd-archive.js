const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRaw`SHOW DATABASES;`;
    console.log('Successfully connected to MySQL! Available databases:');
    console.log(result);
  } catch (error) {
    console.error('Failed to connect to MySQL:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
