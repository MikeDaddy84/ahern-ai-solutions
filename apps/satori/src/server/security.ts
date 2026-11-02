const developmentSecret = 'a_very_long_secret_key_that_is_at_least_32_chars_long!';

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' &&
      (!secret || secret.length < 32 || secret === developmentSecret)) {
    throw new Error('Production requires a unique SESSION_SECRET of at least 32 characters.');
  }
  return secret || developmentSecret;
}

export function getTrustedProxyRanges(): string[] {
  const configured = process.env.TRUSTED_PROXY_CIDRS;
  if (configured) return configured.split(',').map(value => value.trim()).filter(Boolean);
  // Render terminates TLS on its internal network. Validate the peer address,
  // rather than trusting a hop count or all forwarded headers unconditionally.
  return process.env.RENDER === 'true' ? ['loopback', 'uniquelocal'] : ['loopback'];
}
