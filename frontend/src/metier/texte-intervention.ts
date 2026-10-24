export function replaceReclamationByIntervention(value: string | null | undefined) {
    return String(value || "")
        .replace(/Réclamation/g, "Intervention")
        .replace(/réclamation/g, "intervention")
        .replace(/Reclamation/g, "Intervention")
        .replace(/reclamation/g, "intervention");
}
