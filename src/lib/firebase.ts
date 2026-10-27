import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

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

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(getAuth(firebaseApp()), provider);
  return result.user.getIdToken();
}

export async function enableFirebaseAnalytics() {
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return;
  getAnalytics(firebaseApp());
}
