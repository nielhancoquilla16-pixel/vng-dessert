export const AI_SECURITY_REFUSAL = "Sorry, I can’t provide or generate code or expose protected system information.";

const normalize = (value) => String(value || '').normalize('NFKC')
  .replace(/[\p{Cf}\uFE00-\uFE0F]/gu, '').toLowerCase()
  .replace(/[_\p{Pd}]/gu, ' ').replace(/\s+/g, ' ').trim();

const PROTECTED_TOPICS = /\.\s*env\b|\b(?:api|secret|private|signing|service role|access)\s*keys?\b|\b(?:auth(?:entication|orization)?|access|refresh|session|bearer)\s*tokens?\b|\bjwt\b|\bcredentials?\b|\b(?:environment|env)\s*(?:variables?|files?|values?|settings|config(?:uration)?)\b|\bprocess\s*\.\s*env\b|\b(?:backend|server|database)\s*(?:secrets?|passwords?|config(?:uration)?|credentials?|connection strings?)\b|\b(?:system|developer|internal|hidden|initial)\s*(?:prompts?|instructions?|messages?|rules?|config(?:uration)?)\b|\b(?:private|internal|protected)\s*(?:system\s*)?(?:information|config(?:uration)?|implementation|details?|application|business data)\b|\b(?:security rules?|security policies|database schema|source code|production recipes?|supplier(?:s| information)?|profit(?:s)?|margins?|cost price|production costs?|ingredient costs?|wholesale costs?|inventory information|inventory levels?|stock counts?|stock levels?|stock quantities)\b/i;
const OVERRIDE_REQUEST = /\b(?:ignore|override|bypass|forget|disregard)\b.{0,100}\b(?:instructions?|rules?|prompts?|restrictions?|safety|security)\b|\b(?:repeat|print|show|reveal|translate|encode)\b.{0,80}\b(?:everything|text|instructions?|messages?)\b.{0,40}\b(?:above|before (?:this|my)|you were given)\b|\b(?:developer mode|jailbreak|unrestricted mode)\b/i;
const CODE_TOPIC = /\b(?:code|coding|programming|scripts?|pseudocode|programs?)\b/i;
const CUSTOMER_CODE = /\b(?:verification|confirmation|reset|recovery|otp|discount|promo|promotion|coupon|voucher|postal|zip)\s+codes?\b/gi;
const CODE_ACTION = /\b(?:write|generate|create|make|build|implement|modify|edit|fix|debug|repair|refactor|provide|give|show|output|return|print|complete|finish|convert|translate)\b.{0,160}\b(?:javascript|typescript|python|java|c\+\+|c#|csharp|ruby|php|sql|html|css|jsx|tsx|bash|powershell|shell|function|algorithm|regex|regular expression|component|api endpoint|program|snippets?|queries|query|commands?|executable|batch file)\b/i;
const CODE_OUTPUT = /`|<\/?[a-z][^>]*>|\b(?:const|let|var)\s+[a-z_$][\w$]*\s*=|\bfunction\s*[\w$]*\s*\(|\bdef\s+\w+\s*\(|\bclass\s+\w+\s*[:{]|\b(?:console\.log|process\.env|print|require|if|for|while|switch)\s*\(|\b(?:int|void|char|float|double|bool|string)\s+\w+\s*\(|\breturn\s+[^.\n]{1,100};|\bimport\s+.+\s+from\s+['"]|(?:^|\n)\s*(?:import\s+\w+\s*(?:$|\n)|from\s+\S+\s+import\b|(?:echo|cat|export|Get-Content|Invoke-WebRequest)\s+\S+)|\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b.{0,120}\b(?:FROM|VALUES|SET|WHERE)\b|=>|#!\s*\/|\b(?:curl|wget|sudo|npm|pip)\s+(?:-[a-z]|install|run)\b/i;
const SECRET_OUTPUT = /\b(?:sk|pk)_(?:live|test)_[a-z0-9]+|\b(?:sk-|gsk_)[a-z0-9_-]{12,}|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|\bBearer\s+\S+|\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|DATABASE_URL)\s*[:=]|\b(?:password|secret|token|credential)\s*(?:[:=]|is\b|equals\b)\s*(?!\d+\.\s*(?:Open|Select|Enter|Follow)\b)\S+/i;
const PRIVATE_TOPICS = /\b(?:secrets?|dotenv|env|backend|inventory|unit costs?|internal costs?|implementation details?)\b|\b(?:your|the|original)\s+(?:prompts?|instructions?|configuration|config)\b|\bstock\s+(?:count|quantity|numbers?)\b/i;
const PRIVATE_OUTPUT = /\byou are (?:the |a |an )?.{0,60}\bassistant\b|\btreat (?:the )?(?:user|conversation|catalog).{0,100}\b(?:data|instructions)\b|\b(?:backend|database|server)\b.{0,50}\b(?:uses?|hosted|tables?|schema|middleware|endpoints?|configuration)\b/i;
const ENVIRONMENT_NAME = /\b(?:[A-Z][A-Z0-9]*_)+[A-Z0-9]+\b/;

export const containsUnsafeAiOutput = (value) => {
  if (value === AI_SECURITY_REFUSAL) return false;
  const text = normalize(value);
  return PROTECTED_TOPICS.test(text) || PRIVATE_TOPICS.test(text) || OVERRIDE_REQUEST.test(text)
    || CODE_OUTPUT.test(String(value || '')) || SECRET_OUTPUT.test(String(value || ''))
    || ENVIRONMENT_NAME.test(String(value || '')) || PRIVATE_OUTPUT.test(text);
};

export const isRestrictedAiRequest = (value) => {
  const text = normalize(value);
  if (PROTECTED_TOPICS.test(text) || PRIVATE_TOPICS.test(text) || OVERRIDE_REQUEST.test(text)
    || ENVIRONMENT_NAME.test(String(value || ''))
    || CODE_OUTPUT.test(String(value || '')) || SECRET_OUTPUT.test(String(value || ''))) return true;
  if (CODE_TOPIC.test(text.replace(CUSTOMER_CODE, '')) || CODE_ACTION.test(text)) return true;
  // Account help stays available; requests to retrieve actual passwords do not.
  if (/\bpasswords?\b/.test(text)) {
    const accountHelp = /\b(?:reset|forgot|forgotten|change|recover|recovery|requirements?|strong|strength|log\s*in|login|sign\s*up|signup|register)\b/.test(text);
    const disclosure = /\b(?:reveal|show|display|print|give|tell|expose|list|what is|whats|retrieve|read)\b.{0,60}\b(?:my|your|the|admin|saved|stored|actual)\s+passwords?\b/.test(text);
    if (!accountHelp || disclosure) return true;
  }
  return false;
};

export const isRestrictedAiConversation = (message, history = []) => {
  if (isRestrictedAiRequest(message)) return true;
  const previous = (Array.isArray(history) ? history : []).filter((entry) => entry?.role === 'user').at(-1);
  const followup = /^(?:yes\b|ok(?:ay)?\b|go ahead|do (?:it|that)|continue|finish|try again)|^please[?.! ]*$|\b(?:it|that|above|previous|first (?:letter|character)|base64|encoded?|translate)\b/i.test(normalize(message));
  return Boolean(previous && followup && isRestrictedAiRequest(previous.content));
};

export const guardCustomerAiReply = (value) => (
  containsUnsafeAiOutput(value) ? AI_SECURITY_REFUSAL : value
);
