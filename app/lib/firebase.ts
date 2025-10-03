import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCJeT2PDXuiBx2NVKn71YSDq19UfmtGfF8",
  authDomain: "wantnot-eb56d.firebaseapp.com",
  projectId: "wantnot-eb56d",
  storageBucket: "wantnot-eb56d.firebasestorage.app",
  messagingSenderId: "946611385455",
  appId: "1:946611385455:web:817220f2d5c474163d099a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();