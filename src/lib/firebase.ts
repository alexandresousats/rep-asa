import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA592OeNPz2Eb039FgLIk8870IlDZcgTRk",
  authDomain: "openasa-login.firebaseapp.com",
  projectId: "openasa-login",
  storageBucket: "openasa-login.firebasestorage.app",
  messagingSenderId: "718191877505",
  appId: "1:718191877505:web:22f4b8215564bba1ee5c80",
  measurementId: "G-CBR8CJF216",
};

export function firebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

function auth() {
  return getAuth(firebaseApp());
}

async function waitForFirebaseUser() {
  const current = auth();
  await current.authStateReady();
  return current.currentUser;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth(), provider);
  return result.user.getIdToken();
}

export async function signUpWithEmail(input: { name: string; email: string; password: string }) {
  const credential = await createUserWithEmailAndPassword(auth(), input.email.trim(), input.password);
  const name = input.name.trim();
  if (name) await updateProfile(credential.user, { displayName: name });
  try {
    await sendEmailVerification(credential.user);
  } catch (error) {
    console.error("[firebase] falha ao enviar confirmação", error);
  }
  return credential.user.getIdToken();
}

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth(), email.trim(), password);
  return credential.user.getIdToken();
}

export async function sendFirebasePasswordReset(email: string) {
  await sendPasswordResetEmail(auth(), email.trim());
}

export async function resendFirebaseVerification() {
  const user = await waitForFirebaseUser();
  if (!user) return false;
  await sendEmailVerification(user);
  return true;
}

export async function refreshFirebaseVerification() {
  const user = await waitForFirebaseUser();
  if (!user) return null;
  await user.reload();
  if (!user.emailVerified) return null;
  return user.getIdToken(true);
}

export async function enableFirebaseAnalytics() {
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return;
  getAnalytics(firebaseApp());
}
