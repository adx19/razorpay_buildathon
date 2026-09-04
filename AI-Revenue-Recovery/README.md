# AI Revenue Recovery

A payment failure recovery system built for the Razorpay Buildathon.

The idea is simple: when a payment fails, the backend checks the failure reason, decides what should happen next, stores the decision, and shows the failed payment in a dashboard.

## What it does

- Receives Razorpay `payment.failed` webhooks
- Stores failed payment attempts in PostgreSQL
- Classifies failures using a recovery policy
- Decides whether the payment can be retried
- Creates an audit log for recovery decisions
- Shows failed payments and recovery actions in the dashboard
- Allows a retry from the dashboard through Razorpay Checkout
- Verifies successful retry payments
- Tracks failed orders, revenue at risk, and recovered revenue

## Tech Stack

- Frontend: React, Vite, CSS
- Backend: Node.js, Express
- Database: PostgreSQL
- Payment Gateway: Razorpay
- Tunnel: Cloudflare Tunnel
- Containerization: Docker

## Project Structure

```text
AI-Revenue-Recovery/
├── backend/
│   ├── src/
│   │   ├── agent/
│   │   │   └── RecoveryAgent.js
│   │   ├── config/
│   │   │   └── db.js
│   │   ├── policies/
│   │   │   └── recoveryPolicy.js
│   │   ├── routes/
│   │   │   ├── agent.routes.js
│   │   │   ├── payments.routes.js
│   │   │   └── webhook.routes.js
│   │   ├── services/
│   │   │   ├── auditService.js
│   │   │   └── recoveryService.js
│   │   └── server.js
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
└── README.md
```

## How the flow works

```text
Razorpay
   ↓
payment.failed webhook
   ↓
Webhook route
   ↓
PostgreSQL
   ↓
Recovery Agent
   ↓
Recovery Policy
   ↓
retry / alternative payment method / block / review
   ↓
Audit Log
   ↓
Dashboard
   ↓
Retry payment
   ↓
Razorpay Checkout
   ↓
Payment verification
   ↓
PostgreSQL
```

## Recovery Logic

The recovery policy currently groups failures into three main categories.

### Temporary

Examples:

- bank errors
- gateway errors
- technical errors
- payment timeouts
- temporary failures
- a bank-declined `BAD_REQUEST_ERROR`

Action:

```text
retry
```

### Permanent

Examples:

- insufficient funds
- expired card
- incorrect CVV
- transaction limit
- disabled card

Action:

```text
alternative_payment_method
```

### Risky

Examples:

- fraud
- risk check failures

Action:

```text
block
```

If a failure does not match the known rules, it is marked as `unknown` and sent for `review`.

## API Endpoints

### Health

```http
GET /health
```

Checks whether the backend is running.

### Failed Payments

```http
GET /api/recovery
```

Returns the latest failed attempt for each order along with the recovery decision.

### Metrics

```http
GET /api/metrics
```

Returns:

- failed orders
- recovered orders
- revenue at risk
- recovered revenue

### Create Retry Order

```http
POST /api/orders
```

Creates a Razorpay order for a retry.

### Verify Payment

```http
POST /api/verify
```

Verifies the Razorpay payment signature and saves the successful attempt.

### Razorpay Webhook

```http
POST /api/webhooks/razorpay
```

Receives Razorpay payment failure events and starts the recovery flow.

## Environment Variables

Create a `.env` file inside `backend/`.

```env
RAZORPAY_API_KEY=
RAZORPAY_API_SECRET=
RAZORPAY_WEBHOOK_SECRET=

PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_revenue_recovery
DB_USER=postgres
DB_PASSWORD=
```

For the frontend, configure the Razorpay key through Vite:

```env
VITE_RAZORPAY_KEY_ID=
```

Do not commit `.env` files or API secrets.

## Running the Backend

```bash
cd backend
npm install
node src/server.js
```

The backend runs on port `5000` by default.

## Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite development server normally runs on port `5173`.

## Webhook Testing

The local backend needs to be reachable from Razorpay for webhook testing.

A Cloudflare Quick Tunnel can be used:

```bash
cloudflared tunnel --url http://localhost:5000
```

Use the generated HTTPS URL with:

```text
/api/webhooks/razorpay
```

The webhook secret configured in Razorpay must match `RAZORPAY_WEBHOOK_SECRET`.

## Database

The main tables used by the application are:

- `payment_attempts` — stores every payment attempt
- `audit_logs` — stores recovery decisions

Multiple attempts for the same order are kept so the system can track the recovery flow instead of treating every attempt as a separate order.

## Current Status

The core recovery flow is working:

- Razorpay payment failures are received
- Failed attempts are stored
- Recovery decisions are generated
- Duplicate audit decisions are avoided
- Failed orders appear in the dashboard
- Retry payments can be started from the dashboard
- Successful retries are saved
- Metrics update based on the latest attempt for each order

## Notes

This is a buildathon project and currently uses a rule-based recovery policy. The `RecoveryAgent` is separated from the policy so the decision-making part can be extended later without changing the payment and dashboard flow.
