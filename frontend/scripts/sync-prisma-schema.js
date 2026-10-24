const fs = require("fs");
const path = require("path");

const source = path.resolve(__dirname, "../../backend/prisma/schema.prisma");
const targetDir = path.resolve(__dirname, "../prisma");
const target = path.resolve(targetDir, "schema.prisma");

if (!fs.existsSync(source)) {
    console.error(`Schema source introuvable: ${source}`);
    process.exit(1);
}

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

const schemaContent = fs.readFileSync(source, "utf8");
fs.writeFileSync(target, schemaContent, "utf8");

console.log(`Schema Prisma synchronise: ${source} -> ${target}`);
