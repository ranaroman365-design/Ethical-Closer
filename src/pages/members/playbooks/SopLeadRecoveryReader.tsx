import DocumentReader from '@/components/playbooks/DocumentReader';
import { sopLeadRecoveryV5 } from '@/data/sop-lead-recovery-content';

export default function SopLeadRecoveryReader() {
  return <DocumentReader document={sopLeadRecoveryV5} />;
}
