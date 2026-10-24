"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AttachmentItem = {
    name: string;
    url: string;
    contentType?: string | null;
    size?: number | null;
};

type SupplierThreadMessage = {
    id: number;
    action: string;
    createdAt: string;
    senderName: string;
    senderRole: string | null;
    payload: {
        threadId: string;
        subject: string;
        bodyText: string;
        direction: "OUTBOUND" | "INBOUND";
        supplier: string;
        supplierEmail: string;
        attachments?: AttachmentItem[];
        externalDate?: string | null;
    };
};

type SupplierThread = {
    threadId: string;
    orderId: number | null;
    orderRef: string;
    supplier: string;
    supplierEmail: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    ticket: {
        id: number;
        title: string;
        equipmentId: number;
    } | null;
    items: Array<{
        id: number;
        name: string;
        ref: string | null;
        qty: number;
        ticketId: number | null;
    }>;
    messages: SupplierThreadMessage[];
};

type LocalUser = {
    id: number | null;
    role: string | null;
    name: string | null;
};

type SupplierMessagingWorkspaceProps = {
    theme?: "default" | "admin";
};

type UploadedAttachment = {
    name: string;
    rawUrl: string;
    contentType?: string | null;
};

function getLocalUser(): LocalUser {
    if (typeof window === "undefined") return { id: null, role: null, name: null };
    try {
        const parsed = JSON.parse(localStorage.getItem("user") || "{}");
        return {
            id: Number(parsed?.id || 0) || null,
            role: typeof parsed?.role === "string" ? parsed.role : null,
            name: typeof parsed?.name === "string" ? parsed.name : null
        };
    } catch {
        return { id: null, role: null, name: null };
    }
}

function formatDate(value: string | null | undefined) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(parsed);
}

function getDisplayName(thread: SupplierThread) {
    const rawSupplier = String(thread.supplier || "").trim();
    const normalized = rawSupplier.toLowerCase();
    if (rawSupplier && normalized !== "service import" && normalized !== "magasin principal") return rawSupplier;
    return "Fournisseur";
}

function getThreadPreview(thread: SupplierThread) {
    const lastMessage = thread.messages[thread.messages.length - 1];
    if (!lastMessage) return "Aucun message";
    const text = String(lastMessage.payload.bodyText || "").trim().replace(/\s+/g, " ");
    if (!text) return "Aucun message";
    return text.length > 54 ? `${text.slice(0, 54)}...` : text;
}

function GmailMark() {
    return (
        <span style={styles.gmailMark} aria-label="Gmail">
            <span style={{ ...styles.gmailStroke, background: "#ea4335", transform: "rotate(35deg) translate(1px, -1px)" }} />
            <span style={{ ...styles.gmailStroke, background: "#34a853", transform: "rotate(-35deg) translate(-1px, -1px)" }} />
            <span style={{ ...styles.gmailStroke, background: "#fbbc05", width: 7, height: 2, left: 2, right: "auto", bottom: 1, transform: "none" }} />
            <span style={{ ...styles.gmailStroke, background: "#4285f4", width: 7, height: 2, right: 2, left: "auto", bottom: 1, transform: "none" }} />
        </span>
    );
}

async function uploadFiles(files: File[]) {
    const uploaded: UploadedAttachment[] = [];
    for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/uploads", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(String(data?.error || `Téléversement impossible: ${file.name}`));
        }
        uploaded.push({
            name: String(data?.name || file.name),
            rawUrl: String(data?.rawUrl || ""),
            contentType: String(data?.type || file.type || "") || null
        });
    }
    return uploaded;
}

