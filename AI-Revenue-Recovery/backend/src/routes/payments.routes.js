const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const pool = require("../config/db");
const { analyzePayment } = require("../services/recoveryService");

const router = express.Router();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_API_KEY,
    key_secret: process.env.RAZORPAY_API_SECRET,
});


router.post("/orders", async (req, res) => {
    try {
        const { payment_id } = req.body;

        let amount = 500000;

        if (payment_id) {
            const result = await pool.query(
                `
                SELECT amount
                FROM payment_attempts
                WHERE id = $1
                `,
                [payment_id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: "Payment not found",
                });
            }

            amount = result.rows[0].amount;
        }

        const option = {
            amount,
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
            notes: {
                recovery_payment_id: payment_id || "",
            },
        };
        const order = await razorpay.orders.create(option);

        res.status(201).json(order);
    } catch (error) {
        console.error("Razorpay order creation error:", error);

        res.status(500).json({
            error: "Failed to create order",
        });
    }
});

router.post("/verify", async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            recovery_payment_id,
        } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_API_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Payment verification failed",
            });
        }

        let amount = 500000;
        let currency = "INR";
        let attemptNumber = 1;
        let orderId = razorpay_order_id;

        if (recovery_payment_id) {
            const previousPayment = await pool.query(
                `
                SELECT order_id, amount, currency, attempt_number
                FROM payment_attempts
                WHERE id = $1
                `,
                [recovery_payment_id]
            );

            if (previousPayment.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Original payment not found",
                });
            }

            const payment = previousPayment.rows[0];

            orderId = payment.order_id;
            amount = payment.amount;
            currency = payment.currency;
            attemptNumber = Number(payment.attempt_number) + 1;
        }

        const result = await pool.query(
            `
            INSERT INTO payment_attempts
            (
                order_id,
                payment_id,
                amount,
                currency,
                status,
                attempt_number
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
            `,
            [
                orderId,
                razorpay_payment_id,
                amount,
                currency,
                "success",
                attemptNumber,
            ]
        );

        res.status(200).json({
            success: true,
            message: "Payment verified and saved",
            payment: result.rows[0],
        });
    } catch (error) {
        console.error("Payment verification error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

router.get("/recovery", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT id, order_id, payment_id, amount, currency,
                payment_method, failure_code, failure_reason,
                attempt_number, created_at, status
            FROM (
                SELECT *,
                       ROW_NUMBER() OVER (
                           PARTITION BY order_id
                           ORDER BY attempt_number DESC
                       ) AS rn
                FROM payment_attempts
            ) latest
            WHERE rn = 1
              AND status = 'failed'
            ORDER BY id DESC
            `
        );

        const payments = await Promise.all(
            result.rows.map(async (payment) => ({
                ...payment,
                recovery: await analyzePayment(payment),
            }))
        );

        res.status(200).json({
            success: true,
            payments,
        });
    } catch (error) {
        console.error("Recovery fetch error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch recovery payments",
        });
    }
});

router.get("/metrics", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                COUNT(*) FILTER (WHERE latest_status = 'failed') AS failed_orders,
                COUNT(*) FILTER (WHERE latest_status = 'success') AS recovered_orders,
                COALESCE(
                    SUM(latest_amount) FILTER (WHERE latest_status = 'failed'),
                    0
                ) AS revenue_at_risk,
                COALESCE(
                    SUM(latest_amount) FILTER (WHERE latest_status = 'success'),
                    0
                ) AS recovered_revenue
            FROM (
                SELECT DISTINCT ON (order_id)
                    order_id,
                    amount AS latest_amount,
                    status AS latest_status
                FROM payment_attempts
                ORDER BY order_id, attempt_number DESC
            ) latest;
            `
        );

        res.status(200).json({
            success: true,
            metrics: result.rows[0]
        });
    } catch (error) {
        console.error("Metrics fetch error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch recovery metrics"
        });
    }
});

module.exports = router;
