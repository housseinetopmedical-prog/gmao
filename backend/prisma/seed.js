const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    console.log('Début du seeding (Données Magasinier & Stock)...')

    // --- USERS ---
    const users = [
        { email: 'admin@gmail.com', name: 'Ziad Moussi', role: 'ADMIN', password: 'Topmedicalsav' },
        { email: 'sami@biomed.ma', name: 'Sami Tech', role: 'TECHNICIAN', password: 'Topmedicalsav' },
        { email: 'magasin@biomed.ma', name: 'Hamza Stock', role: 'MAGASINIER', password: 'Topmedicalsav' },
        { email: 'responsable.technique@biomed.ma', name: 'Responsable Technique', role: 'RESPONSABLE_TECHNIQUE', password: 'Topmedicalsav' },
        { email: 'facturation@biomed.ma', name: 'Responsable Facturation', role: 'RESPONSABLE_FACTURATION', password: 'Topmedicalsav' },
        { email: 'appels.offre@biomed.ma', name: "Responsable Appels d'Offre", role: 'RESPONSABLE_APPELS_OFFRE', password: 'Topmedicalsav' },
        { email: 'import@biomed.ma', name: 'Responsable Import', role: 'IMPORT', password: 'Topmedicalsav' },
        { email: 'contact@clinique-maamora.ma', name: 'Directeur Clinique Maamora', role: 'CLIENT', password: 'Topmedicalsav' },
        { email: 'contact@hopital-rabat.ma', name: 'Contact Hopital Rabat', role: 'CLIENT', password: 'Topmedicalsav' },
        { email: 'maintenance@clinique-atlas.ma', name: 'Service Maintenance Clinique Atlas', role: 'CLIENT', password: 'Topmedicalsav' },
    ]

    for (const u of users) {
        await prisma.user.upsert({
            where: { email: u.email },
            update: {
                role: u.role,
                name: u.name,
                password: u.password
            },
            create: u
        })
    }

    const magasinierUser = await prisma.user.findUnique({ where: { email: 'magasin@biomed.ma' } })
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@gmail.com' } })

    // --- EQUIPMENTS ---
    const equipments = [
        {
            name: 'Scanner CT Revolution Maxima',
            brand: 'GE',
            model: 'Optima 660',
            serialNumber: 'SN-GE-KN-220',
            type: 'Imagerie',
            client: 'Clinique Maamora Kenitra',
            location: 'Kenitra, Avenue Mohammed V',
            status: 'OPERATIONAL',
        }
    ]

    for (const e of equipments) {
        await prisma.equipment.upsert({
            where: { serialNumber: e.serialNumber },
            update: {},
            create: e
        })
    }

    const scanner = await prisma.equipment.findUnique({ where: { serialNumber: 'SN-GE-KN-220' } })

    // --- PARTS ---
    const parts = [
        { name: 'Tube Rayons X Optima', reference: 'TUB-GE-001', compatibleModels: 'Optima 660, Revolution', quantityInStock: 0, minStock: 1, price: 15000 },
        { name: 'Batterie LifePak 15', reference: 'BATT-LP-15', compatibleModels: 'LifePak 15, LifePak 12', quantityInStock: 2, minStock: 5, price: 450 },
        { name: 'Capteur O2 Médical', reference: 'O2-CELL-08', compatibleModels: 'Dräger Primus, Apollo', quantityInStock: 12, minStock: 3, price: 120 },
    ]

    for (const p of parts) {
        const createdPart = await prisma.part.upsert({
            where: { reference: p.reference },
            update: {
                quantityInStock: p.quantityInStock,
                minStock: p.minStock
            },
            create: p
        })

        // Add an initial movement for tracking
        if (p.quantityInStock > 0 && magasinierUser) {
            await prisma.stock_movement.create({
                data: {
                    partId: createdPart.id,
                    type: 'RECEPTION',
                    qty: p.quantityInStock,
                    ref: 'STOCK_INITIAL',
                    userId: magasinierUser.id
                }
            })
        }
    }

    // --- TICKETS (Pending Parts) ---
    if (scanner && adminUser) {
        // Check if ticket already exists to avoid duplicates if possible, or just create
        const existingTicket = await prisma.ticket.findFirst({
            where: { title: 'Tube RX défectueux' }
        });

        if (!existingTicket) {
            await prisma.ticket.create({
                data: {
                    title: 'Tube RX défectueux',
                    description: 'Le tube à rayons X est en fin de vie. Remplacement urgent nécessaire.',
                    status: 'PENDING_PARTS',
                    priority: 'CRITICAL',
                    equipmentId: scanner.id,
                    creatorId: adminUser.id,
                }
            })
        }
    }

    // --- PURCHASE ORDERS ---
    if (magasinierUser) {
        const existingPO = await prisma.purchase_order.findFirst({
            where: { ref: 'PO-2024-001' }
        });

        if (!existingPO) {
            await prisma.purchase_order.create({
                data: {
                    ref: 'PO-2024-001',
                    supplier: 'GE Healthcare Morocco',
                    status: 'DEMAND',
                    totalAmount: 15000,
                    creatorId: magasinierUser.id,
                    notes: 'Demande urgente de tube CT'
                }
            })
        }
    }

    console.log('Seeding terminé avec succès !')
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
