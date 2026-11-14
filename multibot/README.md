# multibot

Standalone multi-bot teammates (separate from the main `src/` bot). Several Mineflayer bots follow the owner, look at them, and chat/decide with Gemini. CommonJS, own `package.json`.

```
cd multibot
npm install
GEMINI_API_KEY=... OWNER=YourName BOTS=5 node bot.js
```

Env: `MC_HOST`, `MC_PORT`, `MC_VERSION`, `OWNER`, `BOTS` (max 10 names), `GEMINI_API_KEY`, `MODEL`, `MIN_GAP_MS`.
Server needs `online-mode=false` (bots join with made-up names, default skins).
