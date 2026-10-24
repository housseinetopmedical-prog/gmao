import prisma from "@/metier/base-donnees";

const AUTO_INCREMENT_TABLES = new Set([
    "tickets",
    "demandes_intervention"
]);

const KNOWN_SCHEMA_STATEMENTS = new Set([
    "ALTER TABLE `tickets` ADD COLUMN `aiSummary` TEXT NULL",
    "ALTER TABLE `tickets` ADD COLUMN `aiUrgency` VARCHAR(20) NULL",
    "ALTER TABLE `tickets` ADD COLUMN `aiProbableCauses` LONGTEXT NULL",
    "ALTER TABLE `tickets` ADD COLUMN `aiSuggestedParts` LONGTEXT NULL",
    "ALTER TABLE `tickets` ADD COLUMN `aiChecklist` LONGTEXT NULL"
]);

export async function resetAutoIncrementForKnownTable(tableName: string) {
    if (!AUTO_INCREMENT_TABLES.has(tableName)) {
        throw new Error("Table non autorisee pour la reinitialisation SQL.");
    }

    await prisma.$executeRawUnsafe(`ALTER TABLE ${tableName} AUTO_INCREMENT = 1`);
}

export async function executeKnownSchemaStatement(statement: string) {
    if (!KNOWN_SCHEMA_STATEMENTS.has(statement)) {
        throw new Error("Instruction SQL non autorisee.");
    }

    await prisma.$executeRawUnsafe(statement);
}
