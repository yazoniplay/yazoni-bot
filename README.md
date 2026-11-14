# Yazoni Bot

Autonomous Minecraft AI companion powered by **Gemini + Mineflayer**.

## Autonomous

There is no command system. The bot continuously:
- observes surroundings, inventory, health, hunger, time, weather and nearby entities
- talks naturally to the owner
- plans multiple actions
- gathers resources and handles acquisition/crafting chains
- crafts and smelts
- farms and harvests
- builds simple structures
- explores
- avoids nearby hostile mobs
- stores valuable items and sleeps
- remembers important conversations, failures, world facts and actions
- reconnects automatically

Gemini structured JSON is used for reliable action plans.

## Setup

1. Install Node.js 22.
2. Copy .env.example to .env.
3. Put your Google Gemini API key in GEMINI_API_KEY.
4. Configure the Minecraft server.
5. Run npm install.
6. Run npm start.

After spawning, it starts thinking automatically. You can simply play normally and talk to it.

Use automation only on servers where you have permission.

## Multiple bots

Set `BOTS=3` (up to 20) in `.env` to run several bots from one process. Each bot has its own name, position, memory (`data/memory-<name>.json`) and follow distance, and they all follow the owner and look at them when idle.

Who answers a chat message from the owner:

| You say | What happens |
| --- | --- |
| `Kairo mine wood 5` | only Kairo acts and replies (works with several names: `Kairo and Nyx follow me`) |
| `everyone follow me` / `team ...` | every bot acts, only the first bot replies in chat |
| `follow me`, `stop`, `mine ...` (no name) | simple commands go to every bot |
| anything else (small talk, open-ended asks) | only the first bot answers, so you don't pay for N Gemini calls |

All bots share one Gemini queue (`GEMINI_MIN_GAP_MS`, `GEMINI_MAX_QUEUE`), and a rate-limit error backs every bot off together.

Notes:
- The server needs `online-mode=false` for `MC_AUTH=offline` bots with made-up names. They get default Steve/Alex skins; custom skins need real accounts or a skin plugin on the server.
- Bots join `JOIN_DELAY_MS` apart so the server doesn't throttle them, and reconnect with backoff.
