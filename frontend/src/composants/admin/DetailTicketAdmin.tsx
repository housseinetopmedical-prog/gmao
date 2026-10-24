"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { dedupeAndSortHistory, formatTicketHistoryAction, formatTicketHistoryNote, getTicketHistoryTone } from "@/metier/historique-ticket";
import { getPriorityLabel, getSeverityBadgeStyle, getStatusLabel } from "@/metier/workflow-technicien";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { getTicketEquipmentItems } from "@/metier/materiel-ticket";

type TicketHistoryEntry = {
    id?: number | null;
    action?: string | null;
    note?: string | null;
    createdAt?: string | null;
    user?: {
        id?: number | null;
        name?: string | null;
        role?: string | null;
    } | null;
};

type TicketRow = {
    id: number;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    priority?: string | null;
    interventionType?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    creator?: {
        id?: number | null;
        name?: string | null;
        role?: string | null;
    } | null;
    assignedTo?: {
        id?: number | null;
        name?: string | null;
        role?: string | null;
    } | null;
    equipment?: {
        id?: number | null;
        name?: string | null;
        serialNumber?: string | null;
        blNumber?: string | null;
        client?: string | null;
        brand?: string | null;
        model?: string | null;
        code?: string | null;
        location?: string | null;
    } | null;
    reclamation?: {
        id?: number | null;
        customerName?: string | null;
        contactEmail?: string | null;
        phone?: string | null;
        deviceModel?: string | null;
        serialNumber?: string | null;
        description?: string | null;
        checklist?: string | null;
        interventionType?: string | null;
    } | null;
    savHistory?: TicketHistoryEntry[] | null;
};

type ClientSnapshot = {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    phones: string[];
    city: string;
};

type MaterialSnapshot = {
    key: string;
    designation: string;
    serialNumber: string;
    pn: string;
    model: string;
    brand: string;
    articleCode: string;
    location: string;
};

type HistoryPresentation = {
    key: string;
    actionLabel: string;
    detail: string;
    actor: string;
    createdAt: string | null | undefined;
    tone: "success" | "warning" | "danger" | "info";
};

