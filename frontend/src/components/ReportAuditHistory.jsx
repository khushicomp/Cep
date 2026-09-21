import { useEffect, useState } from 'react';
import api from '../services/api';
import { actionLabel, stateLabel, eventReasons, auditTimestamp } from '../utils/auditHistory';
import './ReportAuditHistory.css';

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
    <h3>Report History</h3>
    <p>Times shown in database local time (India).</p>
    {!ready ? <p role="status">Loading history...</p> : result.error ? <div role="alert">
      <p>Unable to load report history.</p><button onClick={() => setRetry(value => value + 1)}>Retry history</button>
    </div> : result.events.length === 0 ? <p>No audit history available for this report.</p> : <ol>
      {result.events.map(event => <li key={event.id}>
        <strong>{actionLabel(event.action)}</strong>
        <div>{event.actor_name || 'Name unavailable'} · {event.actor_role?.replaceAll('_', ' ') || 'Role unavailable'}</div>
        {(stateLabel(event.previous_state) || stateLabel(event.new_state)) && <p>
          {stateLabel(event.previous_state) || 'State unavailable'} → {stateLabel(event.new_state) || 'State unavailable'}
        </p>}
        <div>{auditTimestamp(event.created_at)}</div>
        {eventReasons(event).map(reason => <p className="audit-reason" key={reason.label}><strong>{reason.label}:</strong> {reason.text}</p>)}
      </li>)}
    </ol>}
  </section>;
}
