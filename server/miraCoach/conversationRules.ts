// Syntactic safeguards supplement assessment of relevance and neutrality.
export const SINGLE_QUESTION_PATTERN = /^[^?？]*(?:[?？][^?？]*)?$/;
// Regular-language grammar (no lookarounds): a question cannot contain the
// joining words "and", "also" or "plus", or comma/colon-separated subquestions.
// Other words such as "brand" and "understand" remain allowed.
function singleFocusWordPattern() {
  type Trie = { end?: boolean; children: Record<string, Trie> };
  const root: Trie = { children: {} };
  for (const word of ["and", "also", "plus"]) { let n=root; for(const c of word) n=n.children[c]??=( {children:{}} ); n.end=true; }
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'’‐-";
  const cls=(letters:string)=>`[${letters.replace(/[\\\]\-^]/g,"\\$&")}]`;
  const any=cls(alphabet), branches:string[]=[];
  function walk(n:Trie,prefix:string) {
    if(n.end)return; // Prevent joined evasions such as "andwhat" as well.
    if(prefix&&!n.end)branches.push(prefix);
    const blocked=new Set(Object.keys(n.children).flatMap(c=>[c,c.toUpperCase()]));
    const allowed=Array.from(alphabet).filter(c=>!blocked.has(c)).join("");
    if(allowed)branches.push(prefix+cls(allowed)+any+'*');
    for(const [c,child]of Object.entries(n.children))walk(child,prefix+cls(c+c.toUpperCase()));
  }
  walk(root,"");return '(?:'+branches.join('|')+')';
}
export const FOCUSED_QUESTION_PATTERN = new RegExp('^'+singleFocusWordPattern()+'(?: +'+singleFocusWordPattern()+')*[?？]$');
export function conversationIssues(response: string) {
  const issues: string[] = [];
  if (!SINGLE_QUESTION_PATTERN.test(response)) issues.push("multiple_questions");
  const questions = response.match(/[^.!?？\n]*[?？]/g) ?? [];
  if (questions.some(q => /\b(?:and|also|plus)\s*(?:who|what|when|where|why|how|which|can you|do you|would you)\b/i.test(q))) issues.push("compound_question");
  if (questions.some(q => /[,;]\s*(?:who|what|when|where|why|how|which)\b/i.test(q))) issues.push("listed_questions");
  const requests = response.match(/(?:^|[.!?？]\s+|\n)\s*(?:please\s+)?(?:tell me|describe|share|name|walk me through|give me an example)\b[^.!?？\n]*[.!?？]?/gi) ?? [];
  if (questions.length + requests.filter(r => !/[?？]/.test(r)).length > 1) issues.push("multiple_input_requests");
  return Array.from(new Set(issues));
}
export function redactCredentials(text: string, knownSecret?: string) {
  let safe = knownSecret ? text.split(knownSecret).join("[REDACTED_CREDENTIAL]") : text;
  safe = safe.replace(/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_CREDENTIAL]");
  return safe.replace(/\bBearer\s+[A-Za-z0-9_.-]{16,}\b/gi, "Bearer [REDACTED_CREDENTIAL]");
}
