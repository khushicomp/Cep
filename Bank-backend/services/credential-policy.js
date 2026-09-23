class CredentialError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
const supportedRoles = ['MANAGER', 'HEAD_OFFICE'];
function emailAddress(value) {
    if (typeof value !== 'string') throw new CredentialError('Provide a valid email address');
    const email = value.trim().toLowerCase();
    if (email.length > 100 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) || email.includes('..')) {
        throw new CredentialError('Provide a valid email address');
    }
    return email;
}
function passwordPolicy(password, confirmation) {
    if (typeof password !== 'string' || typeof confirmation !== 'string' || password !== confirmation) {
        throw new CredentialError('Passwords must match');
    }
    if ([...password].length < 15 || Buffer.byteLength(password, 'utf8') > 72 || !password.trim() || /[\u0000-\u001f\u007f]/u.test(password)) {
        throw new CredentialError('Use at least 15 characters and at most 72 UTF-8 bytes, without control characters');
    }
    if (/^(.)\1+$/u.test(password) || ['passwordpassword', '123456789012345', '1234567890123456', 'qwertyuiopasdfgh'].includes(password.toLowerCase())) {
        throw new CredentialError('Choose a less predictable password or passphrase');
    }
}
function version(value) { return Number.isInteger(value) && value >= 0 && value <= 4294967295; }
module.exports = { CredentialError, supportedRoles, emailAddress, passwordPolicy, version };
