import { AI_SECURITY_REFUSAL, containsUnsafeAiOutput, isRestrictedAiRequest } from '../../shared/customerAiPolicy.js';

// Values stay inside this guard. They are never added to the model context or logs.
const containsConfiguredSecret = (value) => {
  const text = String(value || '');
  return Object.entries(process.env).some(([name, secret]) => {
    if (!/(?:key|secret|token|password|credential|url|uri|host|connection_string)/i.test(name) || !secret || secret.length < 4) return false;
    return [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('hex')]
      .some((form) => text.includes(form));
  });
};

export const guardAiReply = (value) => (
  containsUnsafeAiOutput(value) || containsConfiguredSecret(value) ? AI_SECURITY_REFUSAL : value
);

export const publicAiText = (value) => {
  if (typeof value !== 'string' || isRestrictedAiRequest(value) || containsUnsafeAiOutput(value) || containsConfiguredSecret(value)) return '';
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 2000);
};
