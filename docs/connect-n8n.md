---
title: Connecting your n8n instance
description: How to connect an external n8n instance to the Nekazari platform
---

# Connecting your n8n instance

Each tenant can connect its own n8n instance to the Nekazari platform.
Once connected, the platform can query workflows, executions, and trigger
automations through n8n's API.

## Prerequisites

- A running n8n instance (self-hosted or cloud) accessible via HTTPS
- TenantAdmin or PlatformAdmin role in Nekazari

## Step 1: Get your n8n API key

1. Log into your n8n instance
2. Go to **Settings** → **API**
3. Click **Create API Key**
4. Copy the generated key — you won't be able to see it again

![n8n API key settings](https://docs.n8n.io/api/authentication/)

## Step 2: Configure in Nekazari

1. Go to the n8n module page at `/n8n-hub`
2. Expand **n8n Configuration (admin only)**
3. Enter your n8n URL (e.g., `https://n8n.my-company.com`)
4. Paste your API key
5. Click **Test connection** — you should see "Connection OK"
6. Click **Save**

## Step 3: Verify

After saving, the module will use your n8n instance for all API calls.
You should see workflow status and execution data from your instance.

The **Open n8n** button will link directly to your configured URL.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection timed out | Check your n8n instance is running and accessible from the internet |
| HTTP 401 | Your API key may be invalid — generate a new one |
| HTTP 403 | Check the API key has sufficient permissions |
| Private IP rejected | Only `https://` URLs are accepted. Localhost/private IPs are not allowed in production |

## Provisioning a hosted instance

If you don't have your own n8n instance, you can activate a hosted one from the
module page (Enterprise included, or 4.99€/month as an addon). The platform
will provision and manage an isolated n8n instance for your tenant.

See the [n8n auto-provisioning documentation](#) for details.
