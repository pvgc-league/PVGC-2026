import { useMemo } from "react";
import { CHAMPIONS } from "../constants/champions";
import { G, GO, M, CREAM, GOLD, CARD2, FB, FD } from "../constants/theme";

export default function ChampionsScreen() {
  const sorted = useMemo(() => [...CHAMPIONS].sort((a, b) => b.year - a.year), []);
  const latest = sorted[0];
  const rest = sorted.slice(1);

  // Most titles — counts every name across all years, not just current roster.
  const leaderboard = useMemo(() => {
    const counts = {};
    CHAMPIONS.forEach(c => c.names.forEach(n => { counts[n] = (counts[n] || 0) + 1; }));
    return Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, []);

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "20px 14px 60px" }}>
      <div style={{ fontFamily: FD, fontSize: "30px", fontWeight: 700, color: CREAM, marginBottom: "2px" }}>
        Champions
      </div>
      <div style={{ fontSize: "12px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "18px" }}>
        Pickering Valley Golf Club · {sorted.length} seasons on the trophy
      </div>

      {/* Hero — reigning champion */}
      {latest && (
        <div style={{
          background: `linear-gradient(135deg, ${G}, #0f4023)`, borderRadius: "16px",
          padding: "22px 20px", marginBottom: "20px", textAlign: "center",
          boxShadow: "0 6px 20px rgba(26,107,58,0.25)",
        }}>
          <div style={{ fontSize: "34px", lineHeight: 1 }}>🏆</div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#cfe6d5", fontWeight: 700, marginTop: "8px" }}>
            {latest.year} Champions
          </div>
          <div style={{ fontFamily: FD, fontSize: "26px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>
            {latest.names.join(" & ")}
          </div>
        </div>
      )}

      {/* Most titles */}
      {leaderboard.length > 0 && (
        <div style={{ background: CARD2, border: `1px solid ${GOLD}33`, borderRadius: "12px", padding: "14px 16px", marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: M, marginBottom: "10px" }}>
            Most Titles
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {leaderboard.map(([name, n]) => (
              <div key={name} style={{
                display: "flex", alignItems: "center", gap: "5px", background: GOLD + "14",
                border: `1px solid ${GOLD}33`, borderRadius: "8px", padding: "5px 10px",
                fontSize: "13px", fontWeight: 600, color: CREAM,
              }}>
                <span>{name}</span>
                <span style={{ color: GOLD, letterSpacing: "-1px" }}>{"🏆".repeat(Math.min(n, 5))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full history */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}33`, borderRadius: "12px", overflow: "hidden" }}>
        {rest.map((c, i) => (
          <div key={c.year} style={{
            display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px",
            borderTop: i === 0 ? "none" : `1px solid ${GOLD}22`,
          }}>
            <div style={{ fontFamily: FD, fontSize: "18px", fontWeight: 700, color: GOLD, width: "48px", flexShrink: 0 }}>
              {c.year}
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: CREAM }}>
              {c.names.join(" & ")}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "11px", color: M, marginTop: "14px", textAlign: "center", fontStyle: "italic" }}>
        Older years reflect the names on the physical trophy — first names not always on record.
      </div>
    </div>
  );
}
