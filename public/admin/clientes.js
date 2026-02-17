import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM Elements
const tableBody = document.getElementById('clientsTableBody');
const searchInput = document.getElementById('searchInput');
const filterStatus = document.getElementById('filterStatus');
const modal = document.getElementById('clientModal');
const form = document.getElementById('clientForm');
const modalTitle = document.getElementById('modalTitle');

// Inputs Form
const clientIdInput = document.getElementById('clientId');
const nameInput = document.getElementById('clientName');
const idNumInput = document.getElementById('clientIdNum');
const phoneInput = document.getElementById('clientPhone');
const emailInput = document.getElementById('clientEmail');
const addressInput = document.getElementById('clientAddress');

let clientsCache = [];
let unsubscribe = null; // Para detener el listener anterior al cambiar filtro

// 1. INIT
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    subscribeClients('active'); // Cargar activos por defecto
});

// 2. LISTENER INTELIGENTE (FILTRO)
filterStatus.addEventListener('change', (e) => {
    subscribeClients(e.target.value);
});

function subscribeClients(status) {
    if (unsubscribe) unsubscribe(); // Detener listener previo

    // Nota: status puede ser 'active' o 'archived'
    // Si tus clientes viejos no tienen el campo 'status', Firebase los tratará como si no existieran en este query.
    // Para arreglar eso, asumiremos que si no tiene status, es active (o corre un script para actualizar DB).
    // Por ahora, usaremos filtro en cliente para compatibilidad o query simple.
    
    // ESTRATEGIA COMPATIBLE: Traer todo y filtrar en memoria si son pocos (<2000), 
    // o query estricto. Usaremos query estricto asumiendo que al crear guardamos status='active'.
    
    const q = query(
        collection(db, "clients"), 
        where("status", "==", status),
        orderBy("name")
    );

    tableBody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-500"><i class="fas fa-circle-notch fa-spin"></i> Cargando...</td></tr>`;

    unsubscribe = onSnapshot(q, (snapshot) => {
        clientsCache = [];
        snapshot.forEach(doc => clientsCache.push({ id: doc.id, ...doc.data() }));
        renderTable(clientsCache);
    });
}

// 3. RENDERIZADO
function renderTable(list) {
    const isArchivedView = filterStatus.value === 'archived';

    if (list.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-500">No hay clientes en esta vista.</td></tr>`;
        return;
    }

    tableBody.innerHTML = list.map(c => `
        <tr class="hover:bg-gray-800/50 transition-colors border-b border-gray-800/50">
            <td class="px-6 py-4">
                <div class="font-bold text-white text-lg">${c.name}</div>
                <div class="text-xs text-gray-500">${c.idNum || 'Sin ID'}</div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-300">
                <div class="flex items-center gap-2"><i class="fas fa-phone text-gray-600"></i> ${c.phone || '-'}</div>
                <div class="text-xs text-gray-500">${c.email || ''}</div>
            </td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
                
                <a href="cliente-detalle.html?id=${c.id}" 
                   class="w-8 h-8 flex items-center justify-center rounded bg-gray-800 text-blue-400 hover:text-white hover:bg-blue-600 transition" 
                   title="Ver Ficha y Medidas">
                    <i class="fas fa-eye"></i>
                </a>

                <button onclick="window.editClient('${c.id}')" 
                   class="w-8 h-8 flex items-center justify-center rounded bg-gray-800 text-soriano-gold hover:text-white hover:bg-soriano-gold transition" 
                   title="Editar Datos Básicos">
                    <i class="fas fa-pencil-alt"></i>
                </button>

                ${isArchivedView 
                    ? `<button onclick="window.toggleArchive('${c.id}', 'active')" class="w-8 h-8 rounded bg-gray-800 text-green-500 hover:bg-green-600 hover:text-white transition" title="Restaurar"><i class="fas fa-trash-restore"></i></button>`
                    : `<button onclick="window.toggleArchive('${c.id}', 'archived')" class="w-8 h-8 rounded bg-gray-800 text-gray-500 hover:bg-red-600 hover:text-white transition" title="Archivar"><i class="fas fa-archive"></i></button>`
                }
            </td>
        </tr>
    `).join('');
}

// 4. GUARDAR (CREAR O EDITAR)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = clientIdInput.value;
    const data = {
        name: nameInput.value,
        idNum: idNumInput.value,
        phone: phoneInput.value,
        email: emailInput.value,
        address: addressInput.value,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            // EDITAR
            await updateDoc(doc(db, "clients", id), data);
            alert("Cliente actualizado.");
        } else {
            // CREAR
            data.status = 'active'; // Por defecto activo
            data.createdAt = serverTimestamp();
            const ref = await addDoc(collection(db, "clients"), data);
            
            if(confirm("Cliente creado. ¿Ir a ficha de medidas?")) {
                window.location.href = `cliente-detalle.html?id=${ref.id}`;
                return;
            }
        }
        closeModal();
    } catch (error) {
        console.error(error);
        alert("Error al guardar.");
    }
});

// 5. FUNCIONES GLOBALES
window.openModal = () => {
    form.reset();
    clientIdInput.value = "";
    modalTitle.textContent = "Nuevo Cliente";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.editClient = (id) => {
    const client = clientsCache.find(c => c.id === id);
    if (!client) return;

    clientIdInput.value = client.id;
    nameInput.value = client.name;
    idNumInput.value = client.idNum || "";
    phoneInput.value = client.phone || "";
    emailInput.value = client.email || "";
    addressInput.value = client.address || "";

    modalTitle.textContent = "Editar Datos";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.toggleArchive = async (id, newStatus) => {
    const action = newStatus === 'archived' ? "archivar" : "restaurar";
    if(confirm(`¿Desea ${action} este cliente?`)) {
        try {
            await updateDoc(doc(db, "clients", id), { status: newStatus });
            // La tabla se actualiza sola por el snapshot
        } catch (e) {
            console.error(e);
            alert("Error al actualizar estado.");
        }
    }
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };

// BUSCADOR (Filtrado Local sobre la lista actual)
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = clientsCache.filter(c => 
        c.name.toLowerCase().includes(term) || 
        (c.idNum && c.idNum.includes(term))
    );
    renderTable(filtered);
});