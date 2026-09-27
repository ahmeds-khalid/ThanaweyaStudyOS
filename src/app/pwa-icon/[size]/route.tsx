import { ImageResponse } from "next/og";

/** PNG app icons for the PWA manifest (192 and 512), generated at build time. */
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#4f46e5" }}>
        <svg width={px * 0.62} height={px * 0.62} viewBox="8 12 48 40">
          <path d="M32 16 10 27l22 11 22-11-22-11Z" fill="#fff" />
          <path d="M19 32.5V41c0 3.3 5.8 7 13 7s13-3.7 13-7v-8.5L32 39l-13-6.5Z" fill="#fff" opacity=".85" />
          <path d="M51 28v11" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: px, height: px },
  );
}
