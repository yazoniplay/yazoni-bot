import fs from "node:fs";
import path from "node:path";

export class Memory {
  constructor(file) {
    const jsonFile = file.endsWith(".json") ? file : file.replace(/\.[^.]+$/, ".json");
    fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
    this.file = jsonFile;
    this.data = { nextId: 1, memories: [], world: {} };
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (parsed && typeof parsed === "object") {
          this.data = {
            nextId: Number(parsed.nextId) || 1,
            memories: Array.isArray(parsed.memories) ? parsed.memories : [],
            world: parsed.world && typeof parsed.world === "object" ? parsed.world : {}
          };
        }
      }
    } catch (e) {
      console.warn("[Memory] Could not load memory file:", e.message);
    }
  }

  save() {
    const temp = this.file + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(this.data));
    fs.renameSync(temp, this.file);
  }

  remember(player, kind, content, importance = 1) {
    this.data.memories.push({
      id: this.data.nextId++,
      player: String(player),
      kind: String(kind),
      content: String(content),
      importance: Math.max(1, Math.min(10, Number(importance) || 1)),
      created_at: Date.now()
    });
    // Keep the persistent memory bounded so the bot cannot grow the file forever.
    if (this.data.memories.length > 5000) this.data.memories.splice(0, this.data.memories.length - 5000);
    this.save();
  }

  recent(player, limit = 24) {
    return this.data.memories
      .filter(m => m.player === String(player))
      .sort((a, b) => b.id - a.id)
      .slice(0, Number(limit) || 24)
      .reverse()
      .map(({ kind, content, importance, created_at }) => ({ kind, content, importance, created_at }));
  }

  important(player, limit = 16) {
    return this.data.memories
      .filter(m => m.player === String(player))
      .sort((a, b) => b.importance - a.importance || b.id - a.id)
      .slice(0, Number(limit) || 16)
      .map(({ kind, content, importance, created_at }) => ({ kind, content, importance, created_at }));
  }

  setWorld(key, value) {
    this.data.world[String(key)] = { value, updated_at: Date.now() };
    this.save();
  }

  getWorld(key, fallback = null) {
    const entry = this.data.world[String(key)];
    return entry ? entry.value : fallback;
  }

  close() {
    this.save();
  }
}
