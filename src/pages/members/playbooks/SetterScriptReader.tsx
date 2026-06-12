import DocumentReader from '@/components/playbooks/DocumentReader';
import { setterScriptV3 } from '@/data/setter-script-content';

export default function SetterScriptReader() {
  return <DocumentReader document={setterScriptV3} />;
}
