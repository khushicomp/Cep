const { CredentialError } = require('../services/credential-policy');
const { createCredentialService } = require('../services/credential.service');
const { createMailService } = require('../services/credential-mail.service');
const db = require('../config/db');
const generic = { message: 'If this account is eligible, password reset instructions will be emailed.' };

function createCredentialController(service, schedule = setImmediate) {
    let pending = 0;
    return {
        forgot(req, res) {
            // A bounded best-effort background task keeps SMTP/provider latency and existence out of HTTP timing.
            // Provider failure is deliberately indistinguishable; a user may retry after the cooldown.
            if (pending < 32 && typeof req.body?.email === 'string' && req.body.email.length <= 254) {
                const email = req.body.email;
                pending++;
                schedule(() => Promise.resolve().then(() => service.forgot(email)).catch(() => {
                    console.error('Credential recovery delivery unavailable');
                }).finally(() => { pending--; }));
            }
            return res.status(202).json(generic);
        },
        complete: purpose => async (req, res) => {
            try { return res.json(await service.complete(purpose, req.body)); }
            catch (error) {
                if (error instanceof CredentialError) return res.status(error.status).json({ message: error.message });
                console.error('Credential completion unavailable');
                return res.status(503).json({ message: 'Unable to complete this request. Please try again later.' });
            }
        }
    };
}
// Import is side-effect free: no mail or database connection until a request is handled.
let controller;
function runtime() {
    if (!controller) controller = createCredentialController(createCredentialService(db, createMailService()));
    return controller;
}
exports.forgot = (req, res) => {
    try { return runtime().forgot(req, res); }
    catch { console.error('Credential recovery configuration unavailable'); return res.status(202).json(generic); }
};
exports.setup = (req, res, next) => { try { return runtime().complete('SETUP')(req, res); } catch (error) { next(error); } };
exports.reset = (req, res, next) => { try { return runtime().complete('RESET')(req, res); } catch (error) { next(error); } };
exports.createCredentialController = createCredentialController;
