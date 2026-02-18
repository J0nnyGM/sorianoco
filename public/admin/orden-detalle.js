import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { doc, getDoc, updateDoc, collection, getDocs, runTransaction, arrayUnion, writeBatch, increment, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- CONFIGURACIÓN UI ---
const statusLabels = { 'recibido': 'Recibido', 'en_proceso': 'En Proceso', 'procesado': 'Procesado', 'entregado': 'Entregado', 'anulada': 'Anulada' };
const statusColors = { 
    'recibido': 'bg-gray-800 text-gray-300 border-gray-600',
    'en_proceso': 'bg-blue-900/20 text-blue-300 border-blue-800',
    'procesado': 'bg-purple-900/20 text-purple-300 border-purple-800',
    'entregado': 'bg-green-900/20 text-green-300 border-green-800',
    'anulada': 'bg-red-900/20 text-red-300 border-red-800'
};

// --- DOM ELEMENTS ---
const orderTitle = document.getElementById('orderTitle');
const orderStatusBadge = document.getElementById('orderStatusBadge');
const clientInfo = document.getElementById('clientInfo');
const statusSelect = document.getElementById('statusSelect');
const updateStatusBtn = document.getElementById('updateStatusBtn');

// Paneles
const itemsList = document.getElementById('itemsList');
const measuresPanel = document.getElementById('measuresPanel');
const measuresGrid = document.getElementById('measuresGrid');
const materialsList = document.getElementById('materialsList');
const totalOrderValue = document.getElementById('totalOrderValue');
const totalProductionCost = document.getElementById('totalProductionCost');

// Finanzas
const financeTotal = document.getElementById('financeTotal');
const financePaid = document.getElementById('financePaid');
const financeBalance = document.getElementById('financeBalance');
const paymentHistoryList = document.getElementById('paymentHistoryList');

// Info
const dateDeadline = document.getElementById('dateDeadline');
const responsableName = document.getElementById('responsableName');

// Modal Material (BUSCADOR)
const materialModal = document.getElementById('addMaterialModal');
const materialSearch = document.getElementById('materialSearch');
const materialResults = document.getElementById('materialResults');
const selectedMaterialId = document.getElementById('selectedMaterialId');
const selectedMaterialDisplay = document.getElementById('selectedMaterialDisplay');
const selectedMaterialName = document.getElementById('selectedMaterialName');
const useQtyInput = document.getElementById('useQty');
const useUnitInput = document.getElementById('useUnit');
const stockDisplay = document.getElementById('stockAvailableDisplay');
const addMaterialForm = document.getElementById('addMaterialForm');

// Modal Pago
const payModal = document.getElementById('payModal');
const payForm = document.getElementById('payForm');
const payAmount = document.getElementById('payAmount');
const payAccount = document.getElementById('payAccount');
const modalCurrentDebt = document.getElementById('modalCurrentDebt');

// Utils
const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('id');
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

let currentOrderData = null;
let inventoryCache = []; // Cache local de materias primas

// --- 1. INICIALIZACIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) window.location.href = '../auth/login.html';
    getDoc(doc(db, "users", user.uid)).then(s => { if(s.exists()) updateSidebarUser(user, s.data()) });

    if (!orderId) { alert("ID inválido"); window.location.href = 'ordenes.html'; return; }

    await Promise.all([
        loadOrderDetails(),
        loadInventoryMaterials(),
        loadAccountsForPayment()
    ]);
});

// --- 2. CARGAR ORDEN ---
async function loadOrderDetails() {
    try {
        const docSnap = await getDoc(doc(db, "orders", orderId));
        if (!docSnap.exists()) { alert("Orden no encontrada"); return; }

        currentOrderData = docSnap.data();
        renderHeader(currentOrderData);
        renderItems(currentOrderData.items || []);
        renderMeasures(currentOrderData.appliedMeasures || {});
        renderMaterials(currentOrderData.materials || []);
        renderFinance(currentOrderData);

    } catch (e) { console.error("Error loading order:", e); }
}

