import ReferralDashboard from "@/components/referral/ReferralDashboard";
import ReferralAdminPanel from "@/components/referral/ReferralAdminPanel";

export default function ReferralPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Referral Engine™</h1>
      <ReferralDashboard />
      <ReferralAdminPanel />
    </div>
  );
}
