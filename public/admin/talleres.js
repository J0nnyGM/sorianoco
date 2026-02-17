import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM
const tableBody = document.getElementById('externalTableBody');
const modal = document.getElementById('externalModal');
const form = document.getElementById('externalForm');
const modalTitle = document.getElementById('modalTitle');
const orderSelect = document.getElementById('orderSelect');
const workshopSelect = document.getElementById('workshopSelect');

// Inputs
const idInput = document.getElementById('processId');
const serviceInput = document.getElementById('serviceType');
const costInput = document.getElementById('estimatedCost');
const dateOutInput = document.getElementById('dateOut');
const dateReturnInput = document.getElementById('dateReturn');
const notesInput = document.getElementById('notes');

// Init
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    await loadOptions();
    subscribeJobs();
    
    dateOutInput.valueAsDate = new Date();
});

// 1. Cargar Selects
async function loadOptions() {
    // A. Órdenes (Solo activas)
    const ordersSnap = await getDocs(query(collection(db, "orders"), where("status", "!=", "entregado")));
    orderSelect.innerHTML = '<option value="">Seleccionar Orden...</option>';
    ordersSnap.forEach(d => {
        const o = d.data();
        orderSelect.innerHTML += `<option value="${d.id}" data-garment="${o.garment}">#${o.orderNumber} - ${o.clientName}</option>`;
    });

    // B. Talleres (Desde Proveedores)
    // Nota: Filtramos en JS si no tenemos índice compuesto creado en Firebase, 
    // o traemos todos si son pocos. Aquí intentamos traer todos y filtrar visualmente.
    const suppliersSnap = await getDocs(query(collection(db, "suppliers"), orderBy("companyName")));
    workshopSelect.innerHTML = '<option value="">Seleccionar Taller...</option>';
    suppliersSnap.forEach(d => {
        const s = d.data();
        // Filtramos solo los que pueden servir de taller
        if (['taller', 'servicios', 'maquinaria'].includes(s.category)) {
            workshopSelect.innerHTML += `<option value="${d.id}">${s.companyName}</option>`;
        }
    });
}

// 2. Realtime Listener
function subscribeJobs() {
    const q = query(collection(db, "external_jobs"), orderBy("dateOut", "desc"));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No hay procesos externos activos.</td></tr>`;
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            
            // Estado: Si ya pasó la fecha de retorno y no está recibido
            let statusBadge = `<span class="text-orange-400"><i class="fas fa-clock"></i> En proceso</span>`;
            if (data.status === 'recibido') {
                statusBadge = `<span class="text-green-400"><i class="fas fa-check"></i> Recibido</span>`;
            } else {
                const today = new Date().toISOString().split('T')[0];
                if (data.dateReturn < today) {
                    statusBadge = `<span class="text-red-500 font-bold animate-pulse"><i class="fas fa-exclamation-circle"></i> Atrasado</span>`;
                }
            }

            return `
                <tr class="hover:bg-gray-800/50 transition-colors border-b border-gray-800/50">
                    <td class="px-6 py-4">
                        <div class="text-white font-medium">${data.orderNumber || 'S/N'}</div>
                        <div class="text-xs text-gray-400">${data.garmentInfo || ''}</div>
                    </td>
                    <td class="px-6 py-4 text-gray-300">
                        ${data.workshopName}
                    </td>
                    <td class="px-6 py-4 capitalize text-sm text-gray-400">
                        ${data.service}
                    </td>
                    <td class="px-6 py-4 text-right text-gray-300 font-mono text-xs">
                        ${data.dateReturn}
                    </td>
                    <td class="px-6 py-4 text-right text-xs">
                        ${statusBadge}
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                        ${data.status !== 'recibido' ? `
                        <button onclick="window.markReceived('${doc.id}', '${data.estimatedCost}', '${data.workshopName}', '${data.service}')" 
                            class="text-green-500 hover:text-green-400 transition p-2 border border-green-900 bg-green-900/20 rounded" title="Marcar Recibido">
                            Recibir
                        </button>` : ''}
                        
                        <button onclick="window.deleteJob('${doc.id}')" 
                            class="text-gray-600 hover:text-red-500 transition p-2">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

// 3. Registrar Salida
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Obtener textos de los selects
    const orderOption = orderSelect.options[orderSelect.selectedIndex];
    const workshopOption = workshopSelect.options[workshopSelect.selectedIndex];

    const data = {
        orderId: orderSelect.value,
        orderNumber: orderOption.text.split(' - ')[0], // Extraer #ORD
        garmentInfo: orderOption.dataset.garment || '',
        
        workshopId: workshopSelect.value,
        workshopName: workshopOption.text,
        
        service: serviceInput.value,
        estimatedCost: parseFloat(costInput.value || 0),
        dateOut: dateOutInput.value,
        dateReturn: dateReturnInput.value,
        notes: notesInput.value,
        
        status: 'en_proceso',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "external_jobs"), data);
        closeModal();
    } catch (error) {
        console.error("Error:", error);
        alert("Error al registrar salida.");
    }
});

// 4. Marcar como Recibido (Y crear Gasto Automático)
window.markReceived = async (id, cost, workshop, service) => {
    if(!confirm("¿Confirmar que la prenda regresó al taller? Esto registrará el gasto automáticamente.")) return;

    try {
        // A. Actualizar estado del trabajo
        await updateDoc(doc(db, "external_jobs", id), {
            status: 'recibido',
            receivedAt: serverTimestamp()
        });

        // B. Crear el Gasto Automáticamente (Integración Financiera)
        // Solo si hay costo
        if (cost > 0) {
            await addDoc(collection(db, "expenses"), {
                date: new Date().toISOString().split('T')[0],
                category: 'taller_externo',
                description: `Servicio ${service} - ${workshop}`,
                amount: parseFloat(cost),
                createdAt: serverTimestamp()
            });
            alert("Proceso recibido y gasto registrado.");
        } else {
            alert("Proceso marcado como recibido.");
        }

    } catch (error) {
        console.error(error);
        alert("Error al recibir.");
    }
};

// UI
window.openModal = () => {
    form.reset();
    dateOutInput.valueAsDate = new Date();
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
window.deleteJob = async (id) => { if(confirm("¿Eliminar registro?")) await deleteDoc(doc(db, "external_jobs", id)); };