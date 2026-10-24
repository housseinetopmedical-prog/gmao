export function actorLabel(value: string | null | undefined, actor: "client" | "internal" = "internal") {
    const raw = String(value || "");
    if (!raw) return raw;

    if (actor === "client") {
        return raw
            .replace(/tickets/gi, "demandes")
            .replace(/ticket/gi, "demande")
            .replace(/dossiers/gi, "demandes")
            .replace(/dossier/gi, "demande");
    }

    return raw
        .replace(/demandes d'intervention/gi, "tickets")
        .replace(/demande d'intervention/gi, "ticket")
        .replace(/demandes/gi, "tickets")
        .replace(/demande/gi, "ticket")
        .replace(/dossiers/gi, "tickets")
        .replace(/dossier/gi, "ticket");
}
