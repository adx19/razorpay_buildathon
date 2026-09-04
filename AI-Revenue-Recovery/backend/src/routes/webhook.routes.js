const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { analyzePayment } = require("../services/recoveryService");
const Razorpay = require("razorpay");
const router = express.Router();

router.post("/razorpay", async (req, res) => {
    try {
        const webhookSignature = req.headers["x-razorpay-signature"];

        const rawBody = req.body.toString();

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest("hex");

        if (expectedSignature !== webhookSignature) {
            return res.status(400).json({
                success: false,
                message: "Invalid webhook signature",
            });
        }

        const event = JSON.parse(rawBody);

        if (event.event !== "payment.failed") {
            return res.status(200).json({
                success: true,
                message: "Event ignored",
            });
        }

        const payment = event.payload.payment.entity;

        const orderId = payment.order_id;
        const paymentId = payment.id;
        const existingPayment = await pool.query(
            `
            SELECT id
            FROM payment_attempts
            WHERE payment_id = $1
            `,
            [paymentId]
        );

        if (existingPayment.rows.length > 0) {
            return res.status(200).json({
                success: true,
                message: "Webhook already processed",
            });
        }
        const amount = payment.amount;
        const currency = payment.currency;
        const paymentMethod = payment.method;
        const failureCode = payment.error_code;
        const failureReason = payment.error_description;

        const previousAttempt = await pool.query(
            `
            SELECT COALESCE(MAX(attempt_number), 0) AS attempt_number
            FROM payment_attempts
            WHERE order_id = $1
            `,
            [orderId]
        );

        const attemptNumber =
            Number(previousAttempt.rows[0].attempt_number) + 1;

        const result = await pool.query(
            `
            INSERT INTO payment_attempts
            (
                order_id,
                payment_id,
                amount,
                currency,
                payment_method,
                failure_code,
                failure_reason,
                attempt_number,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
            `,
            [
                orderId,
                paymentId,
                amount,
                currency,
                paymentMethod,
                failureCode,
                failureReason,
                attemptNumber,
                "failed",
            ]
        );

        const savedPayment = result.rows[0];

        const recovery = await analyzePayment(savedPayment);

        let retryOrder = null;

        if (recovery.retryAllowed) {
            retryOrder = await razorpay.orders.create({
                amount: savedPayment.amount,
                currency: savedPayment.currency,
                receipt: `recovery_${savedPayment.order_id}_${Date.now()}`,
                notes: {
                    recovery_payment_id: String(savedPayment.id),
                    original_order_id: savedPayment.order_id,
                    recovery_action: "retry",
                },
            });

            await pool.query(
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
                `,
                [
                    savedPayment.id,
                    savedPayment.order_id,
                    "retry_order_created",
                    recovery.classification,
                    recovery.action,
                    `Retry order created: ${retryOrder.id}`,
                ]
            );
        }

        res.status(200).json({
            success: true,
            message: "Payment failure processed",
            payment: savedPayment,
            recovery,
            retryOrder,
        });
    } catch (error) {
        console.error("Razorpay webhook error:", error);

        res.status(500).json({
            success: false,
            message: "Webhook processing failed",
        });
    }
});

module.exports = router;