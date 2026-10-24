const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

function applyEnvContent(content, override = false) {
    const lines = String(content || "").split(/\r?\n/);
    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const index = trimmed.indexOf("=");
        if (index <= 0) return;

        const key = trimmed.slice(0, index).trim();
        if (!key) return;
        if (!override && process.env[key] !== undefined) return;

        let value = trimmed.slice(index + 1).trim();
        if (
            (value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    });
}

function loadEnvFiles() {
    const backendRoot = path.resolve(__dirname, "..");
    const candidates = [
        { file: path.join(backendRoot, ".env"), override: false },
        { file: path.join(backendRoot, ".env.local"), override: true }
    ];
    candidates.forEach(({ file, override }) => {
        if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, "utf8");
            applyEnvContent(content, override);
        }
    });
}

function extractMappedTables(schemaContent) {
    const tables = [];
    const regex = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;

    for (const match of schemaContent.matchAll(regex)) {
        const modelName = match[1];
        const body = match[2] || "";
        const mapMatch = body.match(/@@map\("([^"]+)"\)/);
        tables.push(mapMatch ? mapMatch[1] : modelName);
    }

    return orderTablesByPlatform(Array.from(new Set(tables)));
}

const PLATFORM_TABLE_GROUPS = [
    {
        title: "Espace admin, postes et clients",
        tables: ["utilisateurs"]
    },
    {
        title: "Materiels et documents",
        tables: ["materiels", "marches", "historique_marches", "documents_materiels"]
    },
    {
        title: "Tickets et demandes d'intervention",
        tables: ["demandes_intervention", "tickets", "historiques_sav"]
    },
    {
        title: "Maintenance et visites",
        tables: ["maintenances"]
    },
    {
        title: "Pieces, stock et import",
        tables: [
            "pieces_utilisees",
            "pieces_importees",
            "details_pieces_importees",
            "pieces_locales",
            "mouvements_pieces_locales",
            "main_oeuvre",
            "mises_a_jour",
            "nouvelles_installations"
        ]
    },
    {
        title: "Messagerie interne",
        tables: ["conversations_messagerie", "messagerie", "messagerie_fournisseur"]
    }
];

function orderTablesByPlatform(tables) {
    const remaining = new Set(tables);
    const ordered = [];

    for (const group of PLATFORM_TABLE_GROUPS) {
        for (const table of group.tables) {
            if (remaining.has(table)) {
                ordered.push(table);
                remaining.delete(table);
            }
        }
    }

    return [...ordered, ...Array.from(remaining).sort((a, b) => a.localeCompare(b))];
}

function formatTableGroups(tables) {
    const available = new Set(tables);
    const lines = [];

    for (const group of PLATFORM_TABLE_GROUPS) {
        const groupTables = group.tables.filter((table) => available.has(table));
        if (groupTables.length > 0) {
            lines.push(`-- ${group.title}: ${groupTables.join(", ")}`);
        }
    }

    const groupedTables = new Set(PLATFORM_TABLE_GROUPS.flatMap((group) => group.tables));
    const otherTables = tables.filter((table) => !groupedTables.has(table));
    if (otherTables.length > 0) {
        lines.push(`-- Autres tables techniques utiles: ${otherTables.join(", ")}`);
    }

    return lines;
}

function getConnectionFromDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL introuvable dans .env/.env.local");
    }

    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "mysql:") {
        throw new Error("Seule une base MySQL est supportee pour l'export SQL.");
    }

    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!database) {
        throw new Error("Nom de base absent dans DATABASE_URL.");
    }

    return {
        host: parsed.hostname || "127.0.0.1",
        port: parsed.port || "3306",
        user: decodeURIComponent(parsed.username || ""),
        password: decodeURIComponent(parsed.password || ""),
        database
    };
}

function resolveMysqldumpCandidates() {
    const explicit = process.env.MYSQLDUMP_PATH ? [process.env.MYSQLDUMP_PATH] : [];
    const defaults = [
        "mysqldump",
        "C:\\xampp\\mysql\\bin\\mysqldump.exe",
        "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe"
    ];
    return Array.from(new Set([...explicit, ...defaults]));
}

function runMysqldump(binary, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, { windowsHide: true });
        const stdout = [];
        const stderr = [];

        child.stdout.on("data", (chunk) => stdout.push(chunk));
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.on("error", (error) => reject(error));
        child.on("close", (code) => {
            if (code === 0) {
                resolve(Buffer.concat(stdout));
                return;
            }

            const errorText = Buffer.concat(stderr).toString("utf8").trim();
            reject(new Error(`mysqldump a echoue (${binary}) code ${code}${errorText ? `: ${errorText}` : ""}`));
        });
    });
}

async function dumpWithFallback(args) {
    const candidates = resolveMysqldumpCandidates();
    const errors = [];

    for (const candidate of candidates) {
        try {
            // Ignore les executables explicites introuvables.
            if ((candidate.includes("\\") || candidate.includes("/")) && !fs.existsSync(candidate)) {
                continue;
            }

            return await runMysqldump(candidate, args);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    throw new Error(
        `Impossible d'executer mysqldump. Verifiez MYSQLDUMP_PATH ou l'installation MySQL.\n${errors.join("\n")}`
    );
}

async function writeDumpTargets(content) {
    const databaseSqlFile = path.resolve(__dirname, "..", "..", "database", "gmao_biomed.sql");
    const targets = [databaseSqlFile];

    for (const target of targets) {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, content, "utf8");
    }

    return targets;
}

async function main() {
    loadEnvFiles();

    const schemaPath = path.resolve(__dirname, "schema.prisma");
    const schemaContent = await fsp.readFile(schemaPath, "utf8");
    const tables = extractMappedTables(schemaContent);
    if (tables.length === 0) {
        throw new Error("Aucune table detectee dans schema.prisma");
    }

    const connection = getConnectionFromDatabaseUrl();
    const dumpArgs = [
        `--host=${connection.host}`,
        `--port=${connection.port}`,
        `--user=${connection.user}`,
        `--default-character-set=utf8mb4`,
        "--single-transaction",
        "--skip-lock-tables",
        "--routines",
        "--triggers",
        connection.database,
        ...tables
    ];

    if (connection.password) {
        dumpArgs.splice(3, 0, `--password=${connection.password}`);
    }

    const dumpBuffer = await dumpWithFallback(dumpArgs);

    const generatedAt = new Date().toISOString();
    const header = [
        "-- Export automatique GMAO Biomedicale",
        `-- Date generation: ${generatedAt}`,
        `-- Base: ${connection.database}`,
        `-- Tables utiles de la plateforme (${tables.length}), organisees par titres metier:`,
        ...formatTableGroups(tables),
        "-- Tables ignorees car inutiles/anciennes: message, equipements, documents_equipements, reclamations, interventions, bons_achat, lignes_bons_achat, pieces_detachees, mouvements_stock, tickets_internes, messages_tickets_internes",
        "",
        "SET NAMES utf8mb4;",
        ""
    ].join("\n");

    const finalContent = `${header}\n${dumpBuffer.toString("utf8")}`;
    const targets = await writeDumpTargets(finalContent);

    console.log("Export SQL termine.");
    targets.forEach((target) => console.log(`- ${target}`));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
