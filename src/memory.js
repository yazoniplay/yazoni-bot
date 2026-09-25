import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
export class Memory{
  constructor(file){
    fs.mkdirSync(path.dirname(file),{recursive:true});this.db=new Database(file);this.db.pragma("journal_mode=WAL");
    this.db.exec("CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY AUTOINCREMENT,player TEXT NOT NULL,kind TEXT NOT NULL,content TEXT NOT NULL,importance INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS idx_mem_player ON memories(player,created_at);CREATE TABLE IF NOT EXISTS world_memory(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);");
  }
  remember(player,kind,content,importance=1){this.db.prepare("INSERT INTO memories(player,kind,content,importance,created_at) VALUES(?,?,?,?,?)").run(player,kind,String(content),Math.max(1,Math.min(10,Number(importance)||1)),Date.now());}
  recent(player,limit=24){return this.db.prepare("SELECT kind,content,importance,created_at FROM memories WHERE player=? ORDER BY id DESC LIMIT ?").all(player,limit).reverse();}
  important(player,limit=16){return this.db.prepare("SELECT kind,content,importance,created_at FROM memories WHERE player=? ORDER BY importance DESC,id DESC LIMIT ?").all(player,limit);}
  setWorld(key,value){this.db.prepare("INSERT INTO world_memory(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key,JSON.stringify(value),Date.now());}
  getWorld(key,fallback=null){const r=this.db.prepare("SELECT value FROM world_memory WHERE key=?").get(key);if(!r)return fallback;try{return JSON.parse(r.value)}catch{return r.value}}
  close(){this.db.close();}
}