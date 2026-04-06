import { Env } from "./types";
import { json } from "./utils";
import { handleActivate } from "./routes/activate";
import { handleValidate } from "./routes/validate";
import { handleDeactivate } from "./routes/deactivate";
import { handlePaddleWebhook } from "./routes/webhook";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "active", message: "ok" });
    }

    if (request.method === "POST" && url.pathname === "/api/licenses/activate") {
      return handleActivate(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/licenses/validate") {
      return handleValidate(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/licenses/deactivate") {
      return handleDeactivate(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/paddle/webhooks") {
      return handlePaddleWebhook(request, env);
    }

    return json({ status: "invalid", message: "Not found" }, 404);
  }
};
