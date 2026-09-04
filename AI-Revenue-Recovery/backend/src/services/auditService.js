const pool = require("../config/db");

async function createAuditLog({
    paymentAttemptId,
    orderId,
    action,
    classification,
    decision,
    details
}) {
    const existing = await pool.query(
        `
        SELECT id
        FROM audit_logs
        WHERE payment_attempt_id = $1
          AND action = $2
        LIMIT 1;
        `,
        [paymentAttemptId, action]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0];
    }

    const result = await pool.query(
        `
        INSERT INTO audit_logs
        (
            payment_attempt_id,
            order_id,
            action,
            classification,
            decision,
            details
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
        `,
        [
            paymentAttemptId,
            orderId,
            action,
            classification,
            decision,
            details
        ]
    );

    return result.rows[0];
}

module.exports = {
    createAuditLog
};