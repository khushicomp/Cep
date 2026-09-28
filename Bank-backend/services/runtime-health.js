function readinessProbe(pool, timeoutMs = 2000) {
    let pending;
    return function probe() {
        if (pending) return pending;
        let expired = false, connection, timer;
        const work = (async () => {
            try {
                connection = await pool.getConnection();
                if (expired) return false;
                await connection.query({ sql: 'SELECT 1', timeout: timeoutMs });
                return true;
            } catch { return false; }
            finally {
                if (connection) {
                    if (expired) connection.destroy(); else connection.release();
                }
            }
        })();
        const deadline = new Promise(resolve => {
            timer = setTimeout(() => { expired = true; if (connection) connection.destroy(); resolve(false); }, timeoutMs);
        });
        // Keep one acquisition in flight even if the HTTP deadline has elapsed.
        pending = Promise.race([work, deadline]);
        work.finally(() => { clearTimeout(timer); pending = undefined; });
        return pending;
    };
}
function installHealth(app, pool) {
    const probe = readinessProbe(pool);
    app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
    app.get('/health/ready', async (_req, res) => {
        const ready = await probe();
        res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
    });
}
module.exports = { readinessProbe, installHealth };
