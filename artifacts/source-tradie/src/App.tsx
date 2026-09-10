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
import HomeServicePage from "@/pages/home-services";
import PolicyPage from "@/pages/policy";
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { AuthProvider } from "@/context/auth-context";
import { RequireRole } from "@/components/auth/require-role";
import { trackMetaPageView } from "@/lib/meta-pixel";

const queryClient = new QueryClient();
const siteOrigin = "https://sourcetradie.com.au";

// Routes in this map are indexable: they get their own title, meta
// description and canonical URL. Every other route keeps the existing
// noindex/generic-title default below, unchanged.
const indexableRoutes: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Need a Tradie? Tell Us Once | SourceTradie Melbourne",
    description:
      "Describe the job once. SourceTradie assesses what you need, sources a suitable local tradie and coordinates the next step across Melbourne.",
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
  "/privacy": { title: "Privacy | SourceTradie", description: "How SourceTradie handles homeowner, provider, job, photo and service-coordination information." },
  "/terms": { title: "Service Terms | SourceTradie", description: "Plain-language pilot service terms for SourceTradie's managed tradie sourcing and coordination service." },
};

Object.assign(indexableRoutes, {
  "/find-a-tradie": { title: "Find a Local Tradie in Melbourne | SourceTradie", description: "Tell us what is wrong once. SourceTradie assesses the job and sources a suitable local tradie for your Melbourne home." },
  "/find-a-plumber-melbourne": { title: "Find a Plumber in Melbourne | SourceTradie", description: "Need help with a leak, blockage or hot water? Tell SourceTradie once and we will source a suitable local Melbourne plumber." },
  "/find-an-electrician-melbourne": { title: "Find an Electrician in Melbourne | SourceTradie", description: "Describe your electrical problem once. SourceTradie coordinates the search for a suitable licensed Melbourne electrician." },
  "/heating-air-conditioning-repair-melbourne": { title: "Heating & Air Conditioning Repair Melbourne | SourceTradie", description: "Heating or cooling not working? Share the symptoms once and SourceTradie will source a suitable local repair provider." },
  "/locksmith-melbourne": { title: "Find a Locksmith in Melbourne | SourceTradie", description: "Locked out or need a lock repaired? SourceTradie coordinates the search for a suitable local Melbourne locksmith." },
  "/roof-repair-melbourne": { title: "Roof Leak & Roof Repair Melbourne | SourceTradie", description: "Tell SourceTradie about your roof leak or gutter problem once and we will source a suitable local provider." },
  "/appliance-repair-melbourne": { title: "Appliance Repair Melbourne | SourceTradie", description: "Share your appliance, symptoms and error code once. SourceTradie will source a suitable Melbourne appliance repair provider." },
  "/pest-control-melbourne": { title: "Pest Control Melbourne | SourceTradie", description: "Describe the pest problem once. SourceTradie coordinates the search for a suitable local Melbourne pest-control provider." },
  "/garage-door-repair-melbourne": { title: "Garage Door Repair Melbourne | SourceTradie", description: "Garage door stuck or damaged? Tell SourceTradie once and we will source a suitable local repair provider." },
  "/handyman-melbourne": { title: "Find a Handyman in Melbourne | SourceTradie", description: "List your home repairs once. SourceTradie assesses the scope and sources a suitable local Melbourne handyman." },
  "/rubbish-removal-melbourne": { title: "Rubbish Removal Melbourne | SourceTradie", description: "Tell us what needs removing and access conditions. SourceTradie sources a suitable Melbourne rubbish-removal provider." },
});

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

    document.querySelectorAll<HTMLMetaElement>(
      'meta[property="og:title"], meta[name="twitter:title"]',
    ).forEach((meta) => { meta.content = seo?.title ?? "SourceTradie"; });
    document.querySelectorAll<HTMLMetaElement>(
      'meta[property="og:description"], meta[name="twitter:description"]',
    ).forEach((meta) => { meta.content = seo?.description ?? "SourceTradie"; });
    document.querySelectorAll<HTMLMetaElement>('meta[property="og:url"]').forEach(
      (meta) => { meta.content = seo ? `${siteOrigin}${location === "/" ? "/" : location}` : siteOrigin; },
    );

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

// Fires a Meta Pixel PageView on the initial load and on every
// client-side route change. trackMetaPageView() loads/initialises the
// pixel itself on the first call, so this never double-inits or fires
// more than one PageView per location.
function MetaPixelPageView() {
  const [location] = useLocation();

  useEffect(() => {
    trackMetaPageView();
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
        <Route path="/find-a-tradie" component={HomeServicePage} />
        <Route path="/find-a-plumber-melbourne" component={HomeServicePage} />
        <Route path="/find-an-electrician-melbourne" component={HomeServicePage} />
        <Route path="/heating-air-conditioning-repair-melbourne" component={HomeServicePage} />
        <Route path="/locksmith-melbourne" component={HomeServicePage} />
        <Route path="/roof-repair-melbourne" component={HomeServicePage} />
        <Route path="/appliance-repair-melbourne" component={HomeServicePage} />
        <Route path="/pest-control-melbourne" component={HomeServicePage} />
        <Route path="/garage-door-repair-melbourne" component={HomeServicePage} />
        <Route path="/handyman-melbourne" component={HomeServicePage} />
        <Route path="/rubbish-removal-melbourne" component={HomeServicePage} />
        <Route path="/privacy" component={PolicyPage} />
        <Route path="/terms" component={PolicyPage} />
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
            <MetaPixelPageView />
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