function renderHeader(data) {
    orderTitle.textContent = `Orden #${data.orderNumber}`;
    clientInfo.textContent = data.clientName;
    statusSelect.value = data.status;
    
    const colorClass = statusColors[data.status] || 'bg-gray-800 text-gray-400';
    orderStatusBadge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${colorClass}`;
    orderStatusBadge.textContent = statusLabels[data.status] || data.status;

    dateDeadline.textContent = data.deadline;
    if (responsableName) {
        responsableName.textContent = data.responsableName || "Sin asignar";
        if(!data.responsableName) responsableName.classList.add('italic', 'text-gray-500');
    }
}

// ITEMS DE VENTA
function renderItems(items) {
    if (!items.length) {
        itemsList.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">No hay prendas registradas.</td></tr>`;
        return;
    }

    itemsList.innerHTML = items.map(item => {
        const imgHtml = item.imageUrl 
            ? `<img src="${item.imageUrl}" class="w-10 h-10 object-cover rounded border border-gray-700 cursor-pointer hover:scale-110 transition" onclick="window.open('${item.imageUrl}')">`
            : `<div class="w-10 h-10 rounded bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600"><i class="fas fa-tshirt"></i></div>`;

        return `
            <tr class="hover:bg-white/5 transition border-b border-gray-800/50">
                <td class="px-6 py-3">${imgHtml}</td>
                <td class="px-6 py-3 text-white font-bold text-center">${item.quantity}</td>
                <td class="px-6 py-3">
                    <div class="text-white text-sm font-medium">${item.description}</div>
                    <div class="text-[10px] text-gray-500">${item.size !== 'N/A' ? `Talla: <span class="text-gray-300">${item.size}</span>` : ''}</div>
                    ${item.notes ? `<div class="text-[10px] text-soriano-gold italic mt-0.5">${item.notes}</div>` : ''}
                </td>
                <td class="px-6 py-3 text-right text-gray-400 font-mono text-xs">${cop.format(item.unitPrice)}</td>
                <td class="px-6 py-3 text-right text-white font-mono text-sm font-bold">${cop.format(item.totalPrice)}</td>
            </tr>
        `;
    }).join('');
    totalOrderValue.textContent = cop.format(currentOrderData.totalAmount || 0);
}

// MEDIDAS
function renderMeasures(measures) {
    measuresPanel.classList.add('hidden');
    measuresGrid.innerHTML = '';
    if (!measures || Object.keys(measures).length === 0) return;

    let hasData = false;
    let html = '';
    const cats = ['chaqueta', 'pantalon', 'camisa', 'chaleco'];

    cats.forEach(cat => {
        const data = measures[cat];
        if (data) {
            const entries = Object.entries(data).filter(([k, v]) => v && v.toString().trim() !== "");
            if (entries.length > 0) {
                hasData = true;
                html += `
                    <div class="bg-gray-800/30 border border-gray-700 rounded p-3 relative group hover:border-soriano-gold/30 transition">
                        <div class="absolute top-0 right-0 bg-gray-800 text-[9px] uppercase font-bold px-2 py-1 rounded-bl text-soriano-gold border-l border-b border-gray-700 shadow-sm">${cat}</div>
                        <div class="grid grid-cols-2 gap-y-2 mt-3">
                            ${entries.map(([k, v]) => {
                                let label = k.split('_')[1] || k;
                                return `
                                    <div class="flex flex-col border-b border-gray-700/30 pb-1 mr-2 last:border-0">
                                        <span class="text-[9px] text-gray-500 uppercase tracking-wider font-bold">${label}</span>
                                        <span class="text-sm font-mono text-white">${v}</span>
                                    </div>`;
                            }).join('')}
                        </div>
                    </div>`;
            }
        }
    });

    if (hasData) {
        measuresGrid.innerHTML = html;
        measuresPanel.classList.remove('hidden');
    }
}

