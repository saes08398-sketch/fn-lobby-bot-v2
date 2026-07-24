# FN Lobby Bot

A Fortnite lobby bot that runs on Railway. It logs in with Epic's device-code flow, stays in-game (not in the launcher), auto-accepts party invites, and lets you wear any skin or play any emote through a live web dashboard.

## Features

- Epic device-code login (generate a code on the dashboard, log in at epicgames.com/activate)
- Host on Railway (free tier works)
- Auto-accept party invites
- Equip any skin, backpack, pickaxe, or emote
- Live lobby status, account info, and logs in the web dashboard
- WebSocket-powered real-time updates
- Stays in-game presence (not stuck in launcher)

## Folder Structure

```
fn/
├── src/
│   ├── index.js                 # Entry point
│   ├── auth/
│   │   ├── deviceCode.js        # Epic device-code auth
│   │   └── tokenManager.js      # Token refresh/storage
│   ├── client/
│   │   ├── epicClient.js        # Main orchestrator
│   │   ├── xmppClient.js        # Epic XMPP connection
│   │   ├── partyManager.js      # Party/invite handling
│   │   ├── cosmeticsManager.js  # Skin/emote equip logic
│   │   └── fortniteAPI.js       # HTTP helpers for Epic/Fortnite APIs
│   ├── web/
│   │   └── server.js            # Express + WebSocket dashboard
│   └── utils/
│       ├── constants.js         # Epic endpoints and presence payload
│       ├── logger.js            # Simple logger
│       └── state.js             # Shared bot state
├── public/                      # Dashboard frontend
├── package.json
├── railway.json / railway.toml  # Railway deployment config
└── .env.example
```

## Required Epic Client Credentials

Epic rotates the Fortnite client credentials with updates. You must supply a valid `EPIC_CLIENT_ID` and `EPIC_CLIENT_SECRET` in `.env` or Railway variables. These are the credentials Fortnite uses to authenticate with Epic's OAuth services.

Common sources:
- Extracted from the current Fortnite game client.
- Known community-circulated values for the current Fortnite patch.

If you do not set them, the bot will refuse to start and tell you exactly what's missing.

## Local Setup

1. Install Node.js 18+.
2. Clone/copy the `fn` folder.
3. Install dependencies:

```bash
cd fn
npm install
```

4. Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

5. Start the bot:

```bash
npm start
```

6. Open `http://localhost:3000` and click **Generate Login Code**.
7. Go to the Epic activation link, enter the code, and log in with the account you want the bot to use.
8. The bot will come online and show **Online** in the dashboard.

## Railway Deployment

1. Push the `fn` folder to a GitHub repo.
2. In Railway, create a new project from the GitHub repo.
3. Railway will read `railway.json` / `railway.toml` and start `node src/index.js` automatically.
4. Once deployed, open the public Railway URL.
5. Click **Generate Login Code** and complete Epic login.
6. The bot is now live and hosted.

**Tip:** After the first device-code login, the server logs print the `EPIC_REFRESH_TOKEN`. Add it as a Railway environment variable so the bot auto-logs in after restarts.

Optional environment variables in Railway:

- `AUTO_ACCEPT_INVITES=true` (default)
- `DEFAULT_SKIN=AthenaCharacter:CID_001_Athena_Commando_F_Default`
- `DEFAULT_EMOTE=AthenaDance:EID_DanceMoves`
- `EPIC_REFRESH_TOKEN=...` (for automatic re-login)
- `EPIC_EMAIL=...` + `EPIC_PASSWORD=...` (for automatic email/password login)

You can also log in through the dashboard with either the device-code flow or email/password.

## API Endpoints

- `GET /api/status` - Current bot status
- `GET /api/login` - Generate a new Epic device code
- `POST /api/login-password` - Log in with email/password
  - Body: `{ "email": "...", "password": "..." }`
- `POST /api/equip` - Equip skin/emote/backpack/pickaxe
  - Body examples:
    - `{ "type": "skin", "id": "CID_001_Athena_Commando_F_Default" }`
    - `{ "type": "emote", "id": "EID_DanceMoves", "section": "Emote1" }`
    - `{ "type": "backpack", "id": "BID_001_BlueSquire" }`
    - `{ "type": "pickaxe", "id": "PID_001_DefaultPickaxe" }`
- `POST /api/accept-invites` - Toggle auto-accept
- `POST /api/message` - Send a message to the party
- `POST /api/disconnect` - Disconnect the bot

## How It Avoids the Launcher

The bot sends an Epic XMPP presence stanza with `bIsPlaying: true`, `matchStarted: true`, and `lobbyState: "InGame"`. Fortnite reads this as an in-game friend instead of a launcher-only friend.

## Notes

- Cosmetic IDs can be passed as full template IDs (`AthenaCharacter:CID_...`) or short codes (`CID_...`).
- The bot does not join actual matches; it only operates in the lobby/party layer.
- Epic endpoints and APIs change over time; update constants in `src/utils/constants.js` if needed.

## License

MIT
