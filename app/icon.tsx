import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 180,
          fontWeight: 700,
          letterSpacing: "-0.08em",
          borderRadius: 120,
          border: "20px solid rgba(15, 75, 73, 0.12)",
        }}
      >
        KAG
      </div>
    ),
    size,
  );
}
