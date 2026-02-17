import { auth, db, signOut } from './firebase-init.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Referencias del DOM
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const loginBtn = document.getElementById('loginBtn');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // UI Loading
    const originalBtnText = loginBtn.innerHTML;
    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span class="animate-spin inline-block mr-2 border-2 border-white border-t-transparent rounded-full h-4 w-4"></span> Verificando...`;
    hideError();

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        // 1. Autenticar credenciales (Email/Pass)
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // 2. Verificar estado en Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            // Caso raro: Usuario existe en Auth pero no en Firestore (ej. creado manualmente en consola sin datos)
            await signOut(auth);
            throw new Error("USER_NO_DATA");
        }

        const userData = userDoc.data();

        // 3. Bloqueo de seguridad según estado
        if (userData.status === 'pending') {
            await signOut(auth); // Expulsar inmediatamente
            throw new Error("ACCOUNT_PENDING");
        }

        if (userData.status === 'suspended' || userData.status === 'inactive') {
            await signOut(auth);
            throw new Error("ACCOUNT_SUSPENDED");
        }

        // 4. Si llegamos aquí, está ACTIVO. Redirigir.
        console.log("Acceso concedido:", userData.role);
        
        // Opcional: Redirigir según rol
        // if (userData.role === 'admin') window.location.href = '../admin/dashboard.html';
        window.location.href = '../admin/index.html';

    } catch (error) {
        console.error("Error login:", error.code || error.message);
        let msg = "Credenciales incorrectas.";
        
        // Manejo de errores personalizados
        if (error.message === "ACCOUNT_PENDING") {
            msg = "Tu cuenta está pendiente de aprobación por un administrador.";
        } else if (error.message === "ACCOUNT_SUSPENDED") {
            msg = "Tu cuenta ha sido desactivada. Contacta a soporte.";
        } else if (error.message === "USER_NO_DATA") {
            msg = "Error de integridad: Usuario sin perfil de datos.";
        } 
        // Errores de Firebase
        else if (error.code === 'auth/too-many-requests') {
            msg = "Demasiados intentos. Espera unos minutos.";
        } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            msg = "Correo o contraseña inválidos.";
        } else if (error.code === 'auth/network-request-failed') {
            msg = "Error de conexión.";
        }

        showError(msg);
        
        // Restaurar botón
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalBtnText;
    }
});

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
    errorMessage.classList.add('animate-pulse');
}

function hideError() {
    errorMessage.classList.add('hidden');
}