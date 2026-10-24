import Image from "next/image";

type MedicalDeviceLogoIconProps = {
    size?: number;
    className?: string;
};

export default function MedicalDeviceLogoIcon({
    size = 36,
    className,
}: MedicalDeviceLogoIconProps) {
    const height = Math.max(70, Math.round(size * 1.7));
    const width = Math.round(height * 2.95);

    return (
        <div
            className={className}
            role="img"
            aria-label="Top Medical"
            style={{ display: "block", width: `${width}px`, height: "auto", maxWidth: "100%" }}
        >
            <Image
                src="/branding/imgtop.png"
                alt="Logo Top Medical"
                width={width}
                height={height}
                sizes="(max-width: 768px) 220px, 320px"
                style={{ display: "block", width: "100%", height: "auto", objectFit: "contain" }}
            />
        </div>
    );
}
