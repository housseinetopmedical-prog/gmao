const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk('./src/app/api');
let fixedCount = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Pattern for { params }: { params: { ... } }
    const regex = /(export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\(\s*[a-zA-Z0-9_]+\s*:\s*(?:Request|NextRequest|any)\s*,\s*)\{?\s*params\s*\}?\s*:\s*([^)]+)\)\s*\{/g;
    
    content = content.replace(regex, (match, p1) => {
        changed = true;
        return p1 + "context: any) {\n    const params = await context.params;";
    });

    if (changed) {
        fs.writeFileSync(file, content, 'utf8');
        fixedCount++;
        console.log(`Fixed ${file}`);
    }
}

console.log(`Done. Fixed ${fixedCount} files.`);
