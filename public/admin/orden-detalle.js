import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { doc, getDoc, updateDoc, collection, getDocs, runTransaction, arrayUnion, writeBatch, increment, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- ELEMENTOS DOM ---
const orderTitle = document.getElementById('orderTitle');
const orderStatusBadge = document.getElementById('orderStatusBadge');
const clientInfo = document.getElementById('clientInfo');
const statusSelect = document.getElementById('statusSelect');
const updateStatusBtn = document.getElementById('updateStatusBtn');

// Paneles y Tablas
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

// Modal Material
const materialModal = document.getElementById('addMaterialModal');
const materialSelect = document.getElementById('materialSelect');
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
let inventoryMap = {};

// --- 1. INICIALIZACIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) window.location.href = '../auth/login.html';
    
    getDoc(doc(db, "users", user.uid)).then(s => { if(s.exists()) updateSidebarUser(user, s.data()) });

    if (!orderId) { alert("Sin ID de orden"); window.location.href = 'ordenes.html'; return; }

    await Promise.all([
        loadOrderDetails(),
        loadInventoryOptions(), // Carga solo materias primas para costos
        loadAccountsForPayment() // Carga cuentas para abonos
    ]);
});

// --- 2. CARGAR ORDEN ---
async function loadOrderDetails() {
    try {
        const docRef = doc(db, "orders", orderId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) { alert("Orden no encontrada"); return; }

        currentOrderData = docSnap.data();
        renderHeader(currentOrderData);
        renderItems(currentOrderData.items || []);
        renderMeasures(currentOrderData.appliedMeasures || {});
        renderMaterials(currentOrderData.materials || []);
        renderFinance(currentOrderData);

    } catch (error) {
        console.error("Error loading order:", error);
    }
}

function renderHeader(data) {
    orderTitle.textContent = `Orden #${data.orderNumber}`;
    clientInfo.textContent = `Cliente: ${data.clientName}`;
    statusSelect.value = data.status;
    orderStatusBadge.textContent = data.status.toUpperCase();
    dateDeadline.textContent = data.deadline;
    // responsableName.textContent = data.assignedTo || "Sin asignar";
}

