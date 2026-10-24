const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addADV() {
  try {
    const adv = await prisma.user.upsert({
      where: { email: 'adv@biomed.ma' },
      update: {},
      create: {
        email: 'adv@biomed.ma',
        password: 'password123',
        name: 'Agent ADV',
        role: 'ADV'
      }
    });
    console.log('ADV User created successfully:', adv);
  } catch (err) {
    console.error('Error creating ADV user:', err);
  } finally {
    await prisma.$disconnect();
  }
}

addADV();
