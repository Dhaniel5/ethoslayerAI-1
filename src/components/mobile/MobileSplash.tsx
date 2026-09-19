import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";

const MobileSplash = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center animated-gradient-bg">
      <motion.img
        src={logo}
        alt="EthosLayer"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="h-20 w-20 mb-6"
      />
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="font-display text-2xl font-bold text-foreground"
      >
        <span className="gradient-text">Ethos</span>Layer
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="text-sm text-muted-foreground mt-2 max-w-xs"
      >
        Secure Escrow. Smarter Commerce.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-xs mt-12 space-y-3"
      >
        <Button size="lg" className="w-full font-display font-semibold" onClick={() => navigate("/auth?mode=signup")}>
          Get Started
        </Button>
        <button
          type="button"
          onClick={() => navigate("/auth")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Already have an account? <span className="text-primary font-medium">Sign In</span>
        </button>
      </motion.div>
    </div>
  );
};

export default MobileSplash;