// A. PRENDAS VENDIDAS
function renderItems(items) {
    if (!items.length) {
        itemsList.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Sin ítems.</td></tr>`;
        return;
    }

    itemsList.innerHTML = items.map(item => {
        // Imagen
        const imgHtml = item.imageUrl 
            ? `<img src="${item.imageUrl}" class="w-10 h-10 object-cover rounded border border-gray-600 cursor-pointer hover:scale-150 transition" onclick="window.open('${item.imageUrl}')">`
            : `<div class="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-600"><i class="fas fa-tshirt"></i></div>`;

        return `
            <tr class="hover:bg-gray-800/30 border-b border-gray-800/50">
                <td class="px-6 py-3">${imgHtml}</td>
                <td class="px-6 py-3 text-white font-bold text-center">${item.quantity}</td>
                <td class="px-6 py-3">
                    <div class="text-white text-sm font-medium">${item.description}</div>
                    <div class="text-[10px] text-gray-500">${item.size !== 'N/A' ? 'Talla: '+item.size : ''}</div>
                    ${item.notes ? `<div class="text-[10px] text-soriano-gold italic">${item.notes}</div>` : ''}
                </td>
                <td class="px-6 py-3 text-right text-gray-400 font-mono text-xs">${cop.format(item.unitPrice)}</td>
                <td class="px-6 py-3 text-right text-white font-mono text-sm">${cop.format(item.totalPrice)}</td>
            </tr>
        `;
    }).join('');

    totalOrderValue.textContent = cop.format(currentOrderData.totalAmount || 0);
}

// B. MEDIDAS CLIENTE
function renderMeasures(measures) {
    measuresPanel.classList.add('hidden');
    measuresGrid.innerHTML = '';
    if (!measures || Object.keys(measures).length === 0) return;

    let htmlContent = '';
    let hasValidData = false;
    const categories = ['chaqueta', 'pantalon', 'camisa', 'chaleco'];

    categories.forEach(cat => {
        const catData = measures[cat];
        if (catData) {
            const validEntries = Object.entries(catData).filter(([key, value]) => value && value.toString().trim() !== "");
            if (validEntries.length > 0) {
                hasValidData = true;
                htmlContent += `
                    <div class="bg-gray-800/30 border border-gray-700 rounded p-3 relative">
                        <div class="absolute top-0 right-0 bg-gray-800 text-[10px] uppercase font-bold px-2 py-1 rounded-bl text-soriano-gold border-l border-b border-gray-700 shadow-sm">${cat}</div>
                        <div class="grid grid-cols-2 gap-y-2 mt-3">
                `;
                validEntries.forEach(([key, value]) => {
                    let label = key.split('_')[1] || key;
                    label = label.charAt(0).toUpperCase() + label.slice(1);
                    htmlContent += `
                        <div class="flex flex-col border-b border-gray-700/50 pb-1 mr-2 last:border-0">
                            <span class="text-[9px] text-gray-500 uppercase tracking-wider">${label}</span>
                            <span class="text-sm font-mono text-white font-bold">${value}</span>
                        </div>
                    `;
                });
                htmlContent += `</div></div>`;
            }
        }
    });

    if (hasValidData) {
        measuresGrid.innerHTML = htmlContent;
        measuresPanel.classList.remove('hidden');
    }
}

// C. MATERIALES (COSTOS)
function renderMaterials(mats) {
    if (!mats.length) {
        materialsList.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-500 text-xs">Sin materiales registrados.</td></tr>`;
        totalProductionCost.textContent = "$0";
        return;
    }
    let totalCost = 0;
    materialsList.innerHTML = mats.map(m => {
        const cost = m.qty * m.costPerUnit;
        totalCost += cost;
        return `
            <tr class="border-b border-gray-800/50">
                <td class="px-6 py-2 text-white">${m.name}</td>
                <td class="px-6 py-2 text-right text-gray-400">${m.qty} ${m.unit}</td>
                <td class="px-6 py-2 text-right text-gray-500 font-mono text-xs">${cop.format(cost)}</td>
            </tr>
        `;
    }).join('');
    totalProductionCost.textContent = cop.format(totalCost);
}

// D. FINANZAS Y PAGOS
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
            let typeLabel = p.type === 'advance' ? 'Anticipo' : 'Abono';
            return `
                <li class="flex justify-between border-b border-gray-800 pb-1">
                    <span><i class="fas fa-check-circle text-green-500 mr-1"></i> ${date} - ${typeLabel}</span>
                    <span class="font-mono text-white">${cop.format(p.amount)}</span>
                </li>
            `;
        }).join('');
    } else if (data.advancePayment > 0) {
        paymentHistoryList.innerHTML = `<li class="flex justify-between"><span>Anticipo Inicial</span><span class="font-mono text-white">${cop.format(data.advancePayment)}</span></li>`;
    } else {
        paymentHistoryList.innerHTML = `<li class="text-gray-600 italic">Sin pagos registrados.</li>`;
    }
}

// --- 3. GESTIÓN DE PAGOS (ABONOS) ---
async function loadAccountsForPayment() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"));
    const snap = await getDocs(q);
    payAccount.innerHTML = '<option value="">Seleccionar cuenta...</option>';
    snap.forEach(doc => {
        const acc = doc.data();
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = `${acc.name} (${acc.type})`;
        payAccount.appendChild(opt);
    });
}

window.openPayModal = () => {
    payForm.reset();
    const debt = currentOrderData.balanceDue || 0;
    if (debt <= 0) { alert("Esta orden ya está pagada."); return; }
    
    modalCurrentDebt.textContent = cop.format(debt);
    payAmount.value = cop.format(debt); 
    payModal.classList.remove('hidden'); payModal.classList.add('flex');
};

