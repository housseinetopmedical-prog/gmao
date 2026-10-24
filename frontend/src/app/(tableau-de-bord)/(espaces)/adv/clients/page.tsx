"use client";

/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : clients.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, UserPlus } from "lucide-react";
import styles from "../adv.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type ClientUser = {
    id: number;
    name: string;
    email: string;
    passwordConfigured?: boolean;
    visiblePassword?: string | null;
    phone?: string | null;
    createdAt: string;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeSearchValue(value: string) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeDigits(value: string) {
    return String(value || "").replace(/\D+/g, "");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function splitPhoneEntries(value?: string | null) {
    return String(value || "")
        .split("|")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function splitCustomerName(raw: string) {
    const full = String(raw || "").trim();
    if (!full) return { firstName: "", lastName: "" };
    const [firstName = "", ...rest] = full.split(" ");
    return { firstName, lastName: rest.join(" ") };
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvClientsPage() {
    const searchParams = useSearchParams();
    const [clients, setClients] = useState<ClientUser[]>([]);
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [clientAccessMessage, setClientAccessMessage] = useState("");
    const [clientSearch, setClientSearch] = useState("");
    const [showClientAccessTable, setShowClientAccessTable] = useState(false);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [mobilePhones, setMobilePhones] = useState<string[]>([""]);
    const [landlinePhone, setLandlinePhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const updateMobilePhone = (index: number, value: string) => {
        setMobilePhones((prev) => prev.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
    };

    const addMobilePhone = () => {
        setMobilePhones((prev) => [...prev, ""]);
    };

    const removeMobilePhone = (index: number) => {
        setMobilePhones((prev) => {
            const next = prev.filter((_, entryIndex) => entryIndex !== index);
            return next.length > 0 ? next : [""];
        });
    };

    const loadClients = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/adv/client-access");
            const data = await response.json();
            setClients(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Load clients error:", error);
            setClients([]);
        } finally {
            setLoading(false);
        }
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        loadClients();
    }, []);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const reclamationId = Number(searchParams.get("reclamationId") || 0);
        if (!Number.isFinite(reclamationId) || reclamationId <= 0) return;

        const loadReclamationPrefill = async () => {
            try {
                const userRaw = localStorage.getItem("user");
                const user = userRaw ? JSON.parse(userRaw) : {};
                const response = await fetch(`/api/reclamations/${reclamationId}`, {
                    headers: {
                        "x-user-role": String(user?.role || "ADV"),
                        "x-user-id": String(user?.id || "")
                    }
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) return;

                const slip = parseChecklistPayload(data?.checklist).metadata?.entryRepairSlip || null;
                const resolvedName = slip?.clientFirstName || slip?.clientLastName
                    ? { firstName: String(slip?.clientFirstName || ""), lastName: String(slip?.clientLastName || "") }
                    : splitCustomerName(String(data?.customerName || ""));

                const phoneEntries = splitPhoneEntries(String(data?.phone || ""));
                const mobileEntries = phoneEntries
                    .filter((entry) => /^portable/i.test(entry))
                    .map((entry) => entry.replace(/^portable(?:\s+\d+)?\s*:\s*/i, "").trim())
                    .filter(Boolean);
                const fixedEntry = phoneEntries.find((entry) => /^fixe/i.test(entry));
                const fallbackPhone = String(slip?.phone || "").trim();

                setFirstName(resolvedName.firstName);
                setLastName(resolvedName.lastName);
                setEmail(String(slip?.email || data?.contactEmail || ""));
                setMobilePhones(mobileEntries.length > 0 ? mobileEntries : [fallbackPhone || String(data?.phone || "")].filter(Boolean).slice(0, 1).concat([""]).slice(0, 1));
                setLandlinePhone(fixedEntry ? fixedEntry.replace(/^fixe\s*:\s*/i, "").trim() : "");
                setFeedback(`Formulaire prérempli depuis la demande #${reclamationId}.`);
            } catch (error) {
                console.error("Load reclamation prefill error:", error);
            }
        };

        loadReclamationPrefill();
    }, [searchParams]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const filteredClients = useMemo(() => {
        const term = normalizeSearchValue(clientSearch);
        const termDigits = normalizeDigits(clientSearch);
        if (!term) return clients;

        return clients.filter((client) => {
            const searchableText = normalizeSearchValue(`${client.id} ${client.name} ${client.email} ${client.phone || ""}`);
            const searchableDigits = normalizeDigits(`${client.id} ${client.phone || ""}`);

            return searchableText.includes(term) || (termDigits.length > 0 && searchableDigits.includes(termDigits));
        });
    }, [clients, clientSearch]);

    const saveClientAccess = async () => {
        const cleanEmail = email.trim().toLowerCase();
        const cleanMobilePhones = mobilePhones.map((entry) => entry.trim()).filter(Boolean);
        if (!lastName.trim()) {
            alert("Nom requis.");
            return;
        }
        if (!cleanEmail) {
            alert("E-mail client obligatoire.");
            return;
        }
        if (cleanMobilePhones.length === 0) {
            alert("Portable client obligatoire.");
            return;
        }
        if (!password || password.length < 6) {
            alert("Mot de passe: minimum 6 caractères.");
            return;
        }
        if (password !== confirmPassword) {
            alert("La confirmation du mot de passe ne correspond pas.");
            return;
        }

        const userRaw = localStorage.getItem("user");
        const user = userRaw ? JSON.parse(userRaw) : {};
        if (!user?.id) {
            alert("Utilisateur ADV non détecté.");
            return;
        }

        setSaving(true);
        setFeedback("");
        setClientAccessMessage("");
        try {
            const response = await fetch("/api/adv/client-access", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    advUserId: Number(user.id),
                    reclamationId: Number(searchParams.get("reclamationId") || 0) || null,
                    email: cleanEmail,
                    password,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    mobilePhones: cleanMobilePhones,
                    landlinePhone: landlinePhone.trim() || null
                })
            });
            const data = await response.json();
            if (!response.ok) {
                alert(data?.error || "Impossible d'enregistrer le client.");
                return;
            }

            setFeedback(data?.message || "Client enregistré avec succès.");
            setClientAccessMessage(data?.clientMessage || "");
            setPassword("");
            setConfirmPassword("");
            setMobilePhones([""]);
            setLandlinePhone("");
            await loadClients();
        } catch (error) {
            console.error("Save client access error:", error);
            alert("Erreur réseau pendant l'enregistrement.");
        } finally {
            setSaving(false);
        }
    };

    // Cette partie affiche l interface visible a l ecran.
    return (
        <>
            <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>
                    <UserPlus size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                    Nouveau client
                </h2>

                <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.7rem", maxWidth: "680px" }}>
                    <div className={styles.field}>
                        <label className={styles.label}>Prénom</label>
                        <input className={styles.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ex: Aya" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Nom</label>
                        <input className={styles.input} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ex: Abrouk" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Gmail</label>
                        <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@clinique.ma" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Portable(s)</label>
                        <div style={{ display: "grid", gap: "0.55rem" }}>
                            {mobilePhones.map((value, index) => (
                                <div key={`mobile-phone-${index}`} style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
                                    <input
                                        className={styles.input}
                                        value={value}
                                        onChange={(e) => updateMobilePhone(index, e.target.value)}
                                        placeholder={`Portable ${index + 1}`}
                                    />
                                    {mobilePhones.length > 1 ? (
                                        <button className="btn btn-outline" type="button" onClick={() => removeMobilePhone(index)} aria-label={`Supprimer portable ${index + 1}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                            <div>
                                <button className="btn btn-outline" type="button" onClick={addMobilePhone}>
                                    <Plus size={14} />
                                    Ajouter un portable
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Fixe</label>
                        <input className={styles.input} value={landlinePhone} onChange={(e) => setLandlinePhone(e.target.value)} placeholder="05xxxxxxxx" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Mot de passe</label>
                        <input className={styles.input} type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 caractères" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Confirmer mot de passe</label>
                        <input className={styles.input} type="text" autoComplete="off" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Retaper le mot de passe" />
                    </div>
                </div>

                <div className={styles.actions} style={{ marginTop: "0.8rem" }}>
                    <button className="btn btn-primary" onClick={saveClientAccess} disabled={saving}>
                        {saving ? "Enregistrement..." : "Enregistrer nouveau client"}
                    </button>
                </div>

                {feedback ? (
                    <div className={styles.helper} style={{ marginTop: "0.55rem" }}>
                        {feedback}
                    </div>
                ) : null}
                {clientAccessMessage ? (
                    <div className={styles.helper} style={{ marginTop: "0.55rem", whiteSpace: "pre-wrap", border: "1px solid var(--border-color)", borderRadius: 8, padding: "0.7rem" }}>
                        {clientAccessMessage}
                    </div>
                ) : null}

                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setShowClientAccessTable((current) => !current)}
                    >
                        Client accès plateforme
                    </button>
                </div>
            </section>

            {showClientAccessTable ? (
            <section className={styles.sectionCard}>
                <div className={styles.clientsHeaderRow}>
                    <h3 className={styles.sectionTitle}>Clients accès plateforme</h3>
                    <div className={styles.clientsHeaderTools}>
                        <div className={styles.clientsSearchWrap}>
                            <input
                                className={styles.input}
                                value={clientSearch}
                                onChange={(e) => setClientSearch(e.target.value)}
                                placeholder="Rechercher par nom, gmail ou numéro..."
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className={styles.empty}>Chargement des clients...</div>
                ) : clients.length === 0 ? (
                    <div className={styles.empty}>Aucun client enregistré pour le moment.</div>
                ) : filteredClients.length === 0 ? (
                    <div className={styles.empty}>Aucun client trouvé pour cette recherche.</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={`${styles.table} ${styles.clientsTable}`}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Client</th>
                                    <th>Login</th>
                                    <th>Mot de passe</th>
                                    <th>Téléphones</th>
                                    <th>Créé le</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClients.map((client, index) => (
                                    <tr key={client.id} className={styles.clientsRow}>
                                        <td>
                                            <span className={styles.clientIdPill}>{index + 1}</span>
                                        </td>
                                        <td>
                                            <span className={styles.clientNameStrong}>{client.name}</span>
                                        </td>
                                        <td>
                                            <a className={styles.clientEmailLink} href={`mailto:${client.email}`}>
                                                {client.email}
                                            </a>
                                        </td>
                                        <td>
                                            <span className={styles.clientPhoneChip} style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>
                                                {client.visiblePassword || "-"}
                                            </span>
                                        </td>
                                        <td>
                                            {splitPhoneEntries(client.phone).length === 0 ? (
                                                <span className={styles.clientPhoneEmpty}>Non renseigné</span>
                                            ) : (
                                                <div className={styles.clientPhoneList}>
                                                    {splitPhoneEntries(client.phone).map((entry, index) => {
                                                        const normalized = entry.toLowerCase();
                                                        const toneClass = normalized.startsWith("portable")
                                                            ? styles.clientPhoneMobile
                                                            : normalized.startsWith("fixe")
                                                                ? styles.clientPhoneFixed
                                                                : styles.clientPhoneGeneric;
                                                        // Cette partie affiche l interface visible a l ecran.
                                                        return (
                                                            <span key={`${client.id}-${index}-${entry}`} className={`${styles.clientPhoneChip} ${toneClass}`}>
                                                                {entry}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={styles.clientDate}>{formatDate(client.createdAt)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            ) : null}
        </>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "clients" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
