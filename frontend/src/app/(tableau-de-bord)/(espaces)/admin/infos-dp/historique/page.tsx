import MagasinierReclamationsPage from "@/composants/magasinier/MagasinierReclamationsPage";

export default function AdminInfosDpHistoriquePage() {
    return (
        <MagasinierReclamationsPage
            historyOnly
            historyPath="/admin/infos-dp/historique"
            backHref="/admin/infos-dp"
        />
    );
}
