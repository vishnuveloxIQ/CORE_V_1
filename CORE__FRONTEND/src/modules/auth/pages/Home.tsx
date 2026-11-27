import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { Icon } from "@/shared/ui/icons";
import { useAuth } from "../store/useAuth";
import { PublicNav } from "../components/PublicNav";

const FEATURES = [
  {
    icon: "briefcase",
    title: "Projects",
    text: "Keep projects and teams organised in one place.",
  },
  {
    icon: "shield",
    title: "Secure access",
    text: "Role-based access with extra checks for sensitive changes.",
  },
  {
    icon: "approvals",
    title: "Approvals",
    text: "Clear approval chains for every request.",
  },
  {
    icon: "chatx",
    title: "Support",
    text: "Raise, track issues and grievances with your company.",
  },
] as const;

export default function Home() {
  const user = useAuth((s) => s.user);
  useEffect(() => {
    document.title = "Home | VeloxIQ";
  }, []);
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="pub-page pub-home shell-classic">
      <PublicNav />
      <main className="pub-main">
        <section className="pub-hero">
          <div className="pub-copy">
            <h1>Driving Growth. <br />Streamlining Projects. <br /> Connecting Teams.</h1>
            <p>
              VeloxIQ centralizes project management, workforce coordination, and organizational governance within one intelligent platform(VELOXIQ), ensuring seamless connectivity, operational transparency, and consistent execution across every project and team.
            </p>
            <div className="pub-cta">
              <Link to="/register" className="btn primary">
                Register
              </Link>
              <br /> <br />
              <Link to="/login" className="btn secondary">
                Login
              </Link>
            </div>
          </div>
          <img
            src={`${import.meta.env.BASE_URL}home.jpg`}
            alt="Excavator working on a mountain construction site"
            className="pub-img"
            width={1280}
            height={480}
          />
        </section>
        <section className="pub-features" aria-label="Features">
          {FEATURES.map((f) => (
            <div key={f.title} className="pub-feat">
              <span className="pub-ico">
                <Icon name={f.icon} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
