import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: "-0.06em",
          borderRadius: 40,
        }}
      >
        KAG
      </div>
    ),
    size,
  );
}
