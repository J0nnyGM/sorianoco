import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, doc, query, orderBy, where, getDocs, limit, startAfter, startAt, serverTimestamp, writeBatch, increment, arrayUnion, getDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const ordersGrid = document.getElementById('ordersGrid');
const searchInput = document.getElementById('searchInput');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');

// Modal Pago
const payModal = document.getElementById('payModal');
const payForm = document.getElementById('payForm');
const payOrderId = document.getElementById('payOrderId');
const payBalanceDisplay = document.getElementById('payBalanceDisplay');
const payAmount = document.getElementById('payAmount');
const payAccount = document.getElementById('payAccount');
const markDelivered = document.getElementById('markDelivered');
const discountContainer = document.getElementById('discountContainer');
const discountInput = document.getElementById('discountInput');
const newBalancePreview = document.getElementById('newBalancePreview');

// --- ESTADO LOCAL ---
let clientsCache = [];
let currentUserInfo = null;

// Estado Paginación
let currentStatus = 'recibido';
let currentPage = 1;
let lastVisibleDoc = null;
let firstVisibleDoc = null;
let pageStack = []; 

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const nextStatusMap = {
    'recibido': 'en_proceso',
    'en_proceso': 'procesado',
    'procesado': 'entregado',
    'entregado': null
};

const statusLabels = {
    'todas': 'General',
    'recibido': 'Recibido',
    'en_proceso': 'En Proceso',
    'procesado': 'Procesado',
    'entregado': 'Entregado',
    'anulada': 'Anulada'
};

const statusColors = {
    'todas': 'bg-gray-800 border-gray-600 text-gray-300',
    'recibido': 'bg-gray-800 border-gray-600 text-gray-300',
    'en_proceso': 'bg-blue-900/20 border-blue-900 text-blue-400',
    'procesado': 'bg-purple-900/20 border-purple-900 text-purple-400',
    'entregado': 'bg-green-900/20 border-green-900 text-green-400',
    'anulada': 'bg-red-900/20 border-red-900 text-red-400'
};

// --- 1. INICIALIZACIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    // Obtenemos datos del usuario actual
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if(userSnap.exists()) {
        currentUserInfo = userSnap.data();
        currentUserInfo.uid = user.uid;
        updateSidebarUser(user, currentUserInfo);
    }

    // Cargamos datos necesarios (Solo Clientes y Cuentas)
    await Promise.all([
        loadClients(), 
        loadAccounts()
    ]);
    
    filterByStatus('todas');
});

// --- 2. SISTEMA DE FILTROS Y CARGA ---
window.filterByStatus = (status) => {
    currentStatus = status;
    searchInput.value = "";
    
    document.querySelectorAll('.status-tab').forEach(btn => {
        if(btn.dataset.status === status) {
            btn.className = "status-tab active px-4 py-2 rounded-full text-xs font-bold uppercase transition bg-gray-800 text-white border border-gray-600";
        } else {
            btn.className = "status-tab px-4 py-2 rounded-full text-xs font-bold uppercase transition text-gray-500 hover:text-white";
        }
    });

    loadOrders('reset');
};

nextPageBtn.addEventListener('click', () => loadOrders('next'));
prevPageBtn.addEventListener('click', () => loadOrders('prev'));

let timeout = null;
searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => loadOrders('search'), 500);
});

