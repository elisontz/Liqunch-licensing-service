import { Env, PlanCode, CreatedLicenseDetails, EmailDeliveryResult, LicenseEmailContent } from "../types";
import { escapeHtml } from "../utils";

export function buildLicensePurchaseEmail({
  to,
  licenseKey,
  planCode,
  supportEmail
}: {
  to: string;
  licenseKey: string;
  planCode: PlanCode;
  supportEmail: string;
}): LicenseEmailContent {
  const planNameZh = planCode === "double" ? "双设备终身版" : "单设备终身版";
  const planNameEn = planCode === "double" ? "Double-device lifetime plan" : "Single-device lifetime plan";

  const text = [
    "Hi, thank you for purchasing Liqunch Pro.",
    "",
    `Purchase email: ${to}`,
    `License key: ${licenseKey}`,
    `Plan: ${planNameEn}`,
    "",
    "Activation steps:",
    "1. Open the Liqunch app",
    "2. Go to the Pro tab",
    "3. Enter your purchase email and license key to activate",
    "",
    `If you need help, contact: ${supportEmail}`,
    "Please keep this email for future activation or device changes.",
    "",
    "---",
    "",
    "中文补充",
    "",
    "你好，感谢你购买 Liqunch Pro。",
    "",
    `购买邮箱：${to}`,
    `激活码：${licenseKey}`,
    `套餐：${planNameZh}`,
    "",
    "激活步骤：",
    "1. 打开 Liqunch App",
    "2. 进入 Pro 页面",
    "3. 输入购买邮箱和激活码完成激活",
    "",
    `如需帮助，请联系：${supportEmail}`,
    "请妥善保存这封邮件，后续更换设备时仍可能需要使用这组信息。"
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #111827;">
      <h2>Your Liqunch Pro License Key</h2>
      <p>Hi, thank you for purchasing Liqunch Pro.</p>
      <p><strong>Purchase email:</strong> ${escapeHtml(to)}</p>
      <p><strong>License key:</strong> <code style="font-size: 16px;">${escapeHtml(licenseKey)}</code></p>
      <p><strong>Plan:</strong> ${escapeHtml(planNameEn)}</p>
      <h3>Activation steps</h3>
      <ol>
        <li>Open the Liqunch app</li>
        <li>Go to the Pro tab</li>
        <li>Enter your purchase email and license key to activate</li>
      </ol>
      <p>If you need help, contact: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p>
      <p>Please keep this email for future activation or device changes.</p>
      <hr style="margin: 32px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <h3>Chinese Summary</h3>
      <p>你好，感谢你购买 Liqunch Pro。</p>
      <p><strong>购买邮箱：</strong> ${escapeHtml(to)}</p>
      <p><strong>激活码：</strong> <code style="font-size: 16px;">${escapeHtml(licenseKey)}</code></p>
      <p><strong>套餐：</strong> ${escapeHtml(planNameZh)}</p>
      <h4>激活步骤</h4>
      <ol>
        <li>打开 Liqunch App</li>
        <li>进入 Pro 页面</li>
        <li>输入购买邮箱和激活码完成激活</li>
      </ol>
      <p>如需帮助，请联系：<a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p>
      <p>请妥善保存这封邮件，后续更换设备时仍可能需要使用这组信息。</p>
    </div>
  `.trim();

  return {
    subject: "Your Liqunch Pro License Key / Liqunch Pro 激活码",
    text,
    html
  };
}

export async function maybeSendLicensePurchaseEmail(
  env: Pick<Env, "SMTP2GO_API_KEY" | "EMAIL_FROM_ADDRESS" | "EMAIL_FROM_NAME" | "EMAIL_REPLY_TO" | "SUPPORT_EMAIL">,
  details: CreatedLicenseDetails
): Promise<EmailDeliveryResult> {
  const apiKey = env.SMTP2GO_API_KEY?.trim();
  const fromAddress = env.EMAIL_FROM_ADDRESS?.trim();
  const fromName = env.EMAIL_FROM_NAME?.trim();
  const replyTo = env.EMAIL_REPLY_TO?.trim();
  const supportEmail = env.SUPPORT_EMAIL?.trim();

  if (!apiKey || !fromAddress || !fromName || !replyTo || !supportEmail) {
    return {
      attempted: false,
      delivered: false,
      error: "Missing email delivery configuration."
    };
  }

  const content = buildLicensePurchaseEmail({
    to: details.email,
    licenseKey: details.licenseKey,
    planCode: details.planCode,
    supportEmail
  });

  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: new Headers({
      "X-Smtp2go-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    }),
    body: JSON.stringify({
      sender: `${fromName} <${fromAddress}>`,
      to: [details.email],
      reply_to: [replyTo],
      subject: content.subject,
      text_body: content.text,
      html_body: content.html
    })
  });

  if (!response.ok) {
    return {
      attempted: true,
      delivered: false,
      error: `SMTP2GO delivery failed with status ${response.status}.`
    };
  }

  return {
    attempted: true,
    delivered: true
  };
}
