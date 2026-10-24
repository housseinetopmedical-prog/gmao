import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const lockFile = path.join(workspaceRoot, ".next", "dev", "lock");
const devArtifactsDir = path.join(workspaceRoot, ".next", "dev");
const webpackCacheDir = path.join(workspaceRoot, ".next", "cache", "webpack");
const nextCli = path.join(workspaceRoot, "node_modules", "next", "dist", "bin", "next");
const candidatePorts = [3000, 3001, 3002, 3003];
const defaultWarmupRequests = [
    { path: "/login" },
];
const fullWarmupRequests = [
    ...defaultWarmupRequests,
    { path: "/client" },
    { path: "/client/suivi" },
    { path: "/client/historique" },
    { path: "/adv/dashboard" },
    { path: "/adv/tickets-clotures" },
    { path: "/magasinier/dashboard" },
    { path: "/inventory/magasinier-reclamations" },
    { path: "/technicien/dashboard" },
    { path: "/responsable-technique/dashboard" },
    { path: "/api/reclamations?light=1" },
    { path: "/api/tickets?light=1" },
    { path: "/api/tickets/1" },
    { path: "/api/appels-offre/overview?summary=1" },
    { path: "/api/import/overview?summary=1&role=RESPONSABLE_TECHNIQUE" },
    { path: "/api/import/overview?summary=1&role=TECHNICIAN&userId=1" },
    { path: "/api/dashboard/technician?summary=1&userId=1" },
    {
        path: "/api/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "warmup@example.com", password: "warmup" })
    }
];
const healthcheckRoutes = ["/login"];
const rawCliArgs = process.argv.slice(2);
const shouldCleanDevArtifacts = process.env.NEXT_CLEAN_DEV === "1" || rawCliArgs.includes("--clean");
const shouldWarmAllRoutes = process.env.NEXT_WARM_ALL === "1" || rawCliArgs.includes("--warm-all");
const shouldWarmDefaultRoute = process.env.NEXT_WARM_DEFAULT === "1" || rawCliArgs.includes("--warm");
const shouldSkipWarmup =
    process.env.NEXT_SKIP_WARMUP === "1" || rawCliArgs.includes("--skip-warmup") || (!shouldWarmAllRoutes && !shouldWarmDefaultRoute);

async function isHealthyFrontend(port) {
    for (const route of healthcheckRoutes) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}${route}`, {
                signal: AbortSignal.timeout(2000),
            });

            if (!response.ok) {
                return false;
            }
        } catch {
            return false;
        }
    }

    return true;
}

async function findRunningFrontendUrl() {
    for (const port of candidatePorts) {
        if (await isHealthyFrontend(port)) {
            return `http://localhost:${port}`;
        }
    }

    return null;
}

async function waitForFrontendBaseUrl(preferredPort) {
    const portsToTry = [preferredPort, ...candidatePorts].filter(
        (port, index, ports) => Number.isFinite(port) && ports.indexOf(port) === index
    );

    for (let attempt = 0; attempt < 60; attempt += 1) {
        for (const port of portsToTry) {
            if (await isHealthyFrontend(port)) {
                return `http://127.0.0.1:${port}`;
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return null;
}

async function warmRoutes(preferredPort) {
    if (shouldSkipWarmup) {
        console.log("Warmup ignore via NEXT_SKIP_WARMUP=1.");
        return;
    }

    const baseUrl = await waitForFrontendBaseUrl(preferredPort);

    if (!baseUrl) {
        console.warn("Warmup annule: frontend indisponible.");
        return;
    }

    const warmupRequests = shouldWarmAllRoutes ? fullWarmupRequests : defaultWarmupRequests;

    for (const request of warmupRequests) {
        try {
            const response = await fetch(`${baseUrl}${request.path}`, {
                method: request.method || "GET",
                headers: request.headers,
                body: request.body,
                signal: AbortSignal.timeout(120000),
            });
            console.log(`Warmup ${request.path}: ${response.status}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Warmup ${request.path} ignore: ${message}`);
        }
    }
}

async function main() {
    const runningFrontendUrl = await findRunningFrontendUrl();

    if (runningFrontendUrl) {
        console.log(`Frontend deja actif sur ${runningFrontendUrl}`);
        return;
    }

    if (existsSync(lockFile)) {
        rmSync(lockFile, { force: true });
        console.log("Verrou Next.js stale supprime.");
    }

    if (shouldCleanDevArtifacts && existsSync(devArtifactsDir)) {
        rmSync(devArtifactsDir, { recursive: true, force: true });
        console.log("Artefacts .next/dev nettoyes via NEXT_CLEAN_DEV=1.");
    }

    const useWebpack = rawCliArgs.includes("--webpack");

    if (useWebpack && existsSync(webpackCacheDir)) {
        rmSync(webpackCacheDir, { recursive: true, force: true });
        console.log("Cache webpack dev nettoye.");
    }

    const forwardedArgs = rawCliArgs.filter(
        (arg) => !["--turbo", "--turbopack", "--webpack", "--skip-warmup", "--warm", "--warm-all", "--clean"].includes(arg)
    );
    const bundlerFlag = useWebpack ? "--webpack" : "--turbopack";

    const child = spawn(process.execPath, [nextCli, "dev", bundlerFlag, ...forwardedArgs], {
        stdio: "inherit",
        shell: false,
        env: {
            ...process.env,
            NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || "1",
        },
    });

    const requestedPortArg = forwardedArgs.find((arg) => /^--port=/.test(arg));
    const forwardedPortValue = requestedPortArg ? Number(requestedPortArg.split("=")[1]) : null;
    const forwardedPortIndex = forwardedArgs.indexOf("--port");
    const positionalPortValue =
        forwardedPortIndex >= 0 ? Number(forwardedArgs[forwardedPortIndex + 1]) : null;
    const preferredPort = Number.isFinite(forwardedPortValue)
        ? forwardedPortValue
        : Number.isFinite(positionalPortValue)
          ? positionalPortValue
          : 3000;

    void warmRoutes(preferredPort);

    child.on("exit", (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }

        process.exitCode = code ?? 0;
    });
}

await main();
