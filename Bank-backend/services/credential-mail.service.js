const { emailAddress } = require('./credential-policy');

// HTTP adapter contract: POST {from,to,subject,text} to an authorized HTTPS mail gateway.
// Provider SDKs/SMTP adapters can implement the same send(message) boundary later.
function createMailService(env = process.env, transportOverride) {
    const mode = env.CREDENTIAL_MAIL_TRANSPORT || 'disabled';
    if (transportOverride && env.NODE_ENV !== 'test') throw new Error('Injected mail transport is test-only');
    let transport = transportOverride;
    let origin;
    if (mode !== 'disabled' || transport) {
        const url = new URL(env.CREDENTIAL_APP_ORIGIN);
        if (url.origin !== env.CREDENTIAL_APP_ORIGIN || url.username || url.password ||
            (url.protocol !== 'https:' && !(env.NODE_ENV === 'test' && url.hostname === 'localhost'))) throw new Error('Invalid credential application origin');
        origin = url.origin;
    }
    if (!transport && mode === 'http') {
        const endpoint = new URL(env.CREDENTIAL_MAIL_ENDPOINT);
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) throw new Error('Invalid mail endpoint');
        const from = emailAddress(env.CREDENTIAL_MAIL_FROM);
        const allowedRecipients = new Set((env.CREDENTIAL_MAIL_ALLOWED_RECIPIENTS || '').split(',').filter(value => value.trim()).map(emailAddress));
        if (!allowedRecipients.size) throw new Error('Explicit credential mail recipient allowlist required');
        const key = env.CREDENTIAL_MAIL_API_KEY;
        if (!key || /[\r\n]/.test(key)) throw new Error('Mail authorization configuration required');
        transport = { async send(message) {
            if (!allowedRecipients.has(message.to)) throw new Error('Recipient is not authorized for this mail rollout');
            const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ from, ...message }) });
            await response.body?.cancel();
            if (!response.ok) throw new Error('Mail delivery failed');
        } };
    } else if (!transport && mode !== 'disabled') throw new Error('Unsupported mail transport');
    return {
        configured: Boolean(transport),
        async sendCredential({ email, name, purpose, token, expiresSeconds }) {
            if (!transport) throw new Error('Credential mail is disabled');
            if (!['SETUP', 'RESET'].includes(purpose) || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid credential message');
            const action = purpose === 'SETUP' ? 'Set up your password' : 'Reset your password';
            // Fragment is not sent to web-server access logs or Referer headers.
            const link = `${origin}/${purpose === 'SETUP' ? 'setup' : 'reset'}-password#token=${token}`;
            await transport.send({ to: emailAddress(email), subject: `Branch reporting: ${action}`,
                text: `${name || 'Branch reporting account'}\n\n${action}:\n${link}\n\nThis single-use link expires in ${Math.floor(expiresSeconds / 60)} minutes. If you did not expect it, contact your authorized account operator. Never share this link or your password.` });
        }
    };
}
module.exports = { createMailService };