export default function SupplierMessagingWorkspace({ theme = "default" }: SupplierMessagingWorkspaceProps) {
    const isAdminTheme = theme === "admin";
    const [threads, setThreads] = useState<SupplierThread[]>([]);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [recipientEmail, setRecipientEmail] = useState("");
    const [supplierName, setSupplierName] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [user, setUser] = useState<LocalUser>({ id: null, role: null, name: null });
    const conversationRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setUser(getLocalUser());
    }, []);

    async function loadThreads(preferredThreadId?: string | null) {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/responsable-technique/supplier-messaging", { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(String(data?.error || "Chargement impossible."));
            const nextThreads = Array.isArray(data) ? data : [];
            setThreads(nextThreads);
            const fallbackThreadId = preferredThreadId || nextThreads[0]?.threadId || null;
            setSelectedThreadId((current) => {
                const target = preferredThreadId || current || fallbackThreadId;
                return nextThreads.some((thread: SupplierThread) => thread.threadId === target) ? target : fallbackThreadId;
            });
        } catch (fetchError: any) {
            setError(String(fetchError?.message || "Chargement impossible."));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadThreads();
    }, []);

    const selectedThread = useMemo(
        () => threads.find((thread) => thread.threadId === selectedThreadId) || null,
        [threads, selectedThreadId]
    );

    useEffect(() => {
        if (!conversationRef.current) return;
        conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }, [selectedThread?.messages.length, selectedThreadId]);

    useEffect(() => {
        if (isCreatingNew) {
            setSubject("");
            setRecipientEmail("");
            setSupplierName("");
            setSelectedFiles([]);
            return;
        }
        if (!selectedThread) return;
        const lastSubject = [...selectedThread.messages].reverse().find((entry) => entry.payload.subject)?.payload.subject;
        setSubject(lastSubject || `Echange avec ${getDisplayName(selectedThread)}`);
        setRecipientEmail(selectedThread.supplierEmail || "");
        setSupplierName(getDisplayName(selectedThread));
        setSelectedFiles([]);
    }, [selectedThread?.threadId, isCreatingNew]);

    async function syncThread(thread: SupplierThread, silent = false) {
        setSyncing(true);
        if (!silent) {
            setError(null);
            setSuccess(null);
        }
        try {
            const response = await fetch("/api/responsable-technique/supplier-messaging/sync", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-role": String(user.role || "RESPONSABLE_TECHNIQUE"),
                    "x-user-id": String(user.id || "")
                },
                body: JSON.stringify({ orderId: thread.orderId, threadId: thread.threadId })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(String(data?.error || "Synchronisation impossible."));
            const createdCount = Array.isArray(data?.createdMessages) ? data.createdMessages.length : 0;
            if (!silent) {
                setSuccess(createdCount > 0 ? `${createdCount} message(s) reçu(s).` : null);
            }
            if (createdCount > 0) {
                await loadThreads(thread.threadId);
            }
        } catch (syncError: any) {
            if (!silent) setError(String(syncError?.message || "Synchronisation impossible."));
        } finally {
            setSyncing(false);
        }
    }

    useEffect(() => {
        if (!selectedThread || isCreatingNew || !user.id) return;
        void syncThread(selectedThread, true);
    }, [selectedThreadId, isCreatingNew, user.id]);

    function startNewConversation() {
        setIsCreatingNew(true);
        setSelectedThreadId(null);
        setError(null);
        setSuccess(null);
        setSubject("");
        setRecipientEmail("");
        setSupplierName("");
        setMessage("");
        setSelectedFiles([]);
    }

    function openThread(threadId: string) {
        setIsCreatingNew(false);
        setSelectedThreadId(threadId);
        setError(null);
        setSuccess(null);
    }

    async function handleSend() {
        if (!isCreatingNew && !selectedThread) return;
        setSending(true);
        setError(null);
        setSuccess(null);
        try {
            const uploadedAttachments = selectedFiles.length > 0 ? await uploadFiles(selectedFiles) : [];
            const response = await fetch("/api/responsable-technique/supplier-messaging", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-role": String(user.role || "RESPONSABLE_TECHNIQUE"),
                    "x-user-id": String(user.id || "")
                },
                body: JSON.stringify({
                    orderId: selectedThread?.orderId,
                    threadId: selectedThread?.threadId,
                    supplierName,
                    subject,
                    message,
                    supplierEmail: recipientEmail,
                    attachments: uploadedAttachments
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(String(data?.error || "Envoi impossible."));
            setMessage("");
            setSelectedFiles([]);
            setSuccess("Envoyé.");
            setIsCreatingNew(false);
            await loadThreads(String(data?.threadId || selectedThread?.threadId || ""));
        } catch (sendError: any) {
            setError(String(sendError?.message || "Envoi impossible."));
        } finally {
            setSending(false);
        }
    }

    const visibleThreads = threads;

    return (
        <div style={{ ...styles.page, ...(isAdminTheme ? adminTheme.page : null) }}>
            {error ? <div style={{ ...styles.errorBox, ...(isAdminTheme ? adminTheme.errorBox : null) }}>{error}</div> : null}
            {success ? <div style={{ ...styles.successBox, ...(isAdminTheme ? adminTheme.successBox : null) }}>{success}</div> : null}

            <div style={styles.layout}>
                <aside style={{ ...styles.sidebar, ...(isAdminTheme ? adminTheme.sidebar : null) }}>
                    <button type="button" onClick={startNewConversation} style={{ ...styles.newButton, ...(isAdminTheme ? adminTheme.newButton : null) }}>
                        Nouveau message
                    </button>
                    {loading ? <div style={{ ...styles.muted, ...(isAdminTheme ? adminTheme.muted : null) }}>Chargement...</div> : null}
                    {!loading && visibleThreads.length === 0 ? <div style={{ ...styles.muted, ...(isAdminTheme ? adminTheme.muted : null) }}>Aucun échange.</div> : null}
                    {visibleThreads.map((thread) => {
                        const lastMessage = thread.messages[thread.messages.length - 1];
                        const isActive = thread.threadId === selectedThreadId && !isCreatingNew;
                        return (
                            <button
                                key={thread.threadId}
                                type="button"
                                onClick={() => openThread(thread.threadId)}
                                style={{
                                    ...styles.threadButton,
                                    ...(isAdminTheme ? adminTheme.threadButton : null),
                                    ...(isActive ? styles.threadButtonActive : null)
                                    ,...(isActive && isAdminTheme ? adminTheme.threadButtonActive : null)
                                }}
                            >
                                <strong style={{ ...styles.threadName, ...(isAdminTheme ? adminTheme.threadName : null) }}>{getDisplayName(thread)}</strong>
                                <div style={{ ...styles.threadPreview, ...(isAdminTheme ? adminTheme.threadPreview : null) }}>{getThreadPreview(thread)}</div>
                                <div style={styles.threadFooter}>
                                    <span style={{ ...styles.threadMeta, ...(isAdminTheme ? adminTheme.threadMeta : null) }}>{thread.supplierEmail}</span>
                                    <span style={{ ...styles.threadMeta, ...(isAdminTheme ? adminTheme.threadMeta : null) }}>{lastMessage ? formatDate(lastMessage.payload.externalDate || lastMessage.createdAt) : ""}</span>
                                </div>
                            </button>
                        );
                    })}
                </aside>

                <section style={styles.content}>
                    {isCreatingNew ? (
                        <div style={{ ...styles.editorCard, ...(isAdminTheme ? adminTheme.editorCard : null) }}>
                            <label style={styles.label}>
                                <span style={{ ...styles.labelText, ...(isAdminTheme ? adminTheme.labelText : null) }}>E-mail</span>
                                <input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} style={{ ...styles.input, ...(isAdminTheme ? adminTheme.input : null) }} placeholder="contact@fournisseur.com" />
                            </label>
                            <label style={styles.label}>
                                <span style={{ ...styles.labelText, ...(isAdminTheme ? adminTheme.labelText : null) }}>Objet</span>
                                <input value={subject} onChange={(event) => setSubject(event.target.value)} style={{ ...styles.input, ...(isAdminTheme ? adminTheme.input : null) }} placeholder="Objet" />
                            </label>
                            <label style={styles.label}>
                                <span style={{ ...styles.labelText, ...(isAdminTheme ? adminTheme.labelText : null) }}>Message</span>
                                <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={10} style={{ ...styles.textarea, ...(isAdminTheme ? adminTheme.textarea : null) }} placeholder="Écrivez votre message..." />
                            </label>
                            <label style={{ ...styles.filePicker, ...(isAdminTheme ? adminTheme.filePicker : null) }}>
                                <input type="file" multiple style={{ display: "none" }} onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
                                Ajouter des fichiers
                            </label>
                            {selectedFiles.length > 0 ? (
                                <div style={styles.attachmentsList}>
                                    {selectedFiles.map((file) => (
                                        <span key={`${file.name}-${file.size}`} style={{ ...styles.attachmentChip, ...(isAdminTheme ? adminTheme.attachmentChip : null) }}>{file.name}</span>
                                    ))}
                                </div>
                            ) : null}
                            <div style={styles.composerActions}>
                                <button type="button" onClick={handleSend} style={{ ...styles.primaryButton, ...(isAdminTheme ? adminTheme.primaryButton : null) }} disabled={sending || !message.trim() || !recipientEmail.trim() || !subject.trim() || !user.id}>
                                    {sending ? "Envoi..." : "Envoyer"}
                                </button>
                            </div>
                        </div>
                    ) : !selectedThread ? (
                        <div style={{ ...styles.emptyState, ...(isAdminTheme ? adminTheme.emptyState : null) }}>Nouveau message</div>
                    ) : (
                        <>
                            <div style={{ ...styles.messagesPanel, ...(isAdminTheme ? adminTheme.messagesPanel : null) }} ref={conversationRef}>
                                {selectedThread.messages.map((entry) => {
                                    const inbound = entry.payload.direction === "INBOUND";
                                    return (
                                        <div key={entry.id} style={{ ...styles.messageRow, justifyContent: inbound ? "flex-start" : "flex-end" }}>
                                            <article style={{ ...styles.messageCard, ...(inbound ? styles.messageInbound : styles.messageOutbound), ...(inbound && isAdminTheme ? adminTheme.messageInbound : null), ...(!inbound && isAdminTheme ? adminTheme.messageOutbound : null) }}>
                                                <div style={{ ...styles.messageBody, ...(isAdminTheme ? adminTheme.messageBody : null) }}>{entry.payload.bodyText}</div>
                                                {Array.isArray(entry.payload.attachments) && entry.payload.attachments.length > 0 ? (
                                                    <div style={styles.attachmentsList}>
                                                        {entry.payload.attachments.map((attachment) => (
                                                            <a key={`${entry.id}-${attachment.url}`} href={attachment.url} target="_blank" rel="noreferrer" style={{ ...styles.attachmentLink, ...(isAdminTheme ? adminTheme.attachmentLink : null) }}>
                                                                {attachment.name}
                                                            </a>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                <div style={{ ...styles.messageFooter, ...(isAdminTheme ? adminTheme.messageFooter : null) }}>
                                                    <span>{formatDate(entry.payload.externalDate || entry.createdAt)}</span>
                                                    <GmailMark />
                                                </div>
                                            </article>
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ ...styles.editorCard, ...(isAdminTheme ? adminTheme.editorCard : null) }}>
                                <label style={styles.label}>
                                    <span style={{ ...styles.labelText, ...(isAdminTheme ? adminTheme.labelText : null) }}>Message</span>
                                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} style={{ ...styles.textarea, ...(isAdminTheme ? adminTheme.textarea : null) }} placeholder="Écrivez votre réponse..." />
                                </label>
                                <label style={{ ...styles.filePicker, ...(isAdminTheme ? adminTheme.filePicker : null) }}>
                                    <input type="file" multiple style={{ display: "none" }} onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
                                    Ajouter des fichiers
                                </label>
                                {selectedFiles.length > 0 ? (
                                    <div style={styles.attachmentsList}>
                                        {selectedFiles.map((file) => (
                                            <span key={`${file.name}-${file.size}`} style={{ ...styles.attachmentChip, ...(isAdminTheme ? adminTheme.attachmentChip : null) }}>{file.name}</span>
                                        ))}
                                    </div>
                                ) : null}
                                <div style={styles.composerActions}>
                                    <button type="button" onClick={handleSend} style={{ ...styles.primaryButton, ...(isAdminTheme ? adminTheme.primaryButton : null) }} disabled={sending || !message.trim() || !user.id || !recipientEmail.trim() || !subject.trim() || syncing}>
                                        {sending ? "Envoi..." : "Envoyer"}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    page: { display: "grid", gap: "1rem", padding: "1.25rem" },
    layout: { display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: "1rem", minHeight: "calc(100vh - 180px)" },
    sidebar: {
        display: "grid",
        gap: "0.75rem",
        alignContent: "start",
        padding: "1rem",
        borderRadius: "18px",
        background: "#fff7ed",
        border: "1px solid rgba(194, 65, 12, 0.14)",
        overflow: "auto"
    },
    newButton: {
        padding: "0.8rem 1rem",
        borderRadius: "12px",
        border: "none",
        background: "#c2410c",
        color: "white",
        fontWeight: 700,
        cursor: "pointer"
    },
    threadButton: {
        display: "grid",
        gap: "0.4rem",
        padding: "0.85rem",
        borderRadius: "14px",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        background: "white",
        textAlign: "left",
        cursor: "pointer"
    },
    threadButtonActive: { border: "1px solid #c2410c", boxShadow: "0 0 0 1px rgba(194, 65, 12, 0.12)" },
    threadName: { color: "#111827", fontSize: "1rem" },
    threadPreview: { color: "#334155", lineHeight: 1.45 },
    threadFooter: { display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" },
    threadMeta: { color: "#6b7280", fontSize: "0.82rem" },
    content: { display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: "1rem", minHeight: 0 },
    messagesPanel: {
        display: "grid",
        gap: "0.9rem",
        padding: "1rem",
        borderRadius: "18px",
        background: "white",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        overflow: "auto",
        alignContent: "start"
    },
    messageRow: { display: "flex", width: "100%" },
    messageCard: { display: "grid", gap: "0.7rem", maxWidth: "78%", padding: "0.95rem 1rem", borderRadius: "18px" },
    messageInbound: { background: "#f8fafc", border: "1px solid rgba(148, 163, 184, 0.22)" },
    messageOutbound: { background: "#fff7ed", border: "1px solid rgba(194, 65, 12, 0.16)" },
    messageBody: { color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" },
    messageFooter: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.45rem", color: "#6b7280", fontSize: "0.78rem" },
    gmailMark: { position: "relative", width: 16, height: 12, display: "inline-block", borderRadius: 3, background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.35)", overflow: "hidden" },
    gmailStroke: { position: "absolute", width: 8, height: 2, top: 2, left: 1, borderRadius: 999 },
    editorCard: {
        display: "grid",
        gap: "0.85rem",
        padding: "1rem",
        borderRadius: "18px",
        background: "white",
        border: "1px solid rgba(15, 23, 42, 0.08)"
    },
    label: { display: "grid", gap: "0.4rem" },
    labelText: { fontSize: "0.84rem", fontWeight: 700, color: "#64748b" },
    input: { width: "100%", padding: "0.8rem 0.9rem", borderRadius: "12px", border: "1px solid rgba(148, 163, 184, 0.42)" },
    textarea: { width: "100%", padding: "0.9rem 1rem", borderRadius: "14px", border: "1px solid rgba(148, 163, 184, 0.42)", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 },
    filePicker: { display: "inline-flex", width: "fit-content", padding: "0.72rem 0.95rem", borderRadius: "12px", border: "1px solid rgba(194, 65, 12, 0.24)", color: "#9a3412", fontWeight: 700, cursor: "pointer", background: "#fff7ed" },
    attachmentsList: { display: "flex", flexWrap: "wrap", gap: "0.5rem" },
    attachmentChip: { padding: "0.4rem 0.65rem", borderRadius: "999px", background: "#f1f5f9", color: "#334155", fontSize: "0.82rem" },
    attachmentLink: { padding: "0.4rem 0.65rem", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.82rem", textDecoration: "none" },
    composerActions: { display: "flex", justifyContent: "flex-end" },
    primaryButton: { padding: "0.8rem 1.15rem", borderRadius: "12px", border: "none", background: "#c2410c", color: "white", fontWeight: 700, cursor: "pointer" },
    emptyState: { display: "grid", placeItems: "center", borderRadius: "18px", background: "white", border: "1px solid rgba(15, 23, 42, 0.08)", color: "#64748b" },
    errorBox: { padding: "0.9rem 1rem", borderRadius: "14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid rgba(185, 28, 28, 0.16)" },
    successBox: { padding: "0.9rem 1rem", borderRadius: "14px", background: "#ecfdf5", color: "#047857", border: "1px solid rgba(4, 120, 87, 0.16)" },
    muted: { color: "#6b7280" }
};

const adminTheme: Record<string, React.CSSProperties> = {
    page: { padding: 0 },
    sidebar: {
        background: "linear-gradient(180deg, #fff7f7 0%, #ffffff 100%)",
        border: "1px solid rgba(193, 18, 31, 0.18)",
        boxShadow: "0 18px 35px rgba(15, 23, 42, 0.05)"
    },
    newButton: { background: "#c1121f", color: "#ffffff" },
    muted: { color: "#64748b" },
    threadButton: { border: "1px solid rgba(15, 23, 42, 0.1)", background: "#ffffff" },
    threadButtonActive: { border: "1px solid #c1121f", boxShadow: "0 0 0 1px rgba(193, 18, 31, 0.16)", background: "#fff5f5" },
    threadName: { color: "#111827" },
    threadPreview: { color: "#334155" },
    threadMeta: { color: "#6b7280" },
    messagesPanel: { background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.08)" },
    editorCard: { background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.08)" },
    labelText: { color: "#334155" },
    input: { border: "1px solid rgba(193, 18, 31, 0.2)", color: "#111827", background: "#ffffff" },
    textarea: { border: "1px solid rgba(193, 18, 31, 0.2)", color: "#111827", background: "#ffffff" },
    filePicker: { border: "1px solid rgba(193, 18, 31, 0.22)", color: "#9f1239", background: "#fff5f5" },
    attachmentChip: { background: "#111827", color: "#ffffff" },
    attachmentLink: { background: "#fff1f2", color: "#9f1239" },
    primaryButton: { background: "#111827", color: "#ffffff" },
    emptyState: { background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.08)", color: "#64748b" },
    messageInbound: { background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.1)" },
    messageOutbound: { background: "#fff1f2", border: "1px solid rgba(193, 18, 31, 0.18)" },
    messageBody: { color: "#111827" },
    messageFooter: { color: "#6b7280" },
    errorBox: { background: "#fef2f2", color: "#b91c1c", border: "1px solid rgba(185, 28, 28, 0.16)" },
    successBox: { background: "#111827", color: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.2)" }
};
