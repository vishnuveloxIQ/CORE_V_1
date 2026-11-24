import logo from "@/shared/assets/veloxiq-logo.svg";
import { APP } from "../config/app";

export function Footer() {
  return (
    <footer className="footer" aria-label="Application footer">
      <div className="f-brand">
        <img src={logo} alt="" width={102} height={38} />
        <span>
          © {new Date().getFullYear()} {APP.company}
        </span>
      </div>
      <div className="f-links">
        <span>{APP.module}</span>
      </div>
    </footer>
  );
}
