"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { parseChecklistPayload } from "@/metier/workflow-client";

type HistoryEntry = {
    id: number;
    action: string;
    note?: string | null;
    createdAt: string;
    user?: {
        name?: string | null;
    } | null;
};

type TicketDetail = {
    id: number;
    title: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
    description?: string | null;
    diagnosis?: string | null;
    solution?: string | null;
    actualDuration?: number | null;
    isUnderWarranty?: boolean | null;
    interventionType?: string | null;
    equipment?: {
        name?: string | null;
        brand?: string | null;
        model?: string | null;
        serialNumber?: string | null;
        client?: string | null;
        location?: string | null;
        service?: string | null;
    } | null;
    reclamation?: {
        customerName?: string | null;
        deviceModel?: string | null;
        serialNumber?: string | null;
        description?: string | null;
        checklist?: string | null;
    } | null;
    assignedTo?: {
        name?: string | null;
    } | null;
    savHistory?: HistoryEntry[];
};

type ReportPayload = {
    reportNumber: string;
    summary: string;
    pdfUrl: string | null;
    generatedAt: string;
    generatedBy: string;
    reportData: Record<string, string>;
};

type ReportSection = {
    title: string;
    rows: Array<{ label: string; value: string }>;
};

function clean(value: unknown) {
    const raw = String(value ?? "").trim();
    if (!raw || raw.toLowerCase() === "invalid date") return "-";
    return raw;
}

function extractFirstUrl(raw: string): string | null {
    const match = raw.match(/(https?:\/\/[^\s]+|\/uploads\/[^\s]+)/i);
    if (!match || !match[1]) return null;
    return match[1].replace(/[),.;]+$/g, "");
}

function parseSummaryLines(summary: string): Record<string, string> {
    const map: Record<string, string> = {};
    const raw = String(summary || "").trim();
    if (!raw) return map;

    raw.split("\n").forEach((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex < 0) return;
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (!key) return;
        map[key] = value;
    });

    return map;
}

function parseInterventionLogNote(note: string | null | undefined): Record<string, string> {
    if (!note) return {};
    const raw = String(note).trim();
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            const payload = parsed as Record<string, unknown>;
            const source = typeof payload.summary === "string" ? payload.summary : typeof payload.message === "string" ? payload.message : "";
            if (source) return parseSummaryLines(source);

            const map: Record<string, string> = {};
            if (typeof payload.startTime === "string") map["Debut"] = payload.startTime;
            if (typeof payload.endTime === "string") map["Fin"] = payload.endTime;
            if (typeof payload.interventionDate === "string") map["Date intervention"] = payload.interventionDate;
            return map;
        }
    } catch {
        // legacy plain text support
    }

    return parseSummaryLines(raw);
}

function parseReportDataObject(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") return {};
    const objectValue = value as Record<string, unknown>;
    const parsed: Record<string, string> = {};

    Object.entries(objectValue).forEach(([key, entryValue]) => {
        if (entryValue === null || entryValue === undefined) return;
        parsed[key] = clean(String(entryValue));
    });

    return parsed;
}

function parseTechnicalReportNote(note: string | null | undefined): { summary: string; pdfUrl: string | null; reportNumber: string; reportData: Record<string, string> } {
    if (!note) {
        return { summary: "", pdfUrl: null, reportNumber: "", reportData: {} };
    }

    const raw = String(note).trim();
    if (!raw) {
        return { summary: "", pdfUrl: null, reportNumber: "", reportData: {} };
    }

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            const payload = parsed as Record<string, unknown>;
            const summaryCandidate = typeof payload.summary === "string"
                ? payload.summary
                : typeof payload.message === "string"
                    ? payload.message
                    : raw;

            const pdfCandidate = [payload.pdfUrl, payload.reportUrl, payload.url, payload.attachmentUrl]
                .find((candidate) => typeof candidate === "string" && String(candidate).trim().length > 0);

            return {
                summary: String(summaryCandidate || ""),
                pdfUrl: typeof pdfCandidate === "string" ? pdfCandidate : extractFirstUrl(raw),
                reportNumber: typeof payload.reportNumber === "string" ? payload.reportNumber : "",
                reportData: parseReportDataObject(payload.reportData)
            };
        }
    } catch {
        // Keep plain text compatibility.
    }

    return {
        summary: raw,
        pdfUrl: extractFirstUrl(raw),
        reportNumber: "",
        reportData: {}
    };
}

