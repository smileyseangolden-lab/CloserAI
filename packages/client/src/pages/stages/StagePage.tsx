import { useParams, Navigate } from 'react-router';
import { STAGE_BY_ID } from '../../workflow/stages';
import { StepAssistant } from '../../components/assistant/StepAssistant';

export function StagePage() {
  const { stageId } = useParams<{ stageId: string }>();
  const stage = stageId ? STAGE_BY_ID[stageId] : undefined;
  if (!stage) return <Navigate to="/" replace />;
  return <StepAssistant stage={stage} />;
}
