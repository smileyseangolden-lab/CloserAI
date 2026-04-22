import { useParams, Navigate } from 'react-router';
import { STAGE_BY_ID } from '../../workflow/stages';
import { StepAssistant } from '../../components/assistant/StepAssistant';
import { CompanyProfileStage } from './companyProfile/CompanyProfileStage';
import { DataSourcesStage } from './dataSources/DataSourcesStage';
import { AgentBuilderStage } from './agentBuilder/AgentBuilderStage';
import { IcpStage } from './icp/IcpStage';
import { ValuePropStage } from './valueProp/ValuePropStage';
import { KnowledgeStage } from './knowledge/KnowledgeStage';
import { DeploymentStage } from './deployment/DeploymentStage';
import { PilotStage } from './pilot/PilotStage';
import { HandoffStage } from './handoff/HandoffStage';
import { AnalyticsStage } from './analytics/AnalyticsStage';
import { OptimizationStage } from './optimization/OptimizationStage';

const CUSTOM: Record<string, () => JSX.Element> = {
  'company-profile': CompanyProfileStage,
  'data-sources': DataSourcesStage,
  'agent-builder': AgentBuilderStage,
  icp: IcpStage,
  'value-prop': ValuePropStage,
  knowledge: KnowledgeStage,
  deployment: DeploymentStage,
  pilot: PilotStage,
  handoff: HandoffStage,
  analytics: AnalyticsStage,
  optimization: OptimizationStage,
};

export function StagePage() {
  const { stageId } = useParams<{ stageId: string }>();
  if (!stageId) return <Navigate to="/" replace />;
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return <Navigate to="/" replace />;
  const Custom = CUSTOM[stageId];
  if (Custom) return <Custom />;
  return <StepAssistant stage={stage} />;
}