window.closePayModal = () => { payModal.classList.add('hidden'); payModal.classList.remove('flex'); };

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

        // 1. Actualizar Orden
        batch.update(orderRef, {
            balanceDue: increment(-amount),
            paymentHistory: arrayUnion({ amount, accountId: accId, date: new Date().toISOString(), type: 'partial_payment' })
        });

        // 2. Sumar a Cuenta
        batch.update(accRef, { balance: increment(amount) });

        // 3. Crear Transacción (Extracto)
        batch.set(doc(collection(db, "transactions")), {
            accountId: accId,
            type: 'income',
            amount: amount,
            description: `Abono Orden #${currentOrderData.orderNumber}`,
            relatedDocId: orderId,
            date: serverTimestamp()
        });

        await batch.commit();
        closePayModal();
        loadOrderDetails();
        alert("Pago registrado.");
    } catch (e) { console.error(e); alert("Error al registrar pago"); }
});

// --- 4. GESTIÓN MATERIALES ---
async function loadInventoryOptions() {
    // Filtrar solo Materias Primas para costos
    const q = query(collection(db, "inventory"), where("classification", "==", "materia_prima"));
    const snap = await getDocs(q);
    materialSelect.innerHTML = '<option value="" disabled selected>Seleccionar...</option>';
    snap.forEach(d => {
        const item = d.data();
        inventoryMap[d.id] = item;
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${item.name} (${item.quantity} ${item.unit})`;
        materialSelect.appendChild(opt);
    });
}

materialSelect.addEventListener('change', () => {
    const item = inventoryMap[materialSelect.value];
    if (item) { useUnitInput.value = item.unit; stockDisplay.textContent = `Stock: ${item.quantity} ${item.unit}`; useQtyInput.max = item.quantity; }
});

addMaterialForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const matId = materialSelect.value;
    const qty = parseFloat(useQtyInput.value);
    const itemData = inventoryMap[matId];

    if (!itemData || qty <= 0) return;
    if (qty > itemData.quantity) { alert("Stock insuficiente."); return; }

    try {
        await runTransaction(db, async (t) => {
            const invRef = doc(db, "inventory", matId);
            const ordRef = doc(db, "orders", orderId);
            
            const invDoc = await t.get(invRef);
            if (!invDoc.exists()) throw "Material no existe";
            if (invDoc.data().quantity < qty) throw "Stock insuficiente";

            t.update(invRef, { quantity: invDoc.data().quantity - qty });
            t.update(ordRef, {
                materials: arrayUnion({
                    materialId: matId, name: itemData.name, qty: qty, unit: itemData.unit, costPerUnit: itemData.cost, addedAt: new Date().toISOString()
                })
            });
        });
        closeMaterialModal(); loadOrderDetails(); loadInventoryOptions();
        alert("Material agregado.");
    } catch (e) { console.error(e); alert("Error: " + e); }
});

// UI Utils
window.openMaterialModal = () => { addMaterialForm.reset(); stockDisplay.textContent = "-"; materialModal.classList.remove('hidden'); materialModal.classList.add('flex'); };
window.closeMaterialModal = () => { materialModal.classList.add('hidden'); materialModal.classList.remove('flex'); };
window.formatCurrencyInput = (input) => { 
    let val = input.value.replace(/\D/g, ''); 
    if (val === '') { input.value = ''; return; } 
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(val)); 
};

// Update Status
updateStatusBtn.addEventListener('click', async () => {
    const newStatus = statusSelect.value;
    try {
        updateStatusBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
        orderStatusBadge.textContent = newStatus.toUpperCase();
        updateStatusBtn.innerHTML = '<i class="fas fa-check text-green-500"></i>';
        setTimeout(() => updateStatusBtn.innerHTML = '<i class="fas fa-save"></i>', 2000);
    } catch (error) { console.error(error); }
});