import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV !== "production";
const devIgnored = [
    "**/.git/**",
    "**/.agents/**",
    "**/.codex/**",
    "**/.next/**",
    "**/node_modules/**",
    "**/coverage/**",
    "**/dist/**",
    "**/public/uploads/**",
    "../backend/**",
    "../database/**",
    "../*.sql"
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    compress: true,
    devIndicators: false,
    async headers() {
        const securityHeaders = [
            {
                key: "Content-Security-Policy",
                value: [
                    "default-src 'self'",
                    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob:",
                    "font-src 'self' data:",
                    "media-src 'self' data: blob:",
                    "connect-src 'self'",
                    "object-src 'none'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "frame-ancestors 'self'"
                ].join("; ")
            },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ];

        return [
            {
                source: "/(.*)",
                headers: securityHeaders
            }
        ];
    },
    // Avoid wrong workspace root inference when several lockfiles exist in parent folders.
    turbopack: {
        root: __dirname,
    },
    experimental: {
        optimizePackageImports: ["lucide-react", "recharts"],
    },
    onDemandEntries: {
        // Keep frequently used routes compiled longer to avoid repeated "Compiling..." on navigation.
        maxInactiveAge: 25 * 60 * 1000,
        pagesBufferLength: 40,
    },
    webpack: (config, { dev }) => {
        if (dev) {
            // Avoid corrupted persistent cache packs causing multi-minute recompiles in dev.
            config.cache = {
                type: "memory",
            };
            config.watchOptions = {
                ...(config.watchOptions || {}),
                // Keep only valid string globs to avoid webpack schema errors.
                ignored: devIgnored,
            };
        }
        return config;
    },
};

export default nextConfig;
