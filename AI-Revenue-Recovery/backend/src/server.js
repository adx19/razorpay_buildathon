const express = require("express");
const cors = require("cors");
require("dotenv").config();

const paymentsRoutes = require("./routes/payments.routes");
const webhookRoutes = require("./routes/webhook.routes");

const app = express();
const pool = require("./config/db");

app.use(cors());
app.use(
    "/api/webhooks",
    express.raw({ type: "application/json" }),
    webhookRoutes
);
app.use(express.json());

app.use("/api", paymentsRoutes);

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "ai-revenue-recovery-backend"
    });
});

pool.query("SELECT NOW()", (error, result) => {
    if (error) {
        console.error("Database connection failed:", error);
    } else {
        console.log("Database connected:", result.rows[0]);
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});