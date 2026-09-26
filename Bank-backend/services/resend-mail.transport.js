const { emailAddress } = require('./credential-policy');
const ENDPOINT = 'https://api.resend.com/emails';

function createResendTransport(env) {
    // Pin the provider destination: configuration cannot redirect credentials/tokens elsewhere.
    const endpoint = env.CREDENTIAL_RESEND_ENDPOINT === undefined ? ENDPOINT : env.CREDENTIAL_RESEND_ENDPOINT;
    if (endpoint !== ENDPOINT) throw new Error('Invalid Resend endpoint configuration');
    const key = env.CREDENTIAL_RESEND_API_KEY;
    if (typeof key !== 'string' || !key || !/^[\x21-\x7e]+$/.test(key)) {
        throw new Error('Resend authorization configuration required');
    }
    let from, recipients;
    try {
        from = emailAddress(env.CREDENTIAL_MAIL_FROM);
        const configured = env.CREDENTIAL_MAIL_ALLOWED_RECIPIENTS;
        if (typeof configured !== 'string' || configured.includes('*')) throw new Error();
        recipients = new Set(configured.split(',').filter(value => value.trim()).map(emailAddress));
        if (!recipients.size) throw new Error();
    } catch { throw new Error('Resend sender and explicit recipient allowlist required'); }
    return { async send(message) {
        if (!recipients.has(message.to)) throw new Error('Recipient is not authorized for this mail rollout');
        try {
            const response = await fetch(endpoint, {
                method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text })
            });
            // Never parse/log provider bodies, which may echo credentials or message content.
            await response.body?.cancel();
            if (!response.ok) throw new Error();
        } catch { throw new Error('Mail delivery failed'); }
    } };
}

module.exports = { createResendTransport };
