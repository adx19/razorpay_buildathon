const { evaluateFailure } = require("../policies/recoveryPolicy");

class RecoveryAgent {
    analyze(payment) {
        const decision = evaluateFailure(
            payment.failure_code,
            payment.failure_reason
        );

        return {
            paymentId: payment.payment_id,
            orderId: payment.order_id,
            amount: payment.amount,
            classification: decision.classification,
            action: decision.action,
            retryAllowed: decision.retryAllowed
        };
    }
}

module.exports = RecoveryAgent;
