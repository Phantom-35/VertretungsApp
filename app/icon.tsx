import { ImageResponse } from "next/og";

const icons = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  // Maskable icons get cropped by the OS: fill the whole square and keep the
  // text inside the central safe zone.
  maskable: { size: 512, maskable: true },
} as const;

type IconId = keyof typeof icons;

export function generateImageMetadata() {
  return (Object.keys(icons) as IconId[]).map((id) => ({
    id,
    contentType: "image/png",
    size: { width: icons[id].size, height: icons[id].size },
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const icon = icons[(await id) as IconId] ?? icons["512"];
  const { size, maskable } = icon;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(160deg, rgb(245, 239, 226) 0%, rgb(216, 236, 232) 100%)",
          color: "rgb(15, 75, 73)",
          fontSize: size * (maskable ? 0.26 : 0.35),
          fontWeight: 700,
          letterSpacing: "-0.08em",
          borderRadius: maskable ? 0 : size * 0.23,
          border: maskable ? "none" : `${size * 0.04}px solid rgba(15, 75, 73, 0.12)`,
        }}
      >
        KAG
      </div>
    ),
    { width: size, height: size },
  );
}
