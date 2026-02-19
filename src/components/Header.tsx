import { Link, useLocation } from "react-router-dom";
import { Shield } from "lucide-react";
import logo from "@/assets/logo.png";

const Header = () => {
  const location = useLocation();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card border-t-0 border-x-0 rounded-none">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="EthosLayer" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">
            <span className="gradient-text">Ethos</span>
            <span className="text-foreground">Layer</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            to="/analyze"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/analyze" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Analyze
          </Link>
          <Link
            to="/values"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/values" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Ethos Preferences
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
