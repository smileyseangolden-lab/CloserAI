import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

export function PilotStage() {
  return <StepAssistant stage={STAGE_BY_ID['pilot']!} />;
}
