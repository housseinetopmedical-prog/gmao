"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "../technicien.module.css";

type CalendarEvent = {
    id: string;
    date: Date;
    title: string;
    marketNumber: string;
    executionPlace: string;
    serialNumber: string;
};

const WEEK_DAYS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
const MONTHS = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre"
];

function getMeta(item: any) {
    return item?.marketMeta && typeof item.marketMeta === "object" ? item.marketMeta : {};
}

function parseVisitDate(value: unknown) {
    const text = String(value || "").trim();
    if (!text) return null;
    const frenchDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const parsed = frenchDate
        ? new Date(Number(frenchDate[3]), Number(frenchDate[2]) - 1, Number(frenchDate[1]))
        : new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTechnicalDates(raw: unknown) {
    const values = Array.isArray(raw)
        ? raw
        : String(raw || "")
            .split(/[,\n;]+/g)
            .map((value) => value.trim())
            .filter(Boolean);

    return values
        .map(parseVisitDate)
        .filter((date): date is Date => Boolean(date));
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthDays(date: Date) {
    const first = startOfMonth(date);
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startOffset);

    return Array.from({ length: 42 }).map((_, index) => {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + index);
        return day;
    });
}

function sameDay(left: Date, right: Date) {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

function formatMonth(date: Date) {
    return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export default function TechnicienCalendrierPage() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/appels-offre/equipements", { cache: "no-store" });
                const data = await response.json().catch(() => []);
                setItems(Array.isArray(data) ? data : []);
            } catch {
                setItems([]);
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    const events = useMemo<CalendarEvent[]>(() => {
        return items.flatMap((item) => {
            const meta = getMeta(item);
            const rawDates = Array.isArray(meta.technicalVisitDates) && meta.technicalVisitDates.length > 0
                ? meta.technicalVisitDates
                : item.technicalVisitDates;
            return parseTechnicalDates(rawDates).map((date, index) => ({
                id: `${item.id}-${index}-${date.toISOString()}`,
                date,
                title: String(item.name || "Produit").trim(),
                marketNumber: String(item.marketNumber || item.blNumber || "").trim(),
                executionPlace: String(meta.executionPlace || item.hospital || item.location || "").trim(),
                serialNumber: String(item.serialNumber || "").trim()
            }));
        });
    }, [items]);

    const days = useMemo(() => getMonthDays(visibleMonth), [visibleMonth]);
    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = new Set<number>();
        for (let year = currentYear - 5; year <= currentYear + 10; year += 1) years.add(year);
        events.forEach((event) => years.add(event.date.getFullYear()));
        return Array.from(years).sort((left, right) => left - right);
    }, [events]);

    return (
        <section className={styles.sectionCard}>
            <div className={styles.itemMain}>
                <button type="button" className="btn btn-outline" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
                    <ChevronLeft size={16} />
                    Mois précédent
                </button>
                <h2 className={styles.sectionTitle} style={{ marginBottom: 0, textTransform: "capitalize" }}>{formatMonth(visibleMonth)}</h2>
                <button type="button" className="btn btn-outline" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
                    Mois suivant
                    <ChevronRight size={16} />
                </button>
            </div>

            <div className={styles.formGrid2} style={{ marginTop: "1rem" }}>
                <div className={styles.field}>
                    <label className={styles.label}>Mois</label>
                    <select className={styles.select} value={visibleMonth.getMonth()} onChange={(event) => setVisibleMonth((current) => new Date(current.getFullYear(), Number(event.target.value), 1))}>
                        {MONTHS.map((month, index) => (
                            <option key={month} value={index}>{month}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Année</label>
                    <select className={styles.select} value={visibleMonth.getFullYear()} onChange={(event) => setVisibleMonth((current) => new Date(Number(event.target.value), current.getMonth(), 1))}>
                        {availableYears.map((year) => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className={styles.empty} style={{ marginTop: "1rem" }}>Chargement du calendrier...</div>
            ) : (
                <div style={{ marginTop: "1rem", border: "1px solid #1f1f1f", borderRadius: "12px", overflow: "hidden", background: "#ffffff" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: "#111111", color: "#ffffff" }}>
                        {WEEK_DAYS.map((day) => (
                            <div key={day} style={{ padding: "0.7rem", fontWeight: 800, fontSize: "0.82rem" }}>{day}</div>
                        ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                        {days.map((day) => {
                            const dayEvents = events.filter((event) => sameDay(event.date, day));
                            const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
                            const isToday = sameDay(day, new Date());
                            return (
                                <div
                                    key={day.toISOString()}
                                    style={{
                                        minHeight: "126px",
                                        padding: "0.55rem",
                                        borderRight: "1px solid #e4e4e7",
                                        borderBottom: "1px solid #e4e4e7",
                                        background: isCurrentMonth ? "#ffffff" : "#f8fafc",
                                        opacity: isCurrentMonth ? 1 : 0.55
                                    }}
                                >
                                    <span style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: "1.8rem",
                                        height: "1.8rem",
                                        borderRadius: "999px",
                                        background: isToday ? "#b00020" : "transparent",
                                        color: isToday ? "#ffffff" : "#111111",
                                        fontWeight: 800
                                    }}>
                                        {day.getDate()}
                                    </span>
                                    <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.45rem" }}>
                                        {dayEvents.map((event) => (
                                            <div
                                                key={event.id}
                                                style={{
                                                    border: "1px solid rgba(176, 0, 32, 0.25)",
                                                    borderLeft: "4px solid #b00020",
                                                    borderRadius: "7px",
                                                    padding: "0.4rem",
                                                    background: "#fff1f2",
                                                    color: "#111111",
                                                    fontSize: "0.78rem",
                                                    lineHeight: 1.35
                                                }}
                                            >
                                                <strong>{event.title}</strong>
                                                <div>Marché {event.marketNumber || "-"}</div>
                                                <div>{event.executionPlace || "-"}</div>
                                                <div>SN : {event.serialNumber || "-"}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
