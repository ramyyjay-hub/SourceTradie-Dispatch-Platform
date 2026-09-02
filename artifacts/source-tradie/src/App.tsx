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
import TradieLeadsPage from "@/pages/tradie-leads";
import HipagesAlternativePage from "@/pages/hipages-alternative";
import PlumberLeadsPage from "@/pages/plumber-leads";
import ElectricianLeadsPage from "@/pages/electrician-leads";
import ForTradiesPage from "@/pages/for-tradies";
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { AuthProvider } from "@/context/auth-context";
import { RequireRole } from "@/components/auth/require-role";

const queryClient = new QueryClient();
const siteOrigin = "https://sourcetradie.com.au";

// Routes in this map are indexable: they get their own title, meta
// description and canonical URL. Every other route keeps the existing
// noindex/generic-title default below, unchanged.
const indexableRoutes: Record<string, { title: string; description: string }> = {
  "/": {
    title: "SourceTradie | Find a Local Tradie in Melbourne",
    description:
      "Tell SourceTradie what needs doing at home, get an expected price range, and connect with a suitable local tradie before dispatch.",
  },
  "/tradie-leads": {
    title: "Tradie Leads Without the Bidding War | SourceTradie",
    description:
      "Get matched to local jobs one tradie at a time — no shared leads, no bidding. $0 subscription and $0 lead fees during the SourceTradie pilot.",
  },
  "/hipages-alternative": {
    title: "hipages Alternative for Tradies | SourceTradie",
    description:
      "A fair, factual comparison for tradies weighing up SourceTradie's one-match model against traditional lead marketplaces like hipages.",
  },
  "/plumber-leads": {
    title: "Plumber Leads for Australian Tradies | SourceTradie",
    description:
      "Plumbing job leads offered one suitable business at a time — no bidding, no shared leads. $0 subscription and $0 lead fees during the pilot. Availability depends on current area and category coverage.",
  },
  "/electrician-leads": {
    title: "Electrician Leads for Australian Tradies | SourceTradie",
    description:
      "Electrical job leads offered one suitable, licensed business at a time — no bidding, no shared leads. $0 subscription and $0 lead fees during the pilot. Availability depends on current area and category coverage.",
  },
  "/for-tradies": {
    title: "Work With SourceTradie | Local Job Leads for Tradies",
    description:
      "SourceTradie offers tradies one suitable job at a time — no bidding, no shared leads. $0 subscription and $0 lead fees during the pilot.",
  },
};

function RouteSeoPolicy() {
  const [location] = useLocation();

  useEffect(() => {
    const seo = indexableRoutes[location];
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );

    document.title = seo ? seo.title : "SourceTradie";

    if (robots) {
      robots.content = seo ? "index, follow" : "noindex, nofollow, noarchive";
    }

    if (description) {
      description.content = seo ? seo.description : "SourceTradie";
    }

    if (seo && !canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }

    if (seo && canonical) {
      canonical.href = `${siteOrigin}${location === "/" ? "/" : location}`;
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
        <Route path="/tradie-leads" component={TradieLeadsPage} />
        <Route path="/hipages-alternative" component={HipagesAlternativePage} />
        <Route path="/plumber-leads" component={PlumberLeadsPage} />
        <Route path="/electrician-leads" component={ElectricianLeadsPage} />
        <Route path="/for-tradies" component={ForTradiesPage} />
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
