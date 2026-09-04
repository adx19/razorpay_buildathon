const RecoveryAgent = require("../agent/RecoveryAgent");
const { createAuditLog } = require("./auditService");
const pool = require("../config/db");

const agent = new RecoveryAgent();

async function analyzePayment(payment) {
    const decision = agent.analyze(payment);

    const existingLog = await pool.query(
        `
        SELECT id
        FROM audit_logs
        WHERE payment_attempt_id = $1
          AND action = 'recovery_decision'
        LIMIT 1;
        `,
        [payment.id]
    );

    if (existingLog.rows.length === 0) {
        await createAuditLog({
            paymentAttemptId: payment.id,
            orderId: payment.order_id,
            action: "recovery_decision",
            classification: decision.classification,
            decision: decision.action,
            details: payment.failure_reason || "No failure reason provided"
        });
    }

    return decision;
}

module.exports = {
    analyzePayment
};