// MATERIALES (Lógica Costos)
function renderMaterials(mats) {
    if (!mats.length) {
        materialsList.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-xs text-gray-500 italic">No hay materiales registrados.</td></tr>`;
        totalProductionCost.textContent = "$0";
        return;
    }
    
    let totalCost = 0;
    materialsList.innerHTML = mats.map(m => {
        const cost = m.qty * m.costPerUnit;
        totalCost += cost;
        return `
            <tr class="border-b border-gray-800/50 hover:bg-white/5 transition">
                <td class="px-6 py-3 text-white font-medium text-sm">${m.name}</td>
                <td class="px-6 py-3 text-right text-gray-400 text-xs font-mono">${m.qty} ${m.unit}</td>
                <td class="px-6 py-3 text-right text-white font-mono text-sm">${cop.format(cost)}</td>
                <td class="px-6 py-3 text-center">
                    <button class="text-gray-600 hover:text-red-500 transition text-xs" title="Eliminar (No devuelve stock)" onclick="alert('Funcionalidad en desarrollo: Eliminar material')"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    totalProductionCost.textContent = cop.format(totalCost);
}

// FINANZAS
function renderFinance(data) {
    const total = data.totalAmount || 0;
    const balance = data.balanceDue || 0;
    const paid = total - balance;

    financeTotal.textContent = cop.format(total);
    financePaid.textContent = cop.format(paid);
    
    if (balance <= 0) {
        financeBalance.textContent = "PAGADO";
        financeBalance.classList.replace("text-red-500", "text-green-500");
    } else {
        financeBalance.textContent = cop.format(balance);
        financeBalance.classList.replace("text-green-500", "text-red-500");
    }

    if (data.paymentHistory && data.paymentHistory.length > 0) {
        paymentHistoryList.innerHTML = data.paymentHistory.map(p => {
            const date = new Date(p.date).toLocaleDateString();
            const typeLabel = p.type === 'advance' ? 'Anticipo' : 'Abono';
            return `
                <li class="flex justify-between border-b border-gray-800 pb-1.5 items-center last:border-0">
                    <span class="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-1.5">
                        <i class="fas fa-check-circle text-green-500 text-xs"></i> ${date}
                    </span>
                    <span class="font-mono text-xs text-white bg-gray-900 px-1.5 rounded border border-gray-800">${cop.format(p.amount)}</span>
                </li>
            `;
        }).join('');
    } else {
        paymentHistoryList.innerHTML = `<li class="text-xs text-gray-600 italic text-center py-2">Sin pagos registrados.</li>`;
    }
}

// --- 3. LÓGICA DE MATERIALES (BUSCADOR VISUAL) ---

// A. Elementos UI Adicionales (Asegurarse de tenerlos)
const selectedMaterialImage = document.getElementById('selectedMaterialImage');
const selectedMaterialIcon = document.getElementById('selectedMaterialIcon');
const selectedStockDisplay = document.getElementById('selectedStockDisplay'); // Nuevo elemento en HTML
const searchContainer = document.getElementById('searchContainer');

// B. Cargar Materias Primas en memoria
async function loadInventoryMaterials() {
    const q = query(collection(db, "inventory"), where("classification", "==", "material")); // Asegúrate que sea 'material' o 'materia_prima' según tu DB
    const snap = await getDocs(q);
    inventoryCache = [];
    snap.forEach(d => {
        const item = d.data();
        item.id = d.id;
        inventoryCache.push(item);
    });
}

// C. Renderizar Resultados
function renderSearchResults(items) {
    materialResults.innerHTML = '';
    
    if (items.length === 0) {
        materialResults.innerHTML = `<div class="p-4 text-xs text-gray-500 text-center italic">No se encontraron materiales.</div>`;
    } else {
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = "p-3 hover:bg-gray-800 cursor-pointer border-b border-gray-700 last:border-0 transition flex items-center gap-3 group";
            
            // Imagen miniatura en la lista
            const imgHtml = item.imageUrl 
                ? `<img src="${item.imageUrl}" class="w-8 h-8 rounded object-cover border border-gray-600 group-hover:border-soriano-gold">`
                : `<div class="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-gray-500 text-[10px]"><i class="fas fa-box"></i></div>`;

            div.innerHTML = `
                ${imgHtml}
                <div class="flex-1">
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-white font-bold group-hover:text-soriano-gold transition">${item.name}</span>
                        <span class="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded border border-gray-600">Stock: ${item.quantity}</span>
                    </div>
                    <div class="text-[10px] text-gray-500 font-mono mt-0.5 flex justify-between">
                        <span>SKU: ${item.sku || 'N/A'}</span>
                        <span>${item.unit}</span>
                    </div>
                </div>
            `;
            div.onclick = () => selectMaterial(item);
            materialResults.appendChild(div);
        });
    }
    materialResults.classList.remove('hidden');
}

// D. Eventos del Buscador
materialSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    if (term.length < 1) {
        renderSearchResults(inventoryCache.slice(0, 5)); // Mostrar sugerencias recientes/top si está vacío
        return;
    }
    const filtered = inventoryCache.filter(i => 
        i.name.toLowerCase().includes(term) || 
        (i.sku && i.sku.toLowerCase().includes(term))
    );
    renderSearchResults(filtered);
});

// ABRIR AL PRESIONAR (FOCUS)
materialSearch.addEventListener('focus', () => {
    // Si no hay texto, mostrar los primeros 10 items como sugerencia
    if(!materialSearch.value) {
        renderSearchResults(inventoryCache.slice(0, 10));
    } else {
        // Si hay texto, disparar el evento input para filtrar
        materialSearch.dispatchEvent(new Event('input'));
    }
});

// Ocultar resultados si hago click fuera
document.addEventListener('click', (e) => {
    // Si el click NO fue en el input NI en los resultados
    if (!materialSearch.contains(e.target) && !materialResults.contains(e.target)) {
        materialResults.classList.add('hidden');
    }
});

// E. Selección de Material
function selectMaterial(item) {
    selectedMaterialId.value = item.id;
    selectedMaterialName.textContent = item.name;
    useUnitInput.value = item.unit;
    
    // Actualizar Stock en UI
    if(selectedStockDisplay) selectedStockDisplay.textContent = `Stock: ${item.quantity} ${item.unit}`;
    
    // Manejo de Imagen Grande
    if (item.imageUrl) {
        selectedMaterialImage.src = item.imageUrl;
        selectedMaterialImage.classList.remove('hidden');
        selectedMaterialIcon.classList.add('hidden');
    } else {
        selectedMaterialImage.src = "";
        selectedMaterialImage.classList.add('hidden');
        selectedMaterialIcon.classList.remove('hidden');
    }

    // Configurar input
    useQtyInput.max = item.quantity;
    useQtyInput.value = "";
    
    // UI Toggle: Ocultar buscador, mostrar selección
    materialSearch.value = "";
    materialResults.classList.add('hidden');
    searchContainer.classList.add('hidden'); // Ocultar input buscador
    selectedMaterialDisplay.classList.remove('hidden');
    selectedMaterialDisplay.classList.add('flex');
    
    setTimeout(() => useQtyInput.focus(), 100);
}

window.clearMaterialSelection = () => {
    selectedMaterialId.value = "";
    selectedMaterialName.textContent = "";
    useUnitInput.value = "";
    
    // Reset Imagen
    selectedMaterialImage.src = "";
    
    // UI Toggle: Mostrar buscador, ocultar selección
    selectedMaterialDisplay.classList.add('hidden');
    selectedMaterialDisplay.classList.remove('flex');
    searchContainer.classList.remove('hidden'); // Mostrar input buscador nuevamente
    
    materialSearch.focus(); // Volver foco al buscador
};

// UI Modales
window.openMaterialModal = () => {
    addMaterialForm.reset();
    clearMaterialSelection();
    
    // Mostrar modal
    materialModal.classList.remove('hidden'); 
    materialModal.classList.add('flex');
    
    // Asegurar que el input sea visible
    searchContainer.classList.remove('hidden');
    
    // CORRECCIÓN: Eliminamos el 'materialSearch.focus()' automático.
    // Ahora el usuario debe tocar el input manualmente para que se despliegue la lista.
};
window.closeMaterialModal = () => { materialModal.classList.add('hidden'); materialModal.classList.remove('flex'); };

// --- 4. PAGOS ---
async function loadAccountsForPayment() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"));
    const snap = await getDocs(q);
    payAccount.innerHTML = '<option value="">Seleccionar cuenta...</option>';
    snap.forEach(d => {
        payAccount.appendChild(new Option(d.data().name, d.id));
    });
}
// ... (El resto de la lógica de pagos se mantiene igual, ya funcionaba) ...

window.openPayModal = () => {
    payForm.reset();
    const debt = currentOrderData.balanceDue || 0;
    if (debt <= 0) { alert("Orden pagada."); return; }
    modalCurrentDebt.textContent = cop.format(debt);
    payAmount.value = cop.format(debt); 
    payModal.classList.remove('hidden'); payModal.classList.add('flex');
};
window.closePayModal = () => { payModal.classList.add('hidden'); payModal.classList.remove('flex'); };
window.formatCurrencyInput = (i) => { let v = i.value.replace(/\D/g, ''); i.value = v ? cop.format(parseInt(v)) : ''; };

payForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawAmt = payAmount.value.replace(/\D/g, '');
    const amount = parseInt(rawAmt) || 0;
    const accId = payAccount.value;
    
    if (amount <= 0 || !accId) return;
    if (amount > (currentOrderData.balanceDue || 0)) { alert("Monto excede deuda"); return; }
    if(!confirm("¿Registrar pago?")) return;

    try {
        const batch = writeBatch(db);
        const orderRef = doc(db, "orders", orderId);
        const accRef = doc(db, "accounts", accId);

        batch.update(orderRef, {
            balanceDue: increment(-amount),
            paymentHistory: arrayUnion({ amount, accountId: accId, date: new Date().toISOString(), type: 'partial_payment' })
        });
        batch.update(accRef, { balance: increment(amount) });
        batch.set(doc(collection(db, "transactions")), {
            accountId: accId, type: 'income', amount, description: `Abono Orden #${currentOrderData.orderNumber}`, relatedDocId: orderId, date: serverTimestamp()
        });

        await batch.commit();
        closePayModal();
        loadOrderDetails();
        alert("Pago registrado.");
    } catch (e) { console.error(e); alert("Error al registrar pago"); }
});

// STATUS UPDATE
updateStatusBtn.addEventListener('click', async () => {
    const newStatus = statusSelect.value;
    updateStatusBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus, updatedAt: serverTimestamp() });
        const colorClass = statusColors[newStatus] || 'bg-gray-800 text-gray-400';
        orderStatusBadge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${colorClass}`;
        orderStatusBadge.textContent = statusLabels[newStatus] || newStatus;
        updateStatusBtn.innerHTML = '<i class="fas fa-check text-green-500"></i>';
        setTimeout(() => updateStatusBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
    } catch (e) { alert("Error updating status"); updateStatusBtn.innerHTML = '<i class="fas fa-save"></i>'; }
});