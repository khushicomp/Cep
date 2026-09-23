import { useEffect, useState } from 'react';
import api from '../services/api';
import { actionLabel, stateLabel, eventReasons, auditTimestamp } from '../utils/auditHistory';
import './ReportAuditHistory.css';
import { LoadingState, InlineError, EmptyState } from './OperationsUI';

export default function ReportAuditHistory({ entryId, revision }) {
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    api.get(`/business/entry/${entryId}/audit-history`).then(response => {
      if (!Array.isArray(response.data)) throw new Error('Invalid history');
      if (current) setResult({ entryId, revision, retry, events: response.data });
    }).catch(() => {
      if (current) setResult({ entryId, revision, retry, error: true });
    });
    return () => { current = false; };
  }, [entryId, revision, retry]);
  const ready = result?.entryId === entryId && result?.revision === revision && result?.retry === retry;
  return <section className="report-audit-history" aria-label="Report History">
    <div className="audit-heading"><h2>Audit timeline</h2><p>Chronological events · database local time (India)</p></div>
    {!ready ? <LoadingState>Loading audit history…</LoadingState> : result.error ? <InlineError onRetry={() => setRetry(value => value + 1)}>
      Unable to load report history.
    </InlineError> : result.events.length === 0 ? <EmptyState title="No audit events recorded for this report." /> : <ol>
      {result.events.map(event => <li key={event.id}>
        <div className="audit-event-heading"><strong>{actionLabel(event.action)}</strong><span className="audit-timestamp">{auditTimestamp(event.created_at)}</span></div>
        <div>{event.actor_name || 'Name unavailable'} · {event.actor_role?.replaceAll('_', ' ') || 'Role unavailable'}</div>
        {(stateLabel(event.previous_state) || stateLabel(event.new_state)) && <p>
          {stateLabel(event.previous_state) || 'State unavailable'} → {stateLabel(event.new_state) || 'State unavailable'}
        </p>}
        {eventReasons(event).map(reason => <p className="audit-reason" key={reason.label}><strong>{reason.label}:</strong> {reason.text}</p>)}
      </li>)}
    </ol>}
  </section>;
}
