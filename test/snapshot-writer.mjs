import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync(process.argv[2],{timeout:1000});
const q=db.prepare('SELECT id FROM queries ORDER BY id LIMIT 1').get();
db.exec('BEGIN IMMEDIATE');
db.prepare('INSERT INTO domains VALUES(?)').run('concurrent.test');
db.prepare('INSERT INTO matches VALUES(?,?,?,?,?)').run('concurrent.test',q.id,'https://concurrent.test/',1,1);
db.prepare("UPDATE queries SET next_page=2,state='complete' WHERE id=?").run(q.id);
db.prepare("UPDATE meta SET value=? WHERE key='state'").run(JSON.stringify('running'));
db.exec('COMMIT');db.close();
