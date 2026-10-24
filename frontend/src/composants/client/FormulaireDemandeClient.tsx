"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, FileUp, ImagePlus, List, Loader2, Pencil, Plus, Send } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/(espaces)/client/client.module.css";
import { parseChecklistPayload, SOS_CHECKLIST_TITLE, SOS_QUESTIONS } from "@/metier/workflow-client";

type FormData = {
    firstName: string;
    lastName: string;
    clientCode: string;
    phoneMobile: string;
    phoneFixed: string;
    establishment: string;
    establishmentType: "CLINIQUE" | "HOPITAL" | "SOCIETE" | "CABINET_MEDICAL" | "";
    city: string;
    specialtySector: "PRIVE" | "PUBLIC" | "";
    specialty: string;
    specialtyOther: string;
    email: string;
    pn: string;
    equipmentName: string;
    accessories: string;
    brand: string;
    model: string;
    serialNumber: string;
    publicMarketNumber: string;
    articleCode: string;
    warrantyLabel: string;
    invoiceDate: string;
    shippingDate: string;
    description: string;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    errorMessageDetails: string;
    interventionType: "SITE" | "WORKSHOP";
};

type SosValue = boolean | null;
type UploadedAsset = {
    name: string;
    url: string;
    type: string;
};

type ExistingAttachment = {
    name: string;
    dataUrl: string;
    type?: string;
    title?: string;
    kind: "DOCUMENT" | "MEDIA";
};

const PRIVATE_SPECIALTIES = [
    "Médecine générale",
    "Cardiologie",
    "Radiologie",
    "Anesthésie-réanimation",
    "Pédiatrie",
    "Gynécologie-obstétrique",
    "ORL",
    "Ophtalmologie",
    "Chirurgie générale",
    "Dermatologie"
];

const PUBLIC_SPECIALTIES = [
    "Ingénieur biomédical",
    "Technicien biomédical",
    "Responsable maintenance",
    "Cadre de santé",
    "Médecin urgentiste",
    "Infirmier(ère)",
    "Manipulateur en radiologie",
    "Pharmacien hospitalier",
    "Administrateur hospitalier",
    "Responsable des achats"
];

const INITIAL_FORM: FormData = {
    firstName: "",
    lastName: "",
    clientCode: "",
    phoneMobile: "",
    phoneFixed: "",
    establishment: "",
    establishmentType: "",
    city: "",
    specialtySector: "",
    specialty: "",
    specialtyOther: "",
    email: "",
    pn: "",
    equipmentName: "",
    accessories: "",
    brand: "",
    model: "",
    serialNumber: "",
    publicMarketNumber: "",
    articleCode: "",
    warrantyLabel: "",
    invoiceDate: "",
    shippingDate: "",
    description: "",
    urgency: "MEDIUM",
    errorMessageDetails: "",
    interventionType: "SITE"
};

function splitCustomerName(raw: string) {
    const full = String(raw || "").trim();
    if (!full) {
        return { firstName: "", lastName: "" };
    }
    const [firstName = "", ...rest] = full.split(" ");
    return {
        firstName,
        lastName: rest.join(" ")
    };
}

function extractPhonesFromText(raw: unknown) {
    const value = String(raw || "").trim();
    if (!value) return { mobile: "", fixed: "" };

    const normalized = value.replace(/\r/g, "\n");
    const mobileMatch = normalized.match(/portable(?:\s+\d+)?\s*:\s*([^|\n;]+)/i);
    const fixedMatch = normalized.match(/fixe\s*:\s*([^|\n;]+)/i);

    if (mobileMatch || fixedMatch) {
        return {
            mobile: String(mobileMatch?.[1] || "").trim(),
            fixed: String(fixedMatch?.[1] || "").trim()
        };
    }

    return { mobile: value, fixed: "" };
}

function resolveUserPhones(user: any) {
    const parsedPhone = extractPhonesFromText(user?.phone);

    return {
        mobile: String(
            user?.phoneMobile ||
            user?.mobilePhone ||
            (Array.isArray(user?.mobilePhones) ? user.mobilePhones[0] : "") ||
            parsedPhone.mobile ||
            ""
        ).trim(),
        fixed: String(
            user?.phoneFixed ||
            user?.fixedPhone ||
            user?.landlinePhone ||
            parsedPhone.fixed ||
            ""
        ).trim()
    };
}

