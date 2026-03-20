import test from "node:test";
import assert from "node:assert/strict";

import { classifyPaddleWebhookEvent, resolveWebhookCustomerEmail } from "../src/index.ts";

test("treats successful transaction events as create-license triggers", () => {
  assert.equal(classifyPaddleWebhookEvent("transaction.paid"), "create");
  assert.equal(classifyPaddleWebhookEvent("transaction.completed"), "create");
});

test("treats adjustment events as revoke-license triggers", () => {
  assert.equal(classifyPaddleWebhookEvent("adjustment.created"), "revoke");
  assert.equal(classifyPaddleWebhookEvent("adjustment.updated"), "revoke");
});

test("ignores unrelated webhook events", () => {
  assert.equal(classifyPaddleWebhookEvent("subscription.created"), "ignore");
  assert.equal(classifyPaddleWebhookEvent("unknown"), "ignore");
});

test("uses the email already embedded in a webhook payload when present", async () => {
  const email = await resolveWebhookCustomerEmail(
    { PADDLE_API_KEY: "" } as never,
    {
      data: {
        customer: {
          email: "Buyer@Example.com"
        }
      }
    }
  );

  assert.equal(email, "buyer@example.com");
});

test("fetches customer email from Paddle when the webhook only includes customer_id", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://sandbox-api.paddle.com/customers/ctm_123");
    assert.equal(init?.headers instanceof Headers, true);
    assert.equal((init?.headers as Headers).get("Authorization"), "Bearer pdl_sdbx_apikey_test");

    return new Response(JSON.stringify({
      data: {
        email: "buyer@example.com"
      }
    }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const email = await resolveWebhookCustomerEmail(
    { PADDLE_API_KEY: "pdl_sdbx_apikey_test" } as never,
    {
      data: {
        customer_id: "ctm_123"
      }
    }
  );

  assert.equal(email, "buyer@example.com");
});

test("uses the live Paddle API host for live API keys", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.paddle.com/customers/ctm_live");
    assert.equal(init?.headers instanceof Headers, true);
    assert.equal((init?.headers as Headers).get("Authorization"), "Bearer pdl_live_apikey_test");

    return new Response(JSON.stringify({
      data: {
        email: "live@example.com"
      }
    }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const email = await resolveWebhookCustomerEmail(
    { PADDLE_API_KEY: "pdl_live_apikey_test" } as never,
    {
      data: {
        customer_id: "ctm_live"
      }
    }
  );

  assert.equal(email, "live@example.com");
});
