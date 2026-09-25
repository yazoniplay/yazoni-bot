import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
export class Memory{
 constructor(file){fs.mkdirSync(path.dirname(file),{recursive:true});this.db=new Database(file);this.db.pragma("journal_mode=WAL");this.db.exec("CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY AUTOINCREMENT,player TEXT NOT NULL,kind TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS idx_mem_player ON memories(player,created_at)");}
 remember(player,kind,content){this.db.prepare("INSERT INTO memories(player,kind,content,created_at) VALUES(?,?,?,?)").run(player,kind,String(content),Date.now());}
 recent(player,limit=20){return this.db.prepare("SELECT kind,content,created_at FROM memories WHERE player=? ORDER BY id DESC LIMIT ?").all(player,limit).reverse();}
 close(){this.db.close();}
}
