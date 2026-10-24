"use client";

import { useEffect, useMemo, useState } from "react";
import AdvClientsPage from "@/app/(tableau-de-bord)/(espaces)/adv/clients/page";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";

type InternalActor = {
    id: number;
    name: string;
    email: string;
    password?: string;
    role: string;
};

const ROLE_OPTIONS = [
    { value: "ADMIN", label: "Admin" },
    { value: "ADV", label: "ADV" },
    { value: "TECHNICIAN", label: "Technicien" },
    { value: "MAGASINIER", label: "Magasinier" },
    { value: "RESPONSABLE_TECHNIQUE", label: "Responsable technique" },
    { value: "RESPONSABLE_FACTURATION", label: "Responsable facturation" },
    { value: "RESPONSABLE_APPELS_OFFRE", label: "Responsable appels d'offre" },
    { value: "IMPORT", label: "Import" }
];

export default function AdminActorsManager() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [actors, setActors] = useState<InternalActor[]>([]);
    const [showPosts, setShowPosts] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "TECHNICIAN"
    });

    const loadActors = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/messagerie?mode=users&userId=0", { cache: "no-store" });
            const data = await response.json().catch(() => []);
            setActors(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Admin actors load error:", error);
            setActors([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadActors();
    }, []);

    const sortedActors = useMemo(
        () => [...actors].sort((a, b) => a.name.localeCompare(b.name, "fr")),
        [actors]
    );

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setFeedback("");
        try {
            const response = await fetch("/api/technicians", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(String(data?.error || "Création impossible."));
            setFeedback("Compte créé.");
            setFormData({ name: "", email: "", password: "", role: "TECHNICIAN" });
            await loadActors();
        } catch (error: any) {
            setFeedback(String(error?.message || "Création impossible."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.content}>
            <section className={styles.sectionCard}>
                <div className={styles.itemMain} style={{ alignItems: "center" }}>
                    <h2 className={styles.sectionTitle}>Créer un poste</h2>
                    <button className="btn btn-outline" type="button" onClick={() => setShowPosts((value) => !value)}>
                        Postes
                    </button>
                </div>
                <form onSubmit={handleSubmit} className={styles.formGrid2}>
                    <div className={styles.field}>
                        <label className={styles.label}>Nom complet</label>
                        <input className={styles.input} value={formData.name} onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Email</label>
                        <input className={styles.input} type="email" value={formData.email} onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Mot de passe</label>
                        <input className={styles.input} type="text" value={formData.password} onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Rôle</label>
                        <select className={styles.select} value={formData.role} onChange={(event) => setFormData((prev) => ({ ...prev, role: event.target.value }))}>
                            {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.actions} style={{ gridColumn: "1 / -1" }}>
                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Création..." : "Créer le compte"}</button>
                    </div>
                </form>
                {feedback ? <div className={styles.helper} style={{ marginTop: "0.75rem" }}>{feedback}</div> : null}
            </section>

            {showPosts ? (
            <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Postes</h2>
                {loading ? (
                    <div className={styles.empty}>Chargement...</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nom</th>
                                    <th>Email</th>
                                    <th>Mot de passe</th>
                                    <th>Rôle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedActors.map((actor) => (
                                    <tr key={`admin-actor-${actor.id}`}>
                                        <td>{actor.name}</td>
                                        <td>{actor.email}</td>
                                        <td>{actor.password ? (String(actor.password).startsWith("scrypt$") ? "Protégé" : actor.password) : "-"}</td>
                                        <td>{actor.role}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            ) : null}

            <AdvClientsPage />
        </div>
    );
}

