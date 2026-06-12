import RadiantSelfAssessment from '@/components/members/RadiantSelfAssessment';
import TrainerRecommendationCard from '@/components/trainers/TrainerRecommendationCard';

export default function RadiantDashboard() {
  return (
    <div className="space-y-8">
      <RadiantSelfAssessment />
      <div className="mx-auto max-w-4xl px-5">
        <TrainerRecommendationCard />
      </div>
    </div>
  );
}
