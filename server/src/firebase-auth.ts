import type { GoogleProfile } from "./domain";
import { ApiError } from "./errors";

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY ?? "AIzaSyA592OeNPz2Eb039FgLIk8870IlDZcgTRk";

type ProviderInfo = {
  providerId?: string;
  rawId?: string;
  federatedId?: string;
  displayName?: string;
};

type LookupUser = {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  providerUserInfo?: ProviderInfo[];
};

export async function firebaseIdentityProfile(idToken: string): Promise<GoogleProfile> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) throw new ApiError(401, "Não foi possível entrar.");
  const data = (await response.json()) as { users?: LookupUser[] };
  const user = data.users?.[0];
  if (!user?.email) throw new ApiError(401, "Não foi possível entrar.");
  const google = user.providerUserInfo?.find((item) => item.providerId === "google.com");
  const password = user.providerUserInfo?.find((item) => item.providerId === "password");
  const emailVerified = user.emailVerified === true;
  if (google) {
    const sub = google.rawId || google.federatedId;
    if (!sub) throw new ApiError(401, "Não foi possível entrar com o Google.");
    return {
      sub,
      email: user.email,
      emailVerified,
      name: user.displayName || google.displayName || "",
      provider: "google",
    };
  }
  if (password && user.localId) {
    return {
      sub: user.localId,
      email: user.email,
      emailVerified,
      name: user.displayName || "",
      provider: "password",
    };
  }
  throw new ApiError(401, "Não foi possível entrar.");
}

export async function createFirebasePasswordAccount(input: {
  email: string;
  password: string;
  name: string;
}) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        returnSecureToken: true,
      }),
    },
  );
  const data = (await response.json()) as {
    localId?: string;
    idToken?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    const message = data.error?.message ?? "";
    if (message.includes("EMAIL_EXISTS")) {
      throw new ApiError(400, "Este e-mail já tem conta. A pessoa pode entrar com a senha dela.");
    }
    if (message.includes("WEAK_PASSWORD")) {
      throw new ApiError(400, "A senha precisa ter pelo menos 6 caracteres.");
    }
    throw new ApiError(400, "Não foi possível criar o acesso.");
  }
  if (!data.localId) throw new ApiError(400, "Não foi possível criar o acesso.");
  if (data.idToken) {
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: data.idToken }),
      },
    ).catch(() => undefined);
    if (input.name.trim()) {
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: data.idToken, displayName: input.name.trim() }),
        },
      ).catch(() => undefined);
    }
  }
  return data.localId;
}
