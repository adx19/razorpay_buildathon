import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api";

function App() {
  const [payments, setPayments] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null);

  const fetchPayments = async () => {
    try {
      const response = await fetch(`${API_URL}/recovery`);
      const data = await response.json();

      if (data.success) {
        setPayments(data.payments);
      }
    } catch (error) {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const response = await fetch(`${API_URL}/metrics`);
      const data = await response.json();

      if (data.success) {
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error("Metrics fetch error:", error);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchMetrics();
  }, []);

  const handleRetry = async (payment) => {
    try {
      setRetrying(payment.id);

      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_id: payment.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create retry order");
      }

      const order = await response.json();

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "AI Revenue Recovery",
        description: `Recovery retry for ${payment.order_id}`,
        order_id: order.id,
        notes: {
          recovery_payment_id: String(payment.id),
        },

        handler: async function (response) {
          try {
            const verifyResponse = await fetch(
              `${API_URL}/verify`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  recovery_payment_id: payment.id,
                }),
              }
            );

            const result = await verifyResponse.json();

            if (result.success) {
              alert("Payment recovered successfully!");
              fetchPayments();
              fetchMetrics();
            } else {
              alert("Payment verification failed.");
            }
          } catch (error) {
            console.error("Verification error:", error);
            alert("Could not verify payment.");
          }
        },

        prefill: {
          name: "Test User",
          email: "test@example.com",
          contact: "9999999999",
        },

        theme: {
          color: "#3399cc",
        },
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on("payment.failed", function (response) {
        console.log("Retry payment failed:");
        console.log(JSON.stringify(response, null, 2));

        alert(
          response.error?.description ||
          "Retry payment failed."
        );
      });

      razorpay.open();
    } catch (error) {
      console.error("Retry error:", error);
      alert("Could not start payment retry.");
    } finally {
      setRetrying(null);
    }
  };

  const totalAtRisk = payments.reduce(
    (total, payment) => total + payment.amount,
    0
  );

  const retryable = payments.filter(
    (payment) => payment.recovery?.retryAllowed
  ).length;

  return (
    <div className="app">
      <header>
        <div>
          <h1>AI Revenue Recovery</h1>
          <p>Payment failure recovery dashboard</p>
        </div>

        <button
          onClick={() => {
            fetchPayments();
            fetchMetrics();
          }}
        >
          Refresh
        </button>
      </header>

      <section className="stats">
        <div className="stat-card">
          <span>Failed Orders</span>
          <strong>{metrics?.failed_orders ?? 0}</strong>
        </div>

        <div className="stat-card">
          <span>Revenue at Risk</span>
          <strong>
            ₹{((Number(metrics?.revenue_at_risk) || 0) / 100).toLocaleString("en-IN")}
          </strong>
        </div>

        <div className="stat-card">
          <span>Recovered Revenue</span>
          <strong>
            ₹{((Number(metrics?.recovered_revenue) || 0) / 100).toLocaleString("en-IN")}
          </strong>
        </div>
      </section>

      <section className="payments">
        <h2>Failed Payments</h2>

        {loading ? (
          <p>Loading payments...</p>
        ) : payments.length === 0 ? (
          <p>No failed payments found.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Failure</th>
                  <th>Attempt</th>
                  <th>Classification</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.order_id}</td>

                    <td>
                      ₹{(payment.amount / 100).toLocaleString("en-IN")}
                    </td>

                    <td>{payment.payment_method || "-"}</td>

                    <td>{payment.failure_reason || "-"}</td>

                    <td>{payment.attempt_number}</td>

                    <td>
                      <span
                        className={`classification ${payment.recovery?.classification}`}
                      >
                        {payment.recovery?.classification}
                      </span>
                    </td>

                    <td>
                      {payment.recovery?.retryAllowed ? (
                        <button
                          className="retry-button"
                          onClick={() => handleRetry(payment)}
                          disabled={retrying === payment.id}
                        >
                          {retrying === payment.id
                            ? "Starting..."
                            : "Retry"}
                        </button>
                      ) : (
                        <span
                          className={`action ${payment.recovery?.action}`}
                        >
                          {payment.recovery?.action}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
