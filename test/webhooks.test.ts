import test from "node:test";
import assert from "node:assert/strict";

import { classifyPaddleWebhookEvent } from "../src/index.ts";

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
