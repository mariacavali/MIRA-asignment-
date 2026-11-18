import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

// Read-only authentication check. No generation, request-body logging,
// secret output, key fingerprints, automatic retries or key replacement.
const file=resolve('.env');
const raw=await readFile(file,'utf8'), env=parse(raw), metadata=await stat(file);
const key=env.OPENAI_API_KEY||'';
const inherited=process.env.OPENAI_API_KEY||'';
const result={checkedAt:new Date().toISOString(),credentialSource:file,selectionRule:'The current lab launcher loads only dotenv(.env).OPENAI_API_KEY at process startup.',fileModifiedAt:metadata.mtime.toISOString(),fileMode:(metadata.mode&0o777).toString(8),fileKeyPresent:!!key,inheritedKeyPresent:!!inherited,inheritedKeyMatchesFile:!!inherited&&inherited===key,duplicateDefinitions:raw.split(/\n/).filter(l=>/^\s*(?:export\s+)?OPENAI_API_KEY\s*=/.test(l)).length,model:'gpt-5-mini-2025-08-07',method:'GET',endpoint:'https://api.openai.com/v1/models/gpt-5-mini-2025-08-07',generationRequests:0,providerBilledGenerationTokens:0,keyReplaced:false};
try{
 if(!key.trim())throw new Error('configured_key_missing');
 const response=await fetch(result.endpoint,{method:'GET',headers:{authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null);
 Object.assign(result,{httpStatus:response.status,errorCode:typeof data?.error?.code==='string'?data.error.code.slice(0,100):null,errorType:typeof data?.error?.type==='string'?data.error.type.slice(0,100):null,exactModelAccessible:response.ok&&data?.id===result.model,authentication:response.ok?'accepted':response.status===401?'rejected':'not_established'});
}catch(error){
 Object.assign(result,{authentication:'not_established',transportFailure:true,errorName:error?.name||'Error',errorCode:error?.cause?.code||null});
}
await writeFile('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_knowledge-lab/credential-diagnosis.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(result));
