"use client";

/*
Commentaire simple du fichier :
- Espace : appels-offre.
- Partie : appels offre.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import styles from "./appels-offre.module.css";
import dashboardStyles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";

function getMarketMeta(item: any) {
    return item?.marketMeta && typeof item.marketMeta === "object" ? item.marketMeta : {};
}

function getTechnicalVisitDates(item: any) {
    const dates = getMarketMeta(item).technicalVisitDates;
    return Array.isArray(dates) ? dates : [];
}

function parseTechnicalVisitDate(value: unknown) {
    const text = String(value || "").trim();
    if (!text) return null;

    const frenchDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const parsed = frenchDate
        ? new Date(Number(frenchDate[3]), Number(frenchDate[2]) - 1, Number(frenchDate[1]))
        : /^\d{4}-\d{2}-\d{2}$/.test(text)
          ? new Date(`${text}T12:00:00`)
          : new Date(text);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateKey(value: unknown) {
    const parsed = parseTechnicalVisitDate(value);
    if (!parsed) return "";
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function isVisitCompleted(status: unknown) {
    const normalized = String(status || "").trim().toUpperCase();
    return ["COMPLETED", "DONE", "REALIZED", "REALISED", "REALISEE", "RÉALISÉE"].includes(normalized);
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AppelsOffrePage() {
    const [overview, setOverview] = useState<any>(null);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        fetch("/api/appels-offre/overview", { cache: "no-store" })
            .then((response) => response.json())
            .then((data) => setOverview(data && typeof data === "object" ? data : null))
            .catch(() => setOverview(null));
    }, []);

    const stats = overview?.stats || {};
    const equipments = Array.isArray(overview?.equipments) ? overview.equipments : [];
    const visits = Array.isArray(overview?.visits) ? overview.visits : [];
    const technicalVisitsToDo = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const countedVisitKeys = new Set<string>();
        const completedVisitKeys = new Set<string>();
        let count = 0;

        visits.forEach((visit: any) => {
            const dateKey = getDateKey(visit?.scheduledDate);
            if (!dateKey) return;
            const key = `${Number(visit?.equipmentId || visit?.equipment?.id || 0) || 0}-${dateKey}`;
            if (isVisitCompleted(visit?.status)) {
                completedVisitKeys.add(key);
                return;
            }
            if (!countedVisitKeys.has(key)) {
                countedVisitKeys.add(key);
                count += 1;
            }
        });

        equipments.forEach((item: any) => {
            getTechnicalVisitDates(item).forEach((rawDate: unknown) => {
                const parsed = parseTechnicalVisitDate(rawDate);
                if (!parsed || parsed < today) return;

                const dateKey = getDateKey(parsed);
                const key = `${Number(item?.id || 0) || 0}-${dateKey}`;
                if (countedVisitKeys.has(key) || completedVisitKeys.has(key)) return;

                countedVisitKeys.add(key);
                count += 1;
            });
        });

        return count;
    }, [equipments, visits]);

    // Cette partie affiche l interface visible a l ecran.
    return (
        <section className={styles.hero}>
            <div className={dashboardStyles.pageHeader}>
                <div>
                    <h1 className={dashboardStyles.pageTitle}>Tableau de bord</h1>
                </div>
            </div>
            <div className={styles.heroStats}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Marchés de maintenance enregistrés</div>
                    <div className={styles.statValue}>{stats.equipmentCount ?? equipments.length ?? 0}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>Visites techniques à réaliser</div>
                    <div className={styles.statValue}>{technicalVisitsToDo}</div>
                </div>
            </div>
        </section>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "appels offre" de l espace "appels-offre".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
