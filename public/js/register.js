import { auth, db } from './firebase-init.js';
import { createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Referencias DOM
const registerForm = document.getElementById('registerForm');
const fullNameInput = document.getElementById('fullName');
const departmentInput = document.getElementById('department');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const registerBtn = document.getElementById('registerBtn');
const feedbackMessage = document.getElementById('feedbackMessage');
const feedbackText = document.getElementById('feedbackText');

// Validar contraseñas en tiempo real
confirmPasswordInput.addEventListener('input', () => {
    if (confirmPasswordInput.value !== passwordInput.value) {
        confirmPasswordInput.classList.add('border-red-500');
    } else {
        confirmPasswordInput.classList.remove('border-red-500');
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Validaciones básicas
    if (passwordInput.value !== confirmPasswordInput.value) {
        showFeedback("Las contraseñas no coinciden", "error");
        return;
    }

    setLoading(true);

    try {
        // 2. Crear usuario en Authentication
        const userCredential = await createUserWithEmailAndPassword(
            auth, 
            emailInput.value, 
            passwordInput.value
        );
        const user = userCredential.user;

        // 3. Guardar datos extendidos en Firestore (Colección 'users')
        // IMPORTANTE: El estado inicial es 'pending'
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: fullNameInput.value,
            email: emailInput.value,
            department: departmentInput.value, // Rol solicitado
            role: "user", // Rol técnico por defecto (sin privilegios de admin)
            status: "pending", // ESTADO CLAVE: Requiere aprobación
            createdAt: serverTimestamp(),
            lastLogin: null
        });

        // 4. Cerrar sesión inmediatamente (para que no entren al dashboard)
        await signOut(auth);

        // 5. Mostrar éxito y limpiar
        registerForm.reset();
        showFeedback("Solicitud enviada. Un administrador debe activar tu cuenta antes de poder ingresar.", "success");
        
        // Opcional: Redirigir al login después de unos segundos
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 4000);

    } catch (error) {
        console.error("Error registro:", error);
        let msg = "Error al registrarse.";
        if (error.code === 'auth/email-already-in-use') msg = "Este correo ya está registrado.";
        if (error.code === 'auth/weak-password') msg = "La contraseña debe tener al menos 6 caracteres.";
        
        showFeedback(msg, "error");
    } finally {
        setLoading(false);
    }
});

// Funciones de utilidad UI
function setLoading(isLoading) {
    if (isLoading) {
        registerBtn.disabled = true;
        registerBtn.innerHTML = `<span class="animate-spin inline-block mr-2 border-2 border-white border-t-transparent rounded-full h-4 w-4"></span> Procesando...`;
    } else {
        registerBtn.disabled = false;
        registerBtn.innerHTML = `Enviar Solicitud`;
    }
}

function showFeedback(message, type) {
    feedbackText.textContent = message;
    feedbackMessage.classList.remove('hidden', 'bg-red-900/20', 'text-red-400', 'border-red-900', 'bg-green-900/20', 'text-green-400', 'border-green-900');
    feedbackMessage.classList.add('border');

    if (type === 'error') {
        feedbackMessage.classList.add('bg-red-900/20', 'text-red-400', 'border-red-900/50');
    } else {
        feedbackMessage.classList.add('bg-green-900/20', 'text-green-400', 'border-green-900/50');
    }
    
    feedbackMessage.classList.remove('hidden');
}