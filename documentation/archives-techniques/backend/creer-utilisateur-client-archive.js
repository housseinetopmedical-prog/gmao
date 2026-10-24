const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    await prisma.user.upsert({
        where: { email: 'client@clinique.ma' },
        update: {},
        create: {
            email: 'client@clinique.ma',
            password: 'password123',
            name: 'Clinique Al Azhar',
            role: 'CLIENT'
        }
    })
    console.log('Client user created: client@clinique.ma / password123')
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
