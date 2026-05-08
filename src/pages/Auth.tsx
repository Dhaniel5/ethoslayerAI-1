import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, Lock, CheckCircle, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

type Mode = "signin" | "signup" | "forgot";

const AuthPage = () => {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/";
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        if (data.session) {
          navigate(from, { replace: true });
        } else {
          toast({ title: "Check your inbox", description: "We sent a confirmation email. Verify your address to continue." });
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      const message = err.message || "An unexpected error occurred. Please try again.";
      setAuthError(message);
      toast({ title: mode === "signup" ? "Sign up failed" : mode === "forgot" ? "Reset failed" : "Sign in failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[80px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-sm">
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <img src={logo} alt="EthosLayer" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">
            <span className="gradient-text">Ethos</span>
            <span className="text-foreground">Layer</span>
          </span>
        </Link>

        <div className="glass-card glow-border p-8">
          {/* Tab switcher — hidden in forgot mode */}
          {mode !== "forgot" && (
            <div className="flex gap-1 mb-6 bg-muted/30 rounded-lg p-1">
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setAuthError(null); }}
                  className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${
                    mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "signin" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Forgot password — sent confirmation */}
            {mode === "forgot" && resetSent ? (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4">
                <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
                <h2 className="font-display text-lg font-bold mb-2">Email sent!</h2>
                <p className="text-sm text-muted-foreground mb-5">Check your inbox for a reset link. It may take a minute to arrive.</p>
                <Button variant="ghost" onClick={() => { setMode("signin"); setResetSent(false); }} className="gap-2 text-sm">
                  <ArrowLeft className="h-4 w-4" /> Back to Sign In
                </Button>
              </motion.div>
            ) : mode === "forgot" ? (
              /* Forgot password — form */
              <motion.div key="forgot" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <button onClick={() => { setMode("signin"); setAuthError(null); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </button>
                <h2 className="font-display text-lg font-bold text-foreground mb-1">Reset password</h2>
                <p className="text-xs text-muted-foreground mb-5">Enter your email and we'll send you a reset link.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <input
                        type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="flex h-10 w-full rounded-md border border-input bg-muted/30 pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                  {authError && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive leading-relaxed">{authError}</p>
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send Reset Link
                  </Button>
                </form>
              </motion.div>
            ) : (
              /* Sign In / Sign Up */
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === "signup" ? 10 : -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "signup" ? -10 : 10 }}
                transition={{ duration: 0.15 }}
              >
                <h2 className="font-display text-lg font-bold text-foreground mb-1">
                  {mode === "signin" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-xs text-muted-foreground mb-5">
                  {mode === "signin"
                    ? "Sign in to access your watchlist, ethos profile, and analysis history."
                    : "Join EthosLayer to save your watchlist, preferences, and analysis history across devices."}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <input
                        type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="flex h-10 w-full rounded-md border border-input bg-muted/30 pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Password</label>
                      {mode === "signin" && (
                        <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:text-primary/80 transition-colors">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <input
                        type={showPassword ? "text" : "password"} required minLength={6}
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="flex h-10 w-full rounded-md border border-input bg-muted/30 pl-9 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {mode === "signup" && <p className="text-xs text-muted-foreground/60">At least 6 characters required.</p>}
                  </div>

                  <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === "signin" ? "Sign In" : "Create Account"}
                  </Button>
                  {authError && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive leading-relaxed">{authError}</p>
                    </div>
                  )}
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/" className="hover:text-foreground transition-colors underline underline-offset-2">← Back to home</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default AuthPage;
