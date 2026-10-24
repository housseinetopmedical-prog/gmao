import MagasinierReclamationsPage from "@/composants/magasinier/MagasinierReclamationsPage";

export default function InfosDpHistoriquePage() {
    return (
        <MagasinierReclamationsPage
            historyOnly
            historyPath="/ticket/infos-DP/historique"
            backHref="/ticket/infos-DP"
        />
    );
}
