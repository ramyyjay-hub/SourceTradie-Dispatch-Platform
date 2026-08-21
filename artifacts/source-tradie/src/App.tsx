import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import RequestPage from "@/pages/request";
import PartnerPage from "@/pages/partner";
import PartnerDashboard from "@/pages/partner-dashboard";
import AdminPage from "@/pages/admin";
import PartnerLoginPage from "@/pages/partner-login";
import AdminLoginPage from "@/pages/admin-login";
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { AuthProvider } from "@/context/auth-context";
import { RequireRole } from "@/components/auth/require-role";

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/request" component={RequestPage} />
        <Route path="/request/:id" component={RequestPage} />
        <Route path="/partner" component={PartnerPage} />
        <Route path="/partner/login" component={PartnerLoginPage} />
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/partner/dashboard">
          <RequireRole roles={["partner", "admin"]} loginPath="/partner/login">
            <PartnerDashboard />
          </RequireRole>
        </Route>
        <Route path="/admin">
          <RequireRole roles={["admin"]} loginPath="/admin/login">
            <AdminPage />
          </RequireRole>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
