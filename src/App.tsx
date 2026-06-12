import { lazy, Suspense, useEffect } from "react";
import { captureFirstTouchFromUrl } from "@/lib/attribution";
import { captureFunnelSourceFromUrl, resolveTrafficOwnerFromUtm } from "@/lib/funnel-source";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";

// Critical path — loaded eagerly
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import CookieConsent from "./components/CookieConsent";
import MetaPixelRouteListener from "./components/MetaPixelRouteListener";
import GlobalLanguageSwitcher from "./components/i18n/GlobalLanguageSwitcher";
import PixelDebugPanel from "./components/PixelDebugPanel";
const PixelTest = lazy(() => import("./pages/PixelTest"));
const LpAbPreview = lazy(() => import("./pages/admin/LpAbPreview"));
const MosAbPreview = lazy(() => import("./pages/admin/MosAbPreview"));
// CopilotLiveWidget intentionally not lazy-loaded here — opt-in inside workspace pages only.

// Auth pages — small, loaded eagerly for fast login
import Login from "./pages/members/Login";
import Register from "./pages/members/Register";
import ForgotPassword from "./pages/members/ForgotPassword";
import ResetPassword from "./pages/members/ResetPassword";

// Shared layout — needed before any member route renders
import MembersLayout from "./components/members/MembersLayout";
import ProtectedRoute from "./components/members/ProtectedRoute";
import TrackingDebugOverlay from "./components/debug/TrackingDebugOverlay";

// -----------------------------------------------
// LAZY: Public marketing pages
// -----------------------------------------------
const Funnel = lazy(() => import("./pages/Funnel"));
const Insider = lazy(() => import("./pages/Insider"));
const HighIncomeSkillLanding = lazy(() => import("./pages/HighIncomeSkillLanding"));
const HighConversionLanding = lazy(() => import("./pages/HighConversionLanding"));
const QuizHighIncomeSkill = lazy(() => import("./pages/QuizHighIncomeSkill"));
const BookingHighIncomeSkill = lazy(() => import("./pages/BookingHighIncomeSkill"));
const BookingConfirmedPage = lazy(() => import("./pages/BookingConfirmedPage"));
const Skill = lazy(() => import("./pages/Skill"));
const Quality = lazy(() => import("./pages/Quality"));
const Freiheit = lazy(() => import("./pages/Freiheit"));
const Income = lazy(() => import("./pages/Income"));
const Lifestyle = lazy(() => import("./pages/Lifestyle"));
const Elite = lazy(() => import("./pages/Elite"));
const SystemLanding = lazy(() => import("./pages/SystemLanding"));
const Live = lazy(() => import("./pages/Live"));
const ThankYou = lazy(() => import("./pages/ThankYou"));
const FreiheitDanke = lazy(() => import("./pages/FreiheitDanke"));
const Quiz = lazy(() => import("./pages/Quiz"));
const Ergebnis = lazy(() => import("./pages/Ergebnis"));
const Bewerbung = lazy(() => import("./pages/Bewerbung"));
const Apply = lazy(() => import("./pages/Apply"));
const ApplyLanding = lazy(() => import("./pages/ApplyLanding"));
const MasterOfSales = lazy(() => import("./pages/MasterOfSales"));
const CloserKarriere = lazy(() => import("./pages/CloserKarriere"));
const CloserNow = lazy(() => import("./pages/CloserNow"));
const CloserKarriereDanke = lazy(() => import("./pages/CloserKarriereDanke"));
const CloserKarriereSalesbookOffer = lazy(() => import("./pages/CloserKarriereSalesbookOffer"));
const Salesbook = lazy(() => import("./pages/Salesbook"));

