import CloserPathDashboard from "@/components/admin/CloserPathDashboard";

/**
 * Admin route: /members/admin/closerpath
 * Operator dashboard for the /closerpath funnel.
 */
export default function CloserPathPerformance() {
  return (
    <div className="space-y-6">
      <CloserPathDashboard />
    </div>
  );
}
