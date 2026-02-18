import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM Elements
const tableBody = document.getElementById('clientsTableBody');
const searchInput = document.getElementById('searchInput');
const filterStatus = document.getElementById('filterStatus');
const clientCount = document.getElementById('clientCount');
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
let unsubscribe = null; 

// --- UTILS: AVATAR & COLOR ---
const getInitials = (name) => {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
};

const getAvatarColor = (name) => {
    const colors = [
        'bg-red-900 text-red-200 border-red-700',
        'bg-blue-900 text-blue-200 border-blue-700',
        'bg-green-900 text-green-200 border-green-700',
        'bg-yellow-900 text-yellow-200 border-yellow-700',
        'bg-purple-900 text-purple-200 border-purple-700',
        'bg-pink-900 text-pink-200 border-pink-700',
        'bg-indigo-900 text-indigo-200 border-indigo-700'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

// 1. INIT
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    subscribeClients('active');
});

// 2. LISTENER
filterStatus.addEventListener('change', (e) => {
    subscribeClients(e.target.value);
});

function subscribeClients(status) {
    if (unsubscribe) unsubscribe();

    const q = query(
        collection(db, "clients"), 
        where("status", "==", status),
        orderBy("name")
    );

    tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500"><i class="fas fa-circle-notch fa-spin mr-2"></i> Cargando datos...</td></tr>`;

    unsubscribe = onSnapshot(q, (snapshot) => {
        clientsCache = [];
        snapshot.forEach(doc => clientsCache.push({ id: doc.id, ...doc.data() }));
        renderTable(clientsCache);
    });
}

// 3. RENDERIZADO (MEJORADO)
function renderTable(list) {
    const isArchivedView = filterStatus.value === 'archived';
    clientCount.textContent = `${list.length} registros encontrados`;

    if (list.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500 italic">No se encontraron clientes en esta vista.</td></tr>`;
        return;
    }

    tableBody.innerHTML = list.map(c => {
        const initials = getInitials(c.name);
        const colorClass = getAvatarColor(c.name);

        return `
        <tr class="hover:bg-white/5 transition border-b border-gray-800/50 group">
            
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border ${colorClass} shadow-sm">
                        ${initials}
                    </div>
                    <div>
                        <div class="font-bold text-white text-sm group-hover:text-soriano-gold transition">${c.name}</div>
                        <div class="text-[10px] text-gray-500 font-mono mt-0.5 bg-gray-900 inline-block px-1.5 rounded border border-gray-800">
                            ${c.idNum || 'SIN ID'}
                        </div>
                    </div>
                </div>
            </td>

            <td class="px-6 py-4">
                <div class="flex flex-col gap-1">
                    ${c.phone ? `<div class="text-sm text-gray-300 flex items-center gap-2"><i class="fas fa-phone text-gray-600 text-xs"></i> ${c.phone}</div>` : '<span class="text-gray-600 text-xs italic">Sin teléfono</span>'}
                    ${c.email ? `<div class="text-xs text-gray-500 flex items-center gap-2 truncate max-w-[150px]"><i class="fas fa-envelope text-gray-600 text-xs"></i> ${c.email}</div>` : ''}
                </div>
            </td>

            <td class="px-6 py-4 hidden md:table-cell">
                <span class="text-xs text-gray-400 truncate max-w-[200px] block" title="${c.address || ''}">
                    ${c.address || '<span class="italic opacity-50">No registrada</span>'}
                </span>
            </td>

            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    
                    <a href="cliente-detalle.html?id=${c.id}" 
                       class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 text-blue-400 hover:text-white hover:bg-blue-600 hover:border-blue-500 transition shadow-sm" 
                       title="Ver Ficha y Medidas">
                        <i class="fas fa-ruler-combined"></i>
                    </a>

                    <button onclick="window.editClient('${c.id}')" 
                       class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-500 transition shadow-sm" 
                       title="Editar Datos">
                        <i class="fas fa-pencil-alt"></i>
                    </button>

                    ${isArchivedView 
                        ? `<button onclick="window.toggleArchive('${c.id}', 'active')" class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 text-green-500 hover:bg-green-600 hover:text-white transition" title="Restaurar"><i class="fas fa-trash-restore"></i></button>`
                        : `<button onclick="window.toggleArchive('${c.id}', 'archived')" class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 text-gray-500 hover:bg-red-900/50 hover:text-red-400 hover:border-red-900 transition" title="Archivar"><i class="fas fa-archive"></i></button>`
                    }
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

// 4. GUARDAR
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // UI Feedback
    const submitBtn = form.querySelector('button[type="button"].btn-primary') || document.querySelector('#clientModal .btn-primary');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    submitBtn.disabled = true;

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
            await updateDoc(doc(db, "clients", id), data);
            // alert("Cliente actualizado."); // Opcional, mejor cerrar directo si es obvio
        } else {
            data.status = 'active';
            data.createdAt = serverTimestamp();
            const ref = await addDoc(collection(db, "clients"), data);
            
            if(confirm("Cliente creado exitosamente.\n¿Desea ir a la ficha para registrar medidas ahora?")) {
                window.location.href = `cliente-detalle.html?id=${ref.id}`;
                return;
            }
        }
        closeModal();
    } catch (error) {
        console.error(error);
        alert("Error al guardar: " + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

// 5. FUNCIONES GLOBALES
window.openModal = () => {
    form.reset();
    clientIdInput.value = "";
    modalTitle.textContent = "Nuevo Cliente";
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => nameInput.focus(), 100);
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

    modalTitle.textContent = "Editar Cliente";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.toggleArchive = async (id, newStatus) => {
    const action = newStatus === 'archived' ? "archivar" : "restaurar";
    if(confirm(`¿Desea ${action} este cliente?`)) {
        try {
            await updateDoc(doc(db, "clients", id), { status: newStatus });
        } catch (e) {
            console.error(e);
            alert("Error al actualizar estado.");
        }
    }
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };

// BUSCADOR INSTANTÁNEO
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = clientsCache.filter(c => 
        c.name.toLowerCase().includes(term) || 
        (c.idNum && c.idNum.includes(term))
    );
    renderTable(filtered);
});