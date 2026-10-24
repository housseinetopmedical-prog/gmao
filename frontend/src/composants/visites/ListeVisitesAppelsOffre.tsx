"use client";

import { useEffect, useMemo, useState } from "react";
import { getActorFilteredAppelsOffreVisits, getAppelsOffreVisitKindLabel } from "@/metier/workflow-appels-offre";

type Props = {
    actorMode: "TECHNICIAN" | "RESPONSABLE_TECHNIQUE";
    visitKind: "PREVENTIVE" | "CORRECTIVE";
    title: string;
    subtitle: string;
};

const AO_ACCENT = {
    soft: "#fff5f5",
    strong: "#b00020",
    border: "#1f1f1f",
    text: "#111111"
};

export default function AppelsOffreVisitInbox({ actorMode, visitKind, title, subtitle }: Props) {
    const [overview, setOverview] = useState<any>(null);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("user");
            const parsed = raw ? JSON.parse(raw) : {};
            setCurrentUserId(Number(parsed?.id || 0) || null);
        } catch {
            setCurrentUserId(null);
        }

        fetch("/api/appels-offre/overview", { cache: "no-store" })
            .then((response) => response.json())
            .then((data) => setOverview(data && typeof data === "object" ? data : null))
            .catch(() => setOverview(null));
    }, []);

    const visits = useMemo(() => {
        const source = visitKind === "PREVENTIVE" ? overview?.preventiveVisits : overview?.correctiveVisits;
        return getActorFilteredAppelsOffreVisits({
            visits: Array.isArray(source) ? source : [],
            actorMode,
            userId: currentUserId
        }).sort((a: any, b: any) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    }, [overview, actorMode, currentUserId, visitKind]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <section style={{ background: "linear-gradient(145deg, #ffffff 0%, #fffafa 100%)", border: `1px solid ${AO_ACCENT.border}`, borderRadius: "16px", padding: "1rem", boxShadow: "0 10px 24px rgba(0,0,0,0.06)" }}>
                {title || subtitle ? (
                    <div style={{ marginBottom: "0.9rem" }}>
                        {title ? <div style={{ fontSize: "1.05rem", fontWeight: 800, color: AO_ACCENT.text }}>{title}</div> : null}
                        {subtitle ? <div style={{ marginTop: "0.3rem", color: "#52525b", fontSize: "0.9rem", lineHeight: 1.6 }}>{subtitle}</div> : null}
                    </div>
                ) : null}
                <div style={{ display: "grid", gap: "0.9rem" }}>
                    {visits.length === 0 ? (
                        <div style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucune visite disponible.</div>
                    ) : (
                        visits.map((visit: any) => (
                            <article key={visit.id} style={{ border: `1px solid ${AO_ACCENT.border}`, borderRadius: "14px", overflow: "hidden", background: "#fff" }}>
                                <div style={{ background: AO_ACCENT.soft, borderBottom: `1px solid ${AO_ACCENT.border}`, padding: "0.85rem 1rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                                        <div>
                                            <div style={{ fontWeight: 800, color: AO_ACCENT.text }}>Marché {visit.equipment?.blNumber ? `#${visit.equipment.blNumber}` : ""}</div>
                                        </div>
                                        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                                            <span style={badgeStyle("#fff1f2", "#b00020")}>{getAppelsOffreVisitKindLabel(visit.metadata?.visitKind)}</span>
                                            <span style={badgeStyle("#ffffff", "#111111")}>{new Date(visit.scheduledDate).toLocaleDateString("fr-FR")}</span>
                                            {visit.metadata?.cadence ? <span style={badgeStyle("#111111", "#ffffff")}>{visit.metadata.cadence}</span> : null}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: "1rem", display: "grid", gap: "0.8rem" }}>
                                    <InfoGrid
                                        items={[
                                            ["Numéro d'inventaire", visit.equipment?.code || "-"],
                                            ["Hôpital", visit.equipment?.location || "-"],
                                            ["Secteur", visit.equipment?.service || "-"],
                                            ["Maître d'ouvrage", visit.equipment?.client || "-"],
                                            ["Numéro de marché", visit.equipment?.blNumber || "-"],
                                            ["Technicien concerné", visit.metadata?.assignedTechnicianName || "-"],
                                            ["Créée par", visit.metadata?.createdByLabel || "-"],
                                        ]}
                                    />

                                    {visit.metadata?.visitKind === "CORRECTIVE" ? (
                                        <InfoGrid
                                            items={[
                                                ["Date d'appel", formatOptionalDate(visit.metadata?.callDate)],
                                                ["Date d'intervention", formatOptionalDate(visit.metadata?.interventionDate)],
                                                ["Date retour matériel", formatOptionalDate(visit.metadata?.materialReturnDate)],
                                                ["Date récupération matériel", formatOptionalDate(visit.metadata?.materialRecoveryDate)]
                                            ]}
                                        />
                                    ) : null}

                                    {visit.metadata?.comment ? (
                                        <div style={{ borderRadius: "12px", background: "#fff5f5", border: "1px solid #1f1f1f", padding: "0.8rem" }}>
                                            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#b00020", textTransform: "uppercase", letterSpacing: "0.02em" }}>Commentaire</div>
                                            <div style={{ marginTop: "0.35rem", color: "#111111", fontSize: "0.87rem", lineHeight: 1.6 }}>{visit.metadata.comment}</div>
                                        </div>
                                    ) : null}

                                    {visit.equipment?.blDocumentUrl ? (
                                        <a href={visit.equipment.blDocumentUrl} target="_blank" rel="noreferrer" style={{ color: "#b00020", fontSize: "0.86rem", fontWeight: 700 }}>
                                            Voir la copie de marché
                                        </a>
                                    ) : null}
                                </div>
                            </article>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.7rem" }}>
            {items.map(([label, value]) => (
                <div key={`${label}-${value}`} style={{ border: "1px solid #1f1f1f", borderRadius: "12px", padding: "0.75rem", background: "#fff" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.02em" }}>{label}</div>
                    <div style={{ marginTop: "0.25rem", color: "#111111", fontSize: "0.87rem", fontWeight: 700, lineHeight: 1.5 }}>{value}</div>
                </div>
            ))}
        </div>
    );
}

function badgeStyle(background: string, color: string) {
    return {
        background,
        color,
        border: `1px solid ${color === "#ffffff" || color === "#111111" ? "#111111" : "#fecdd3"}`,
        borderRadius: "999px",
        padding: "0.2rem 0.55rem",
        fontSize: "0.75rem",
        fontWeight: 700
    } as const;
}

function formatOptionalDate(raw: unknown) {
    if (!raw) return "-";
    const parsed = new Date(String(raw));
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("fr-FR");
}

