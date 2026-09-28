function installShutdown(server, pool, { signals = process, exit = code => process.exit(code), timeoutMs = 10000 } = {}) {
    let started = false;
    function shutdown() {
        if (started) return;
        started = true;
        let closingPool = false, finished = false;
        const finish = async forced => {
            if (closingPool) return;
            closingPool = true;
            clearTimeout(drainTimer);
            let code = forced ? 1 : 0;
            try { await pool.end(); } catch { code = 1; }
            if (!finished) { finished = true; clearTimeout(timer); exit(code); }
        };
        const timer = setTimeout(() => {
            finished = true;
            server.closeAllConnections?.();
            exit(1);
        }, timeoutMs);
        const drainTimer = setTimeout(() => {
            server.closeAllConnections?.();
            void finish(true);
        }, Math.floor(timeoutMs / 2));
        server.close(() => finish(false));
        server.closeIdleConnections?.();
    }
    signals.on('SIGTERM', shutdown);
    signals.on('SIGINT', shutdown);
    return shutdown;
}
module.exports = { installShutdown };