function toSafeUrgency(raw: unknown): FormData["urgency"] {
    const value = String(raw || "").trim().toUpperCase();
    if (value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL") return value;
    return "MEDIUM";
}

function toSafeInterventionType(raw: unknown): FormData["interventionType"] {
    const value = String(raw || "").trim().toUpperCase();
    return value === "WORKSHOP" ? "WORKSHOP" : "SITE";
}

async function uploadFile(file: File): Promise<UploadedAsset> {
    const formData = new FormData();
    formData.append("file", file);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    try {
        const response = await fetch("/api/uploads", {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        const raw = await response.text();
        let data: Record<string, unknown> = {};
        try {
            data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
            data = {};
        }

        if (!response.ok) {
            const apiError = typeof data.error === "string" && data.error.trim().length > 0 ? data.error : "";
            throw new Error(apiError || `Téléversement impossible (${response.status}) : ${file.name}`);
        }

        const url = typeof data.url === "string" ? data.url : "";
        if (!url) {
            throw new Error(`Réponse de téléversement invalide pour ${file.name}`);
        }

        return {
            name: String(data.name || file.name),
            url,
            type: String(data.type || file.type || "application/octet-stream")
        };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`Téléversement trop long (délai 10 min): ${file.name}`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function uploadManyFiles(
    files: File[],
    options?: { concurrency?: number; onProgress?: (done: number, total: number) => void }
) {
    const uploaded: UploadedAsset[] = [];
    const failed: Array<{ name: string; reason: string }> = [];
    const total = files.length;
    const onProgress = options?.onProgress;
    const concurrency = Math.max(1, Math.min(Number(options?.concurrency || 3), 5));

    if (total === 0) {
        onProgress?.(0, 0);
        return { uploaded, failed };
    }

    let done = 0;
    const queue = [...files];

    const worker = async () => {
        while (queue.length > 0) {
            const file = queue.shift();
            if (!file) break;

            try {
                const item = await uploadFile(file);
                uploaded.push(item);
            } catch (error) {
                failed.push({
                    name: file.name,
                    reason: error instanceof Error && error.message ? error.message : "Téléversement impossible"
                });
            } finally {
                done += 1;
                onProgress?.(done, total);
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));

    return { uploaded, failed };
}

async function requestJsonWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 60_000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(input, {
            ...init,
            signal: controller.signal
        });
        const raw = await response.text();
        let data: Record<string, unknown> = {};
        try {
            data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
            data = raw ? { error: raw.slice(0, 300) } : {};
        }

        return { response, data };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Le serveur met trop de temps à répondre. Merci de réessayer.");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

const DOCUMENT_TITLE_HINT = "Facture";
const SUPPLIER_WARRANTY_DOCUMENT_LABEL = "Contrat de garantie";
const DOCUMENT_CATEGORIES: Array<{ label: string; aliases: string[] }> = [
    { label: "Facture", aliases: ["Facture", "Facture fournisseur"] },
    { label: SUPPLIER_WARRANTY_DOCUMENT_LABEL, aliases: [SUPPLIER_WARRANTY_DOCUMENT_LABEL, "Durée de garantie contractuelle de fournisseur"] },
    { label: "Bon de livraison", aliases: ["Bon de livraison", "BL Livraison"] }
];
const MEDIA_TITLE_HINT = "Médias de la panne";
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".rtf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp"
]);

function buildFileKey(file: File) {
    return `${file.name}__${file.size}__${file.lastModified}__${file.type}`;
}

function mergeUniqueFiles(existing: File[], incoming: File[]) {
    const byKey = new Map<string, File>();
    existing.forEach((item) => byKey.set(buildFileKey(item), item));
    incoming.forEach((item) => byKey.set(buildFileKey(item), item));
    return Array.from(byKey.values());
}

function dedupeAttachments(items: ExistingAttachment[]) {
    const dedup = new Map<string, ExistingAttachment>();
    items.forEach((item) => {
        const key = `${item.kind}|${item.dataUrl}|${item.title || ""}`.toLowerCase();
        if (!dedup.has(key)) dedup.set(key, item);
    });
    return Array.from(dedup.values());
}

function fileExtension(name: string) {
    const value = String(name || "");
    const dotIndex = value.lastIndexOf(".");
    if (dotIndex < 0) return "";
    return value.slice(dotIndex).toLowerCase();
}

function sanitizeIncomingFiles(target: "documents" | "medias", incoming: File[]) {
    const accepted: File[] = [];
    const warnings: string[] = [];

    incoming.forEach((file) => {
        const ext = fileExtension(file.name);
        const mime = String(file.type || "").toLowerCase();

        if (target === "documents") {
            const allowedByExt = ALLOWED_DOCUMENT_EXTENSIONS.has(ext);
            const allowedByMime = mime.startsWith("image/") || mime.startsWith("application/") || mime.startsWith("text/");
            if (!allowedByExt && !allowedByMime) {
                warnings.push(`${file.name}: format document non supporté.`);
                return;
            }
            accepted.push(file);
            return;
        }

        const isMedia = mime.startsWith("image/") || mime.startsWith("video/");
        if (!isMedia) {
            warnings.push(`${file.name}: seul image/vidéo est accepté ici.`);
            return;
        }
        accepted.push(file);
    });

    return { accepted, warnings };
}

export default function ClientReclamationForm({ editIdOverride, embedded = false, onSubmitted }: { editIdOverride?: number | string | null; embedded?: boolean; onSubmitted?: () => void } = {}) {
    const router = useRouter();
    const params = useParams<{ ticketId?: string }>();
    const searchParams = useSearchParams();
    const routeEditIdParam = typeof params?.ticketId === "string" ? params.ticketId : "";
    const editIdParam = editIdOverride ? String(editIdOverride) : searchParams.get("editId") || routeEditIdParam;
    const [step, setStep] = useState(1);
    const [submitted, setSubmitted] = useState(false);
    const [submissionMode, setSubmissionMode] = useState<"create" | "update">("create");
    const [submittedReclamationId, setSubmittedReclamationId] = useState<number | null>(null);
    const [submittedTicketId, setSubmittedTicketId] = useState<number | null>(null);
    const [submittedTicketReference, setSubmittedTicketReference] = useState<string | null>(null);
    const [editingReclamationId, setEditingReclamationId] = useState<number | null>(null);
    const [editingTicketReference, setEditingTicketReference] = useState<string | null>(null);
    const [loadingEditData, setLoadingEditData] = useState(false);
    const [form, setForm] = useState<FormData>(INITIAL_FORM);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [sosAnswers, setSosAnswers] = useState<Record<string, SosValue>>(() =>
        SOS_QUESTIONS.reduce((acc, question) => ({ ...acc, [question.id]: null }), {})
    );
    const [documentFiles, setDocumentFiles] = useState<File[]>([]);
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const [documentTitleByKey, setDocumentTitleByKey] = useState<Record<string, string>>({});
    const [mediaTitleByKey, setMediaTitleByKey] = useState<Record<string, string>>({});
    const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
    const nextMediaTitle = MEDIA_TITLE_HINT;
    const [uploadWarning, setUploadWarning] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [currentRole, setCurrentRole] = useState<string>("CLIENT");

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        const role = user?.role ? String(user.role) : "CLIENT";
        const resolvedPhones = resolveUserPhones(user);
        setCurrentRole(role);
        setCurrentUserId(Number.isFinite(Number(user?.id)) ? Number(user.id) : null);

        const fullName = String(user?.name || "").trim();
        const [firstName = "", ...rest] = fullName.split(" ");
        const lastName = rest.join(" ");

        setForm((prev) => ({
            ...prev,
            firstName: prev.firstName || firstName,
            lastName: prev.lastName || lastName,
            phoneMobile: prev.phoneMobile || resolvedPhones.mobile,
            phoneFixed: prev.phoneFixed || resolvedPhones.fixed,
            email: prev.email || user?.email || "",
            // L'urgence est definie uniquement par le client.
            urgency: role === "ADV" ? "MEDIUM" : prev.urgency
        }));
    }, []);

    useEffect(() => {
        const rawEditId = editIdParam;
        const editId = Number(rawEditId || "");
        if (!Number.isFinite(editId) || editId <= 0) {
            setEditingReclamationId(null);
            setLoadingEditData(false);
            setExistingAttachments([]);
            return;
        }

        let cancelled = false;
        setLoadingEditData(true);

        const run = async () => {
            try {
                const user = JSON.parse(localStorage.getItem("user") || "{}");
                const userEmail = String(user?.email || "").trim().toLowerCase();
                const userRole = String(user?.role || "").trim().toUpperCase();

                const response = await fetch(`/api/reclamations/${editId}`);
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.error || "Impossible de charger la demande.");
                }

                if (userRole !== "ADV" && userEmail && String(data?.contactEmail || "").trim().toLowerCase() !== userEmail) {
                    alert("Vous ne pouvez pas modifier cette demande.");
                    router.push("/client/suivi");
                    return;
                }

                const checklistData = parseChecklistPayload(data?.checklist);
                const metadata = checklistData.metadata || {};
                const fallbackName = splitCustomerName(String(data?.customerName || ""));
                const metadataAttachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
                const normalizedExistingAttachments: ExistingAttachment[] = metadataAttachments
                    .map((item) => {
                        const kind: ExistingAttachment["kind"] = item.kind === "MEDIA" ? "MEDIA" : "DOCUMENT";
                        return {
                            name: String(item.name || "Pièce jointe"),
                            dataUrl: String(item.dataUrl || "").trim(),
                            type: item.type ? String(item.type) : undefined,
                            title: item.title ? String(item.title) : undefined,
                            kind
                        };
                    })
                    .filter((item) => item.dataUrl.length > 0);

                const nextSosAnswers = SOS_QUESTIONS.reduce<Record<string, SosValue>>(
                    (acc, question) => ({ ...acc, [question.id]: null }),
                    {}
                );
                const incomingAnswers = checklistData.sosAnswers || {};
                Object.keys(nextSosAnswers).forEach((key) => {
                    const value = (incomingAnswers as Record<string, unknown>)[key];
                    if (typeof value === "boolean") {
                        nextSosAnswers[key] = value;
                    }
                });

                if (cancelled) return;

                const parsedStoredPhones = extractPhonesFromText(data?.phone);

                setSosAnswers(nextSosAnswers);
                setForm((prev) => ({
                    ...prev,
                    firstName: String(metadata.firstName || fallbackName.firstName || ""),
                    lastName: String(metadata.lastName || fallbackName.lastName || ""),
                    clientCode: String(metadata.clientCode || ""),
                    establishment: String(metadata.establishment || ""),
                    establishmentType:
                        metadata.establishmentType === "CLINIQUE" ||
                        metadata.establishmentType === "HOPITAL" ||
                        metadata.establishmentType === "SOCIETE" ||
                        metadata.establishmentType === "CABINET_MEDICAL"
                            ? metadata.establishmentType
                            : "",
                    city: String(metadata.city || ""),
                    specialtySector: metadata.specialtySector === "PRIVE" || metadata.specialtySector === "PUBLIC"
                        ? metadata.specialtySector
                        : "",
                    specialty:
                        String(metadata.specialty || "") === "AUTRE"
                            ? "AUTRE"
                            : String(metadata.specialty || ""),
                    specialtyOther:
                        String(metadata.specialty || "") === "AUTRE"
                            ? String(metadata.specialtyOther || "")
                            : "",
                    email: String(data?.contactEmail || prev.email || ""),
                    pn: String(metadata.pn || data?.sageCode || ""),
                    equipmentName: String(metadata.equipmentName || ""),
                    accessories: String(metadata.accessories || ""),
                    brand: String(metadata.brand || ""),
                    model: String(metadata.model || data?.deviceModel || ""),
                    serialNumber: String(data?.serialNumber || ""),
                    publicMarketNumber: String(metadata.publicMarketNumber || ""),
                    phoneMobile: String(parsedStoredPhones.mobile || data?.phone || prev.phoneMobile || ""),
                    phoneFixed: String(metadata.phoneFixed || parsedStoredPhones.fixed || prev.phoneFixed || ""),
                    description: String(data?.description || ""),
                    urgency: toSafeUrgency(metadata.urgency || prev.urgency),
                    errorMessageDetails: String(metadata.errorMessageDetails || ""),
                    interventionType: toSafeInterventionType(data?.interventionType || prev.interventionType)
                }));
                setDocumentFiles([]);
                setMediaFiles([]);
                setDocumentTitleByKey({});
                setMediaTitleByKey({});
                setExistingAttachments(normalizedExistingAttachments);
                setUploadWarning(null);
                setUploadProgress(null);
                setStep(1);
                setSubmitted(false);
                setSubmissionMode("update");
                setEditingReclamationId(editId);
                setSubmittedReclamationId(editId);
                setEditingTicketReference(String(data?.ticket?.ticketReference || data?.ticket?.displayId || data?.ticket?.id || editId));
            } catch (error) {
                console.error("Client reclamation edit load error:", error);
                if (!cancelled) {
                    alert(error instanceof Error ? error.message : "Impossible de charger la demande.");
                }
            } finally {
                if (!cancelled) {
                    setLoadingEditData(false);
                }
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [editIdParam, router]);

    const privateOrPublicSpecialties = useMemo(() => {
        if (form.specialtySector === "PRIVE") return PRIVATE_SPECIALTIES;
        if (form.specialtySector === "PUBLIC") return PUBLIC_SPECIALTIES;
        return [];
    }, [form.specialtySector]);

    const missingStep1 = useMemo(() => {
        const labels: string[] = [];
        if (form.firstName.trim().length <= 1) labels.push("Prénom");
        if (form.lastName.trim().length <= 1) labels.push("Nom");
        if (form.email.trim().length <= 3) labels.push("E-mail");
        if (currentRole === "ADV" && form.phoneMobile.trim().length <= 3) labels.push("Portable");
        if (currentRole === "ADV" && form.phoneFixed.trim().length <= 3) labels.push("Fixe");
        if (form.city.trim().length <= 1) labels.push("Ville");
        if (!form.specialtySector) labels.push("Secteur");
        if (form.specialty.trim().length <= 1) labels.push("Spécialité");
        if (form.specialty === "AUTRE" && form.specialtyOther.trim().length <= 1) labels.push("Autre spécialité");
        return labels;
    }, [form, currentRole]);

    const missingStep2 = useMemo(() => {
        const labels: string[] = [];
        if (form.equipmentName.trim().length <= 1) labels.push("Désignation du matériel à réparer");
        if (form.brand.trim().length <= 1) labels.push("Marque");
    if (form.model.trim().length <= 1) labels.push("Modèle");
        if (form.serialNumber.trim().length <= 1) labels.push("SN");
        return labels;
    }, [form]);

    const missingStep4 = useMemo(() => {
        const labels: string[] = [];
        if (form.description.trim().length <= 2) labels.push("Description libre de la panne");
        return labels;
    }, [form.description]);

    const setSos = (questionId: string, value: SosValue) => {
        if (questionId === "error" && value !== true) {
            setForm((prev) => ({ ...prev, errorMessageDetails: "" }));
        }
        setSosAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    const addFilesWithTitle = (target: "documents" | "medias", fileList: FileList | null, docTitle: string) => {
        const picked = Array.from(fileList || []);
        if (picked.length === 0) return;

        const sanitized = sanitizeIncomingFiles(target, picked);
        const accepted = sanitized.accepted;
        const warnings = sanitized.warnings;

        if (accepted.length === 0) {
            if (warnings.length > 0) setUploadWarning(warnings.slice(0, 2).join(" | "));
            return;
        }
        if (warnings.length > 0) {
            setUploadWarning(warnings.slice(0, 2).join(" | "));
        } else {
            setUploadWarning(null);
        }

        if (target === "documents") {
            setDocumentFiles((prev) => {
                const merged = mergeUniqueFiles(prev, accepted);
                return merged;
            });
            setDocumentTitleByKey((prev) => {
                const next = { ...prev };
                accepted.forEach((file) => { next[buildFileKey(file)] = docTitle; });
                return next;
            });
        } else {
            setMediaFiles((prev) => {
                const merged = mergeUniqueFiles(prev, accepted);
                return merged;
            });
            setMediaTitleByKey((prev) => {
                const next = { ...prev };
                accepted.forEach((file) => { next[buildFileKey(file)] = docTitle; });
                return next;
            });
        }
    };

    const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const addFiles = (target: "documents" | "medias", fileList: FileList | null) => { // used for medias
        addFilesWithTitle(target, fileList, nextMediaTitle.trim() || "Média");
    };
    const removeFileAt = (target: "documents" | "medias", index: number) => {
        if (target === "documents") {
            setDocumentFiles((prev) => {
                const targetFile = prev[index];
                if (targetFile) {
                    const key = buildFileKey(targetFile);
                    setDocumentTitleByKey((titles) => {
                        const next = { ...titles };
                        delete next[key];
                        return next;
                    });
                }
                return prev.filter((_, idx) => idx !== index);
            });
            return;
        }
        setMediaFiles((prev) => {
            const targetFile = prev[index];
            if (targetFile) {
                const key = buildFileKey(targetFile);
                setMediaTitleByKey((titles) => {
                    const next = { ...titles };
                    delete next[key];
                    return next;
                });
            }
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const removeExistingAttachmentAt = (target: "documents" | "medias", index: number) => {
        const kind = target === "documents" ? "DOCUMENT" : "MEDIA";
        setExistingAttachments((prev) => {
            let currentIndex = -1;
            return prev.filter((item) => {
                if (item.kind !== kind) return true;
                currentIndex += 1;
                return currentIndex !== index;
            });
        });
    };

    const handleSubmit = async () => {
        if (submitting) return;
        if (!editingReclamationId && (missingStep1.length > 0 || missingStep2.length > 0 || missingStep4.length > 0)) {
                alert(`Merci de compléter les champs requis: ${[...missingStep1, ...missingStep2, ...missingStep4].join(", ")}`);
                return;
            }
        setSubmitting(true);
        setUploadWarning(null);
        const totalUploads = documentFiles.length + mediaFiles.length;
        let documentsDone = 0;
        let mediasDone = 0;
        setUploadProgress(totalUploads > 0 ? { done: 0, total: totalUploads } : null);

        try {
            const [documentsUpload, mediasUpload] = await Promise.all([
                uploadManyFiles(documentFiles, {
                    concurrency: 3,
                    onProgress: (done) => {
                        if (totalUploads <= 0) return;
                        documentsDone = done;
                        setUploadProgress({ done: documentsDone + mediasDone, total: totalUploads });
                    }
                }),
                uploadManyFiles(mediaFiles, {
                    concurrency: 2,
                    onProgress: (done) => {
                        if (totalUploads <= 0) return;
                        mediasDone = done;
                        setUploadProgress({ done: documentsDone + mediasDone, total: totalUploads });
                    }
                })
            ]);

            const uploadErrors = [...documentsUpload.failed, ...mediasUpload.failed];
            if (uploadErrors.length > 0) {
                const summary = uploadErrors
                    .slice(0, 3)
                    .map((item) => `${item.name}: ${item.reason}`)
                    .join("\n");
                alert(`Certains fichiers n'ont pas pu être téléversés. La demande sera envoyée avec les fichiers valides.\n${summary}`);
            }

            const uploadedDocuments = documentsUpload.uploaded;
            const uploadedMedias = mediasUpload.uploaded;
            const uploadedCount = uploadedDocuments.length + uploadedMedias.length;

            if (totalUploads > 0 && uploadedCount === 0) {
                alert("Aucun fichier n'a pu être téléversé. La mise à jour n'a pas été envoyée pour éviter une demande vide.");
                return;
            }

            const resolvedSpecialty = form.specialty === "AUTRE" ? "AUTRE" : form.specialty;

            const uploadedAttachments: ExistingAttachment[] = [
                ...uploadedDocuments.map((item) => ({
                    ...(() => {
                        const matchedDoc = documentFiles.find((candidate) => candidate.name === item.name && candidate.type === item.type);
                        const title = matchedDoc ? documentTitleByKey[buildFileKey(matchedDoc)] : undefined;
                        return { title: title || "Document" };
                    })(),
                    name: item.name,
                    type: item.type,
                    kind: "DOCUMENT" as const,
                    dataUrl: item.url
                })),
                ...uploadedMedias.map((item) => ({
                    ...(() => {
                        const matchedMedia = mediaFiles.find((candidate) => candidate.name === item.name && candidate.type === item.type);
                        const title = matchedMedia ? mediaTitleByKey[buildFileKey(matchedMedia)] : undefined;
                        return { title: title || "Média" };
                    })(),
                    name: item.name,
                    type: item.type,
                    kind: "MEDIA" as const,
                    dataUrl: item.url
                }))
            ];
            const attachments = dedupeAttachments([...existingAttachments, ...uploadedAttachments]);

            const primaryAttachmentUrl = attachments[0]?.dataUrl || "";
            const customerName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
            const requesterEmail = String(JSON.parse(localStorage.getItem("user") || "{}")?.email || "").trim().toLowerCase();
            let response: Response;

            if (editingReclamationId) {
                const result = await requestJsonWithTimeout(
                    `/api/reclamations/${editingReclamationId}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            mode: "CLIENT_EDIT",
                            userId: currentUserId,
                            actorRole: currentRole,
                            requesterEmail,
                            contactEmail: form.email,
                            phone: form.phoneMobile || null,
                            firstName: form.firstName,
                            lastName: form.lastName,
                            clientCode: form.clientCode,
                            phoneFixed: form.phoneFixed,
                            establishment: form.establishment,
                            establishmentType: form.establishmentType,
                            city: form.city,
                            specialtySector: form.specialtySector,
                            specialty: resolvedSpecialty,
                            specialtyOther: form.specialty === "AUTRE" ? form.specialtyOther : "",
                            pn: form.pn,
                            equipmentName: form.equipmentName,
                            brand: form.brand,
                            model: form.model,
                            serialNumber: form.serialNumber,
                            publicMarketNumber: form.publicMarketNumber,
                            description: form.description,
                            urgency: form.urgency,
                            accessories: form.accessories.trim(),
                            errorMessageDetails: sosAnswers.error === true ? form.errorMessageDetails.trim() : "",
                            interventionType: form.interventionType,
                            sosAnswers,
                            attachments
                        })
                    }
                );
                response = result.response;
                const responseData = result.data;
                if (!response.ok) {
                    const message = typeof responseData.error === "string" && responseData.error.trim().length > 0
                        ? responseData.error
                        : `Échec de mise à jour (${response.status}).`;
                    alert(message);
                    return;
                }

                setDocumentFiles([]);
                setMediaFiles([]);
                setDocumentTitleByKey({});
                setMediaTitleByKey({});
                setExistingAttachments([]);
                setUploadWarning(null);
                const resolvedId = Number(responseData?.id || editingReclamationId || 0);
                setSubmittedReclamationId(Number.isFinite(resolvedId) && resolvedId > 0 ? resolvedId : null);
                setSubmittedTicketId(Number(responseData?.ticketId || 0) > 0 ? Number(responseData.ticketId) : null);
                setSubmittedTicketReference(typeof responseData?.ticketReference === "string" ? responseData.ticketReference : null);
                setSubmissionMode("update");
                if (embedded) {
                    alert("Modifications enregistrées.");
                    onSubmitted?.();
                    return;
                }
                setSubmitted(true);
                return;
            } else {
                const payload = {
                    customerName,
                    contactEmail: form.email,
                    phone: form.phoneMobile || null,
                    serialNumber: form.serialNumber,
                    deviceModel: form.model,
                    description: form.description,
                    interventionType: form.interventionType,
                    attachmentUrl: primaryAttachmentUrl,
                    attachments,
                    sageCode: form.pn,
                    checklist: {
                        sosAnswers,
                        metadata: {
                            firstName: form.firstName,
                            lastName: form.lastName,
                            clientCode: form.clientCode,
                            phoneFixed: form.phoneFixed,
                            establishment: form.establishment,
                            establishmentType: form.establishmentType,
                            city: form.city,
                            specialtySector: form.specialtySector,
                            specialty: resolvedSpecialty,
                            specialtyOther: form.specialty === "AUTRE" ? form.specialtyOther : "",
                            pn: form.pn,
                            contactPerson: customerName,
                            urgency: form.urgency,
                            equipmentName: form.equipmentName,
                            accessories: form.accessories.trim(),
                            brand: form.brand,
                            model: form.model,
                            publicMarketNumber: form.publicMarketNumber.trim(),
                            errorMessageDetails: sosAnswers.error === true ? form.errorMessageDetails.trim() : "",
                            submittedByRole: currentRole,
                            source: currentRole === "ADV" ? "ADV_FORM" : "CLIENT_FORM",
                            attachments
                        }
                    }
                };

                const result = await requestJsonWithTimeout(
                    "/api/reclamations",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-user-role": currentRole,
                            "x-user-id": String(currentUserId || "")
                        },
                        body: JSON.stringify(payload)
                    }
                );
                response = result.response;
                const responseData = result.data;
                if (!response.ok) {
                    const message = typeof responseData.error === "string" && responseData.error.trim().length > 0
                        ? responseData.error
                        : `Échec d'envoi de la demande (${response.status}).`;
                    alert(message);
                    return;
                }

                setDocumentFiles([]);
                setMediaFiles([]);
                setDocumentTitleByKey({});
                setMediaTitleByKey({});
                setExistingAttachments([]);
                setUploadWarning(null);
                const resolvedId = Number(responseData?.id || editingReclamationId || 0);
                setSubmittedReclamationId(Number.isFinite(resolvedId) && resolvedId > 0 ? resolvedId : null);
                setSubmittedTicketId(Number(responseData?.ticketId || 0) > 0 ? Number(responseData.ticketId) : null);
                setSubmittedTicketReference(typeof responseData?.ticketReference === "string" ? responseData.ticketReference : null);
                setSubmissionMode(editingReclamationId ? "update" : "create");
                setSubmitted(true);
                return;
            }
        } catch (error) {
            console.error("Client reclamation submit error:", error);
            if (error instanceof Error && error.message.trim().length > 0) {
                alert(error.message);
            } else {
                alert("Une erreur est survenue pendant l'envoi.");
            }
        } finally {
            setUploadProgress(null);
            setSubmitting(false);
        }
    };

    const goToNextStep = () => {
        if (editingReclamationId) {
            setStep((prev) => Math.min(prev + 1, 4));
            return;
        }
        if (step === 1 && missingStep1.length > 0) {
            alert(`Merci de compléter: ${missingStep1.join(", ")}`);
            return;
        }
        if (step === 2 && missingStep2.length > 0) {
            alert(`Merci de compléter: ${missingStep2.join(", ")}`);
            return;
        }
        setStep((prev) => Math.min(prev + 1, 4));
    };

    const resetForm = () => {
        setSubmitted(false);
        setSubmissionMode("create");
        setSubmittedReclamationId(null);
        setSubmittedTicketId(null);
        setSubmittedTicketReference(null);
        setEditingReclamationId(null);
        setEditingTicketReference(null);
        setStep(1);
        setForm((prev) => ({
            ...INITIAL_FORM,
            firstName: prev.firstName,
            lastName: prev.lastName,
            phoneMobile: prev.phoneMobile,
            phoneFixed: prev.phoneFixed,
            email: prev.email
        }));
        setSosAnswers(SOS_QUESTIONS.reduce((acc, question) => ({ ...acc, [question.id]: null }), {}));
        setDocumentFiles([]);
        setMediaFiles([]);
        setDocumentTitleByKey({});
        setMediaTitleByKey({});
        setExistingAttachments([]);
        setUploadWarning(null);
        setUploadProgress(null);
        if (editIdParam) {
            router.replace(currentRole === "ADV" ? "/adv/tickets" : "/client/demande-intervention");
        }
    };

    const isContactReadOnly = false;
    const showClientCodeField = currentRole === "ADV" && Boolean(editingReclamationId);
    const existingDocumentAttachments = existingAttachments.filter((item) => item.kind === "DOCUMENT");
    const existingMediaAttachments = existingAttachments.filter((item) => item.kind === "MEDIA");

    if (loadingEditData) {
        return (
            <div className={styles.page}>
                <div className={styles.empty}>Chargement de l'intervention...</div>
            </div>
        );
    }

    if (submitted) {
        const submittedTicketDisplay = submittedTicketReference || submittedTicketId || "-";
        return (
            <div className={`${styles.page} ${styles.confirmationPage}`}>
                <section className={styles.confirmationCard}>
                    <div className={styles.confirmationHeader}>
                        <div className={styles.confirmationIcon} aria-hidden="true">
                            <Check size={34} strokeWidth={2.5} />
                        </div>
                        <div className={styles.confirmationMessage}>
                            <h1 className={styles.heroTitle}>
                                {submissionMode === "update" ? "Ticket mis à jour" : currentRole === "ADV" ? "Demande d'intervention finalisée" : "Merci, votre ticket est créé !"}
                            </h1>
                            <p className={styles.heroDesc}>
                                {submissionMode === "update"
                                    ? "Vos modifications ont bien été enregistrées."
                                    : currentRole === "ADV"
                                        ? "La demande d'intervention a bien été enregistrée."
                                        : "Votre demande d'intervention a bien été enregistrée sous le numéro de ticket :"}
                            </p>
                        </div>
                        {submissionMode !== "update" && currentRole !== "ADV" ? (
                            <div className={styles.ticketNumberBadge}>{submittedTicketDisplay}</div>
                        ) : null}
                        <div className={`${styles.statusBadge} ${styles.statusSuccess}`}>
                            <CheckCircle2 size={16} />
                            {submissionMode === "update" ? "Mise à jour confirmée" : "Envoi confirmé"}
                        </div>
                    </div>
                </section>
                <section className={styles.confirmationActionsCard}>
                    <div className={styles.confirmationActions}>
                        {submittedReclamationId && currentRole !== "ADV" ? (
                            <button className="btn btn-outline" onClick={() => router.push(`/client/demande-intervention?editId=${submittedReclamationId}`)}>
                                <Pencil size={18} />
                                Modifier cette demande d'intervention
                            </button>
                        ) : null}
                        <button className="btn btn-primary" onClick={() => router.push(currentRole === "ADV" ? "/adv/tickets" : "/client/suivi")}>
                            <List size={18} />
                            Voir le suivi
                        </button>
                        <button className="btn btn-outline" onClick={resetForm}>
                            <Plus size={18} />
                            Nouvelle demande d'intervention
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <section className={styles.heroCard}>
                <div>
                    <h1 className={styles.heroTitle}>
                        {editingReclamationId ? `Mise à jour ticket #${editingTicketReference || editingReclamationId}` : "Demande d'intervention"}
                    </h1>
                    <p className={styles.heroDesc}>Étape {step}/4</p>
                    <p className={styles.heroDesc}>Pour une prise en charge rapide de votre problème technique, il est préférable de déposer votre matériel à réparer à Rabat.</p>
                </div>
            </section>

            <section className={styles.form}>
                {step === 1 ? (
                    <div className={styles.formSection}>
                        <h2 className={styles.sectionTitle}>Informations client</h2>
                        <div className={styles.fieldGrid3}>
                            <div className={styles.field}>
                                <label className={styles.label}>Prénom *</label>
                                <input
                                    className={styles.input}
                                    value={form.firstName}
                                    onChange={(e) => updateField("firstName", e.target.value)}
                                    readOnly={isContactReadOnly}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Nom *</label>
                                <input
                                    className={styles.input}
                                    value={form.lastName}
                                    onChange={(e) => updateField("lastName", e.target.value)}
                                    readOnly={isContactReadOnly}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>E-mail *</label>
                                <input
                                    className={styles.input}
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => updateField("email", e.target.value)}
                                    readOnly={isContactReadOnly}
                                />
                            </div>
                        </div>

                        {showClientCodeField ? (
                            <div className={styles.fieldGrid2}>
                                <div className={styles.field}>
                                    <label className={styles.label}>Code client</label>
                                    <input
                                        className={styles.input}
                                        value={form.clientCode}
                                        onChange={(e) => updateField("clientCode", e.target.value)}
                                        placeholder="Optionnel"
                                    />
                                </div>
                            </div>
                        ) : null}

                        <div className={styles.fieldGrid2}>
                            <div className={styles.field}>
                                <label className={styles.label}>Portable *</label>
                                <input
                                    className={styles.input}
                                    value={form.phoneMobile}
                                    onChange={(e) => updateField("phoneMobile", e.target.value)}
                                    readOnly={isContactReadOnly}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Fixe *</label>
                                <input
                                    className={styles.input}
                                    value={form.phoneFixed}
                                    onChange={(e) => updateField("phoneFixed", e.target.value)}
                                    readOnly={isContactReadOnly}
                                />
                            </div>
                        </div>

                        <div className={styles.fieldGrid2}>
                            <div className={styles.field}>
                                <label className={styles.label}>Ville *</label>
                                <input className={styles.input} value={form.city} onChange={(e) => updateField("city", e.target.value)} placeholder="Ex: Casablanca" />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Secteur (privé, public) *</label>
                                <select
                                    className={styles.select}
                                    value={form.specialtySector}
                                    onChange={(e) => {
                                        const nextValue = e.target.value as FormData["specialtySector"];
                                        updateField("specialtySector", nextValue);
                                        updateField("specialty", "");
                                    }}
                                >
                                    <option value="">Sélectionner</option>
                                    <option value="PRIVE">Privé</option>
                                    <option value="PUBLIC">Public</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.fieldGrid2}>
                            <div className={styles.field}>
                                <label className={styles.label}>Spécialité *</label>
                                <select className={styles.select} value={form.specialty} onChange={(e) => updateField("specialty", e.target.value)}>
                                    <option value="">Sélectionner</option>
                                    {privateOrPublicSpecialties.map((entry) => (
                                        <option key={entry} value={entry}>
                                            {entry}
                                        </option>
                                    ))}
                                    <option value="AUTRE">Autre</option>
                                </select>
                                {form.specialty === "AUTRE" ? (
                                    <input
                                        className={styles.input}
                                        style={{ marginTop: "0.35rem" }}
                                        value={form.specialtyOther}
                                        onChange={(e) => updateField("specialtyOther", e.target.value)}
                                        placeholder="Précisez votre spécialité"
                                    />
                                ) : null}
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Établissement (clinique, hôpital, société, cabinet médical...)</label>
                                <input className={styles.input} value={form.establishment} onChange={(e) => updateField("establishment", e.target.value)} />
                            </div>
                        </div>
                    </div>
                ) : null}

                {step === 2 ? (
                    <div className={styles.formSection}>
                    <h2 className={styles.sectionTitle}>Matériel à réparer</h2>
                        <div className={styles.fieldGrid3}>
                            <div className={styles.field}>
                                <label className={styles.label}>Désignation du matériel à réparer *</label>
                                <input className={styles.input} value={form.equipmentName} onChange={(e) => updateField("equipmentName", e.target.value)} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Marque *</label>
                                <input className={styles.input} value={form.brand} onChange={(e) => updateField("brand", e.target.value)} />
                            </div>
                            <div className={styles.field}>
                            <label className={styles.label}>Modèle *</label>
                                <input className={styles.input} value={form.model} onChange={(e) => updateField("model", e.target.value)} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>Numéro de marché (si marché public)</label>
                                <input className={styles.input} value={form.publicMarketNumber} onChange={(e) => updateField("publicMarketNumber", e.target.value)} />
                            </div>
                        </div>

                        <div className={styles.fieldGrid3}>
                            <div className={styles.field}>
                                <label className={styles.label}>SN *</label>
                                <input className={styles.input} value={form.serialNumber} onChange={(e) => updateField("serialNumber", e.target.value)} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>PN</label>
                                <input className={styles.input} value={form.pn} onChange={(e) => updateField("pn", e.target.value)} placeholder="Ex: PN-001" />
                            </div>
                            {currentRole !== "ADV" ? (
                                <div className={styles.field}>
                                    <label className={styles.label}>Niveau d'urgence</label>
                                    <select className={styles.select} value={form.urgency} onChange={(e) => updateField("urgency", e.target.value as FormData["urgency"])}>
                                        <option value="LOW">Faible</option>
                                        <option value="MEDIUM">Moyenne</option>
                                        <option value="HIGH">Élevée</option>
                                        <option value="CRITICAL">Critique</option>
                                    </select>
                                </div>
                            ) : null}
                        </div>
                        <div className={styles.fieldGrid2}>
                            <div className={styles.field}>
                                <label className={styles.label}>Type d'intervention</label>
                                <select className={styles.select} value={form.interventionType} onChange={(e) => updateField("interventionType", e.target.value as FormData["interventionType"])}>
                                    <option value="SITE">Sur site</option>
                                    <option value="WORKSHOP">En atelier</option>
                                </select>
                                {form.interventionType === "SITE" ? (
                                    <div className={styles.helperText}>Ce choix implique des frais supplémentaires et un délai d'intervention plus long.</div>
                                ) : null}
                            </div>
                        </div>

                    </div>
                ) : null}

                {step === 4 ? (
                    <>
                        <div className={styles.formSection}>
                            <h2 className={styles.sectionTitle}>Description libre de la panne *</h2>
                            <textarea
                                className={styles.textarea}
                                value={form.description}
                                onChange={(e) => updateField("description", e.target.value)}
                                placeholder="Décrivez clairement la panne, les symptômes et l'impact sur le service"
                            />
                        </div>

                        <div className={styles.formSection}>
                            <h2 className={styles.sectionTitle}>Pièces à joindre par le client</h2>

                            {/* 3 catégories de documents obligatoires */}
                            {DOCUMENT_CATEGORIES.map((docCategory) => {
                                const catFiles = documentFiles.filter((f) => docCategory.aliases.includes(String(documentTitleByKey[buildFileKey(f)] || "")));
                                const catExisting = existingDocumentAttachments.filter((item) => docCategory.aliases.includes(String(item.title || "")));
                                const catExistingIndexes: number[] = [];
                                existingDocumentAttachments.forEach((item, i) => {
                                    if (docCategory.aliases.includes(String(item.title || ""))) catExistingIndexes.push(i);
                                });
                                return (
                                    <div key={docCategory.label} className={styles.field} style={{ marginBottom: "1.2rem", padding: "0.9rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
                                        <label className={styles.label} style={{ fontWeight: "600", marginBottom: "0.4rem" }}>{docCategory.label}</label>
                                        <div className={styles.helperText}>Tout document manquant retardera l&apos;intervention.</div>
                                        <label className={styles.input} style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", marginTop: "0.4rem" }}>
                                            <FileUp size={15} />
                                            <span>
                                                {catFiles.length > 0
                                                    ? `${catFiles.length} fichier(s) ajouté(s)`
                                                    : `Sélectionner un document`}
                                            </span>
                                            <input
                                                type="file"
                                                hidden
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.png,.jpg,.jpeg,.webp"
                                                multiple
                                                onChange={(e) => {
                                                    addFilesWithTitle("documents", e.target.files, docCategory.label);
                                                    e.currentTarget.value = "";
                                                }}
                                            />
                                        </label>
                                        {catFiles.length > 0 ? (
                                            <div className={styles.docList} style={{ marginTop: "0.5rem" }}>
                                                {catFiles.map((file, _catIdx) => {
                                                    const globalIdx = documentFiles.indexOf(file);
                                                    return (
                                                        <span key={buildFileKey(file)} className={styles.docChip}>
                                                            {file.name}
                                                            <button
                                                                type="button"
                                                                onClick={() => removeFileAt("documents", globalIdx)}
                                                                style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700, color: "inherit", lineHeight: 1 }}
                                                                aria-label={`Retirer ${file.name}`}
                                                                title="Retirer"
                                                            >×</button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                        {catExisting.length > 0 ? (
                                            <div className={styles.docList} style={{ marginTop: "0.5rem" }}>
                                                {catExisting.map((item, _catExIdx) => {
                                                    const globalIdx = catExistingIndexes[_catExIdx];
                                                    return (
                                                        <span key={`existing-${docCategory.label}-${item.dataUrl}-${_catExIdx}`} className={styles.docChip}>
                                                            {item.name}
                                                            <button
                                                                type="button"
                                                                onClick={() => removeExistingAttachmentAt("documents", globalIdx)}
                                                                style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700, color: "inherit", lineHeight: 1 }}
                                                                aria-label={`Retirer ${item.name}`}
                                                                title="Retirer"
                                                            >×</button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}

                            {/* Médias */}
                            <div className={styles.fieldGrid2}>
                                <div className={styles.field}>
                                    <label className={styles.label}>Veuillez ajouter des photos et des vidéos de la panne</label>
                                    <div className={styles.helperText}>Vous pouvez ajouter plusieurs images et vidéos en une ou plusieurs sélections.</div>
                                    <label className={styles.input} style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", marginTop: "0.4rem" }}>
                                        <ImagePlus size={15} />
                                        <span>{mediaFiles.length > 0 ? `${mediaFiles.length} média(s) sélectionné(s)` : "Choisir des médias"}</span>
                                        <input
                                            type="file"
                                            hidden
                                            accept="image/*,video/*"
                                            multiple
                                            onChange={(e) => {
                                                addFiles("medias", e.target.files);
                                                e.currentTarget.value = "";
                                            }}
                                        />
                                    </label>
                                    {mediaFiles.length > 0 ? (
                                        <div className={styles.docList} style={{ marginTop: "0.5rem" }}>
                                            {mediaFiles.map((file, index) => (
                                                <span key={buildFileKey(file)} className={styles.docChip}>
                                                    {(mediaTitleByKey[buildFileKey(file)] || "Média")}: {file.name}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFileAt("medias", index)}
                                                        style={{
                                                            border: "none",
                                                            background: "transparent",
                                                            cursor: "pointer",
                                                            fontWeight: 700,
                                                            color: "inherit",
                                                            lineHeight: 1
                                                        }}
                                                        aria-label={`Retirer ${file.name}`}
                                                        title="Retirer"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                    {existingMediaAttachments.length > 0 ? (
                                        <div className={styles.docList} style={{ marginTop: "0.5rem" }}>
                                            {existingMediaAttachments.map((item, index) => (
                                                <span key={`existing-media-${item.dataUrl}-${index}`} className={styles.docChip}>
                                                    {(item.title || "Média")}: {item.name}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeExistingAttachmentAt("medias", index)}
                                                        style={{
                                                            border: "none",
                                                            background: "transparent",
                                                            cursor: "pointer",
                                                            fontWeight: 700,
                                                            color: "inherit",
                                                            lineHeight: 1
                                                        }}
                                                        aria-label={`Retirer ${item.name}`}
                                                        title="Retirer"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {uploadWarning ? <div className={styles.helperText} style={{ color: "#b45309" }}>{uploadWarning}</div> : null}
                            {uploadProgress && uploadProgress.total > 0 ? (
                                <div className={styles.helperText} style={{ color: "var(--primary-blue)" }}>
                                    Téléversement en cours: {uploadProgress.done}/{uploadProgress.total}
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
                {step === 3 ? (
                    <div className={styles.formSection}>
                        <h2 className={styles.sectionTitle}>{SOS_CHECKLIST_TITLE}</h2>
                        <div className={styles.sosGrid}>
                            {SOS_QUESTIONS.map((question) => (
                                <article key={question.id} className={styles.sosItem}>
                                    <div className={styles.sosQuestion}>{question.label}</div>
                                    <div className={styles.sosActions}>
                                        <button
                                            type="button"
                                            className={`${styles.sosButton} ${sosAnswers[question.id] === true ? styles.sosButtonYesActive : ""}`}
                                            onClick={() => setSos(question.id, true)}
                                        >
                                            OUI
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.sosButton} ${sosAnswers[question.id] === false ? styles.sosButtonNoActive : ""}`}
                                            onClick={() => setSos(question.id, false)}
                                        >
                                            NON
                                        </button>
                                    </div>
                                    {question.id === "error" && sosAnswers.error === true ? (
                                        <div className={styles.field} style={{ marginTop: "0.7rem" }}>
                                            <label className={styles.label}>Si un message d'erreur apparaît, merci de le reconstruire ci-dessous</label>
                                            <textarea
                                                className={styles.textarea}
                                                value={form.errorMessageDetails}
                                                onChange={(e) => updateField("errorMessageDetails", e.target.value)}
                                                placeholder="Recopiez le message exact"
                                            />
                                        </div>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "0.6rem" }}>
                        {step > 1 ? (
                            <button className="btn btn-outline" type="button" onClick={() => setStep((prev) => Math.max(prev - 1, 1))}>
                                Retour
                            </button>
                        ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "0.6rem" }}>
                        <button className="btn btn-outline" type="button" onClick={() => router.push(currentRole === "ADV" ? "/adv/tickets" : "/client")}>
                            Annuler
                        </button>
                        {editingReclamationId && step < 4 ? (
                            <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={submitting}>
                                {submitting ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                                {submitting ? "Validation..." : "Valider cette étape"}
                            </button>
                        ) : null}
                        {step < 4 ? (
                            <button className="btn btn-primary" type="button" onClick={goToNextStep}>
                                Continuer
                            </button>
                        ) : (
                            <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={submitting}>
                                {submitting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                                {submitting
                                    ? uploadProgress && uploadProgress.total > 0
                                        ? `Téléversement ${uploadProgress.done}/${uploadProgress.total}...`
                                        : "Envoi en cours..."
                                    : editingReclamationId
                                        ? "Enregistrer les modifications"
                                        : "Envoyer la demande d'intervention"}
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <style jsx>{`
                @keyframes spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }

                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
}



