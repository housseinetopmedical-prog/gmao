"use client";

import { useState, useEffect } from "react";
import { 
    X, CheckCircle2, AlertCircle, Save, Star, 
    ClipboardCheck, FileText, Upload, Shield, 
    ShieldAlert, Loader2, Info
} from "lucide-react";

interface QualificationModalProps {
    ticket: any;
    onClose: () => void;
    onSuccess: () => void;
    currentUser: any;
}

export default function QualificationModal({ ticket, onClose, onSuccess, currentUser }: QualificationModalProps) {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const ticketDisplayId = Number(ticket?.displayId || ticket?.id || 0);

    // Contrôles préalables chez le client
    const [checklist, setChecklist] = useState<Record<string, boolean>>({
        "État physique général OK": false,
        "Câbles et connecteurs présents": false,
        "Batterie / Alimentation OK": false,
        "Accessoires joints": false,
        "Symptômes reproduits": false,
    });
    
    // Form state
    const [isHandled, setIsHandled] = useState<boolean | null>(null);
    const [motive, setMotive] = useState("");
    const [satisfaction, setSatisfaction] = useState(5);
    const [description, setDescription] = useState(ticket.description || "");
    const [attachments, setAttachments] = useState<string[]>([]);
    const [underWarranty, setUnderWarranty] = useState(ticket.isUnderWarranty);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAttachments(prev => [...prev, reader.result as string]);
            };
            reader.readAsDataURL(file);
        });
    };
    
    // Equipment update state
    const [eqData, setEqData] = useState({
        name: ticket.equipment?.name || "",
        serialNumber: ticket.equipment?.serialNumber || "",
        location: ticket.equipment?.location || "",
        client: ticket.equipment?.client || ""
    });

    useEffect(() => {
        // Parse existing checklist if any
        if (ticket.sosChecklist) {
            try {
                const parsed = typeof ticket.sosChecklist === 'string' 
                    ? JSON.parse(ticket.sosChecklist) 
                    : ticket.sosChecklist;
                setChecklist(prev => ({ ...prev, ...parsed }));
            } catch (e) {
                console.error("Parse checklist error:", e);
            }
        }
        if (ticket.isHandledByTopMedical !== null) setIsHandled(ticket.isHandledByTopMedical);
        if (ticket.rejectionMotive) setMotive(ticket.rejectionMotive);
        if (ticket.satisfactionRate) setSatisfaction(ticket.satisfactionRate);
    }, [ticket]);

    const handleCheckChange = (item: string) => {
        setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
    };

    const handleSubmit = async () => {
        if (isHandled === null) {
            setError("Veuillez indiquer si le ticket est pris en charge.");
            return;
        }
        if (!isHandled && !motive) {
            setError("Veuillez indiquer le motif du refus de prise en charge.");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            // 1. Update Equipment data first if changed
            await fetch(`/api/equipments/${ticket.equipmentId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(eqData)
            });

            // 2. Qualify Ticket
            const res = await fetch(`/api/tickets/${ticket.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: isHandled ? "DIAGNOSTIC" : "CLOSED", // If handled, move to diagnostic. If not, close.
                    sosChecklist: checklist,
                    satisfactionRate: satisfaction,
                    isHandledByTopMedical: isHandled,
                    rejectionMotive: isHandled ? "" : motive,
                    description: description,
                    isUnderWarranty: underWarranty,
                    userId: currentUser?.id
                })
            });

            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                const data = await res.json();
                setError(data.error || "Une erreur est survenue.");
            }
        } catch (err) {
            setError("Erreur réseau. Veuillez réessayer.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>Validation du ticket #{String(ticketDisplayId).padStart(4, "0")}</h2>
                        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Validation technique et administrative avant intervention</p>
                    </div>
                    <button onClick={onClose} style={closeBtnStyle}><X size={20} /></button>
                </div>

                <div style={bodyStyle}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                        {/* Section 1: Contrôles préalables & description */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                            <div className="card" style={{ padding: "1.25rem" }}>
                                <h3 style={sectionTitleStyle}><ClipboardCheck size={18} color="#c1121f" /> Contrôles préalables chez le client</h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                                    {Object.keys(checklist).map(item => (
                                        <label key={item} style={checkLabelStyle}>
                                            <input 
                                                type="checkbox" 
                                                checked={checklist[item]} 
                                                onChange={() => handleCheckChange(item)}
                                                style={checkboxStyle}
                                            />
                                            {item}
                                        </label>
                                    ))}
                                </div>
                                <div style={{ marginTop: "1rem" }}>
                                    <label style={labelStyle}>Description libre / Observations</label>
                                    <textarea 
                                        style={textareaStyle} 
                                        value={description} 
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Notez ici les détails supplémentaires..."
                                    />
                                </div>
                                <div style={{ marginTop: "1rem" }}>
                                    <label style={labelStyle}>Documents de contrôle / Photos</label>
                                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                                        {attachments.map((img, i) => (
                                            <div key={i} style={{ position: "relative", width: "60px", height: "60px", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                                                <img src={img} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                <button onClick={() => setAttachments(p => p.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: "50%", padding: "4px", cursor: "pointer" }}>
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                        <label style={{ width: "60px", height: "60px", borderRadius: "8px", border: "2px dashed #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b" }}>
                                            <Upload size={20} />
                                            <input type="file" multiple hidden onChange={handleFileUpload} />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ padding: "1.25rem" }}>
                                <h3 style={sectionTitleStyle}><Star size={18} color="#f59e0b" /> Taux de satisfaction client</h3>
                                <div style={{ marginTop: "1rem" }}>
                                    <input 
                                        type="range" min="1" max="10" step="1" 
                                        value={satisfaction} 
                                        onChange={e => setSatisfaction(parseInt(e.target.value))}
                                        style={{ width: "100%", cursor: "pointer" }}
                                    />
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                        <span>Décevant (1)</span>
                                        <span style={{ fontWeight: 800, color: "#c1121f", fontSize: "1.1rem" }}>{satisfaction}/10</span>
                                        <span>Excellent (10)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Material Data & Decision */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                            <div className="card" style={{ padding: "1.25rem" }}>
                                <h3 style={sectionTitleStyle}><Info size={18} color="#c1121f" /> Données Matériel</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
                                    <div style={{ gridColumn: "1 / -1" }}>
                                        <label style={labelStyle}>Nom équipement</label>
                                        <input style={inputStyle} value={eqData.name} onChange={e => setEqData(p => ({ ...p, name: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>N° de Série</label>
                                        <input style={inputStyle} value={eqData.serialNumber} onChange={e => setEqData(p => ({ ...p, serialNumber: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Localisation</label>
                                        <input style={inputStyle} value={eqData.location} onChange={e => setEqData(p => ({ ...p, location: e.target.value }))} />
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ padding: "1.25rem", borderLeft: `4px solid ${isHandled === true ? "#10b981" : isHandled === false ? "#ef4444" : "#e2e8f0"}` }}>
                                <h3 style={sectionTitleStyle}><Save size={18} color="#c1121f" /> Prise en charge Top Médical</h3>
                                <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setIsHandled(true)}
                                        style={{ ...toggleBtnStyle, background: isHandled === true ? "#dcfce7" : "transparent", color: isHandled === true ? "#15803d" : "#64748b", borderColor: isHandled === true ? "#10b981" : "#e2e8f0" }}
                                    >
                                        <CheckCircle2 size={16} /> OUI
                                    </button>
                                    <button 
                                        onClick={() => setIsHandled(false)}
                                        style={{ ...toggleBtnStyle, background: isHandled === false ? "#fee2e2" : "transparent", color: isHandled === false ? "#991b1b" : "#64748b", borderColor: isHandled === false ? "#ef4444" : "#e2e8f0" }}
                                    >
                                        <X size={16} /> NON
                                    </button>
                                </div>

                                {isHandled === true && (
                                    <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1.5rem" }}>
                                        <label style={{ ...checkLabelStyle, margin: 0 }}>Garantie ?</label>
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            <button onClick={() => setUnderWarranty(true)} style={{ ...smallBtnStyle, background: underWarranty ? "#c1121f" : "white", color: underWarranty ? "white" : "#64748b" }}><Shield size={14} /> Garantie</button>
                                            <button onClick={() => setUnderWarranty(false)} style={{ ...smallBtnStyle, background: !underWarranty ? "#ef4444" : "white", color: !underWarranty ? "white" : "#64748b" }}><ShieldAlert size={14} /> Hors G.</button>
                                        </div>
                                    </div>
                                )}

                                {isHandled === false && (
                                    <div style={{ marginTop: "1rem" }}>
                                        <label style={labelStyle}>Motif du refus de prise en charge *</label>
                                        <textarea 
                                            style={{ ...textareaStyle, height: "80px" }} 
                                            value={motive} 
                                            onChange={e => setMotive(e.target.value)}
                                            placeholder="Ex: Dommages causés par l'utilisateur, dépassement délais, contrat expiré..."
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                {error && <div style={errorStyle}>{error}</div>}
                <div style={footerStyle}>
                    <button onClick={onClose} className="btn btn-outline" disabled={submitting}>Annuler</button>
                    <button 
                        onClick={handleSubmit} 
                        className="btn btn-primary" 
                        disabled={submitting} 
                        style={{ background: isHandled === false ? "#ef4444" : "#c1121f", display: "flex", alignItems: "center", gap: "0.5rem", width: "200px", justifyContent: "center" }}
                    >
                        {submitting ? <Loader2 size={18} className="animate-spin" /> : isHandled === false ? <X size={18} /> : <Save size={18} />}
                        {isHandled === false ? "Clôturer le dossier" : "Valider"}
                    </button>
                </div>
            </div>

            <style jsx>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" };
const modalStyle: React.CSSProperties = { background: "white", borderRadius: "20px", width: "100%", maxWidth: "900px", display: "flex", flexDirection: "column", maxHeight: "95vh", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" };
const headerStyle: React.CSSProperties = { padding: "1.5rem 2rem", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" };
const bodyStyle: React.CSSProperties = { padding: "2rem", overflowY: "auto", flex: 1 };
const footerStyle: React.CSSProperties = { padding: "1.5rem 2rem", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: "1rem" };
const sectionTitleStyle: React.CSSProperties = { margin: "0 0 1rem", fontSize: "0.9rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.6rem", textTransform: "uppercase", letterSpacing: "0.025em" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#64748b", marginBottom: "0.4rem" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.9rem" };
const textareaStyle: React.CSSProperties = { ...inputStyle, height: "100px", resize: "none" };
const checkLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9rem", color: "#334155", cursor: "pointer", fontWeight: 500 };
const checkboxStyle: React.CSSProperties = { width: "18px", height: "18px", cursor: "pointer" };
const toggleBtnStyle: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.75rem", borderRadius: "10px", border: "2px solid", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" };
const smallBtnStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" };
const closeBtnStyle: React.CSSProperties = { background: "#f1f5f9", border: "none", color: "#64748b", padding: "8px", borderRadius: "50%", cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: "0.75rem 2rem", color: "#ef4444", fontSize: "0.85rem", fontWeight: 600 };


