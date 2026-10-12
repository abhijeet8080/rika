import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Rika — Be present. Rika remembers. A serene mountain valley behind the meeting assistant's hero headline.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const valley = await readFile(join(process.cwd(), "public/images/rika-valley.png"));
  const background = `data:image/png;base64,${valley.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          color: "#173d38",
          backgroundColor: "#eef3ed",
          backgroundImage: `linear-gradient(180deg, rgba(248,250,247,0.9) 0%, rgba(248,250,247,0.65) 48%, rgba(248,250,247,0) 100%), url(${background})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          padding: "40px 60px",
        }}
      >
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700, letterSpacing: -2, color: "#124e49" }}>
          rika.
        </div>
        <div style={{ display: "flex", marginTop: 38, fontSize: 17, color: "#526d61" }}>
          A little less note-taking. A lot more presence.
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20, fontSize: 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -4 }}>
          <div style={{ display: "flex" }}>Be present.</div>
          <div style={{ display: "flex" }}>Rika remembers.</div>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 22, color: "#405f53" }}>
          Your meetings, turned into clarity.
        </div>
        <div style={{ display: "flex", marginTop: 30, padding: "15px 26px", borderRadius: 14, background: "#124e49", color: "white", fontSize: 18 }}>
          For the conversation now. And the questions later.
        </div>
      </div>
    ),
    size,
  );
}
