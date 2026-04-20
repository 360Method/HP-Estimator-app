import { useEffect, useState } from "react";
import { CheckCircle, ArrowRight, Calendar, Shield, Star } from "lucide-react";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";
const PORTAL_URL = "https://client.handypioneers.com/portal/login";

const TIER_DETAILS: Record<string, { label: string; tagline: string; color: string; perks: string[] }> = {
  bronze: {
    label: "Bronze",
    tagline: "Essential protection for the proactive homeowner",
    color: "#cd7f32",
    perks: [
      "Annual 360° Home Scan",
      "2 seasonal visits — Spring & Fall",
      "Step-ladder member discounts",
    ],
  },
  silver: {
    label: "Silver",
    tagline: "Full-season coverage with a labor credit cushion",
    color: "#aaa9ad",
    perks: [
      "Annual 360° Home Scan",
      "4 seasonal visits — all seasons",
      "$200 labor bank credit",
      "Higher member discounts",
    ],
  },
  gold: {
    label: "Gold",
    tagline: "Maximum coverage, priority service, and the biggest savings",
    color: "#c8922a",
    perks: [
      "Annual 360° Home Scan",
      "4 seasonal visits — all seasons",
      "$500 labor bank credit",
      "Priority scheduling",
      "Highest member discounts",
    ],
  },
};

const CADENCE_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export default function Welcome360Page() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  const [tier, setTier] = useState<string>("");
  const [cadence, setCadence] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(!!sessionId);

  useEffect(() => {
    // Read tier/cadence the funnel stored in sessionStorage before Stripe redirect
    const storedTier = sessionStorage.getItem("hp360_tier") ?? "";
    const storedCadence = sessionStorage.getItem("hp360_cadence") ?? "";
    sessionStorage.removeItem("hp360_tier");
    sessionStorage.removeItem("hp360_cadence");
    sessionStorage.removeItem("hp360_type");

    if (storedTier) setTier(storedTier);
    if (storedCadence) setCadence(storedCadence);

    // Optionally enrich from the server if we have a session_id
    if (sessionId) {
      fetch(`/api/360/session?session_id=${encodeURIComponent(sessionId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.tier) setTier(data.tier);
          if (data?.cadence) setCadence(data.cadence);
          if (data?.customerName) setName(data.customerName);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const tierInfo = TIER_DETAILS[tier] ?? null;
  const firstName = name.split(" ")[0] || null;

  const G = "oklch(22% 0.07 155)";   // dark forest green
  const Gold = "#c8922a";

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", fontFamily: "Helvetica Neue, Arial, sans-serif" }}>
      {/* Card */}
      <div style={{ width: "100%", maxWidth: 560, background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>

        {/* Header */}
        <div style={{ background: G, padding: "28px 40px", display: "flex", alignItems: "center", gap: 16 }}>
          <img src={HP_LOGO} alt="Handy Pioneers" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Handy Pioneers</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>360° Method Membership</div>
          </div>
        </div>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${Gold}, #e8b84b)` }} />

        {/* Body */}
        <div style={{ padding: "36px 40px" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#888" }}>Loading your membership details…</p>
          ) : (
            <>
              {/* Success banner */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <CheckCircle size={32} color="#2d7a2d" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: "#1a1a1a" }}>
                    Welcome{firstName ? `, ${firstName}` : ""}!
                  </div>
                  <div style={{ fontSize: 14, color: "#555", marginTop: 2 }}>Your 360° Method membership is confirmed.</div>
                </div>
              </div>

              {/* Tier badge */}
              {tierInfo && (
                <div style={{ background: "#f8f9fa", border: "1px solid #e8e8e8", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Star size={18} color={tierInfo.color} fill={tierInfo.color} />
                    <span style={{ fontWeight: 700, fontSize: 16, color: tierInfo.color }}>
                      {tierInfo.label} Plan
                    </span>
                    {cadence && (
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "#888", background: "#efefef", borderRadius: 4, padding: "2px 8px" }}>
                        {CADENCE_LABEL[cadence] ?? cadence}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>{tierInfo.tagline}</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.7 }}>
                    {tierInfo.perks.map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}

              {/* Next steps */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>What happens next</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { icon: <Calendar size={16} />, text: "We'll reach out within 1 business day to schedule your first visit." },
                    { icon: <Shield size={16} />, text: "Your portal account will be ready — use it to track visits, invoices, and your labor credit." },
                    { icon: <Star size={16} />, text: "Your member discounts are active immediately on any new service requests." },
                  ].map(({ icon, text }, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#444" }}>
                      <span style={{ color: Gold, marginTop: 2, flexShrink: 0 }}>{icon}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <a
                href={PORTAL_URL}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: Gold, color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 24px", borderRadius: 8, textDecoration: "none", width: "100%", boxSizing: "border-box" }}
              >
                Access Your Client Portal <ArrowRight size={16} />
              </a>

              <p style={{ textAlign: "center", fontSize: 12, color: "#aaa", marginTop: 20 }}>
                Questions? <a href="mailto:help@handypioneers.com" style={{ color: Gold }}>help@handypioneers.com</a> · (360) 544-9858
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
