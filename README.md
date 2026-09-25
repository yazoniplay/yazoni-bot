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

1. Install Node.js 20+.
2. Copy .env.example to .env.
3. Put your Google Gemini API key in GEMINI_API_KEY.
4. Configure the Minecraft server.
5. Run npm install.
6. Run npm start.

After spawning, it starts thinking automatically. You can simply play normally and talk to it.

Use automation only on servers where you have permission.
