import { getSosAnswerLabel, SOS_CHECKLIST_TITLE } from "@/metier/workflow-client";

type SosChecklistItem = {
    key: string;
    label: string;
    value: boolean | null;
};

type SosChecklistSectionProps = {
    answers: SosChecklistItem[];
    errorMessageDetails?: string | null;
    titleAs?: "div" | "h3";
    titleClassName?: string;
    emptyClassName?: string;
};

export default function SosChecklistSection({
    answers,
    errorMessageDetails,
    titleAs = "h3",
    titleClassName,
    emptyClassName,
}: SosChecklistSectionProps) {
    const TitleTag = titleAs;

    return (
        <div>
            <TitleTag className={titleClassName}>{SOS_CHECKLIST_TITLE}</TitleTag>

            {answers.length === 0 ? (
                <div className={emptyClassName} style={{ marginTop: "0.75rem" }}>
                    Aucune réponse renseignée.
                </div>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: "0.85rem",
                        marginTop: "0.85rem",
                    }}
                >
                    {answers.map((item) => {
                        const answerLabel = getSosAnswerLabel(item.value);
                        const tone = item.value === true ? "#166534" : item.value === false ? "#991b1b" : "#475569";
                        const background = item.value === true ? "#dcfce7" : item.value === false ? "#fee2e2" : "#e2e8f0";

                        return (
                            <article
                                key={item.key}
                                style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "14px",
                                    padding: "0.95rem 1rem",
                                    background: "#fff",
                                }}
                            >
                                <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: 1.45 }}>{item.label}</div>
                                <div style={{ marginTop: "0.65rem" }}>
                                    <span
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            minWidth: "7rem",
                                            padding: "0.38rem 0.75rem",
                                            borderRadius: "999px",
                                            background,
                                            color: tone,
                                            fontWeight: 800,
                                            fontSize: "0.85rem",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.02em",
                                        }}
                                    >
                                        {answerLabel}
                                    </span>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {String(errorMessageDetails || "").trim() ? (
                <div
                    style={{
                        marginTop: "0.85rem",
                        padding: "0.95rem 1rem",
                        borderRadius: "14px",
                        background: "#fff7ed",
                        border: "1px solid #fed7aa",
                    }}
                >
                    <div style={{ fontWeight: 700, color: "#9a3412", marginBottom: "0.35rem" }}>
                        Message d'erreur communiqué par le client
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", color: "#7c2d12", lineHeight: 1.55 }}>
                        {String(errorMessageDetails).trim()}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
