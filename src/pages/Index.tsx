import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Search, Play, Shield, Eye, Users, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const features = [
  {
    icon: Shield,
    title: "Token Integrity",
    description: "Analyze mint authority, supply concentration, and contract upgradeability.",
  },
  {
    icon: Users,
    title: "Governance Health",
    description: "Evaluate voter participation, power distribution, and treasury control.",
  },
  {
    icon: Eye,
    title: "Manipulation Detection",
    description: "Detect wallet clustering, liquidity injections, and social spikes.",
  },
  {
    icon: BarChart3,
    title: "Ethos Preferences",
    description: "Customize your ethical criteria and get personalized risk assessments.",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col animated-gradient-bg">
      <Header />

      {/* Hero */}
      <main className="flex-1 pt-16">
        <section className="container mx-auto px-6 py-24 md:py-36">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 glass-card px-4 py-1.5 mb-8 text-sm text-muted-foreground"
            >
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              Powered by on-chain analysis
            </motion.div>

            <h1 className="font-display text-4xl md:text-6xl font-bold leading-tight mb-6">
              Your{" "}
              <span className="gradient-text">Ethical Intelligence</span>
              {" "}Layer for Web3
            </h1>

            <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Understand token integrity, governance health, and manipulation risk 
              before you participate. Not financial advice — transparency intelligence.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={() => navigate("/analyze")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 font-display font-semibold px-8"
              >
                <Search className="h-4 w-4" />
                Analyze a Token
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/analyze?demo=true")}
                className="border-border text-foreground hover:bg-muted gap-2 font-display px-8"
              >
                <Play className="h-4 w-4" />
                Try Demo Analysis
              </Button>
            </div>
          </motion.div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                className="glass-card p-6 hover:glow-border transition-shadow duration-500 group"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