function buildFallbackReportNumber(ticketId: number) {
    const year = new Date().getFullYear();
    return `RPT-${year}-${String(ticketId || 0).padStart(4, "0")}`;
}

function getInterventionLabel(raw: string | null | undefined) {
    const value = String(raw || "").toUpperCase();
    if (value === "SITE" || value === "SUR SITE") return "Sur site";
    if (value === "ATELIER" || value === "WORKSHOP") return "En atelier";
    return clean(raw);
}

function getReportField(
    data: Record<string, string>,
    summaryMap: Record<string, string>,
    dataKeys: string[],
    summaryKeys: string[],
    fallback: string
) {
    for (const key of dataKeys) {
        const value = clean(data[key]);
        if (value !== "-") return value;
    }
    for (const key of summaryKeys) {
        const value = clean(summaryMap[key]);
        if (value !== "-") return value;
    }
    return clean(fallback);
}

export default function TicketReportPage() {
    const { id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [ticket, setTicket] = useState<TicketDetail | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const ticketId = Number(id);

    useEffect(() => {
        const raw = localStorage.getItem("user");
        const user = raw ? JSON.parse(raw) : {};
        const role = user?.role ? String(user.role).toUpperCase() : "";
        setCurrentRole(role || null);
    }, []);

    useEffect(() => {
        if (!ticketId) {
            setTicket(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        fetch(`/api/tickets/${ticketId}`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.error || "Ticket introuvable");
                }
                setTicket(data);
            })
            .catch((error) => {
                console.error("Ticket report load error:", error);
                setTicket(null);
            })
            .finally(() => setLoading(false));
    }, [ticketId]);

    const backTarget = useMemo(() => {
        const from = String(searchParams.get("from") || "").toLowerCase();
        if (from === "adv-cloture") return "/adv/tickets-clotures";
        if (from === "technicien-rapport") return "/technicien/mes-tickets";
        if (from === "client-historique") return "/client/historique";
        if (from === "ticket-detail") return "/adv/tickets-clotures";

        if (currentRole === "ADV") return "/adv/tickets-clotures";
        if (currentRole === "TECHNICIAN") return "/technicien/mes-tickets";
        if (currentRole === "CLIENT") return "/client/historique";
        return "/adv/tickets-clotures";
    }, [searchParams, ticketId, currentRole]);

    const handleBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
        }
        router.push(backTarget);
    };

    const report = useMemo<ReportPayload | null>(() => {
        if (!ticket) return null;
        const history = Array.isArray(ticket.savHistory) ? ticket.savHistory : [];
        const entry = history.find((item) => String(item.action || "") === "TECHNICAL_REPORT");
        if (!entry) return null;

        const parsed = parseTechnicalReportNote(entry.note);
        return {
            reportNumber: clean(parsed.reportNumber),
            summary: parsed.summary,
            pdfUrl: parsed.pdfUrl,
            generatedAt: entry.createdAt,
            generatedBy: clean(entry.user?.name || ticket.assignedTo?.name || "-"),
            reportData: parsed.reportData
        };
    }, [ticket]);

    const sections = useMemo<ReportSection[]>(() => {
        if (!ticket) return [];

        const metadata = parseChecklistPayload(ticket.reclamation?.checklist || null)?.metadata || {};
        const summaryMap = parseSummaryLines(report?.summary || "");
        const data = report?.reportData || {};
        const history = Array.isArray(ticket.savHistory) ? ticket.savHistory : [];
        const latestIntervention = history.find((item) => String(item.action || "") === "INTERVENTION_LOG");
        const interventionMap = parseInterventionLogNote(latestIntervention?.note);

        const fallbackClient = clean(ticket.equipment?.client || ticket.reclamation?.customerName || "-");
        const fallbackEstablishment = clean(metadata.establishment || "-");
        const fallbackEquipment = clean(ticket.equipment?.name || ticket.reclamation?.deviceModel || "-");
        const fallbackBrand = clean(ticket.equipment?.brand || metadata.brand || "-");
        const fallbackModel = clean(ticket.equipment?.model || metadata.model || ticket.reclamation?.deviceModel || "-");
        const fallbackSerial = clean(ticket.equipment?.serialNumber || ticket.reclamation?.serialNumber || "-");
        const fallbackTechnician = clean(ticket.assignedTo?.name || "-");
        const fallbackWarranty = ticket.isUnderWarranty === true ? "Sous garantie" : ticket.isUnderWarranty === false ? "Hors garantie" : "-";
        const legacyBrandModelSerialRaw = clean(summaryMap["Marque, modele, numero de serie"]);
        const legacyBrandModelSerial = legacyBrandModelSerialRaw !== "-"
            ? legacyBrandModelSerialRaw.split(",").map((part) => clean(part))
            : [];
        const legacyBrand = legacyBrandModelSerial[0] || "-";
        const legacyModel = legacyBrandModelSerial[1] || "-";
        const legacySerial = legacyBrandModelSerial[2] || "-";

        const reportNumber = getReportField(
            data,
            summaryMap,
            ["reportNumber"],
            ["Numero du rapport"],
            buildFallbackReportNumber(ticket.id)
        );

        const dateIntervention = getReportField(
            data,
            summaryMap,
            ["dateIntervention"],
            ["Date de l'intervention"],
            ticket.updatedAt || ticket.createdAt
        );

        return [
            {
                title: "Identification",
                rows: [
                    { label: "Numéro du rapport", value: reportNumber },
                    { label: "Ticket", value: `#${(ticket as any).displayId || ticket.id}` },
                    { label: "Date d'intervention", value: dateIntervention },
                    { label: "Technicien", value: getReportField(data, summaryMap, ["technician"], ["Nom du technicien"], fallbackTechnician) }
                ]
            },
            {
                title: "Client et équipement",
                rows: [
                    {
                        label: "Client / établissement",
                        value: `${getReportField(data, summaryMap, ["client"], ["Nom du client / etablissement"], fallbackClient)} / ${getReportField(
                            data,
                            summaryMap,
                            ["establishment"],
                            [],
                            fallbackEstablishment
                        )}`
                    },
                    { label: "Équipement", value: getReportField(data, summaryMap, ["equipment"], ["Nom de l'equipement"], fallbackEquipment) },
                    {
                        label: "Marque / modèle / SN",
                        value: `${getReportField(data, summaryMap, ["brand"], [], fallbackBrand === "-" ? legacyBrand : fallbackBrand)} / ${getReportField(
                            data,
                            summaryMap,
                            ["model"],
                            [],
                            fallbackModel === "-" ? legacyModel : fallbackModel
                        )} / ${getReportField(data, summaryMap, ["serialNumber"], [], fallbackSerial === "-" ? legacySerial : fallbackSerial)}`
                    },
                    { label: "Type intervention", value: getInterventionLabel(getReportField(data, summaryMap, ["interventionType"], ["Type d'intervention"], ticket.interventionType || "-")) },
                    { label: "Statut de garantie", value: getReportField(data, summaryMap, ["statutGarantie"], ["Statut de garantie"], fallbackWarranty) }
                ]
            },
            {
                title: "Exécution intervention",
                rows: [
                    { label: "Motif panne / intervention", value: getReportField(data, summaryMap, ["motifPanne"], ["Motif de la panne / intervention"], ticket.reclamation?.description || ticket.description || "-") },
                    {
                        label: "Heure début",
                        value:
                            getReportField(data, summaryMap, ["startTimeLabel"], ["Heure de debut"], interventionMap["Debut"] || interventionMap["Heure debut"] || "-")
                    },
                    {
                        label: "Heure fin",
                        value:
                            getReportField(data, summaryMap, ["endTimeLabel"], ["Heure de fin"], interventionMap["Fin"] || interventionMap["Heure fin"] || "-")
                    },
                    { label: "Diagnostic", value: getReportField(data, summaryMap, ["diagnostic"], ["Diagnostic"], ticket.diagnosis || "-") },
                    { label: "Cause probable", value: getReportField(data, summaryMap, ["causeProbable"], ["Cause probable"], "-") },
                    { label: "Pièces changées", value: getReportField(data, summaryMap, ["piecesChangees"], ["Pieces changees", "Pieces utilisees"], "-") },
                    { label: "Résultat final", value: getReportField(data, summaryMap, ["resultatFinal"], ["Resultat final"], ticket.status || "-") },
                    { label: "Validation test", value: getReportField(data, summaryMap, ["validationTest"], ["Validation test"], "-") }
                ]
            },
            {
                title: "Clôture et signatures",
                rows: [
                    { label: "Observations", value: getReportField(data, summaryMap, ["observations"], ["Observations"], "-") },
                    { label: "Recommandation", value: getReportField(data, summaryMap, ["recommandation"], ["Recommandation"], "-") },
                    { label: "Signature technicien", value: getReportField(data, summaryMap, ["signatureTechnicien"], ["Signature technicien"], "-") },
                    { label: "Signature client", value: getReportField(data, summaryMap, ["signatureClient"], ["Signature client"], "-") }
                ]
            }
        ];
    }, [ticket, report]);

    const reportPdfUrl = report?.pdfUrl || null;
    const canConsultReport = Boolean(report);

    if (loading) {
        return (
            <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
                Chargement du rapport d'intervention...
            </div>
        );
    }

    if (!ticket) {
        return (
            <div style={{ padding: "3rem", textAlign: "center", color: "#b91c1c" }}>
                Ticket introuvable.
            </div>
        );
    }

    return (
        <div style={{ background: "#f1f5f9", minHeight: "100vh", paddingBottom: "1.5rem" }}>
            <div
                className="no-print"
                style={{
                    background: "#fff",
                    borderBottom: "1px solid #e2e8f0",
                    padding: "0.9rem 1.2rem",
                    position: "sticky",
                    top: 0,
                    zIndex: 20,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.6rem",
                    flexWrap: "wrap"
                }}
            >
                <button
                    onClick={handleBack}
                    className="btn btn-outline"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                    <ArrowLeft size={16} />
                    Retour
                </button>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                    {reportPdfUrl ? (
                        <a
                            href={reportPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline"
                        >
                            <Download size={14} />
                            Télécharger le PDF
                        </a>
                    ) : null}
                </div>
            </div>

            <main
                className="report-sheet"
                style={{
                    width: "min(100%, 980px)",
                    margin: "1rem auto",
                    background: "#fff",
                    border: "1px solid #dbe4ee",
                    borderRadius: "14px",
                    padding: "1rem",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)"
                }}
            >
                <header
                    style={{
                        borderBottom: "2px solid #991b1b",
                        paddingBottom: "0.8rem",
                        marginBottom: "0.9rem"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "#991b1b", fontWeight: 800 }}>
                        <FileText size={18} />
                        RAPPORT D'INTERVENTION TECHNIQUE
                    </div>
                    <div style={{ marginTop: "0.25rem", color: "#334155", fontSize: "0.88rem" }}>
                        Ticket #{(ticket as any).displayId || ticket.id} - {clean(ticket.title)}
                    </div>
                    {canConsultReport ? (
                        <div style={{ marginTop: "0.35rem", color: "#475569", fontSize: "0.8rem" }}>
                            Rapport généré le {new Date(report!.generatedAt).toLocaleString("fr-FR")} par {report!.generatedBy}
                        </div>
                    ) : (
                        <div style={{ marginTop: "0.35rem", color: "#92400e", fontSize: "0.8rem" }}>
                            Aucun rapport technique final n'est encore généré pour ce ticket.
                        </div>
                    )}
                </header>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.7rem" }} className="report-grid">
                    {sections.map((section) => (
                        <section
                            key={section.title}
                            style={{
                                border: "1px solid #dbe4ee",
                                borderRadius: "12px",
                                background: "#f8fbff",
                                padding: "0.7rem"
                            }}
                        >
                            <h2
                                style={{
                                    margin: "0 0 0.5rem",
                                    color: "#1e3a8a",
                                    fontSize: "0.82rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.02em"
                                }}
                            >
                                {section.title}
                            </h2>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                                {section.rows.map((row) => (
                                    <div
                                        key={`${section.title}-${row.label}`}
                                        style={{
                                            border: "1px solid #e2e8f0",
                                            borderRadius: "8px",
                                            background: "#fff",
                                            padding: "0.45rem"
                                        }}
                                    >
                                        <div style={{ color: "#64748b", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>{row.label}</div>
                                        <div style={{ color: "#0f172a", fontSize: "0.84rem", marginTop: "0.15rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{clean(row.value)}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>

                <footer
                    style={{
                        marginTop: "1rem",
                        borderTop: "1px dashed #cbd5e1",
                        paddingTop: "0.6rem",
                        color: "#64748b",
                        fontSize: "0.76rem"
                    }}
                >
                    Document d'intervention généré automatiquement par la plateforme GMAO biomédicale.
                </footer>
            </main>

            <style jsx global>{`
                @media (max-width: 900px) {
                    .report-grid {
                        grid-template-columns: 1fr !important;
                    }
                }

                @media print {
                    .no-print {
                        display: none !important;
                    }

                    body {
                        margin: 0 !important;
                        background: #fff !important;
                    }

                    .report-sheet {
                        margin: 0 !important;
                        width: 100% !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        padding: 0.6rem !important;
                    }
                }
            `}</style>
        </div>
    );
}


