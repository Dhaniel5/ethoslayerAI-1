import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Analyze from "./pages/Analyze";
import Values from "./pages/Values";
import Watchlist from "./pages/Watchlist";
import Methodology from "./pages/Methodology";
import Settlement from "./pages/Settlement";
import EscrowDetail from "./pages/EscrowDetail";
import TransactionHistory from "./pages/TransactionHistory";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/analyze" element={<ProtectedRoute><Analyze /></ProtectedRoute>} />
          <Route path="/values" element={<ProtectedRoute><Values /></ProtectedRoute>} />
          <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
          <Route path="/methodology" element={<ProtectedRoute><Methodology /></ProtectedRoute>} />
          <Route path="/settlement" element={<ProtectedRoute><Settlement /></ProtectedRoute>} />
          <Route path="/settlement/history" element={<ProtectedRoute><TransactionHistory /></ProtectedRoute>} />
          <Route path="/settlement/:id" element={<ProtectedRoute><EscrowDetail /></ProtectedRoute>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
