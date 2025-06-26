import crypto from 'crypto';

export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!payload || !signature || !secret) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

export function extractSignatureFromHeader(signatureHeader: string): string | null {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return null;
  }
  return signatureHeader;
}

export function isSignatureValid(
  body: string,
  signatureHeader: string | undefined,
  webhookSecret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const signature = extractSignatureFromHeader(signatureHeader);
  if (!signature) {
    return false;
  }

  return validateWebhookSignature(body, signature, webhookSecret);
}