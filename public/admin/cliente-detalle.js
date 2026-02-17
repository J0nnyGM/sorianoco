import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

const urlParams = new URLSearchParams(window.location.search);
const clientId = urlParams.get('id');

// UI Elements
const viewName = document.getElementById('viewName');
const viewIdNum = document.getElementById('viewIdNum');
const viewLtv = document.getElementById('viewLtv');
const ordersList = document.getElementById('ordersHistoryList');

// Inputs Contacto
const viewPhone = document.getElementById('viewPhone');
const viewEmail = document.getElementById('viewEmail');
const viewAddress = document.getElementById('viewAddress');
const saveContactBtn = document.getElementById('saveContactBtn');

// Form Medidas
const measuresForm = document.getElementById('measuresForm');
const notesInput = document.getElementById('clientNotes');

// CONFIGURACIÓN DE CAMPOS (Sin Talla ni Tela)
const measureFields = {
    chaqueta: ['chk_pecho', 'chk_cintura', 'chk_espalda', 'chk_manga', 'chk_hombro', 'chk_contorno'],
    pantalon: ['pan_cintura', 'pan_base', 'pan_pierna', 'pan_largo', 'pan_entube'],
    camisa:   ['cam_cuello', 'cam_manga', 'cam_largo', 'cam_modelo'],
    chaleco:  ['cha_pecho', 'cha_hombro', 'cha_contorno']
};

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// Init
onAuthStateChanged(auth, async (user) => {
    if (!user) window.location.href = '../auth/login.html';
    getDoc(doc(db, "users", user.uid)).then(s => { if(s.exists()) updateSidebarUser(user, s.data()) });

    if(!clientId) { alert("Cliente no especificado"); window.location.href = "clientes.html"; return; }

    await Promise.all([loadClientData(), loadClientOrders()]);
});

// 1. Cargar Datos Cliente
async function loadClientData() {
    const snap = await getDoc(doc(db, "clients", clientId));
    if (!snap.exists()) { alert("Cliente no encontrado"); return; }
    
    const data = snap.data();
    viewName.textContent = data.name;
    viewIdNum.textContent = `NIT/CC: ${data.idNum || '-'}`;
    
    viewPhone.value = data.phone || '';
    viewEmail.value = data.email || '';
    viewAddress.value = data.address || '';
    notesInput.value = data.notes || '';

    // Llenar Medidas
    if (data.measures) {
        for (const [cat, fields] of Object.entries(measureFields)) {
            if (data.measures[cat]) {
                for (const [key, val] of Object.entries(data.measures[cat])) {
                    const el = document.getElementById(key);
                    if(el) el.value = val;
                }
            }
        }
    }
}

// 2. Cargar Historial Órdenes
async function loadClientOrders() {
    const q = query(collection(db, "orders"), where("clientId", "==", clientId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    
    if (snap.empty) {
        ordersList.innerHTML = `<p class="text-xs text-gray-500 text-center py-2">Sin órdenes registradas.</p>`;
        viewLtv.textContent = "$0";
        return;
    }

    let totalSpent = 0;
    ordersList.innerHTML = snap.docs.map(d => {
        const order = d.data();
        totalSpent += (order.totalAmount || 0);
        
        const statusColor = order.status === 'entregado' ? 'text-green-500' : 'text-yellow-500';
        const date = order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : '-';

        // Lógica para resumen de ítems
        let summary = 'Varios';
        if (order.items && order.items.length === 1) summary = order.items[0].description;
        else if (order.items) summary = `${order.items.length} Prendas`;

        return `
            <a href="orden-detalle.html?id=${d.id}" class="block bg-gray-900 hover:bg-gray-800 p-3 rounded border border-gray-700 transition">
                <div class="flex justify-between mb-1">
                    <span class="text-sm font-bold text-white">#${order.orderNumber}</span>
                    <span class="text-[10px] uppercase border border-gray-600 px-1 rounded ${statusColor}">${order.status}</span>
                </div>
                <div class="text-xs text-gray-400 mb-1">${summary}</div>
                <div class="flex justify-between text-xs text-gray-500">
                    <span>${date}</span>
                    <span class="text-white font-mono">${cop.format(order.totalAmount)}</span>
                </div>
            </a>
        `;
    }).join('');

    viewLtv.textContent = cop.format(totalSpent);
}

// 3. Guardar Medidas
measuresForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const measuresObj = {};
    
    // Recolectar solo campos definidos (Sin talla/tela)
    for (const [category, fields] of Object.entries(measureFields)) {
        measuresObj[category] = {};
        fields.forEach(id => {
            const el = document.getElementById(id);
            if(el) measuresObj[category][id] = el.value;
        });
    }

    try {
        await updateDoc(doc(db, "clients", clientId), {
            measures: measuresObj,
            notes: notesInput.value
        });
        alert("Ficha de medidas actualizada correctamente.");
    } catch (error) { console.error(error); alert("Error al guardar ficha."); }
});

// 4. Guardar Contacto
saveContactBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        await updateDoc(doc(db, "clients", clientId), {
            phone: viewPhone.value,
            email: viewEmail.value,
            address: viewAddress.value
        });
        alert("Datos de contacto actualizados.");
    } catch (error) { console.error(error); alert("Error al guardar contacto."); }
});