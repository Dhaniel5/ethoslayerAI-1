import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ETHOS_VALUES, type EthosId, getEthosPrefs, saveEthosPrefs, isOnboardingDone, markOnboardingDone } from "@/lib/ethos";

interface Props {
  onComplete: () => void;
}

const EthosOnboardingModal = ({ onComplete }: Props) => {
  const [show, setShow] = useState(false);
  const [prefs, setPrefs] = useState<Record<EthosId, boolean>>(getEthosPrefs());

  useEffect(() => {
    if (!isOnboardingDone()) setShow(true);
  }, []);

  const toggle = (id: EthosId) => {
    setPrefs((p) => ({ ...p, [id]: !p[id] }));
  };

  const handleSave = () => {
    saveEthosPrefs(prefs);
    markOnboardingDone();
    setShow(false);
    onComplete();
  };

  const handleSkip = () => {
    markOnboardingDone();
    setShow(false);
    onComplete();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="glass-card glow-border max-w-md w-full p-6 relative"
          >
            <button onClick={handleSkip} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Define Your Web3 Values</h2>
                <p className="text-xs text-muted-foreground">Personalize your analysis experience</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-5">
              Select the principles that matter most to you. We'll highlight how tokens align — or conflict — with your values.
            </p>

            <div className="space-y-3 mb-6">
              {ETHOS_VALUES.map((v) => (
                <label
                  key={v.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <Checkbox checked={prefs[v.id]} onCheckedChange={() => toggle(v.id)} className="mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-foreground">{v.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSkip} variant="outline" className="flex-1">
                Skip for Now
              </Button>
              <Button onClick={handleSave} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                Save Preferences
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EthosOnboardingModal;
