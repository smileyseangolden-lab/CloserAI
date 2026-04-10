import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';

interface Knowledge {
  id: string;
  knowledgeType: string;
  title: string;
  content: string;
}

interface Agent {
  id: string;
  name: string;
  agentType: string;
  personalityStyle: string;
  toneDescription: string | null;
  senderName: string;
  senderTitle: string | null;
  emailSignature: string | null;
  knowledge: Knowledge[];
}

export function AgentDetailPage() {
  const { id } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [scenario, setScenario] = useState(
    'VP of Sales at a 200-person B2B SaaS company. First touch, cold email.',
  );
  const [draft, setDraft] = useState<{ subject: string; bodyText: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api.get<Agent>(`/agents/${id}`).then(setAgent);
  }, [id]);

  async function testMessage() {
    if (!id) return;
    setGenerating(true);
    try {
      const result = await api.post<{ subject: string; bodyText: string }>(
        `/agents/${id}/test-message`,
        { scenario },
      );
      setDraft(result);
    } finally {
      setGenerating(false);
    }
  }

  if (!agent) return <div className="p-8 text-slate-400">Loading...</div>;

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title={agent.name}
        subtitle={`${agent.senderName}${agent.senderTitle ? `, ${agent.senderTitle}` : ''}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-3">Personality</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Type</dt>
              <dd className="font-medium capitalize">{agent.agentType}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Style</dt>
              <dd className="font-medium capitalize">{agent.personalityStyle}</dd>
            </div>
            {agent.toneDescription && (
              <div>
                <dt className="text-slate-500">Tone</dt>
                <dd>{agent.toneDescription}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-3">Knowledge base ({agent.knowledge.length})</h2>
          <div className="space-y-3">
            {agent.knowledge.map((k) => (
              <div key={k.id} className="border border-slate-100 rounded-lg p-3">
                <div className="text-xs text-slate-500 uppercase tracking-wide">
                  {k.knowledgeType.replace(/_/g, ' ')}
                </div>
                <div className="font-medium text-sm">{k.title}</div>
                <div className="text-sm text-slate-600 mt-1">{k.content}</div>
              </div>
            ))}
            {agent.knowledge.length === 0 && (
              <div className="text-sm text-slate-400">No knowledge entries yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-semibold mb-3">Test message generation</h2>
        <textarea
          className="input mb-3"
          rows={3}
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
        />
        <button className="btn-primary" onClick={testMessage} disabled={generating}>
          {generating ? 'Generating...' : 'Generate sample'}
        </button>
        {draft && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            {draft.subject && (
              <div className="font-medium mb-2">Subject: {draft.subject}</div>
            )}
            <div className="text-sm whitespace-pre-wrap">{draft.bodyText}</div>
          </div>
        )}
      </div>
    </div>
  );
}
