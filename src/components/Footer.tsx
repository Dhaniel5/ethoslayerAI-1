import { FileText } from "lucide-react";
import logo from "@/assets/logo.png";

const Footer = () => {
  return (
    <footer className="border-t border-border/50 mt-auto">
      <div className="container mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="EthosLayer" className="h-6 w-6 opacity-70" />
            <div>
              <p className="text-sm text-muted-foreground">
                Built by <span className="font-display font-semibold text-foreground/80">Sphere Of Web3</span>
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground/60 max-w-md text-center md:text-right">
            EthosLayer provides transparency insights, not financial advice. 
            Always conduct your own research before participating in any Web3 project.
          </p>

          <a
            href="/EthosLayer_Whitepaper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Read Whitepaper
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
