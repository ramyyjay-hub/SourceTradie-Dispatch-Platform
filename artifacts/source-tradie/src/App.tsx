import { type ReactNode, useEffect } from "react";
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
const homepageTitle = "SourceTradie | Find a Local Tradie in Melbourne";
const homepageDescription =
  "Tell SourceTradie what needs doing at home, get an expected price range, and connect with a suitable local tradie before dispatch.";
const homepageUrl = "https://sourcetradie.com.au/";

function RouteSeoPolicy() {
  const [location] = useLocation();

  useEffect(() => {
    const isHomepage = location === "/";
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );

    document.title = isHomepage ? homepageTitle : "SourceTradie";

    if (robots) {
      robots.content = isHomepage
        ? "index, follow"
        : "noindex, nofollow, noarchive";
    }

    if (description) {
      description.content = isHomepage ? homepageDescription : "SourceTradie";
    }

    if (isHomepage && !canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }

    if (isHomepage && canonical) {
      canonical.href = homepageUrl;
    } else if (canonical) {
      canonical.remove();
    }
  }, [location]);

  return null;
}

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
            <RouteSeoPolicy />
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
