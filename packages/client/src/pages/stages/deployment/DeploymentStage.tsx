import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

export function DeploymentStage() {
  return <StepAssistant stage={STAGE_BY_ID['deployment']!} />;
}