function formatDateTime(value: string | null | undefined) {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

function getActorLabel(actor: { name?: string | null; role?: string | null } | null | undefined) {
    if (!actor?.name) return "-";
    const role = String(actor.role || "").trim();
    return role ? `${actor.name} (${role})` : actor.name;
}

function valueOrDash(value: unknown) {
    const text = String(value || "").trim();
    return text || "-";
}

function hasDisplayValue(value: unknown) {
    const text = String(value ?? "").trim();
    if (!text) return false;
    const normalized = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return !["-", "non renseigne", "non precise", "non precisee"].includes(normalized);
}

function normalizeComparable(value: unknown) {
    return String(value ?? "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function formatInterventionType(value: string | null | undefined) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "WORKSHOP" || normalized === "EN ATELIER") return "En atelier";
    if (normalized === "SITE" || normalized === "SUR SITE") return "Sur site";
    return valueOrDash(value);
}

function parseStatusChange(action: string | null | undefined) {
    const normalized = String(action || "").trim();
    const match = normalized.match(/^Status changed\s*:\s*([A-Z_]+)\s*->\s*([A-Z_]+)$/i);
    if (!match) return null;
    return {
        from: getStatusLabel(match[1]),
        to: getStatusLabel(match[2])
    };
}

function parseLineMap(note: string | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    const raw = String(note || "").trim();
    if (!raw) return out;

    raw.split("\n").forEach((line) => {
        const idx = line.indexOf(":");
        if (idx < 0) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (!key) return;
        out[key] = value;
    });

    return out;
}

function formatSimpleHistoryDetail(entry: TicketHistoryEntry) {
    const statusChange = parseStatusChange(entry.action);
    if (statusChange) {
        return `Statut: ${statusChange.from} -> ${statusChange.to}`;
    }

    const action = String(entry.action || "").trim();
    const raw = String(entry.note || "").trim();
    if (!raw) return formatTicketHistoryNote(entry);

    if (action === "INTERVENTION_LOG") {
        const map = parseLineMap(raw);
        const parts = [
            map["Statut avancement"] ? `Étape SAV: ${map["Statut avancement"]}` : "",
            map["Nature de réparation"] ? `Nature: ${map["Nature de réparation"]}` : "",
            map["Date d'intervention"] ? `Date: ${map["Date d'intervention"]}` : ""
        ].filter(Boolean);
        return parts.join(" | ") || formatTicketHistoryNote(entry);
    }

    if (action === "PART_REQUEST") {
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(" | ");
    }

    return formatTicketHistoryNote(entry);
}

function getHistoryPresentation(entry: TicketHistoryEntry, ticketId: number, index: number): HistoryPresentation {
    const statusChange = parseStatusChange(entry.action);
    const action = String(entry.action || "").trim();
    return {
        key: `history-${ticketId}-${entry.id || "no-id"}-${entry.createdAt || "no-date"}-${action || "no-action"}-${index}`,
        actionLabel: statusChange ? "Changement de statut" : formatTicketHistoryAction(entry.action),
        detail: formatSimpleHistoryDetail(entry),
        actor: getActorLabel(entry.user),
        createdAt: entry.createdAt,
        tone: getTicketHistoryTone(entry.action)
    };
}

function getToneStyles(tone: HistoryPresentation["tone"]) {
    if (tone === "success") {
        return { border: "#bbf7d0", background: "#f0fdf4", chipBackground: "#dcfce7", chipColor: "#166534" };
    }
    if (tone === "warning") {
        return { border: "#fde68a", background: "#fffbeb", chipBackground: "#fef3c7", chipColor: "#92400e" };
    }
    if (tone === "danger") {
        return { border: "#fecaca", background: "#fff1f2", chipBackground: "#fee2e2", chipColor: "#9f1239" };
    }
    return { border: "#dbeafe", background: "#eff6ff", chipBackground: "#dbeafe", chipColor: "#1d4ed8" };
}

function getClientSnapshot(ticket: TicketRow): ClientSnapshot {
    const metadata = parseChecklistPayload(ticket.reclamation?.checklist).metadata || {};
    const entryRepairSlip = (metadata as any).entryRepairSlip || {};
    const firstName = String(entryRepairSlip.clientFirstName || "").trim();
    const lastName = String(entryRepairSlip.clientLastName || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ")
        || String(ticket.reclamation?.customerName || ticket.equipment?.client || "").trim()
        || "-";
    const phones = [
        String(entryRepairSlip.phone || ticket.reclamation?.phone || "").trim(),
        ...(Array.isArray(entryRepairSlip.mobilePhones) ? entryRepairSlip.mobilePhones.map((item: unknown) => String(item || "").trim()) : []),
        String(entryRepairSlip.landlinePhone || "").trim()
    ].filter(Boolean);

    return {
        fullName,
        firstName: firstName || (fullName !== "-" ? fullName.split(" ")[0] || "-" : "-"),
        lastName: lastName || (fullName !== "-" ? fullName.split(" ").slice(1).join(" ") || "-" : "-"),
        email: String(entryRepairSlip.email || ticket.reclamation?.contactEmail || "").trim() || "-",
        phones: Array.from(new Set(phones)),
        city: String((metadata as any).city || entryRepairSlip.city || "").trim() || "-"
    };
}

function getMaterialSnapshots(ticket: TicketRow): MaterialSnapshot[] {
    const metadata = parseChecklistPayload(ticket.reclamation?.checklist).metadata || {};
    const merchandiseInfo = (metadata as any).merchandiseInfo || {};
    const equipmentItems = getTicketEquipmentItems({
        checklist: ticket.reclamation?.checklist,
        deviceModel: ticket.reclamation?.deviceModel,
        serialNumber: ticket.equipment?.serialNumber || ticket.reclamation?.serialNumber,
        equipmentName: ticket.equipment?.name,
        description: ticket.reclamation?.description || ticket.description
    });

    const merchandiseItems = Array.isArray(merchandiseInfo.equipmentMerchandiseItems)
        ? merchandiseInfo.equipmentMerchandiseItems
        : [];

    if (equipmentItems.length === 0) {
        return [{
            key: `material-${ticket.id}`,
            designation: valueOrDash(ticket.equipment?.name || ticket.reclamation?.deviceModel),
            serialNumber: valueOrDash(ticket.equipment?.serialNumber || ticket.reclamation?.serialNumber),
            pn: valueOrDash((metadata as any).pn),
            model: valueOrDash(ticket.equipment?.model || (metadata as any).model || ticket.reclamation?.deviceModel),
            brand: valueOrDash(ticket.equipment?.brand || (metadata as any).brand),
            articleCode: valueOrDash(ticket.equipment?.code || merchandiseInfo.articleCode),
            location: valueOrDash(ticket.equipment?.location)
        }];
    }

    return equipmentItems.map((item, index) => {
        const merchandiseEntry = merchandiseItems.find((entry: any) => Number(entry?.materialIndex ?? entry?.index ?? -1) === index) || null;
        const designation = valueOrDash(item.designation);
        const modelCandidate = index === 0 ? (ticket.equipment?.model || (metadata as any).model || ticket.reclamation?.deviceModel) : "";
        return {
            key: `material-${ticket.id}-${index}`,
            designation,
            serialNumber: valueOrDash(item.serialNumber),
            pn: valueOrDash(item.pn),
            model: valueOrDash(modelCandidate),
            brand: valueOrDash(index === 0 ? (ticket.equipment?.brand || (metadata as any).brand) : ""),
            articleCode: valueOrDash(index === 0 ? (ticket.equipment?.code || merchandiseEntry?.articleCode || merchandiseInfo.articleCode) : merchandiseEntry?.articleCode),
            location: valueOrDash(index === 0 ? ticket.equipment?.location : "")
        };
    });
}

function getFailureDescription(ticket: TicketRow) {
    const metadata = parseChecklistPayload(ticket.reclamation?.checklist).metadata || {};
    const entryRepairSlip = (metadata as any).entryRepairSlip || {};
    return String(entryRepairSlip.failureDescription || ticket.reclamation?.description || ticket.description || ticket.title || "").trim();
}

export default function AdminTicketDetailsWorkspace() {
    const [tickets, setTickets] = useState<TicketRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/tickets?hideClientDocuments=1", { cache: "no-store" });
                const data = await response.json().catch(() => []);
                if (cancelled) return;
                setTickets(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Admin ticket details load error:", error);
                if (!cancelled) setTickets([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const filteredTickets = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const source = [...tickets].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime());
        if (!normalizedSearch) return source;

        return source.filter((ticket) => {
            const haystack = [
                ticket.id,
                ticket.title,
                ticket.status,
                ticket.priority,
                ticket.interventionType,
                ticket.equipment?.name,
                ticket.equipment?.serialNumber,
                ticket.equipment?.blNumber,
                ticket.equipment?.client,
                ticket.creator?.name,
                ticket.assignedTo?.name
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(normalizedSearch);
        });
    }, [searchTerm, tickets]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card" style={{ padding: "1rem 1.1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#0f172a" }}>Détail ticket</h2>
                    </div>
                    <div style={{ position: "relative", minWidth: "280px", flex: "1 1 320px", maxWidth: "420px" }}>
                        <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                        <input
                            className="search-input"
                            placeholder="Rechercher ticket, client, marché, acteur..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            style={{ width: "100%", paddingLeft: "2.1rem" }}
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="card" style={{ padding: "2.5rem", textAlign: "center" }}>
                    <Loader2 size={28} color="#c1121f" className="animate-spin" />
                </div>
            ) : filteredTickets.length === 0 ? (
                <div className="card" style={{ padding: "1.5rem", color: "#64748b" }}>Aucun ticket à afficher.</div>
            ) : (
                filteredTickets.map((ticket) => {
                    const historyEntries = dedupeAndSortHistory(Array.isArray(ticket.savHistory) ? ticket.savHistory : [], "asc");
                    const recentHistory = historyEntries.slice(-8).reverse().map((entry, index) => getHistoryPresentation(entry, ticket.id, index));
                    const priorityStyle = getSeverityBadgeStyle(ticket.priority);
                    const client = getClientSnapshot(ticket);
                    const materials = getMaterialSnapshots(ticket);
                    const failureDescription = getFailureDescription(ticket);

                    return (
                        <article key={`admin-ticket-detail-${ticket.id}`} className="card" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                                        <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#0f172a" }}>
                                            Ticket #{(ticket as any).displayId || ticket.id}
                                        </h3>
                                        <span
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                borderRadius: "999px",
                                                padding: "0.25rem 0.7rem",
                                                fontSize: "0.78rem",
                                                fontWeight: 700,
                                                ...priorityStyle
                                            }}
                                        >
                                            {getPriorityLabel(ticket.priority)}
                                        </span>
                                        <span style={{ display: "inline-flex", alignItems: "center", borderRadius: "999px", padding: "0.25rem 0.7rem", fontSize: "0.78rem", fontWeight: 700, background: "#f8fafc", border: "1px solid #dbe5f0", color: "#111827" }}>
                                            {getStatusLabel(ticket.status)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <section style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "1rem", background: "#ffffff" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                                    <div style={{ display: "grid", gap: "0.8rem" }}>
                                        <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#111827" }}>Informations client</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem" }}>
                                            <div style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.8rem 0.9rem", background: "#fffdfd" }}>
                                                <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Client</div>
                                                <div style={{ marginTop: "0.25rem", fontWeight: 700, color: "#0f172a" }}>{client.fullName}</div>
                                            </div>
                                            <div style={{ display: hasDisplayValue(client.email) ? undefined : "none", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.8rem 0.9rem", background: "#fffdfd" }}>
                                                <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>E-mail</div>
                                                <div style={{ marginTop: "0.25rem", fontWeight: 700, color: "#0f172a" }}>{client.email}</div>
                                            </div>
                                            <div style={{ display: client.phones.length > 0 ? undefined : "none", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.8rem 0.9rem", background: "#fffdfd" }}>
                                                <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Téléphones</div>
                                                <div style={{ marginTop: "0.25rem", fontWeight: 700, color: "#0f172a" }}>{client.phones.length > 0 ? client.phones.join(" / ") : "-"}</div>
                                            </div>
                                            <div style={{ display: hasDisplayValue(client.city) ? undefined : "none", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.8rem 0.9rem", background: "#fffdfd" }}>
                                                <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Ville</div>
                                                <div style={{ marginTop: "0.25rem", fontWeight: 700, color: "#0f172a" }}>{client.city}</div>
                                            </div>
                                            <div style={{ display: hasDisplayValue(formatInterventionType(ticket.interventionType || ticket.reclamation?.interventionType)) ? undefined : "none", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.8rem 0.9rem", background: "#fffdfd" }}>
                                                <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Type d'intervention</div>
                                                <div style={{ marginTop: "0.25rem", fontWeight: 700, color: "#0f172a" }}>{formatInterventionType(ticket.interventionType || ticket.reclamation?.interventionType)}</div>
                                            </div>
                                            <div style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.8rem 0.9rem", background: "#fffdfd" }}>
                                                <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Ouvert le</div>
                                                <div style={{ marginTop: "0.25rem", fontWeight: 700, color: "#0f172a" }}>{formatDateTime(ticket.createdAt)}</div>
                                            </div>
                                            <div style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.8rem 0.9rem", background: "#fffdfd" }}>
                                                <div style={{ fontSize: "0.76rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Dernière mise à jour</div>
                                                <div style={{ marginTop: "0.25rem", fontWeight: 700, color: "#0f172a" }}>{formatDateTime(ticket.updatedAt)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "1rem", background: "#ffffff" }}>
                                <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#111827", marginBottom: "0.75rem" }}>Matériels</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.8rem" }}>
                                    {materials.map((material) => (
                                        <div key={material.key} style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.9rem", background: "#fffdfd" }}>
                                            <div style={{ fontWeight: 800, color: "#0f172a" }}>{material.designation}</div>
                                            <div style={{ marginTop: "0.35rem", color: "#475569", display: "grid", gap: "0.18rem", lineHeight: 1.35 }}>
                                                {hasDisplayValue(material.model) ? <div><strong style={{ color: "#111827" }}>Modèle:</strong> {material.model}</div> : null}
                                                {hasDisplayValue(material.brand) ? <div><strong style={{ color: "#111827" }}>Marque:</strong> {material.brand}</div> : null}
                                                {hasDisplayValue(material.serialNumber) ? <div><strong style={{ color: "#111827" }}>SN:</strong> {material.serialNumber}</div> : null}
                                                {hasDisplayValue(material.pn) ? <div><strong style={{ color: "#111827" }}>PN:</strong> {material.pn}</div> : null}
                                                {hasDisplayValue(material.articleCode) ? <div><strong style={{ color: "#111827" }}>Code article:</strong> {material.articleCode}</div> : null}
                                                {hasDisplayValue(material.location) ? <div><strong style={{ color: "#111827" }}>Localisation:</strong> {material.location}</div> : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                                <section style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "1rem", background: "#ffffff" }}>
                                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#111827", marginBottom: "0.4rem" }}>Description de la panne</div>
                                    <div style={{ color: "#475569", lineHeight: 1.6 }}>{failureDescription || "Aucune description renseignée."}</div>
                                </section>

                                <section style={{ border: "1px solid #e5e7eb", borderRadius: "16px", padding: "1rem", background: "#ffffff" }}>
                                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#111827", marginBottom: "0.75rem" }}>Historique du ticket</div>
                                    {recentHistory.length === 0 ? (
                                        <div style={{ color: "#64748b" }}>Aucun historique disponible.</div>
                                    ) : (
                                        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "0.95rem", paddingLeft: "1.35rem" }}>
                                            <div style={{ position: "absolute", left: "0.32rem", top: "0.2rem", bottom: "0.2rem", width: "2px", background: "#fecaca" }} />
                                            {recentHistory.map((entry) => {
                                                const tone = getToneStyles(entry.tone);
                                                return (
                                                <div key={entry.key} style={{ position: "relative", display: "grid", gap: "0.38rem" }}>
                                                    <div style={{ position: "absolute", left: "-1.35rem", top: "0.4rem", width: "10px", height: "10px", borderRadius: "999px", background: tone.chipColor, boxShadow: "0 0 0 4px #ffffff" }} />
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                                                        <span style={{ display: "inline-flex", alignItems: "center", borderRadius: "999px", padding: "0.24rem 0.68rem", fontSize: "0.76rem", fontWeight: 800, background: tone.chipBackground, color: tone.chipColor }}>
                                                            {entry.actionLabel}
                                                        </span>
                                                        <span style={{ color: "#64748b", fontSize: "0.84rem" }}>{formatDateTime(entry.createdAt)}</span>
                                                    </div>
                                                    {hasDisplayValue(entry.detail) ? (
                                                        <div style={{ display: "inline-flex", width: "fit-content", maxWidth: "100%", alignItems: "center", padding: "0.35rem 0.65rem", borderRadius: "10px", border: `1px solid ${tone.border}`, background: tone.background, color: "#111827", fontSize: "0.98rem", fontWeight: 700, lineHeight: 1.45 }}>
                                                            {entry.detail}
                                                        </div>
                                                    ) : null}
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                                                        <span style={{ display: "inline-flex", alignItems: "center", borderRadius: "999px", padding: "0.22rem 0.65rem", fontSize: "0.78rem", fontWeight: 700, background: "#ecfdf5", color: "#166534" }}>
                                                            {entry.actor === "-" ? "SAV" : `SAV: ${entry.actor}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                    )}
                                </section>
                            </div>
                        </article>
                    );
                })
            )}
        </div>
    );
}


