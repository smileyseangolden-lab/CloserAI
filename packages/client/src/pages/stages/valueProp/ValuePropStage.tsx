import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

export function ValuePropStage() {
  return <StepAssistant stage={STAGE_BY_ID['value-prop']!} />;
}
