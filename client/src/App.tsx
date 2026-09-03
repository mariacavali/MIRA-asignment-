import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import MiraV3 from "./pages/MiraV3";
import MiraV3Journey from "./pages/MiraV3Journey";
import MiraV3Results from "./pages/MiraV3Results";
import MiraV4 from "./pages/MiraV4";
import MiraV4Journey from "./pages/MiraV4Journey";
import MiraLevel1 from "./pages/MiraLevel1";
import MiraLevel1Journey from "./pages/MiraLevel1Journey";
import MiraLevel2Journey from "./pages/MiraLevel2Journey";
import MiraLevel2Create from "./pages/MiraLevel2Create";
import MiraDashboard from "./pages/MiraDashboard";
import MiraPhotographerOnboarding from "./pages/MiraPhotographerOnboarding";
import MiraShoot from "./pages/MiraShoot";
import MiraShootRoom from "./pages/MiraShootRoom";
import MiraLanding from "./pages/MiraLanding";
import MiraPhotographerPricing from "./pages/MiraPhotographerPricing";
import MiraPhotographerCheckout from "./pages/MiraPhotographerCheckout";
import MiraPhotographerHome from "./pages/MiraPhotographerHome";
import MiraPhotographerSignup from "./pages/MiraPhotographerSignup";
import MiraPhotographerLogin from "./pages/MiraPhotographerLogin";
import MiraPaymentSuccess from "./pages/MiraPaymentSuccess";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={MiraLanding} />
      <Route path={"/mira-v3"} component={MiraV3} />
      <Route path={"/mira-v3/journey/:journeyId"} component={MiraV3Journey} />
      <Route path={"/mira-v3/results/:journeyId"} component={MiraV3Results} />
      <Route path={"/mira-v4"} component={MiraV4} />
      <Route path={"/mira-v4/journey/:journeyId"} component={MiraV4Journey} />
      <Route path={"/mira-1"} component={MiraLevel1} />
      <Route path={"/mira-1/journey/:journeyId"} component={MiraLevel1Journey} />
      <Route path={"/mira-1/journey/:journeyId/deeper"} component={MiraLevel2Journey} />
      <Route path={"/mira-1/journey/:journeyId/create"} component={MiraLevel2Create} />
      <Route path={"/mira"} component={MiraLanding} />
      <Route path={"/for-photographers"} component={MiraLanding} />
      <Route path={"/mira/account"} component={MiraPhotographerHome} />
      <Route path={"/mira/login"} component={MiraPhotographerLogin} />
      <Route path={"/mira/signup"} component={MiraPhotographerSignup} />
      <Route path={"/mira/checkout"} component={MiraPhotographerCheckout} />
      <Route path={"/mira/payment-success"} component={MiraPaymentSuccess} />
      <Route path={"/mira/dashboard"} component={MiraDashboard} />
      <Route path={"/mira/onboarding"} component={MiraPhotographerOnboarding} />
      <Route path={"/mira/photographer"} component={MiraPhotographerPricing} />
      <Route path={"/mira/photographer/checkout"} component={MiraPhotographerCheckout} />
      <Route path={"/mira/shoots/:shootId"} component={MiraShoot} />
      <Route path={"/prepare/:token"} component={MiraShootRoom} />
      <Route path={"/prepare/access/:signedAccessToken"} component={MiraShootRoom} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
