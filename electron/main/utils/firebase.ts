import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

// Consistent config with Admin app
const firebaseConfig = {
  apiKey: "AIzaSyA4xS9MTOlRfplN_ohoTJtEMQBgA4v1fV4",
  authDomain: "trafexia-69056.firebaseapp.com",
  projectId: "trafexia-69056",
  storageBucket: "trafexia-69056.firebasestorage.app",
  messagingSenderId: "766144738684",
  appId: "1:766144738684:web:4a0f5d5a314b6d4c0920f9",
  measurementId: "G-RLVD6HZVVJ"
};

const app = initializeApp(firebaseConfig);

// Use lite SDK — REST only, no gRPC (gRPC fails in Electron main process)
export const db = getFirestore(app);
export default app;
