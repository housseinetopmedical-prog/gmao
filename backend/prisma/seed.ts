import { PrismaClient, Role, EquipmentStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding database...')

    // Create an Admin user
    const admin = await prisma.user.upsert({
        where: { email: 'admin@gmail.com' },
        update: {},
        create: {
            email: 'admin@gmail.com',
            password: 'Topmedicalsav',
            name: 'Dr. Admin',
            role: Role.ADMIN,
        },
    })

    // Create some equipment
    const scanner = await prisma.equipment.upsert({
        where: { serialNumber: 'SN-SCAN-001' },
        update: {},
        create: {
            name: 'Scanner CT 64',
            type: 'Imagerie',
            brand: 'Siemens',
            model: 'Somatom',
            serialNumber: 'SN-SCAN-001',
            location: 'Radiologie RDC',
            status: EquipmentStatus.OPERATIONAL,
        },
    })

    console.log({ admin, scanner })
    console.log('Seeding finished successfully.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
