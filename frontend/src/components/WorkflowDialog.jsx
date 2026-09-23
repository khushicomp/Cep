import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { DialogContext } from '../utils/useDialog';
import { reasonError } from '../utils/operations';

export default function WorkflowDialog({ children }) {
  const [request, setRequest] = useState(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const resolver = useRef(null);
  const dialog = useRef(null);
  const cancel = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const ask = useCallback(options => new Promise(resolve => {
    resolver.current?.(null); resolver.current = resolve;
    trigger.current = document.activeElement;
    setValue(''); setError(''); setRequest(options);
  }), []);
  useEffect(() => {
    if (request) { dialog.current.showModal(); cancel.current.focus(); }
  }, [request]);
  useEffect(() => () => { resolver.current?.(null); }, []);
  const settle = result => {
    dialog.current.close();
    resolver.current?.(result); resolver.current = null;
    setRequest(null);
    const target = trigger.current?.isConnected ? trigger.current : document.getElementById('workspace-main');
    target?.focus();
  };
  const submit = event => {
    event.preventDefault();
    const message = request.reason ? reasonError(value) : '';
    if (message) { setError(message); return; }
    settle(request.reason ? value.trim() : true);
  };
  return <DialogContext.Provider value={ask}>{children}
    <dialog className="workflow-dialog" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); settle(null); }}>
      {request && <form onSubmit={submit}>
        <span className="eyebrow">Report action</span><h2 id={`${id}-title`}>{request.title}</h2>
        <p id={`${id}-description`}>{request.description}</p>
        {request.reason && <label className="reason-field">{request.reasonLabel || 'Reason'}
          <textarea rows="5" value={value} onChange={event => { setValue(event.target.value); setError(''); }}
            aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${error ? `${id}-error` : ''}`} />
          <span id={`${id}-hint`} className="muted">{[...value.trim()].length} / 1,000 characters. Required.</span>
        </label>}
        {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" ref={cancel} onClick={() => settle(null)}>Cancel</button>
          <button type="submit" className={request.danger ? 'danger-button' : 'primary-button'}>{request.confirm || 'Confirm'}</button></div>
      </form>}
    </dialog>
  </DialogContext.Provider>;
}
