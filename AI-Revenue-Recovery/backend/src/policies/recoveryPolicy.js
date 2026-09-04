const retryableFailures = [
    "gateway_technical_error",
    "bank_technical_error",
    "payment_timed_out",
    "bank_error",
    "gateway_error",
    "temporary"
];

const permanentFailures = [
    "insufficient_funds",
    "card_expired",
    "incorrect_cvv",
    "transaction_limit",
    "card_disabled"
];

const riskyFailures = [
    "payment_risk_check_failed",
    "fraud",
    "risk"
];
function evaluateFailure(failureCode, failureReason) {
    const code = (failureCode || "").toLowerCase();
    const reason = (failureReason || "").toLowerCase();
    const failure = `${code} ${reason}`;

    if (
        retryableFailures.some(type => failure.includes(type)) ||
        (
            code === "bad_request_error" &&
            reason.includes("declined by the bank")
        )
    ) {
        return {
            classification: "temporary",
            action: "retry",
            retryAllowed: true
        };
    }

    if (
        permanentFailures.some(type => failure.includes(type))
    ) {
        return {
            classification: "permanent",
            action: "alternative_payment_method",
            retryAllowed: false
        };
    }

    if (
        riskyFailures.some(type => failure.includes(type))
    ) {
        return {
            classification: "risky",
            action: "block",
            retryAllowed: false
        };
    }

    return {
        classification: "unknown",
        action: "review",
        retryAllowed: false
    };
}
module.exports = {
    evaluateFailure
};
