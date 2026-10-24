import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={styles.shell}>
            <section className={styles.content}>{children}</section>
        </div>
    );
}