async function loadOrders(action) {
    ordersGrid.innerHTML = `<div class="col-span-full py-12 text-center text-gray-500"><i class="fas fa-circle-notch fa-spin mr-2"></i> Cargando...</div>`;
    
    const searchTerm = searchInput.value.trim();
    let q;

    try {
        if (searchTerm) {
            const isNumber = /^\d+$/.test(searchTerm);
            if (isNumber) {
                const num = parseInt(searchTerm);
                q = query(collection(db, "orders"), where("orderNumber", "==", num));
            } else {
                q = query(
                    collection(db, "orders"), 
                    where("clientName", ">=", searchTerm),
                    where("clientName", "<=", searchTerm + '\uf8ff'),
                    limit(30)
                );
            }
            prevPageBtn.disabled = true;
            nextPageBtn.disabled = true;
            pageIndicator.textContent = "Resultados búsqueda";

        } else {
            let baseQuery;
            
            if (currentStatus === 'todas') {
                baseQuery = query(
                    collection(db, "orders"), 
                    orderBy("createdAt", "desc"),
                    limit(30)
                );
            } else {
                baseQuery = query(
                    collection(db, "orders"), 
                    where("status", "==", currentStatus),
                    orderBy("createdAt", "desc"),
                    limit(30)
                );
            }

            if (action === 'reset' || action === 'search') {
                currentPage = 1;
                pageStack = [];
                q = baseQuery;
            } else if (action === 'next' && lastVisibleDoc) {
                pageStack.push(firstVisibleDoc);
                q = query(baseQuery, startAfter(lastVisibleDoc));
                currentPage++;
            } else if (action === 'prev' && pageStack.length > 0) {
                const prevDoc = pageStack.pop();
                q = query(baseQuery, startAt(prevDoc));
                currentPage--;
            } else {
                q = baseQuery;
            }
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            ordersGrid.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                        No hay órdenes en esta vista.
                    </td>
                </tr>`;
            nextPageBtn.disabled = true;
            if (currentPage === 1) prevPageBtn.disabled = true;
            return;
        }

        firstVisibleDoc = snapshot.docs[0];
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        renderOrdersGrid(snapshot.docs);

        if (!searchTerm) {
            pageIndicator.textContent = `Página ${currentPage}`;
            prevPageBtn.disabled = currentPage === 1;
            nextPageBtn.disabled = snapshot.docs.length < 30;
        }

    } catch (error) {
        console.error("Error cargando órdenes:", error);
        ordersGrid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500 text-xs">Error de consulta. Verifique índices en Firebase.</div>`;
    }
}

function renderOrdersGrid(docs) {
    ordersGrid.innerHTML = docs.map(doc => {
        const data = doc.data();
        
        // --- Estilo especial para anuladas ---
        if (data.status === 'anulada') {
            return `
                <tr class="bg-red-900/5 hover:bg-red-900/10 transition border-b border-gray-800">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <span class="font-mono text-red-500 font-bold text-sm">#${data.orderNumber}</span>
                            <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-900/20 text-red-400 border border-red-900/30">Anulada</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-gray-500 line-through">${data.clientName}</td>
                    <td colspan="3" class="px-6 py-4 text-center text-xs text-red-900/50 uppercase font-bold tracking-widest">Orden Cancelada</td>
                    <td class="px-6 py-4 text-right">
                        ${/* Solo Admin puede borrar definitivamente */ currentUserInfo?.role === 'admin' ? `
                        <button onclick="window.deleteOrder('${doc.id}')" class="text-gray-600 hover:text-red-400 transition" title="Eliminar Definitivamente">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </td>
                </tr>
            `;
        }

        // --- Lógica Normal ---
        const items = data.items || [];
        const totalQty = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
        let summary = 'Sin items';
        if (items.length === 1) summary = items[0].description;
        else if (items.length > 1) summary = `${items.length} Prendas (Varios)`;

        let phoneDisplay = '';
        const cachedClient = clientsCache.find(c => c.id === data.clientId);
        if (cachedClient && cachedClient.phone) {
            phoneDisplay = `<div class="text-[10px] text-gray-500 mt-0.5"><i class="fas fa-phone mr-1"></i> ${cachedClient.phone}</div>`;
        }

        const totalAmount = data.totalAmount || 0;
        const balance = data.balanceDue || 0;
        const isPaid = balance <= 0;

        const moneyHtml = `
            <div class="flex flex-col items-end gap-0.5">
                ${!isPaid 
                    ? `<span class="text-red-400 font-bold text-sm bg-red-900/10 px-1.5 rounded">${copFormatter.format(balance)}</span>` 
                    : `<span class="text-green-500 font-bold text-xs border border-green-500/30 bg-green-900/10 px-2 py-0.5 rounded">PAGADO</span>`
                }
                <span class="text-[10px] text-gray-500 font-mono">
                    Total: <span class="text-gray-400">${copFormatter.format(totalAmount)}</span>
                </span>
            </div>
        `;

        const nextStatus = nextStatusMap[data.status];
        
        // --- Botones de Acción ---
        let actionButtons = '';
        
        // 1. Botón Avanzar Estado
        if (nextStatus) {
            actionButtons += `
                <button onclick="window.advanceStatus('${doc.id}', '${data.status}')" 
                    class="w-8 h-8 rounded-full bg-gray-800 hover:bg-soriano-gold hover:text-black text-gray-400 border border-gray-700 transition flex items-center justify-center"
                    title="Avanzar a ${statusLabels[nextStatus]}">
                    <i class="fas fa-arrow-right"></i>
                </button>
            `;
        } else {
            actionButtons += `<div class="w-8 h-8 flex items-center justify-center text-green-500" title="Finalizado"><i class="fas fa-check-circle"></i></div>`;
        }

        // 2. Botón Pagar
        if (!isPaid) {
            actionButtons += `
                <button onclick="window.openPayModal('${doc.id}', ${balance}, '${data.orderNumber}')" 
                    class="w-8 h-8 rounded-full bg-green-900/20 hover:bg-green-500 hover:text-white text-green-400 border border-green-900/30 transition flex items-center justify-center" 
                    title="Registrar Pago">
                    <i class="fas fa-dollar-sign"></i>
                </button>
            `;
        }

        // 3. Ver Detalle e Imprimir (Siempre visibles)
        actionButtons += `
            <a href="orden-detalle.html?id=${doc.id}" class="w-8 h-8 rounded-full hover:bg-blue-500 hover:text-white text-blue-400 transition flex items-center justify-center" title="Ver Detalle"><i class="fas fa-eye"></i></a>
            <a href="remision.html?id=${doc.id}" target="_blank" class="w-8 h-8 rounded-full hover:bg-white hover:text-black text-gray-500 transition flex items-center justify-center" title="Imprimir"><i class="fas fa-print"></i></a>
        `;

        // 4. Botón Anular (SOLO ADMIN)
        if (currentUserInfo && currentUserInfo.role === 'admin') {
            actionButtons += `
                <button onclick="window.cancelOrder('${doc.id}', '${data.orderNumber}', ${data.totalAmount - balance})" class="w-8 h-8 rounded-full hover:bg-red-500 hover:text-white text-gray-600 transition flex items-center justify-center" title="Anular (Admin)">
                    <i class="fas fa-ban"></i>
                </button>
            `;
        }

        return `
            <tr class="hover:bg-white/5 transition group border-b border-gray-800 last:border-0">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex flex-col gap-1">
                        <span class="font-mono text-soriano-gold font-bold text-sm">#${data.orderNumber}</span>
                        <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                            <span class="inline-block w-2 h-2 rounded-full mr-1 ${statusColors[data.status] ? statusColors[data.status].replace('text-', 'bg-').split(' ')[0] : 'bg-gray-500'}"></span>
                            ${statusLabels[data.status] || data.status}
                        </span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="font-bold text-white text-sm truncate max-w-[150px]">${data.clientName}</div>
                    ${phoneDisplay}
                </td>
                <td class="px-6 py-4 hidden md:table-cell">
                    <div class="flex items-center">
                        <span class="bg-gray-800 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">${totalQty}</span>
                        <span class="text-gray-400 text-xs truncate max-w-[200px]">${summary}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-center hidden md:table-cell">
                    <div class="font-mono text-xs text-gray-300 bg-gray-900 inline-block px-2 py-1 rounded border border-gray-800">
                        ${data.deadline}
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    ${moneyHtml} 
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// --- 3. LÓGICA DE AVANCE RÁPIDO DE ESTADO ---
window.advanceStatus = async (id, current) => {
    const next = nextStatusMap[current];
    if (!next) return;

    try {
        await updateDoc(doc(db, "orders", id), { status: next });
        loadOrders('reset'); 
    } catch (e) {
        console.error(e);
        alert("Error al cambiar estado.");
    }
};

// --- CARGAS AUXILIARES ---
async function loadClients() {
    const q = query(collection(db, "clients"), orderBy("name"));
    const snap = await getDocs(q);
    clientsCache = [];
    snap.forEach(d => {
        const c = d.data(); c.id = d.id; clientsCache.push(c);
    });
}

async function loadAccounts() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"), orderBy("name"));
    const snap = await getDocs(q);
    
    // Eliminamos accountsCache porque ya no se usa
    const options = '<option value="">Seleccionar cuenta...</option>' + 
        snap.docs.map(doc => {
            const acc = doc.data();
            return `<option value="${doc.id}">${acc.name} (${acc.type})</option>`;
        }).join('');
        
    payAccount.innerHTML = options;
}

// --- PAGOS & DESCUENTOS ---
window.openPayModal = (id, balance, number) => {
    payForm.reset();
    discountContainer.classList.add('hidden'); 
    payOrderId.value = id;
    
    payBalanceDisplay.dataset.val = balance; 
    payBalanceDisplay.textContent = copFormatter.format(balance);
    document.getElementById('payModalSubtitle').textContent = `Orden #${number}`;
    
    payAmount.value = copFormatter.format(balance);
    markDelivered.checked = true; 
    payModal.classList.remove('hidden'); payModal.classList.add('flex');
};

window.toggleDiscount = () => {
    discountContainer.classList.toggle('hidden');
    discountInput.value = "";
    newBalancePreview.textContent = "-";
};

window.calculateFinalPayment = (input) => {
    const discount = parseInt(input.value.replace(/\D/g, '')) || 0;
    const currentDebt = parseInt(payBalanceDisplay.dataset.val);
    const newDebt = Math.max(0, currentDebt - discount);
    newBalancePreview.textContent = copFormatter.format(newDebt);
    payAmount.value = copFormatter.format(newDebt); 
    formatCurrencyInput(input);
};

payForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = payOrderId.value;
    const rawAmt = payAmount.value.replace(/\D/g, '');
    const amount = parseInt(rawAmt) || 0;
    const rawDisc = discountInput.value.replace(/\D/g, '');
    const discount = parseInt(rawDisc) || 0;
    const accId = payAccount.value;
    const currentDebt = parseInt(payBalanceDisplay.dataset.val);

    if (amount < 0) return;
    if (amount > 0 && !accId) { alert("Seleccione cuenta."); return; }
    if ((amount + discount) > currentDebt) { alert("Pago + Descuento exceden deuda."); return; }

    if(!confirm(`¿Confirmar transacción?`)) return;

    try {
        const batch = writeBatch(db);
        const orderRef = doc(db, "orders", id);
        const accRef = doc(db, "accounts", accId);

        if (discount > 0) {
            batch.update(orderRef, {
                totalAmount: increment(-discount),
                balanceDue: increment(-discount),
                discountApplied: discount
            });
        }

        if (amount > 0) {
            const updateData = {
                balanceDue: increment(-amount), 
                paymentHistory: arrayUnion({
                    amount: amount,
                    accountId: accId,
                    date: new Date().toISOString(),
                    type: 'balance_payment'
                }),
                updatedAt: serverTimestamp()
            };
            if (markDelivered.checked) updateData.status = 'entregado';
            
            batch.update(orderRef, updateData);
            batch.update(accRef, { balance: increment(amount) });
            batch.set(doc(collection(db, "transactions")), {
                accountId: accId, type: 'income', amount, description: `Pago Orden (Cierre)`, relatedDocId: id, date: serverTimestamp()
            });
        } else {
             if (markDelivered.checked) batch.update(orderRef, { status: 'entregado' });
        }

        await batch.commit();
        closePayModal();
        alert("Registrado correctamente.");
        loadOrders('reset'); 

    } catch (error) {
        console.error(error);
        alert("Error al registrar.");
    }
});

window.closePayModal = () => { payModal.classList.add('hidden'); payModal.classList.remove('flex'); };

// --- ANULAR ORDEN ---
window.cancelOrder = async (id, number, paidAmount) => {
    // 1. Verificación de Seguridad
    if (!currentUserInfo || currentUserInfo.role !== 'admin') {
        alert("Acceso denegado. Solo administradores pueden anular órdenes.");
        return;
    }

    let msg = `¿ANULAR orden #${number}?`;
    if (paidAmount > 0) msg += `\n\nATENCIÓN: Se debe devolver ${copFormatter.format(paidAmount)} al cliente.`;

    if (!confirm(msg)) return;

    if (paidAmount > 0) {
        alert("La orden será ANULADA.\nPor favor registre un GASTO manual por 'Devolución Cliente' para descargar el dinero de la caja.");
    }

    try {
        await updateDoc(doc(db, "orders", id), {
            status: 'anulada',
            canceledAt: serverTimestamp()
        });
        loadOrders('reset');
        alert("Orden anulada.");
    } catch (e) {
        console.error(e);
        alert("Error al anular.");
    }
};

window.deleteOrder = async (id) => { if(confirm("¿Borrar definitivamente?")) { await deleteDoc(doc(db, "orders", id)); loadOrders('reset'); } };

window.formatCurrencyInput = (input) => { let value = input.value.replace(/\D/g, ''); if (value === '') { input.value = ''; return; } input.value = new Intl.NumberFormat('es-CO').format(parseInt(value)); };