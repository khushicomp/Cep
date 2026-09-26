const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();
const { validateEnvironment, corsOptions } = require('./config/security');
const security = validateEnvironment();
// Validate Resend configuration before mounting routes; construction never sends mail.
if (process.env.CREDENTIAL_MAIL_TRANSPORT === 'resend') {
    require('./services/credential-mail.service').createMailService();
}

const app = express();
app.set('trust proxy', security.trustProxy);
app.disable('x-powered-by');

// Global Middlewares (Order matters)
app.use(helmet({ referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: security.production ? { maxAge: 31536000, includeSubDomains: true } : false }));

app.use(cors(corsOptions(security.origins)));
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });



// Routes

const authRoutes = require("./routes/auth.routes");
app.use("/api/auth", authRoutes);

app.use(express.json({ limit: '1mb' }));

const businessRoutes = require("./routes/business.routes");
app.use("/api/business", businessRoutes);

// Error Handler (should be last)
const { errorHandler } = require("./middleware/error.middleware");
app.use(errorHandler);

app.get("/", (req,res) => {
    res.send("Bank Branch Reporting Backend Running");
});

module.exports = app;
