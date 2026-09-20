// Keep the API's exact decimal cents when formatting large all-branch totals.
export function formatBusinessAmount(value) {
    const [whole, fraction = ''] = String(value).split('.');
    return `${BigInt(whole).toLocaleString('en-IN')}.${fraction.padEnd(2, '0')}`;
}
