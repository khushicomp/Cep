const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();

// Global Middlewares (Order matters)
app.use(helmet());

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());



// Routes
const testRoutes = require("./routes/test.routes");
app.use("/api", testRoutes);

const dbTestRoutes = require("./routes/dbTest.routes");
app.use("/api", dbTestRoutes);

const authRoutes = require("./routes/auth.routes");
app.use("/api/auth", authRoutes);

const taskRoutes = require("./routes/task.routes");
app.use("/api/tasks", taskRoutes);

const reportRoutes = require("./routes/report.routes");
app.use("/api/reports", reportRoutes);

const userRoutes = require("./routes/user.routes");
app.use("/api/users", userRoutes);

const businessRoutes = require("./routes/business.routes");
app.use("/api/business", businessRoutes);

// Error Handler (should be last)
const { errorHandler } = require("./middleware/error.middleware");
app.use(errorHandler);

app.get("/", (req,res) => {
    res.send("Bank Task Monitoring Backend Running");
});

module.exports = app;