const QualifyLanding = lazy(() => import("./pages/QualifyLanding"));
const ApplyQuiz = lazy(() => import("./pages/ApplyQuiz"));
const LowLeadResult = lazy(() => import("./pages/LowLeadResult"));
const Terminbuchung = lazy(() => import("./pages/Terminbuchung"));
const Booking = lazy(() => import("./pages/Booking"));
const BookingMen = lazy(() => import("./pages/BookingMen"));
const BookingWomen = lazy(() => import("./pages/BookingWomen"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const LegalNotice = lazy(() => import("./pages/LegalNotice"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const NoCallOutcome = lazy(() => import("./components/funnel/NoCallOutcome"));
const FastTrackQuiz = lazy(() => import("./pages/FastTrackQuiz"));
const FastTrackResult = lazy(() => import("./pages/FastTrackResult"));
const FastTrackOffer = lazy(() => import("./pages/FastTrackOffer"));
const TheClose = lazy(() => import("./pages/public/TheClose"));
const TheCloseJoin = lazy(() => import("./pages/the-close/TheCloseJoin"));
const TheCloseOnboardingCloser = lazy(() => import("./pages/the-close/TheCloseOnboardingCloser"));
const TheCloseOnboardingPartner = lazy(() => import("./pages/the-close/TheCloseOnboardingPartner"));
const TheCloseDirectory = lazy(() => import("./pages/the-close/TheCloseDirectory"));
const TheCloseJobs = lazy(() => import("./pages/the-close/TheCloseJobs"));
const TheCloseJobDetail = lazy(() => import("./pages/the-close/TheCloseJobDetail"));
const TheCloseProfile = lazy(() => import("./pages/the-close/TheCloseProfile"));
const TheCloseDashboard = lazy(() => import("./pages/the-close/TheCloseDashboard"));
const TheCloseDashboardJobs = lazy(() => import("./pages/the-close/TheCloseDashboardJobs"));
const TheCloseDashboardProfile = lazy(() => import("./pages/the-close/TheCloseDashboardProfile"));
const TheCloseDashboardBadge = lazy(() => import("./pages/the-close/TheCloseDashboardBadge"));
const TheClosePartnerDashboard = lazy(() => import("./pages/the-close/TheClosePartnerDashboard"));
const TheClosePartnerJobs = lazy(() => import("./pages/the-close/TheClosePartnerJobs"));
const TheClosePartnerJobNew = lazy(() => import("./pages/the-close/TheClosePartnerJobNew"));
const TheClosePartnerDirectory = lazy(() => import("./pages/the-close/TheClosePartnerDirectory"));
const TheCloseBlackInvitation = lazy(() => import("./pages/the-close/TheCloseBlackInvitation"));
const TheCloseAuthGate = lazy(() => import("./components/the-close/TheCloseAuthGate"));
const CheckoutPage = lazy(() => import("./pages/checkout/CheckoutPage"));
const PaymentRecoveryPage = lazy(() => import("./pages/checkout/PaymentRecoveryPage"));
const CheckoutSuccess = lazy(() => import("./pages/checkout/CheckoutSuccess"));
const CheckoutCancelled = lazy(() => import("./pages/checkout/CheckoutCancelled"));
const Webinar = lazy(() => import("./pages/Webinar"));
const WebinarFull = lazy(() => import("./pages/WebinarFull"));
const Workshop = lazy(() => import("./pages/Workshop"));
const Partners = lazy(() => import("./pages/Partners"));
const PartnersApply = lazy(() => import("./pages/PartnersApply"));
const PartnersLicense = lazy(() => import("./pages/PartnersLicense"));
const Partnerunternehmen = lazy(() => import("./pages/Partnerunternehmen"));
const CloneLanding = lazy(() => import("./pages/public/CloneLanding"));

// -----------------------------------------------
// LAZY: /closerpath funnel (V3 — Lifestyle / Charisma / Narrative stack)
// -----------------------------------------------
const CloserPath = lazy(() => import("./pages/CloserPath"));
const CloserPathResult = lazy(() => import("./pages/CloserPathResult"));
const CloserPathBooking = lazy(() => import("./pages/CloserPathBooking"));
const CloserPathPerformance = lazy(() => import("./pages/members/CloserPathPerformance"));

// -----------------------------------------------
// LAZY: Members area pages (heaviest bundle)
// -----------------------------------------------
const EntryScreen = lazy(() => import("./pages/members/EntryScreen"));
const Dashboard = lazy(() => import("./pages/members/Dashboard"));
const Playbooks = lazy(() => import("./pages/members/Playbooks"));
const PlaybookAuszahlungspolitik = lazy(() => import("./pages/members/playbooks/AuszahlungspolitikPage"));
const SetterScriptReader = lazy(() => import("./pages/members/playbooks/SetterScriptReader"));
const SopLeadRecoveryReader = lazy(() => import("./pages/members/playbooks/SopLeadRecoveryReader"));
const StartHere = lazy(() => import("./pages/members/StartHere"));
const Academy = lazy(() => import("./pages/members/Academy"));
const Lesson = lazy(() => import("./pages/members/Lesson"));
const Practice = lazy(() => import("./pages/members/Practice"));
const Certification = lazy(() => import("./pages/members/Certification"));
const ObjectionHandling = lazy(() => import("./pages/members/ObjectionHandling"));
const Placement = lazy(() => import("./pages/members/Placement"));
const Tools = lazy(() => import("./pages/members/Tools"));
const ClipperBrief = lazy(() => import("./pages/members/ClipperBrief"));
const HelpCenter = lazy(() => import("./pages/members/HelpCenter"));
const CommunityRedirect = lazy(() => import("./components/CommunityRedirect"));
const MemberProfile = lazy(() => import("./pages/members/MemberProfile"));
const AdminPanel = lazy(() => import("./pages/members/AdminPanel"));
const AdminWorkspace = lazy(() => import("./pages/members/AdminWorkspace"));
const SetterWorkspace = lazy(() => import("./pages/members/SetterWorkspace"));
const CloserWorkspace = lazy(() => import("./pages/members/CloserWorkspace"));
const DirectorWorkspace = lazy(() => import("./pages/members/DirectorWorkspace"));
const OperatorCalendar = lazy(() => import("./pages/members/OperatorCalendar"));
const CalendarRouter = lazy(() => import("./pages/members/CalendarRouter"));

const ClosingQuestions = lazy(() => import("./pages/members/ClosingQuestions"));
const CallFramework = lazy(() => import("./pages/members/CallFramework"));
const CloserFramework = lazy(() => import("./pages/members/CloserFramework"));
const CloserSimulator = lazy(() => import("./pages/members/CloserSimulator"));
const RadiantDashboard = lazy(() => import("./pages/members/RadiantDashboard"));
const MentorSpace = lazy(() => import("./pages/members/MentorSpace"));
const TrainerDirectory = lazy(() => import("./pages/members/TrainerDirectory"));
const CloserBenefits = lazy(() => import("./pages/members/CloserBenefits"));
const BuildYourTeam = lazy(() => import("./pages/members/BuildYourTeam"));
const AdvancedLab = lazy(() => import("./pages/members/AdvancedLab"));
const QuarterlyCrossing = lazy(() => import("./pages/members/QuarterlyCrossing"));
const InnerCircle = lazy(() => import("./pages/members/InnerCircle"));
const Pool = lazy(() => import("./pages/members/Pool"));
const OpenerWorkspace = lazy(() => import("./pages/members/OpenerWorkspace"));
const OpenerSimulator = lazy(() => import("./pages/members/OpenerSimulator"));
const SetterSimulator = lazy(() => import("./pages/members/SetterSimulator"));
const PracticeHub = lazy(() => import("./pages/members/PracticeHub"));
const FeedbackHub = lazy(() => import("./pages/members/FeedbackHub"));
const SimulatorOpener = lazy(() => import("./pages/members/SimulatorOpener"));
const SimulatorSetter = lazy(() => import("./pages/members/SimulatorSetter"));
const SimulatorCloser = lazy(() => import("./pages/members/SimulatorCloser"));
const CareerPathScreen = lazy(() => import("./pages/members/CareerPathScreen"));
const EarnDashboard = lazy(() => import("./pages/members/EarnDashboard"));
const ReferralPage = lazy(() => import("./pages/members/ReferralPage"));
const PayoutDashboard = lazy(() => import("./pages/members/PayoutDashboard"));
const PortalPreview = lazy(() => import("./pages/members/PortalPreview"));
const Testimonial = lazy(() => import("./pages/members/Testimonial"));
const Philosophy = lazy(() => import("./pages/members/Philosophy"));
const EthicalFramework = lazy(() => import("./pages/members/EthicalFramework"));
const EthicalSimulator = lazy(() => import("./pages/members/EthicalSimulator"));
const DirectorOnboarding = lazy(() => import("./pages/members/DirectorOnboarding"));
const PartnerHub = lazy(() => import("./pages/members/PartnerHub"));
const GovernanceDashboard = lazy(() => import("./pages/members/GovernanceDashboard"));
const AdminKpiDashboard = lazy(() => import("./pages/members/AdminKpiDashboard"));
const ChatAudit = lazy(() => import("./pages/members/ChatAudit"));
const ScaleHub = lazy(() => import("./pages/members/ScaleHub"));
const OfferDeck = lazy(() => import("./pages/members/OfferDeck"));
const CloneVerification = lazy(() => import("./pages/members/CloneVerification"));
const WhiteLabelSettings = lazy(() => import("./pages/members/WhiteLabelSettings"));
const PartnerEarnings = lazy(() => import("./pages/members/PartnerEarnings"));
const VoiceSimulator = lazy(() => import("./pages/members/VoiceSimulator"));
const LeaderboardPage = lazy(() => import("./pages/members/LeaderboardPage"));
const ClosingOS = lazy(() => import("./pages/members/ClosingOS"));
const SimulationLab = lazy(() => import("./pages/members/SimulationLab"));
const CallReview = lazy(() => import("./pages/members/CallReview"));
const KpiVerification = lazy(() => import("./pages/members/KpiVerification"));
const RevenueBlueprint = lazy(() => import("./pages/members/RevenueBlueprint"));
const TeamSupport = lazy(() => import("./pages/members/TeamSupport"));
const OwnerDashboard = lazy(() => import("./pages/members/OwnerDashboard"));
const IntelligenceDashboard = lazy(() => import("./pages/members/IntelligenceDashboard"));
const RevenueIntelligence = lazy(() => import("./pages/members/RevenueIntelligence"));
const AssignmentIntelligence = lazy(() => import("./pages/members/AssignmentIntelligence"));
const TenantDashboard = lazy(() => import("./pages/members/TenantDashboard"));
const DailyExecutionOS = lazy(() => import("./pages/members/DailyExecutionOS"));
const MembersCalendar = lazy(() => import("./pages/members/Calendar"));
const ApplicantInterview = lazy(() => import("./pages/members/ApplicantInterview"));
const DealIntelligence = lazy(() => import("./pages/members/DealIntelligence"));
const PaymentLinksPage = lazy(() => import("./pages/members/PaymentLinksPage"));
const AutomationHub = lazy(() => import("./pages/members/AutomationHub"));
const FunnelAnalytics = lazy(() => import("./pages/members/FunnelAnalytics"));
const EmailDeliveryDropoff = lazy(() => import("./pages/members/EmailDeliveryDropoff"));

// Community feature was removed. All /community* routes now hard-redirect to
// the Global Closer Network (affiliate partner) via CommunityRedirect above.
const AdminHeartbeatPage = lazy(() => import("./pages/admin/AdminHeartbeatPage"));
const GoLiveSimulation = lazy(() => import("./pages/admin/GoLiveSimulation"));

// -----------------------------------------------
// LAZY: Admin pages
// -----------------------------------------------
const PerformanceMonitor = lazy(() => import("./pages/admin/PerformanceMonitor"));
const LevelMessagingAdmin = lazy(() => import("./pages/admin/LevelMessagingAdmin"));
const PerformanceLevelMessaging = lazy(() => import("./pages/members/PerformanceLevelMessaging"));
const MessageLibraryAdmin = lazy(() => import("./pages/admin/MessageLibraryAdmin"));
const MessagePerformanceAdmin = lazy(() => import("./pages/admin/MessagePerformanceAdmin"));
const VoicePerformanceAdmin = lazy(() => import("./pages/admin/VoicePerformanceAdmin"));
const FunnelIntelligenceAdmin = lazy(() => import("./pages/admin/FunnelIntelligenceAdmin"));
const ConversionIntelligence = lazy(() => import("./pages/admin/ConversionIntelligence"));
const IntelligenceControl = lazy(() => import("./pages/admin/IntelligenceControl"));
const PerformanceShell = lazy(() => import("./components/performance/PerformanceShell"));
const L6PerformanceDashboard = lazy(() => import("./components/performance/L6PerformanceDashboard"));
const ExecutionDashboard = lazy(() => import("./components/performance/ExecutionDashboard"));
const LearningLoopAdmin = lazy(() => import("./pages/admin/LearningLoopAdmin"));
const LearningPool = lazy(() => import("./pages/members/LearningPool"));
const PerformanceControlLayer = lazy(() => import("./pages/admin/PerformanceControlLayer"));
const PlacementRevenueEngine = lazy(() => import("./pages/admin/PlacementRevenueEngine"));
const ProductSetupWizard = lazy(() => import("./pages/admin/ProductSetupWizard"));
const ProductOperations = lazy(() => import("./pages/admin/ProductOperations"));
const ProductPreview = lazy(() => import("./pages/admin/ProductPreview"));
const PayoutManagement = lazy(() => import("./pages/admin/PayoutManagement"));
const PlaybookVersionsAdmin = lazy(() => import("./pages/admin/PlaybookVersionsAdmin"));
const MasterOfSalesProofsAdmin = lazy(() => import("./pages/admin/MasterOfSalesProofsAdmin"));
const SystemHealth = lazy(() => import("./pages/admin/SystemHealth"));
const FastlaneBookings = lazy(() => import("./pages/admin/FastlaneBookings"));
const AvailabilityAnalytics = lazy(() => import("./pages/admin/AvailabilityAnalytics"));
const SecurityConsole = lazy(() => import("./pages/admin/SecurityConsole"));
const AuditLogViewer = lazy(() => import("./pages/admin/AuditLogViewer"));
const ExportCenter = lazy(() => import("./pages/admin/ExportCenter"));
const CleanupReport = lazy(() => import("./pages/admin/CleanupReport"));
const RoleEscalation = lazy(() => import("./pages/admin/RoleEscalation"));
const PromptVault = lazy(() => import("./pages/admin/PromptVault"));
const SessionManagement = lazy(() => import("./pages/admin/SessionManagement"));
const IntegrationRegistry = lazy(() => import("./pages/admin/IntegrationRegistry"));
const OwnerIpConsole = lazy(() => import("./pages/admin/OwnerIpConsole"));
const TenantAccessMatrix = lazy(() => import("./pages/admin/TenantAccessMatrix"));
const TenantIsolationProbe = lazy(() => import("./pages/admin/TenantIsolationProbe"));
const ReferenceCases = lazy(() => import("./pages/admin/ReferenceCases"));
const ApprovalQueue = lazy(() => import("./pages/admin/ApprovalQueue"));
const WorkflowRegistry = lazy(() => import("./pages/admin/WorkflowRegistry"));
const InternalNotifications = lazy(() => import("./pages/admin/InternalNotifications"));
const RevenueCommandCenter = lazy(() => import("./pages/admin/RevenueCommandCenter"));
const CeoDashboard = lazy(() => import("./pages/admin/CeoDashboard"));
const GovernanceLock = lazy(() => import("./pages/admin/GovernanceLock"));
const PerformanceCommandCenter = lazy(() => import("./pages/admin/PerformanceCommandCenter"));
const UtmValidation = lazy(() => import("./pages/admin/UtmValidation"));
const OrsGovernance = lazy(() => import("./pages/admin/OrsGovernance"));
const PerformanceOverview = lazy(() => import("./pages/admin/PerformanceOverview"));
const OperatorComparisonDashboard = lazy(() => import("./pages/admin/OperatorComparisonDashboard"));
// Layer 27 / 28 — Smart Attendance + AI Setter (Phase 1, additive, silent by default)
const PerformanceAttendance = lazy(() => import("./pages/members/PerformanceAttendance"));
const PerformanceAiSetter = lazy(() => import("./pages/members/PerformanceAiSetter"));
const OperatorControl = lazy(() => import("./pages/members/OperatorControl"));
const TouchpointSequenceEditor = lazy(() => import("./pages/members/TouchpointSequenceEditor"));
const AiSetterGuardrails = lazy(() => import("./pages/members/AiSetterGuardrails"));
const SelfOptimization = lazy(() => import("./pages/members/SelfOptimization"));
const AuditCenter = lazy(() => import("./pages/members/AuditCenter"));
// SmartAttendanceSettings removed — legacy tables dropped, route now redirects to operator attendance
const AiSetterAdmin = lazy(() => import("./pages/admin/AiSetterAdmin"));
const AbTestDashboard = lazy(() => import("./pages/admin/AbTestDashboard"));
// Layer 29 — Lead Activation (Phase 1, additive, silent)
const PerformanceLeadActivation = lazy(() => import("./pages/members/PerformanceLeadActivation"));
const LeadActivationAdmin = lazy(() => import("./pages/admin/LeadActivationAdmin"));
const SystemAudit = lazy(() => import("./pages/members/admin/SystemAudit"));
const SystemIntegrity = lazy(() => import("./pages/members/admin/SystemIntegrity"));
const E2EChecks = lazy(() => import("./pages/members/admin/E2EChecks"));
const OperatorCoach = lazy(() => import("./pages/members/admin/OperatorCoach"));
const ApplyAbDashboard = lazy(() => import("./pages/members/admin/ApplyAbDashboard"));
const StickyHintAbDashboard = lazy(() => import("./pages/members/admin/StickyHintAbDashboard"));
const ExperimentsRegistry = lazy(() => import("./pages/members/admin/Experiments"));
const WinnerEngineDashboard = lazy(() => import("./pages/members/admin/WinnerEngineDashboard"));
const MetaEvents = lazy(() => import("./pages/members/admin/MetaEvents"));
const MetaEventReplay = lazy(() => import("./pages/members/admin/MetaEventReplay"));
const RecordingIntegration = lazy(() => import("./pages/members/admin/RecordingIntegration"));
const AlertSettings = lazy(() => import("./pages/members/admin/AlertSettings"));
const CommunicationMatrix = lazy(() => import("./pages/members/admin/CommunicationMatrix"));
const CapacityEngine = lazy(() => import("./pages/members/admin/CapacityEngine"));
const RevenuePartnerships = lazy(() => import("./pages/members/admin/RevenuePartnerships"));
const BrandDashboard = lazy(() => import("./pages/members/admin/BrandDashboard"));

const InvestorDashboard = lazy(() => import("./pages/admin/InvestorDashboard"));
const AutomationHealth = lazy(() => import("./pages/admin/AutomationHealth"));
const RetargetingABResults = lazy(() => import("./pages/admin/RetargetingABResults"));
const RetargetingDashboard = lazy(() => import("./pages/admin/RetargetingDashboard"));
const RevenueAccelerationKPI = lazy(() => import("./pages/admin/RevenueAccelerationKPI"));

// -----------------------------------------------
// LAZY: Employer pages
// -----------------------------------------------
const EmployerLayout = lazy(() => import("./pages/employer/EmployerLayout"));
const EmployerDashboard = lazy(() => import("./pages/employer/EmployerDashboard"));
const TalentPool = lazy(() => import("./pages/employer/TalentPool"));
const SavedProfiles = lazy(() => import("./pages/employer/SavedProfiles"));
const EmployerMessages = lazy(() => import("./pages/employer/EmployerMessages"));
const EmployerJobs = lazy(() => import("./pages/employer/EmployerJobs"));

const queryClient = new QueryClient();

/**
 * /ergebnis — Smart router.
 *   - `?q=low` (or hard-blocked applicants) → terminal LowLeadResult page
 *     with NO calendar / NO booking. This protects funnel KPIs and closer
 *     capacity.
 *   - Anything else → /booking (legacy behavior).
 */
const ErgebnisRouter = () => {
  // V3 "no dead-end" rule: low / hard-blocked applicants are no longer routed
  // to a terminal LowLeadResult page. They go into /booking with the
  // orientation calendar (expectation-setting copy + 1–2 weekly slots).
  // LowLeadResult is intentionally NOT mounted here; it remains in the repo
  // only as a soft alternative surface reachable from internal docs.
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const q = params.get("q");
  const bucket = typeof window !== "undefined" ? localStorage.getItem("qualification_bucket") : null;
  const hardBlocked = typeof window !== "undefined" ? localStorage.getItem("qualification_hard_blocked") === "true" : false;
  if (q === "low" || bucket === "low" || hardBlocked) {
    return <Navigate to="/booking?q=low&type=orientation&src=ergebnis_router" replace />;
  }
  return <Navigate to="/booking" replace />;
};


/**
 * Smart legacy /quiz redirect — preserves funnel context via UTM/referrer.
 * Maps utm_source / utm_campaign / referrer to the matching funnel quiz so
 * attribution and creative-specific copy survive the redirect.
 */
const QuizRouter = () => {
  const params = new URLSearchParams(window.location.search);
  const ctx = (
    params.get("funnel") ||
    params.get("utm_campaign") ||
    params.get("utm_source") ||
    ""
  ).toLowerCase();
  const ref = (typeof document !== "undefined" ? document.referrer : "").toLowerCase();
  const haystack = `${ctx} ${ref}`;

  const target =
    /freiheit/.test(haystack) ? "/freiheit/quiz" :
    /income|einkommen/.test(haystack) ? "/income/quiz" :
    /lifestyle|reise|travel/.test(haystack) ? "/lifestyle/quiz" :
    /high-?income-?skill|skill/.test(haystack) ? "/high-income-skill/quiz" :
    "/start/quiz";

  // Preserve query string (UTMs etc.) on redirect
  const search = window.location.search;
  return <Navigate to={`${target}${search}`} replace />;
};

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

function FirstTouchBootstrap() {
  useEffect(() => {
    captureFirstTouchFromUrl();
    captureFunnelSourceFromUrl();
    // Capture free-form ?source= (e.g. source=masterofsales) at app boot so
    // every downstream surface (debug overlay, master tracking payload,
    // booking dashboards) sees a stable value across /masterofsales →
    // /apply/quiz → /booking. Write-once; safe if already set.
    void import("@/lib/attribution-source").then((m) => m.captureAttributionSource());
    void resolveTrafficOwnerFromUtm();
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
    <TooltipProvider>
      <FirstTouchBootstrap />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <MetaPixelRouteListener />
        <GlobalLanguageSwitcher />
        <Suspense fallback={null}>
          <TrackingDebugOverlay />
        </Suspense>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/preview/lp-ab" element={<ProtectedRoute requireAdmin><LpAbPreview /></ProtectedRoute>} />
          <Route path="/preview/mos-ab" element={<ProtectedRoute requireAdmin><MosAbPreview /></ProtectedRoute>} />
          <Route
            path="/pixel-test"
            element={
              <ProtectedRoute requireAdmin>
                <PixelTest />
              </ProtectedRoute>
            }
          />

          {/* ── CORE / START funnel ── */}
          <Route path="/start" element={<Index />} />
          <Route path="/start/quiz" element={<Quiz />} />
          <Route path="/start/masterclass" element={<Live />} />
          <Route path="/start/danke" element={<Ergebnis />} />
          <Route path="/start/bewerbung" element={<Bewerbung />} />

          {/* ── FREIHEIT funnel ── */}
          <Route path="/freiheit" element={<Freiheit />} />
          <Route path="/freiheit/quiz" element={<Quiz />} />
          <Route path="/freiheit/masterclass" element={<Live />} />
          <Route path="/freiheit/danke" element={<FreiheitDanke />} />
          <Route path="/freiheit/bewerbung" element={<Bewerbung />} />

          {/* ── INCOME funnel ── */}
          <Route path="/income" element={<Income />} />
          <Route path="/income/quiz" element={<Quiz />} />
          <Route path="/income/masterclass" element={<Live />} />
          <Route path="/income/danke" element={<Ergebnis />} />
          <Route path="/income/bewerbung" element={<Bewerbung />} />

          {/* ── LIFESTYLE funnel ── */}
          <Route path="/lifestyle" element={<Lifestyle />} />
          <Route path="/lifestyle/quiz" element={<Quiz />} />
          <Route path="/lifestyle/masterclass" element={<Live />} />
          <Route path="/lifestyle/danke" element={<Ergebnis />} />
          <Route path="/lifestyle/bewerbung" element={<Bewerbung />} />

          {/* ── /CLOSERPATH funnel (V3 — Gold Standard) ── */}
          <Route path="/closerpath" element={<CloserPath />} />
          <Route path="/closerpath/quiz" element={<Quiz />} />
          <Route path="/closerpath/result" element={<CloserPathResult />} />
          <Route path="/closerpath/booking" element={<CloserPathBooking />} />

          {/* ── HIGH-INCOME-SKILL funnel ── */}
          <Route path="/system" element={<SystemLanding />} />
          <Route path="/high-income-skill" element={<HighConversionLanding />} />
          <Route path="/high-income-skill/quiz" element={<QuizHighIncomeSkill />} />
          <Route path="/high-income-skill/booking" element={<BookingHighIncomeSkill />} />
          <Route path="/booking/confirmed" element={<BookingConfirmedPage />} />

          {/* ── Booking (unified thank-you + conversion page) ── */}
          <Route path="/booking" element={<Booking />} />
          {/* ── Female funnel alias for /booking (same component) ── */}
          <Route path="/booking-women" element={<BookingWomen />} />
          {/* ── Male-targeted booking presentation layer (wraps Booking) ── */}
          <Route path="/booking-men" element={<BookingMen />} />
          {/* ── Public Booking — no quiz required, lead capture after slot selection ── */}
          <Route path="/book" element={<PublicBooking />} />

          {/* ── Checkout (Payment V24.2) ── */}
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/checkout/cancelled" element={<CheckoutCancelled />} />
          <Route path="/checkout/recover/:token" element={<PaymentRecoveryPage />} />
          <Route path="/checkout/:token" element={<CheckoutPage />} />

          {/* ── B2B / Partners (public entry) ── */}
          <Route path="/partners" element={<Partners />} />
          <Route path="/partners/apply" element={<PartnersApply />} />
          <Route path="/partners/license" element={<PartnersLicense />} />
          {/* Focused B2B partner pilot landing (companies with existing leads/calls) */}
          <Route path="/partnerunternehmen" element={<Partnerunternehmen />} />
          {/* Catch-all: any unknown /partners/* deep link → canonical landing (no 404) */}
          <Route path="/partners/*" element={<Navigate to="/partners" replace />} />
          {/* Common B2B aliases → canonical /partners */}
          <Route path="/b2b" element={<Navigate to="/partners" replace />} />
          <Route path="/unternehmen" element={<Navigate to="/partners" replace />} />
          <Route path="/sales-teams" element={<Navigate to="/partners" replace />} />

          {/* ── Webinar (public) ── */}
          <Route path="/webinar" element={<Webinar />} />
          <Route path="/webinar/full" element={<WebinarFull />} />

          {/* ── The Close Platform ── */}
          <Route path="/the-close" element={<Suspense fallback={null}><TheClose /></Suspense>} />
          <Route path="/the-close/join" element={<Suspense fallback={null}><TheCloseJoin /></Suspense>} />
          <Route path="/the-close/onboarding/closer" element={<Suspense fallback={null}><TheCloseOnboardingCloser /></Suspense>} />
          <Route path="/the-close/onboarding/partner" element={<Suspense fallback={null}><TheCloseOnboardingPartner /></Suspense>} />
          <Route path="/the-close/directory" element={<Suspense fallback={null}><TheCloseDirectory /></Suspense>} />
          <Route path="/the-close/jobs" element={<Suspense fallback={null}><TheCloseJobs /></Suspense>} />
          <Route path="/the-close/jobs/:id" element={<Suspense fallback={null}><TheCloseJobDetail /></Suspense>} />
          <Route path="/the-close/profile/:userId" element={<Suspense fallback={null}><TheCloseProfile /></Suspense>} />
          {/* The Close — Auth required */}
          <Route path="/the-close/dashboard" element={<Suspense fallback={null}><TheCloseAuthGate><TheCloseDashboard /></TheCloseAuthGate></Suspense>} />
          <Route path="/the-close/dashboard/jobs" element={<Suspense fallback={null}><TheCloseAuthGate><TheCloseDashboardJobs /></TheCloseAuthGate></Suspense>} />
          <Route path="/the-close/dashboard/profile" element={<Suspense fallback={null}><TheCloseAuthGate><TheCloseDashboardProfile /></TheCloseAuthGate></Suspense>} />
          <Route path="/the-close/dashboard/badge" element={<Suspense fallback={null}><TheCloseAuthGate><TheCloseDashboardBadge /></TheCloseAuthGate></Suspense>} />
          <Route path="/the-close/partner/dashboard" element={<Suspense fallback={null}><TheCloseAuthGate><TheClosePartnerDashboard /></TheCloseAuthGate></Suspense>} />
          <Route path="/the-close/partner/jobs" element={<Suspense fallback={null}><TheCloseAuthGate><TheClosePartnerJobs /></TheCloseAuthGate></Suspense>} />
          <Route path="/the-close/partner/jobs/new" element={<Suspense fallback={null}><TheCloseAuthGate><TheClosePartnerJobNew /></TheCloseAuthGate></Suspense>} />
          <Route path="/the-close/partner/directory" element={<Suspense fallback={null}><TheCloseAuthGate><TheClosePartnerDirectory /></TheCloseAuthGate></Suspense>} />

          {/* ── Email compliance ── */}
          <Route path="/unsubscribe" element={<Unsubscribe />} />

          {/* ── Fast Track Self-Closing ── */}
          <Route path="/fast-track/quiz" element={<FastTrackQuiz />} />
          <Route path="/fast-track/ergebnis" element={<FastTrackResult />} />
          <Route path="/fast-track/offer" element={<FastTrackOffer />} />

          {/* ── Legacy redirects (forbidden global slugs) ── */}
          <Route path="/quiz" element={<QuizRouter />} />
          <Route path="/ergebnis" element={<ErgebnisRouter />} />
          {/* V3 no-dead-end safety net: legacy low-result slug now redirects
              straight into the booking flow with the orientation calendar. */}
          <Route path="/quiz/low-result" element={<Navigate to="/booking?q=low&type=orientation&src=legacy_low_result" replace />} />
          <Route path="/danke" element={<Navigate to="/booking" replace />} />

          <Route path="/bewerbung" element={<Navigate to="/start/bewerbung" replace />} />
          <Route path="/masterclass" element={<Navigate to="/start/masterclass" replace />} />
          <Route path="/apply" element={<Suspense fallback={null}><ApplyLanding /></Suspense>} />
          <Route path="/masterofsales" element={<Suspense fallback={null}><MasterOfSales /></Suspense>} />
          {/* ── Phase 10 — Standalone Ethical Top Closer Registrierungs-LP (additive) ── */}
          <Route path="/closer-karriere" element={<Suspense fallback={null}><CloserKarriere /></Suspense>} />
          <Route path="/closer-now" element={<Suspense fallback={null}><CloserNow /></Suspense>} />
          <Route path="/closer-karriere/salesbook-offer" element={<Suspense fallback={null}><CloserKarriereSalesbookOffer /></Suspense>} />
          <Route path="/closer-karriere/danke" element={<Suspense fallback={null}><CloserKarriereDanke /></Suspense>} />
          <Route path="/salesbook" element={<Suspense fallback={null}><Salesbook /></Suspense>} />
          
          
          
          
          <Route path="/qualify" element={<Suspense fallback={null}><QualifyLanding /></Suspense>} />
          <Route path="/apply/quiz" element={<Suspense fallback={null}><ApplyQuiz /></Suspense>} />
          <Route path="/terminbuchung" element={<Navigate to="/booking" replace />} />
          <Route path="/live" element={<Navigate to="/start/masterclass" replace />} />
          <Route path="/nextrealstep" element={<Funnel />} />
          <Route path="/funnel" element={<Navigate to="/nextrealstep" replace />} />

          {/* ── Insider (L0 preview) ── */}
          <Route path="/insider" element={<Insider />} />

          {/* ── Community feature removed — hard redirect to Global Closer Network ── */}
          <Route path="/community" element={<CommunityRedirect />} />
          <Route path="/community/*" element={<CommunityRedirect />} />
          <Route path="/admin/community" element={<CommunityRedirect />} />
          <Route path="/admin/community/*" element={<CommunityRedirect />} />
          <Route path="/admin/heartbeat" element={<AdminHeartbeatPage />} />
          <Route path="/admin/go-live-simulation" element={<ProtectedRoute><GoLiveSimulation /></ProtectedRoute>} />

          {/* Members Area */}
          <Route path="/members/login" element={<Login />} />
          <Route path="/members/register" element={<Register />} />
          <Route path="/members/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Entryflow: per-login orientation ritual — full-screen, NO MembersLayout/sidebar */}
          <Route
            path="/members/entryflow"
            element={
              <ProtectedRoute>
                <EntryScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/members"
            element={
              <ProtectedRoute>
                <MembersLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<EntryScreen />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="playbooks" element={<Playbooks />} />
            <Route path="playbooks/auszahlungspolitik" element={<PlaybookAuszahlungspolitik />} />
            <Route path="playbooks/setter-script" element={<SetterScriptReader />} />
            <Route path="playbooks/sop-lead-recovery" element={<SopLeadRecoveryReader />} />
            <Route path="closing-os" element={<ClosingOS />} />
            <Route path="intelligence" element={<IntelligenceDashboard />} />
            <Route path="simulation-lab" element={<SimulationLab />} />
            <Route path="call-review" element={<CallReview />} />
            <Route path="closer-benefits" element={<CloserBenefits />} />
            <Route path="build-your-team" element={<BuildYourTeam />} />
            <Route path="path" element={<CareerPathScreen />} />
            <Route path="portal-preview" element={<PortalPreview />} />
            <Route path="start" element={<StartHere />} />
            <Route path="philosophy" element={<Philosophy />} />
            <Route path="academy" element={<Academy />} />
            <Route path="academy/:moduleId" element={<Lesson />} />
            <Route path="practice" element={<PracticeHub />} />
            <Route path="practice-legacy" element={<Practice />} />
            <Route path="simulator/opener" element={<SimulatorOpener />} />
            <Route path="simulator/setter" element={<SimulatorSetter />} />
            <Route path="simulator/closer" element={<SimulatorCloser />} />
            {/* Legacy redirects — keep old routes working */}
            <Route path="voice-simulator" element={<PracticeHub />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="referral" element={<ReferralPage />} />
            
            <Route path="certification" element={<Certification />} />
            <Route path="kpi-verification" element={<KpiVerification />} />
            <Route path="testimonial" element={<Testimonial />} />
            <Route path="objection-handling" element={<ObjectionHandling />} />
            <Route path="placement" element={<Placement />} />
            <Route path="tools" element={<Tools />} />
            <Route path="clipper-brief" element={<ProtectedRoute requireAdmin><ClipperBrief /></ProtectedRoute>} />
            <Route path="help" element={<HelpCenter />} />
            <Route path="community" element={<CommunityRedirect />} />
            <Route path="community/*" element={<CommunityRedirect />} />
            <Route path="closer-community" element={<CommunityRedirect />} />
            <Route path="opener-workspace" element={<OpenerWorkspace />} />
            <Route path="opener-simulator" element={<SimulatorOpener />} />
            <Route path="setter-simulator" element={<SimulatorSetter />} />
            <Route path="setter" element={<SetterWorkspace />} />
            <Route path="closer" element={<CloserWorkspace />} />
            <Route path="profile" element={<MemberProfile />} />
            <Route path="closing-questions" element={<ClosingQuestions />} />
            <Route path="call-framework" element={<CallFramework />} />
            
            <Route path="closer-framework" element={<CloserFramework />} />
            <Route path="simulator" element={<SimulatorCloser />} />
            <Route path="ethical-framework" element={<EthicalFramework />} />
            <Route path="ethical-simulator" element={<SimulatorCloser />} />
            <Route path="radiant" element={<RadiantDashboard />} />
            <Route path="trainers" element={<TrainerDirectory />} />
            <Route path="advanced-lab" element={<AdvancedLab />} />
            <Route path="quarterly-crossing" element={<QuarterlyCrossing />} />
            <Route path="inner-circle" element={<InnerCircle />} />
            <Route path="pool" element={<Pool />} />
            <Route path="earn-dashboard" element={<EarnDashboard />} />
            <Route path="payouts" element={<ProtectedRoute><PayoutDashboard /></ProtectedRoute>} />
            <Route path="director-workspace" element={<DirectorWorkspace />} />
            <Route path="operator-calendar" element={<OperatorCalendar />} />
            <Route path="director-onboarding" element={<DirectorOnboarding />} />
            <Route path="partner-hub" element={<PartnerHub />} />
            <Route path="scale-hub" element={<ScaleHub />} />
            <Route path="offer-deck" element={<OfferDeck />} />
            <Route path="revenue-blueprint" element={<RevenueBlueprint />} />
            <Route path="mentor-space" element={<MentorSpace />} />
            <Route path="feedback" element={<FeedbackHub />} />
            <Route path="admin" element={<ProtectedRoute requireAdmin><AdminPanel /></ProtectedRoute>} />
            <Route path="admin-workspace" element={<ProtectedRoute requireAdmin><AdminWorkspace /></ProtectedRoute>} />
            <Route path="admin/governance" element={<ProtectedRoute requireAdmin><GovernanceDashboard /></ProtectedRoute>} />
            <Route path="dashboard/governance" element={<ProtectedRoute requireAdmin><GovernanceLock /></ProtectedRoute>} />
            <Route path="admin/kpi-dashboard" element={<ProtectedRoute requireAdmin><AdminKpiDashboard /></ProtectedRoute>} />
            <Route path="admin/chat-audit" element={<ProtectedRoute requireAdmin><ChatAudit /></ProtectedRoute>} />
            <Route path="admin/clone-verification" element={<ProtectedRoute requireAdmin><CloneVerification /></ProtectedRoute>} />
            <Route path="admin/white-label" element={<ProtectedRoute requireAdmin><WhiteLabelSettings /></ProtectedRoute>} />
            <Route path="admin/performance-monitor" element={<ProtectedRoute requireAdmin><PerformanceMonitor /></ProtectedRoute>} />
            <Route path="admin/level-messaging" element={<ProtectedRoute requireAdmin><LevelMessagingAdmin /></ProtectedRoute>} />
            <Route path="dashboard/level-messaging" element={<ProtectedRoute><PerformanceLevelMessaging /></ProtectedRoute>} />
            <Route path="admin/message-library" element={<ProtectedRoute requireAdmin><MessageLibraryAdmin /></ProtectedRoute>} />
            <Route path="admin/message-performance" element={<ProtectedRoute requireAdmin><MessagePerformanceAdmin /></ProtectedRoute>} />
            <Route path="admin/voice-performance" element={<ProtectedRoute requireAdmin><VoicePerformanceAdmin /></ProtectedRoute>} />
            <Route path="admin/funnel-intelligence" element={<ProtectedRoute requireAdmin><FunnelIntelligenceAdmin /></ProtectedRoute>} />
            {/* Legacy redirects → canonical Performance Shell routes */}
            <Route path="admin/conversion-intelligence" element={<Navigate to="/members/performance/revenue" replace />} />
            <Route path="admin/intelligence-control" element={<Navigate to="/members/performance/intelligence" replace />} />
            <Route path="dashboard/intelligence-control" element={<Navigate to="/members/performance/intelligence" replace />} />

            {/* ═══ ETC OS · Visualization Layer · Unified Performance Shell (Layer 47 integration) ═══
                Single shell · 3 tabs · persistent global filters · cross-drilldown via ?lead/?stage/?channel.
                Permissions: L6 → Revenue + Intelligence · L7+ → all three. */}
            <Route path="performance" element={<ProtectedRoute><PerformanceShell /></ProtectedRoute>}>
              <Route index element={<Navigate to="revenue" replace />} />
              <Route path="execution" element={<ExecutionDashboard />} />
              <Route path="revenue" element={<ConversionIntelligence />} />
              <Route path="talent" element={<PerformanceOverview />} />
              <Route path="intelligence" element={<IntelligenceControl />} />
              <Route path="l6" element={<L6PerformanceDashboard />} />
            </Route>
            <Route path="admin/learning-loop" element={<ProtectedRoute requireAdmin><LearningLoopAdmin /></ProtectedRoute>} />
            <Route path="dashboard/learning-pool" element={<ProtectedRoute><LearningPool /></ProtectedRoute>} />
            <Route path="admin/create-product" element={<ProtectedRoute requireAdmin><ProductSetupWizard /></ProtectedRoute>} />
            <Route path="admin/products" element={<ProtectedRoute requireAdmin><ProductOperations /></ProtectedRoute>} />
            <Route path="admin/product-preview/:productKey" element={<ProtectedRoute requireAdmin><ProductPreview /></ProtectedRoute>} />
            <Route path="admin/payouts" element={<ProtectedRoute requireAdmin><PayoutManagement /></ProtectedRoute>} />
            <Route path="admin/playbook-versions" element={<ProtectedRoute requireAdmin><PlaybookVersionsAdmin /></ProtectedRoute>} />
            <Route path="admin/team-support" element={<ProtectedRoute requireAdmin><TeamSupport /></ProtectedRoute>} />
            <Route path="admin/masterofsales-proofs" element={<ProtectedRoute requireAdmin><MasterOfSalesProofsAdmin /></ProtectedRoute>} />
            <Route path="admin/system-health" element={<ProtectedRoute requireAdmin><SystemHealth /></ProtectedRoute>} />
            <Route path="admin/fastlane-bookings" element={<ProtectedRoute requireAdmin><FastlaneBookings /></ProtectedRoute>} />
            <Route path="admin/availability-analytics" element={<ProtectedRoute requireAdmin><AvailabilityAnalytics /></ProtectedRoute>} />
            <Route path="admin/security" element={<ProtectedRoute requireAdmin><SecurityConsole /></ProtectedRoute>} />
            <Route path="admin/audit-log" element={<ProtectedRoute requireAdmin><AuditLogViewer /></ProtectedRoute>} />
            <Route path="admin/exports" element={<ProtectedRoute requireAdmin><ExportCenter /></ProtectedRoute>} />
            <Route path="admin/cleanup-report" element={<ProtectedRoute requireAdmin><CleanupReport /></ProtectedRoute>} />
            <Route path="admin/escalation" element={<ProtectedRoute requireAdmin><RoleEscalation /></ProtectedRoute>} />
            <Route path="admin/prompt-vault" element={<ProtectedRoute requireAdmin><PromptVault /></ProtectedRoute>} />
            <Route path="admin/sessions" element={<ProtectedRoute requireAdmin><SessionManagement /></ProtectedRoute>} />
            <Route path="admin/integrations" element={<ProtectedRoute requireAdmin><IntegrationRegistry /></ProtectedRoute>} />
            <Route path="admin/ip-console" element={<ProtectedRoute requireAdmin><OwnerIpConsole /></ProtectedRoute>} />
            <Route path="admin/tenant-matrix" element={<ProtectedRoute requireAdmin><TenantAccessMatrix /></ProtectedRoute>} />
            <Route path="admin/tenant-isolation" element={<ProtectedRoute requireAdmin><TenantIsolationProbe /></ProtectedRoute>} />
            <Route path="admin/reference-cases" element={<ProtectedRoute requireAdmin><ReferenceCases /></ProtectedRoute>} />
            <Route path="admin/approvals" element={<ProtectedRoute requireAdmin><ApprovalQueue /></ProtectedRoute>} />
            <Route path="admin/workflows" element={<ProtectedRoute requireAdmin><WorkflowRegistry /></ProtectedRoute>} />
            <Route path="internal-notifications" element={<ProtectedRoute requireAdmin><InternalNotifications /></ProtectedRoute>} />
            <Route path="admin/internal-notifications" element={<ProtectedRoute requireAdmin><InternalNotifications /></ProtectedRoute>} />
            <Route path="admin/revenue-intelligence" element={<ProtectedRoute requireAdmin><RevenueIntelligence /></ProtectedRoute>} />
            <Route path="admin/assignment-intelligence" element={<ProtectedRoute requireAdmin><AssignmentIntelligence /></ProtectedRoute>} />
            <Route path="tenant-dashboard" element={<TenantDashboard />} />
            <Route path="daily-execution" element={<DailyExecutionOS />} />
            <Route path="calendar" element={<CalendarRouter />} />
            <Route path="interview" element={<ApplicantInterview />} />
            <Route path="deal-intelligence" element={<DealIntelligence />} />
            <Route path="payment-links" element={<PaymentLinksPage />} />
            <Route path="admin/automation-hub" element={<ProtectedRoute requireAdmin><AutomationHub /></ProtectedRoute>} />
            <Route path="admin/performance-control" element={<ProtectedRoute requireAdmin><PerformanceControlLayer /></ProtectedRoute>} />
            <Route path="admin/placement-engine" element={<ProtectedRoute requireAdmin><PlacementRevenueEngine /></ProtectedRoute>} />
            <Route path="admin/revenue-command" element={<ProtectedRoute requireAdmin><RevenueCommandCenter /></ProtectedRoute>} />
            <Route path="dashboard/ceo" element={<ProtectedRoute requireAdmin><CeoDashboard /></ProtectedRoute>} />
            <Route path="admin/performance" element={<Navigate to="/members/performance/talent" replace />} />
            <Route path="admin/retargeting-ab" element={<ProtectedRoute requireAdmin><RetargetingABResults /></ProtectedRoute>} />
            <Route path="admin/retargeting" element={<ProtectedRoute><RetargetingDashboard /></ProtectedRoute>} />
            <Route path="admin/revenue-acceleration" element={<ProtectedRoute requireAdmin><RevenueAccelerationKPI /></ProtectedRoute>} />
            <Route path="admin/performance-command" element={<ProtectedRoute requireAdmin><PerformanceCommandCenter /></ProtectedRoute>} />
            <Route path="admin/utm-validation" element={<ProtectedRoute requireAdmin><UtmValidation /></ProtectedRoute>} />
            <Route path="admin/ors-governance" element={<ProtectedRoute requireAdmin><OrsGovernance /></ProtectedRoute>} />
            {/* L6+ operator-facing performance dashboard. Component performs its own level gate (L5 preview, L6 full). */}
            <Route path="dashboard/performance" element={<ProtectedRoute><OperatorComparisonDashboard /></ProtectedRoute>} />
            {/* Layer 27 — Smart Attendance (L6+ self-gated inside component) */}
            <Route path="dashboard/performance/attendance" element={<ProtectedRoute><PerformanceAttendance /></ProtectedRoute>} />
            {/* Layer 28 — AI Setter Voice Agent (L6+ self-gated inside component) */}
            <Route path="dashboard/performance/ai-setter" element={<ProtectedRoute><PerformanceAiSetter /></ProtectedRoute>} />
            <Route path="dashboard/operator-control" element={<Navigate to="/members/dashboard/performance/operator-control" replace />} />
            {/* Canonical route under Performance section */}
            <Route path="dashboard/performance/operator-control" element={<ProtectedRoute><OperatorControl /></ProtectedRoute>} />
            <Route path="dashboard/touchpoint-sequences" element={<ProtectedRoute><TouchpointSequenceEditor /></ProtectedRoute>} />
            <Route path="admin/ai-setter-guardrails" element={<ProtectedRoute requireAdmin><AiSetterGuardrails /></ProtectedRoute>} />
            <Route path="admin/self-optimization" element={<Navigate to="/members/dashboard/self-optimization" replace />} />
            <Route path="dashboard/self-optimization" element={<ProtectedRoute><SelfOptimization /></ProtectedRoute>} />
            <Route path="admin/audit-center" element={<ProtectedRoute requireAdmin><AuditCenter /></ProtectedRoute>} />
            <Route path="dashboard/audit-center" element={<ProtectedRoute><AuditCenter operatorScopeOnly /></ProtectedRoute>} />
            {/* Admin Smart Attendance removed — legacy tables dropped. Redirect to operator attendance. */}
            <Route path="admin/smart-attendance" element={<Navigate to="/members/dashboard/performance/attendance" replace />} />
            <Route path="admin/ai-setter" element={<ProtectedRoute requireAdmin><AiSetterAdmin /></ProtectedRoute>} />
            <Route path="admin/system-audit" element={<ProtectedRoute requireAdmin><SystemAudit /></ProtectedRoute>} />
            <Route path="admin/system-integrity" element={<ProtectedRoute requireAdmin><SystemIntegrity /></ProtectedRoute>} />
            <Route path="admin/e2e-checks" element={<ProtectedRoute requireAdmin><E2EChecks /></ProtectedRoute>} />
            <Route path="admin/operator-coach" element={<ProtectedRoute requireAdmin><OperatorCoach /></ProtectedRoute>} />
            <Route path="admin/apply-ab" element={<ProtectedRoute requireAdmin><ApplyAbDashboard /></ProtectedRoute>} />
            <Route path="admin/apply-ab/sticky-hint" element={<ProtectedRoute requireAdmin><StickyHintAbDashboard /></ProtectedRoute>} />
            {/* Experiment Registry — L6+ self-gated inside component */}
            <Route path="admin/experiments" element={<ProtectedRoute><ExperimentsRegistry /></ProtectedRoute>} />
            <Route path="admin/winner-engine" element={<ProtectedRoute><WinnerEngineDashboard /></ProtectedRoute>} />
            <Route path="admin/meta-events" element={<ProtectedRoute requireAdmin><MetaEvents /></ProtectedRoute>} />
            <Route path="admin/meta-events/replay" element={<ProtectedRoute requireAdmin><MetaEventReplay /></ProtectedRoute>} />
            <Route path="admin/recording-integration" element={<ProtectedRoute requireAdmin><RecordingIntegration /></ProtectedRoute>} />
            {/* WhatsApp Admin Alerts — L6+ self-gated inside component */}
            <Route path="admin/alert-settings" element={<ProtectedRoute><AlertSettings /></ProtectedRoute>} />
            {/* Layer 48 — Communication OS Matrix — L6+ self-gated via RLS */}
            <Route path="admin/communication-matrix" element={<ProtectedRoute><CommunicationMatrix /></ProtectedRoute>} />
            {/* Capacity Engine Phase 1 — Read-only slot generation; L6+/admin self-gated */}
            <Route path="admin/capacity-engine" element={<ProtectedRoute><CapacityEngine /></ProtectedRoute>} />
            {/* Multi-Brand Revenue OS — Phase F */}
            <Route path="admin/revenue-partnerships" element={<ProtectedRoute requireAdmin><RevenuePartnerships /></ProtectedRoute>} />
            <Route path="admin/brand-dashboard/:slug" element={<ProtectedRoute requireAdmin><BrandDashboard /></ProtectedRoute>} />
            <Route path="admin/community-access" element={<CommunityRedirect />} />
            <Route path="admin/investor-dashboard" element={<ProtectedRoute requireAdmin><InvestorDashboard /></ProtectedRoute>} />
            <Route path="admin/automation-health" element={<ProtectedRoute requireAdmin><AutomationHealth /></ProtectedRoute>} />
            <Route path="admin/funnel-analytics" element={<ProtectedRoute requireAdmin><FunnelAnalytics /></ProtectedRoute>} />
            <Route path="admin/ab-tests" element={<ProtectedRoute requireAdmin><AbTestDashboard /></ProtectedRoute>} />
            <Route path="admin/email-delivery-dropoff" element={<ProtectedRoute requireAdmin><EmailDeliveryDropoff /></ProtectedRoute>} />
            <Route path="admin/closerpath" element={<ProtectedRoute requireAdmin><CloserPathPerformance /></ProtectedRoute>} />
            <Route path="partner-earnings" element={<PartnerEarnings />} />
            <Route path="owner/dashboard" element={<OwnerDashboard />} />
          </Route>

          {/* Employer Dashboard */}
          <Route path="/employer" element={<EmployerLayout />}>
            <Route index element={<EmployerDashboard />} />
            <Route path="talent" element={<TalentPool />} />
            <Route path="saved" element={<SavedProfiles />} />
            <Route path="messages" element={<EmployerMessages />} />
            <Route path="jobs" element={<EmployerJobs />} />
            {/* Catch-all inside employer: unknown sub-paths → dashboard (no 404) */}
            <Route path="*" element={<Navigate to="/employer" replace />} />
          </Route>
          {/* B2B alias for partners looking for the talent marketplace */}
          <Route path="/talent" element={<Navigate to="/employer" replace />} />
          <Route path="/hire" element={<Navigate to="/employer" replace />} />

          <Route path="/lp/:productKey" element={<CloneLanding />} />
          {/* ── Legal stack (canonical EN routes) ── */}
          <Route path="/legal-notice" element={<LegalNotice />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/cookie-policy" element={<CookiePolicy />} />
          {/* DE redirects to canonical legal routes */}
          <Route path="/impressum" element={<LegalNotice />} />
          <Route path="/datenschutz" element={<PrivacyPolicy />} />
          <Route path="/agb" element={<TermsOfService />} />
          <Route path="/widerruf" element={<RefundPolicy />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        <CookieConsent />
        <PixelDebugPanel />
        {/* CopilotLiveWidget removed from global render — now opt-in inside workspace pages only. */}
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
