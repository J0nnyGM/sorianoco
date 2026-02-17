// /public/js/firebase-init.js

// Importamos las librerías desde el CDN oficial (Usando la versión que nos diste)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// Configuración de "Soriano" (Tus credenciales reales)
const firebaseConfig = {
  apiKey: "AIzaSyAlZwtoorXSRpgJJLfIVUqA7blHVFGVCBQ",
  authDomain: "sorianoco.firebaseapp.com",
  projectId: "sorianoco",
  storageBucket: "sorianoco.firebasestorage.app",
  messagingSenderId: "76822566031",
  appId: "1:76822566031:web:6d6a0b6ea84e652c328cfa",
  measurementId: "G-SW2DPZHSVE"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
const db = getFirestore(app);   // Base de datos
const auth = getAuth(app);      // Autenticación
const storage = getStorage(app); // Archivos (Imágenes, documentos)

console.log("🔥 Firebase Soriano inicializado correctamente");

// Exportar para usar en otros archivos JS

export { app, db, auth, storage, onAuthStateChanged, signOut };