# Telegram transport: polling and webhooks

## Polling (default)

The bot uses Telegram long polling by default. Start the application locally
with `npm run dev`; the bot connects to Telegram and checks for new messages.
No public URL or tunnel is required.

Polling is the simplest option for local development and venue Wi-Fi. Only one
bot process should poll a bot at a time.

## Webhook

Use a webhook when Telegram should deliver updates to a publicly reachable
HTTPS endpoint. A tunnel forwards a public URL to the local application:

```sh
cloudflared tunnel --url http://localhost:3000
```

or:

```sh
ngrok http 3000
```

Configure the bot's webhook with the HTTPS URL supplied by the tunnel and
ensure the application is listening on port `3000`. Stop polling before using
a webhook; Telegram should have one active update-delivery method for the bot.
