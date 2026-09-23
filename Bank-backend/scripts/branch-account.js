// Operator access is controlled by OS/deployment permissions, not public application roles.
const path = require('node:path');
const { CredentialError } = require('../services/credential-policy');
function parseArgs(args) {
    const [action, ...rest] = args;
    const values = {}, switches = new Set();
    const names = new Set(['--branch-code', '--email', '--name', '--role', '--user-id', '--operator']);
    for (let i = 0; i < rest.length; i++) {
        const key = rest[i];
        if (names.has(key)) {
            if (values[key] !== undefined || !rest[i+1] || rest[i+1].startsWith('--')) throw new CredentialError('Invalid or repeated operator argument');
            values[key] = rest[++i];
        } else if (['--dry-run', '--apply', '--send-email', '--mailbox-verified'].includes(key) && !switches.has(key)) switches.add(key);
        else throw new CredentialError('Unknown or repeated operator argument');
    }
    if (!['invite','reissue','disable'].includes(action) || (switches.has('--apply') && switches.has('--dry-run')) ||
        (!switches.has('--apply') && (switches.has('--send-email') || switches.has('--mailbox-verified'))) ||
        (action === 'disable' && (switches.has('--send-email') || switches.has('--mailbox-verified')))) throw new CredentialError('Use invite/reissue/disable with --dry-run (default) or explicit --apply');
    return { input: { action, branchCode: values['--branch-code'], email: values['--email'], name: values['--name'], role: values['--role'], userId: values['--user-id'], operator: values['--operator'] },
        options: { apply: switches.has('--apply'), sendEmail: switches.has('--send-email'), mailboxVerified: switches.has('--mailbox-verified') } };
}
async function main() {
    const { input, options } = parseArgs(process.argv.slice(2));
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    const db = require('../config/db');
    try {
        const mail = require('../services/credential-mail.service').createMailService();
        const credentials = require('../services/credential.service').createCredentialService(db, mail);
        const service = require('../services/account-provisioning.service').createProvisioningService(db, credentials, mail);
        const result = await service.run(input, options);
        console.log(JSON.stringify(result, null, 2));
        if (result.delivery === 'failed') { console.error('Account remains invited; delivery failed and its link was revoked. Review mail configuration and explicitly reissue.'); process.exitCode = 2; }
    } finally { await db.promise().end(); }
}
module.exports = { parseArgs };
if (require.main === module) main().catch(error => {
    console.error(error instanceof CredentialError ? error.message : 'Account operation failed. Inspect account state before retrying. No sensitive provider/database details printed.');
    process.exitCode = 1;
});
