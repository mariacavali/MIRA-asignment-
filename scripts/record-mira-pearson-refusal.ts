import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { createKnowledgeRepository } from "../server/miraKnowledge/repository";

// Records the read Pearson refusal through the existing withdrawal path.
// Socket-only local catalogue; no provider, Pinecone, deletion or publication.
const root=resolve('.mira-local-data/connected-review');
const work='/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion/publication-preparation-2026-10-31';
const evidence=join(work,'correspondence/2026-11-02-pearson-refusal/response.json');
const refusal=JSON.parse(await readFile(evidence,'utf8'));
if(refusal.decision!=='permission_refused'||refusal.messageId!=='1a19b13cbf3d51d4'||!refusal.plainTextAsReturned.includes('we are unable to grant permission'))throw new Error('Verified refusal record required.');
const pool=mysql.createPool({socketPath:join(root,'db.sock'),user:'root',database:'mira_connected_review',connectionLimit:1,connectTimeout:5000});
try{
 const repo=createKnowledgeRepository(drizzle(pool));
 const [rows]=await pool.query("SELECT id, JSON_EXTRACT(bundle, '$.sources') AS sources FROM mira_knowledge_releases");
 const sources=new Map<string,{id:string;version:number;title:string}>();
 for(const row of rows as any[]){
  const values=typeof row.sources==='string'?JSON.parse(row.sources):row.sources;
  for(const s of values??[])if(s.id==='book-brand-management'||/Strategic Brand Management/i.test(s.title))sources.set(`source:${s.id}@${s.version}`,{id:s.id,version:s.version,title:s.title});
 }
 const before=await repo.status();
 const reason=`Pearson refused the proposed AI use on 2026-11-02, Global Permissions / Allison Bulpitt; Gmail message ${refusal.messageId}, thread ${refusal.threadId}. Exclude Keller extraction and derivative notes from retrieval, generation tests and Pinecone. Preserve files; no paraphrased substitute. Evidence: ${evidence}`;
 const applied=process.argv.includes('--apply');
 if(applied)for(const source of sources.values())await repo.withdraw(1,{expectedRevision:(await repo.status()).revision,kind:'source',ref:{id:source.id,version:source.version},reason});
 const after=await repo.status(),snapshot=await repo.publishedSnapshot();
 const [withdrawals]=await pool.query('SELECT `key`,reason FROM mira_knowledge_withdrawals WHERE `key` LIKE ?', ['source:book-brand-management@%']);
 const report={checkedAt:new Date().toISOString(),decision:'permission_refused',evidence,applied,sourceVersions:[...sources.values()],withdrawals,before,after,activeItems:snapshot.items.length,activeSources:snapshot.sources.map(s=>({id:s.id,version:s.version})),providerRequests:0,pineconeRequests:0,filesDeleted:0};
 await mkdir(join(work,'correspondence/2026-11-02-pearson-refusal'),{recursive:true});
 await writeFile(join(work,'correspondence/2026-11-02-pearson-refusal/catalogue-exclusion.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({applied,sourceVersions:report.sourceVersions,withdrawalCount:(withdrawals as any[]).length,before,after,activeItems:report.activeItems,providerRequests:0,pineconeRequests:0}));
}finally{await pool.end();}
