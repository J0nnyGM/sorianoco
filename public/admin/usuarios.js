import { auth, db, signOut, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, getDocs, doc, updateDoc, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- Referencias DOM ---
const tableBody = document.getElementById('usersTableBody');
const filterAll = document.getElementById('filterAll');
const filterPending = document.getElementById('filterPending');
const badgePending = document.getElementById('badgePending');

// --- Referencias Modal ---
const modal = document.getElementById('actionModal');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

let allUsers = [];
let currentAction = null;

// --- 1. Inicialización ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../auth/login.html';
        return;
    }

    // Verificación de seguridad: ¿Existen los elementos HTML?
    if (!tableBody || !filterAll || !filterPending) {
        console.error("Error Crítico: No se encontraron elementos HTML necesarios (tabla o filtros).");
        return; // Detener ejecución para evitar errores
    }
    
    // Cargar datos del usuario actual para el Sidebar
    try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if(userSnap.exists()){
            updateSidebarUser(user, userSnap.data());
        }
    } catch (e) {
        console.error("Error info usuario", e);
    }

    // Iniciar carga de la tabla
    loadUsers();
});

// --- 2. Cargar Usuarios ---
async function loadUsers() {
    try {
        const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        allUsers = [];
        let pendingCount = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            allUsers.push({ id: doc.id, ...data });
            if (data.status === 'pending') pendingCount++;
        });

        updateBadge(pendingCount);
        renderTable(allUsers);

    } catch (error) {
        console.error("Error cargando usuarios:", error);
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Error al cargar datos.</td></tr>`;
    }
}

// --- 3. Renderizar Tabla ---
function renderTable(usersList) {
    if (!tableBody) return;

    if (usersList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">No se encontraron usuarios.</td></tr>`;
        return;
    }

    tableBody.innerHTML = usersList.map(user => {
        let statusClass = "bg-gray-700 text-gray-300";
        let statusText = "Desconocido";

        if (user.status === 'active') {
            statusClass = "bg-green-900/30 text-green-400 border border-green-900";
            statusText = "Activo";
        } else if (user.status === 'pending') {
            statusClass = "bg-yellow-900/30 text-yellow-500 border border-yellow-900 animate-pulse";
            statusText = "Pendiente";
        } else if (user.status === 'suspended') {
            statusClass = "bg-red-900/30 text-red-500 border border-red-900";
            statusText = "Suspendido";
        }

        return `
            <tr class="hover:bg-gray-800/50 transition-colors group">
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-soriano-red border border-gray-700 mr-3">
                            ${(user.name || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-medium text-white">${user.name || "Sin nombre"}</div>
                            <div class="text-xs text-gray-500">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-gray-400 capitalize">${user.department || user.role || '-'}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs rounded-full font-medium ${statusClass}">${statusText}</span>
                </td>
                <td class="px-6 py-4 text-right">
                    ${user.status === 'pending' ? `
                        <button onclick="window.confirmAction('${user.id}', 'approve', '${user.name}')" class="text-green-500 hover:text-green-400 text-xs uppercase tracking-wide border border-green-900 bg-green-900/20 px-3 py-1 rounded hover:bg-green-900/40 transition">Aprobar</button>
                    ` : ''}
                    ${user.status === 'active' ? `
                        <button onclick="window.confirmAction('${user.id}', 'suspend', '${user.name}')" class="text-gray-500 hover:text-red-500 ml-2"><i class="fas fa-ban"></i></button>
                    ` : ''}
                     ${user.status === 'suspended' ? `
                        <button onclick="window.confirmAction('${user.id}', 'approve', '${user.name}')" class="text-gray-500 hover:text-green-500 ml-2"><i class="fas fa-redo"></i></button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// --- 4. Modal y Acciones ---
window.confirmAction = (uid, action, userName) => {
    currentAction = { uid, action };
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    if (action === 'approve') {
        modalTitle.textContent = "Aprobar Acceso";
        modalDesc.textContent = `¿Activar cuenta de ${userName}?`;
        modalConfirmBtn.className = "px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition";
    } else {
        modalTitle.textContent = "Suspender Usuario";
        modalDesc.textContent = `¿Bloquear a ${userName}?`;
        modalConfirmBtn.className = "px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition";
    }
};

window.closeModal = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentAction = null;
};

if(modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', async () => {
        if (!currentAction) return;
        const { uid, action } = currentAction;
        const newStatus = action === 'approve' ? 'active' : 'suspended';
        
        try {
            await updateDoc(doc(db, "users", uid), { status: newStatus });
            closeModal();
            loadUsers();
        } catch (error) {
            console.error("Error:", error);
            alert("Error al actualizar.");
        }
    });
}

// --- 5. Filtros ---
function updateBadge(count) {
    if(!badgePending) return;
    if (count > 0) {
        badgePending.textContent = count;
        badgePending.classList.remove('hidden');
    } else {
        badgePending.classList.add('hidden');
    }
}

if(filterAll) {
    filterAll.addEventListener('click', () => {
        renderTable(allUsers);
        filterAll.classList.add('ring-1', 'ring-gray-600', 'text-white');
        filterAll.classList.remove('text-gray-400');
        filterPending.classList.remove('ring-1', 'ring-gray-600', 'text-white');
    });
}

if(filterPending) {
    filterPending.addEventListener('click', () => {
        const pending = allUsers.filter(u => u.status === 'pending');
        renderTable(pending);
        filterPending.classList.add('ring-1', 'ring-gray-600', 'text-white');
        filterPending.classList.remove('text-gray-400');
        filterAll.classList.remove('ring-1', 'ring-gray-600', 'text-white');
    });
}