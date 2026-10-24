import { PrismaClient } from "@prisma/client"

// Cette fonction crée une connexion Prisma vers la base de données.
const prismaClientSingleton = () => {
    return new PrismaClient()
}

// En développement, on garde une seule instance globale
// pour éviter de recréer trop de connexions à chaque rechargement.
declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma

/* Résumé simple :
   Ce fichier prépare l'accès à la base de données.
   Il crée un client Prisma réutilisable
   pour que toute l'application parle à la base de façon stable. */
