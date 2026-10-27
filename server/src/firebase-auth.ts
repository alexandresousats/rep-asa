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
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  providerUserInfo?: ProviderInfo[];
};

export async function firebaseGoogleProfile(idToken: string): Promise<GoogleProfile> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) throw new ApiError(401, "Não foi possível entrar com o Google.");
  const data = (await response.json()) as { users?: LookupUser[] };
  const user = data.users?.[0];
  const google = user?.providerUserInfo?.find((item) => item.providerId === "google.com");
  const sub = google?.rawId || google?.federatedId;
  if (!user?.email || !sub) throw new ApiError(401, "Não foi possível entrar com o Google.");
  return {
    sub,
    email: user.email,
    emailVerified: user.emailVerified === true,
    name: user.displayName || google?.displayName || "",
  };
}
