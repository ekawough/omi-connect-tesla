# Omi Connect — Tesla

Control your Tesla by voice using the [Omi](https://omi.me) wearable. Say **"Tesla, unlock my car"** and it happens instantly.

## How it works

1. Wear your Omi device
2. Say "Tesla" followed by a command
3. Your car responds

## Commands

| Say | Action |
|-----|--------|
| Tesla, unlock my car | Unlock doors |
| Tesla, lock my car | Lock doors |
| Tesla, open the trunk | Open rear trunk |
| Tesla, open the frunk | Open front trunk |
| Tesla, start climate | Turn on AC/heat |
| Tesla, stop climate | Turn off climate |
| Tesla, start charging | Start charging |
| Tesla, stop charging | Stop charging |
| Tesla, open charge port | Open charge port |
| Tesla, honk | Honk horn |
| Tesla, flash lights | Flash lights |
| Tesla, find my car | Flash lights to locate |

## Architecture

```
Omi device → Railway webhook → Tesla VCP proxy (VPS) → Tesla API
```

- **Railway** — webhook server, processes voice commands
- **VPS** — Tesla OAuth handler + Vehicle Command Protocol proxy
- **Supabase** — stores Tesla session tokens per user
- **Tesla Fleet API** — signed commands via VCP

## Setup (for users)

Install the app from the Omi store → tap Connect Tesla → sign in with your Tesla account → done.

## Self-hosting

### Requirements
- Node.js 20+
- Railway account
- Hostinger VPS (or any VPS)
- Supabase project
- Tesla Developer account

### Environment variables

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
INTERNAL_SECRET=
OMI_API_KEY=
VCP_PROXY_URL=
ANTHROPIC_API_KEY=
TESLA_CLIENT_ID=
TESLA_CLIENT_SECRET=
```

### VPS setup
The VPS runs two services:
1. `tesla-oauth` — Node.js OAuth handler (PM2, port 3458)
2. `tesla-proxy` — Tesla HTTP proxy for signed VCP commands (systemd, port 4443)

nginx routes `/api/1/vehicles/` to the VCP proxy and `/auth/tesla`, `/callback` to the OAuth handler.

## Security

- Tesla tokens encrypted at rest in Supabase
- Voice transcripts never stored
- Commands signed via Tesla's Vehicle Command Protocol
- Rate limiting per user (20 commands/30 seconds)

## License

MIT — free to use, modify, and distribute.

Built by [Kawough Marketing LLC](https://omideveloper.com)
