"""
Email notification utility.
Sends digest emails for Knowledge Monitor alerts.
Requires SMTP_USER and SMTP_PASS env vars (Gmail App Password recommended).
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER

logger = logging.getLogger(__name__)


def _enabled() -> bool:
    return bool(SMTP_USER and SMTP_PASS)


def send_monitor_digest(to_email: str, digest: dict) -> bool:
    """
    Send a Knowledge Monitor digest email.
    digest = {"since": ..., "total_new": N, "by_topic": {topic: [items]}}
    Returns True on success.
    """
    if not _enabled():
        logger.debug("Email notifications disabled — SMTP_USER/SMTP_PASS not set")
        return False
    if not to_email:
        return False

    total = digest.get("total_new", 0)
    if total == 0:
        return False

    by_topic: dict = digest.get("by_topic", {})
    subject = f"IntelLab Monitor — {total} new item{'s' if total != 1 else ''} across {len(by_topic)} topic{'s' if len(by_topic) != 1 else ''}"

    # ── Build HTML body ─────────────────────────────���────────────────────────
    rows = ""
    for topic, items in by_topic.items():
        rows += f"""
        <tr>
          <td colspan="2" style="padding:14px 0 6px;font-size:13px;font-weight:600;color:#f97316;border-top:1px solid #1e2128;">
            {topic} <span style="font-weight:400;color:#555560;font-size:11px;">({len(items)} new)</span>
          </td>
        </tr>"""
        for item in items[:5]:
            badge = "arxiv" if item.get("item_type") == "arxiv" else "web"
            badge_color = "#7c3aed" if badge == "arxiv" else "#0ea5e9"
            rows += f"""
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:52px;">
            <span style="background:{badge_color}18;color:{badge_color};font-size:9px;
              font-weight:700;padding:2px 7px;border-radius:10px;text-transform:uppercase;
              letter-spacing:0.08em;">{badge}</span>
          </td>
          <td style="padding:5px 0 5px 8px;">
            <a href="{item.get('url','#')}" style="color:#e2e4f0;font-size:13px;text-decoration:none;">
              {item.get('title','Untitled')[:100]}
            </a>
          </td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0f14;font-family:'Segoe UI',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0f14;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#161920;border:1px solid #1e2128;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:22px 28px;">
            <span style="font-size:20px;font-weight:700;color:white;letter-spacing:-0.02em;">
              🔬 IntelLab Monitor
            </span>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">
              {total} new item{'s' if total != 1 else ''} discovered for your tracked topics
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="color:#b8b8c4;">
              {rows}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #1e2128;">
            <p style="margin:0;font-size:11px;color:#36363e;text-align:center;">
              IntelLab AI Research Intelligence Suite &nbsp;·&nbsp;
              <a href="https://research-assistant-0g24.onrender.com" style="color:#f97316;text-decoration:none;">
                Open App
              </a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    # ── Send ─────────────────────────────────────────────────────────────────
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"IntelLab Monitor <{SMTP_USER}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        logger.info(f"Monitor digest sent to {to_email} ({total} items)")
        return True
    except Exception as e:
        logger.error(f"Failed to send monitor digest to {to_email}: {e}")
        return False
