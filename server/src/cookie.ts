type CookieEnv = {
  NODE_ENV?: string;
  COOKIE_SECURE?: string;
};

// Secure por padrão em produção. COOKIE_SECURE=1 ou 0 vence o padrão,
// para ligar o flag no dev ou desligar num servidor local sem HTTPS.
export function sessionCookieSecure(env: CookieEnv = process.env): boolean {
  const flag = env.COOKIE_SECURE?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") return true;
  return env.NODE_ENV === "production";
}
