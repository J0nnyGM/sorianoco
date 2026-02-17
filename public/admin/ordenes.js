import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, doc, query, orderBy, where, getDocs, limit, startAfter, startAt, endBefore, serverTimestamp, writeBatch, increment, arrayUnion, runTransaction, getDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const ordersGrid = document.getElementById('ordersGrid');
const searchInput = document.getElementById('searchInput');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');


// Modal Nueva Orden
const modal = document.getElementById('orderModal');
const modalTitle = document.getElementById('modalTitle');
const orderIdInput = document.getElementById('orderId');
const clientSelect = document.getElementById('clientSelect');
const clientInfoBox = document.getElementById('clientInfoBox');
const deadlineInput = document.getElementById('deadline');
const statusInput = document.getElementById('status');
const orderNotesInput = document.getElementById('orderNotes');

// Buscador Inventario
const inventorySearch = document.getElementById('inventorySearch');
const inventoryList = document.getElementById('inventoryList');
const selectedInventoryId = document.getElementById('selectedInventoryId');
const addItemDesc = document.getElementById('addItemDesc');
const addItemQty = document.getElementById('addItemQty');
const addItemPrice = document.getElementById('addItemPrice');
const addItemNotes = document.getElementById('addItemNotes');
const sizeSelectorContainer = document.getElementById('sizeSelectorContainer');
const sizeButtons = document.getElementById('sizeButtons');
const selectedSizeInput = document.getElementById('selectedSize');
const imgPreviewContainer = document.getElementById('productImagePreview');
const imgPreviewSrc = document.getElementById('imgPreviewSrc');
const orderItemsBody = document.getElementById('orderItemsBody');
const orderTotalDisplay = document.getElementById('orderTotalDisplay');
const measuresContainer = document.getElementById('measuresContainer');
const advanceInput = document.getElementById('advancePayment');
const targetAccountSelect = document.getElementById('targetAccount');

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

const responsableSelect = document.getElementById('responsableSelect');

// --- ESTADO LOCAL ---
let clientsCache = [];
let productsCache = [];
let accountsCache = [];
let orderItems = [];
let currentMeasures = {};
let activeTab = 'chaqueta';

let currentUserInfo = null; // Para saber si soy admin o no

// Estado Paginación
let currentStatus = 'recibido';
let currentPage = 1;
let lastVisibleDoc = null;
let firstVisibleDoc = null;
let pageStack = []; 

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const measureFields = {
    chaqueta: ['Pecho', 'Cintura', 'Espalda', 'Manga', 'Hombro', 'Contorno'],
    pantalon: ['Cintura', 'Base', 'Pierna', 'Largo', 'Entube'],
    camisa:   ['Cuello', 'Manga', 'Largo', 'Modelo'],
    chaleco:  ['Pecho', 'Hombro', 'Contorno']
};

const nextStatusMap = {
    'recibido': 'en_proceso',
    'en_proceso': 'procesado',
    'procesado': 'entregado',
    'entregado': null
};

const statusLabels = {
    'recibido': 'Recibido',
    'en_proceso': 'En Proceso',
    'procesado': 'Procesado',
    'entregado': 'Entregado',
    'anulada': 'Anulada'
};

const statusColors = {
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
        currentUserInfo.uid = user.uid; // Guardamos el ID también
        updateSidebarUser(user, currentUserInfo);
    }

    // Cargamos datos necesarios
    await Promise.all([
        loadClients(), 
        loadInventoryProducts(), 
        loadAccounts(),
        loadUsersForSelect() // <--- NUEVA FUNCIÓN
    ]);
    
    filterByStatus('recibido');
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
            let baseQuery = query(
                collection(db, "orders"), 
                where("status", "==", currentStatus),
                orderBy("createdAt", "desc"),
                limit(30)
            );

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
        ordersGrid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500 text-xs">Error de índice. Revise la consola (F12).</div>`;
    }
}

// RENDERIZADO TIPO LISTA (TODOS LOS BOTONES VISIBLES)
// 2. Reemplazar completamente la función renderOrdersGrid
function renderOrdersGrid(docs) {
    ordersGrid.innerHTML = docs.map(doc => {
        const data = doc.data();
        
        // Estilo especial para anuladas
        if (data.status === 'anulada') {
            return `
                <tr class="bg-red-900/5 hover:bg-red-900/10 transition">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <span class="font-mono text-red-500 font-bold text-sm">#${data.orderNumber}</span>
                            <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-900/20 text-red-400 border border-red-900/30">Anulada</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-gray-500 line-through">${data.clientName}</td>
                    <td colspan="3" class="px-6 py-4 text-center text-xs text-red-900/50 uppercase font-bold tracking-widest">Orden Cancelada</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="window.deleteOrder('${doc.id}')" class="text-gray-600 hover:text-red-400 transition" title="Eliminar Definitivamente">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }

        // Lógica de items y resumen (Igual que antes)
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

        const balance = data.balanceDue || 0;
        const isPaid = balance <= 0;
        const balanceHtml = !isPaid 
            ? `<span class="text-red-400 font-bold text-xs whitespace-nowrap">${copFormatter.format(balance)}</span>` 
            : `<span class="text-green-500 font-bold text-[10px] border border-green-500/30 bg-green-900/10 px-2 py-0.5 rounded">PAGADO</span>`;

        const nextStatus = nextStatusMap[data.status];
        
        // Botones (Simplificados para tabla)
        let actionButtons = '';
        
        // Botón Avanzar
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

        // Botón Pagar
        if (!isPaid) {
            actionButtons += `
                <button onclick="window.openPayModal('${doc.id}', ${balance}, '${data.orderNumber}')" 
                    class="w-8 h-8 rounded-full bg-green-900/20 hover:bg-green-500 hover:text-white text-green-400 border border-green-900/30 transition flex items-center justify-center" 
                    title="Registrar Pago">
                    <i class="fas fa-dollar-sign"></i>
                </button>
            `;
        }

        // Botón Ver Detalle
        actionButtons += `
            <a href="orden-detalle.html?id=${doc.id}" 
                class="w-8 h-8 rounded-full hover:bg-blue-500 hover:text-white text-blue-400 transition flex items-center justify-center" 
                title="Ver Detalle">
                <i class="fas fa-eye"></i>
            </a>
        `;

        // Botón Imprimir
        actionButtons += `
            <a href="remision.html?id=${doc.id}" target="_blank" 
                class="w-8 h-8 rounded-full hover:bg-white hover:text-black text-gray-500 transition flex items-center justify-center" 
                title="Imprimir">
                <i class="fas fa-print"></i>
            </a>
        `;

        // Botón Anular (Dropdown o directo, aquí directo por espacio)
        actionButtons += `
            <button onclick="window.cancelOrder('${doc.id}', '${data.orderNumber}', ${data.totalAmount - balance})" 
                class="w-8 h-8 rounded-full hover:bg-red-500 hover:text-white text-gray-600 transition flex items-center justify-center" 
                title="Anular Orden">
                <i class="fas fa-ban"></i>
            </button>
        `;

        // Renderizar la FILA (TR)
        return `
            <tr class="hover:bg-white/5 transition group border-b border-gray-800 last:border-0">
                
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex flex-col gap-1">
                        <span class="font-mono text-soriano-gold font-bold text-sm">#${data.orderNumber}</span>
                        <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
                            <span class="inline-block w-2 h-2 rounded-full mr-1 ${statusColors[data.status].replace('text-', 'bg-').split(' ')[0]}"></span>
                            ${statusLabels[data.status]}
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
                    ${balanceHtml}
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
    clientSelect.innerHTML = '<option value="">Seleccionar Cliente...</option>';
    snap.forEach(d => {
        const c = d.data(); c.id = d.id; clientsCache.push(c);
        clientSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
}

async function loadInventoryProducts() {
    const q = query(collection(db, "inventory"), where("classification", "==", "producto"));
    const snap = await getDocs(q);
    productsCache = [];
    snap.forEach(d => {
        const p = d.data();
        p.id = d.id;
        productsCache.push(p);
    });
}

async function loadAccounts() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"), orderBy("name"));
    const snap = await getDocs(q);
    accountsCache = [];
    const options = '<option value="">Seleccionar cuenta...</option>' + 
        snap.docs.map(doc => {
            const acc = doc.data(); acc.id = doc.id; accountsCache.push(acc);
            return `<option value="${doc.id}">${acc.name} (${acc.type})</option>`;
        }).join('');
    targetAccountSelect.innerHTML = options;
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

// --- NUEVA ORDEN ---
inventorySearch.addEventListener('input', () => renderInventoryList(inventorySearch.value));
inventorySearch.addEventListener('focus', () => renderInventoryList(inventorySearch.value));
document.addEventListener('click', (e) => {
    if (!inventorySearch.contains(e.target) && !inventoryList.contains(e.target)) {
        inventoryList.classList.add('hidden');
    }
});

function renderInventoryList(term = '') {
    inventoryList.innerHTML = '';
    const lowerTerm = term.toLowerCase();

    const manualDiv = document.createElement('div');
    manualDiv.className = "px-4 py-3 border-b border-gray-700 bg-gray-800 hover:bg-soriano-gold hover:text-black cursor-pointer transition flex items-center group";
    manualDiv.innerHTML = `<i class="fas fa-cut mr-2 text-soriano-gold group-hover:text-black"></i> <span class="font-bold">Prenda Sobre Medida (Manual)</span>`;
    manualDiv.onclick = () => selectProduct(null);
    inventoryList.appendChild(manualDiv);

    const filtered = productsCache.filter(p => 
        p.name.toLowerCase().includes(lowerTerm) || 
        p.sku.toLowerCase().includes(lowerTerm)
    );

    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-800 last:border-0";
        const totalStock = p.sizes ? Object.values(p.sizes).reduce((a,b)=>a+b,0) : (p.quantity || 0);
        div.innerHTML = `<div class="font-bold text-white">${p.name}</div><div class="text-[10px] text-gray-500 flex justify-between"><span>SKU: ${p.sku}</span><span>Stock: ${totalStock}</span></div>`;
        div.onclick = () => selectProduct(p);
        inventoryList.appendChild(div);
    });
    inventoryList.classList.remove('hidden');
}

function selectProduct(product) {
    inventoryList.classList.add('hidden');
    selectedSizeInput.value = "";
    sizeSelectorContainer.classList.add('hidden');
    sizeButtons.innerHTML = "";
    imgPreviewContainer.classList.add('hidden');
    imgPreviewSrc.src = "";

    if (!product) {
        inventorySearch.value = "Prenda Sobre Medida";
        selectedInventoryId.value = "";
        addItemDesc.value = "";
        addItemDesc.readOnly = false;
        addItemDesc.placeholder = "Ej. Traje de Novio";
        addItemDesc.focus();
        addItemPrice.value = "";
    } else {
        inventorySearch.value = product.name;
        selectedInventoryId.value = product.id;
        addItemDesc.value = product.name;
        if (product.cost) addItemPrice.value = new Intl.NumberFormat('es-CO').format(product.cost);
        if (product.sizes) {
            sizeSelectorContainer.classList.remove('hidden');
            let hasStock = false;
            Object.entries(product.sizes).forEach(([size, qty]) => {
                if (qty > 0) {
                    hasStock = true;
                    const btn = document.createElement('button');
                    btn.type = "button";
                    btn.className = "size-btn px-3 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition";
                    btn.innerHTML = `${size} <span class="text-[9px] text-gray-500 ml-1">(${qty})</span>`;
                    btn.onclick = () => {
                        document.querySelectorAll('.size-btn').forEach(b => b.className = "size-btn px-3 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300");
                        btn.className = "size-btn px-3 py-1 bg-soriano-red border border-soriano-red rounded text-xs text-white font-bold shadow-lg transform scale-105";
                        selectedSizeInput.value = size;
                        addItemDesc.value = `${product.name} (Talla ${size})`;
                    };
                    sizeButtons.appendChild(btn);
                }
            });
            if (!hasStock) sizeButtons.innerHTML = '<span class="text-red-500 text-xs">Sin stock físico.</span>';
        }
        if(product.imageUrl) { imgPreviewSrc.src = product.imageUrl; imgPreviewContainer.classList.remove('hidden'); imgPreviewSrc.dataset.url = product.imageUrl; } 
        else { imgPreviewSrc.dataset.url = ""; }
    }
}

window.addItemToOrder = () => {
    const invId = selectedInventoryId.value;
    const desc = addItemDesc.value;
    const qty = parseInt(addItemQty.value) || 1;
    const priceRaw = addItemPrice.value.replace(/\D/g, '');
    const price = parseInt(priceRaw) || 0;
    const notes = addItemNotes.value;
    const size = selectedSizeInput.value;
    
    let imgUrl = null;
    if (invId) { const prod = productsCache.find(p => p.id === invId); if (prod) imgUrl = prod.imageUrl; }

    if (!desc) { alert("Descripción requerida"); return; }
    if (!price) { alert("Precio requerido"); return; }
    if (invId && !size) { const prod = productsCache.find(p => p.id === invId); if (prod && prod.sizes && Object.keys(prod.sizes).length > 0) { alert("Seleccione una talla."); return; } }

    orderItems.push({
        id: Date.now(),
        inventoryId: invId || null, 
        description: desc,
        size: size || "N/A",
        quantity: qty,
        unitPrice: price,
        totalPrice: price * qty,
        notes: notes,
        imageUrl: imgUrl
    });

    inventorySearch.value = ""; selectedInventoryId.value = ""; addItemDesc.value = ""; addItemDesc.readOnly = false; addItemQty.value = "1"; addItemPrice.value = ""; addItemNotes.value = ""; selectedSizeInput.value = ""; sizeSelectorContainer.classList.add('hidden'); sizeButtons.innerHTML = ""; imgPreviewContainer.classList.add('hidden'); imgPreviewSrc.src = "";
    renderOrderItems();
};

window.removeOrderItem = (id) => { orderItems = orderItems.filter(i => i.id !== id); renderOrderItems(); };

function renderOrderItems() {
    if (orderItems.length === 0) { orderItemsBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-xs text-gray-500">No hay prendas.</td></tr>`; orderTotalDisplay.textContent = "$0"; return; }
    let total = 0;
    orderItemsBody.innerHTML = orderItems.map(item => {
        total += item.totalPrice;
        const icon = item.inventoryId ? '<i class="fas fa-box text-blue-400" title="De Stock"></i>' : '<i class="fas fa-cut text-soriano-gold" title="Sobre Medida"></i>';
        return `<tr class="border-b border-gray-800/50 hover:bg-white/5"><td class="p-3 text-center font-bold text-white">${item.quantity}</td><td class="p-3 text-center text-xs">${icon}</td><td class="p-3"><div class="text-white text-sm">${item.description}</div>${item.notes ? `<div class="text-xs text-soriano-gold italic">${item.notes}</div>` : ''}</td><td class="p-3 text-right font-mono text-sm text-gray-400">${copFormatter.format(item.totalPrice)}</td><td class="p-3 text-center"><button onclick="removeOrderItem(${item.id})" class="text-gray-600 hover:text-red-500 transition"><i class="fas fa-times"></i></button></td></tr>`;
    }).join('');
    orderTotalDisplay.textContent = copFormatter.format(total);
}

clientSelect.addEventListener('change', () => {
    const clientId = clientSelect.value;
    if (!clientId) { currentMeasures = {}; renderMeasuresInputs(); clientInfoBox.classList.add('hidden'); return; }
    const client = clientsCache.find(c => c.id === clientId);
    if (client) { currentMeasures = JSON.parse(JSON.stringify(client.measures || {})); document.getElementById('infoPhone').textContent = client.phone || 'Sin tel'; clientInfoBox.classList.remove('hidden'); renderMeasuresInputs(); }
});

window.showMeasureTab = (tab) => {
    activeTab = tab;
    const buttons = document.querySelectorAll('#measureTabs .measure-tab');
    buttons.forEach(btn => { if(btn.textContent.trim().toLowerCase() === tab) { btn.className = "measure-tab text-[10px] uppercase px-2 py-1 text-soriano-red border-b-2 border-soriano-red font-bold"; } else { btn.className = "measure-tab text-[10px] uppercase px-2 py-1 text-gray-500 hover:text-white"; } });
    renderMeasuresInputs();
};

function renderMeasuresInputs() {
    const fields = measureFields[activeTab] || [];
    const prefixMap = { chaqueta: 'chk_', pantalon: 'pan_', camisa: 'cam_', chaleco: 'cha_' };
    const prefix = prefixMap[activeTab];
    const storedValues = currentMeasures[activeTab] || {};
    if (fields.length === 0) { measuresContainer.innerHTML = '<p class="text-xs text-gray-500 col-span-2 text-center">Sin campos.</p>'; return; }
    measuresContainer.innerHTML = fields.map(field => {
        const key = prefix + field.toLowerCase(); 
        const val = storedValues[key] || '';
        return `<div><label class="block text-[9px] text-gray-500 uppercase">${field}</label><input type="text" class="measure-input input-soriano text-center text-xs py-1 h-7 border-gray-700" data-category="${activeTab}" data-key="${key}" value="${val}" onchange="updateLocalMeasure(this)"></div>`;
    }).join('');
}

window.updateLocalMeasure = (input) => { const cat = input.dataset.category; const key = input.dataset.key; if(!currentMeasures[cat]) currentMeasures[cat] = {}; currentMeasures[cat][key] = input.value; };

window.saveOrder = async () => {
    // 1. Validaciones
    if (!clientSelect.value) { alert("Seleccione un cliente"); return; }
    if (orderItems.length === 0) { alert("Agregue al menos una prenda a la orden"); return; }
    if (!deadlineInput.value) { alert("Defina la fecha de entrega"); return; }

    const rawAdvance = advanceInput.value.replace(/\D/g, '');
    const advance = parseInt(rawAdvance) || 0;

    if (advance > 0 && !targetAccountSelect.value) { 
        alert("Seleccione la cuenta de destino para el anticipo."); 
        return; 
    }

    // 2. Obtener datos del Responsable (NUEVO)
    const respId = responsableSelect.value;
    // Obtenemos el texto (nombre) del option seleccionado para no tener que consultarlo luego
    const respName = responsableSelect.options[responsableSelect.selectedIndex]?.text || "Sin Asignar";

    if(!confirm("¿Confirmar y generar orden?")) return;

    // UI Feedback (Opcional, para evitar doble click)
    const saveBtn = document.querySelector('#orderModal .btn-primary');
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    try {
        await runTransaction(db, async (transaction) => {
            const isEdit = orderIdInput.value !== "";
            let orderRef; 
            let orderNumber;
            
            // Calculamos el total sumando los items
            const totalAmount = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);

            // A. Definir Referencia y Número de Orden
            if (isEdit) { 
                orderRef = doc(db, "orders", orderIdInput.value); 
                // En edición no cambiamos el número
            } else {
                // Si es nueva, obtenemos el contador atómico
                const counterRef = doc(db, "counters", "orders");
                const counterSnap = await transaction.get(counterRef);
                
                let nextId = 1;
                if (counterSnap.exists()) {
                    nextId = counterSnap.data().current + 1;
                }
                
                // Actualizamos contador
                transaction.set(counterRef, { current: nextId }, { merge: true });
                
                orderNumber = nextId; 
                orderRef = doc(collection(db, "orders")); // Nueva referencia auto-ID
            }

            // B. Preparar Objeto de Datos
            const orderData = {
                clientId: clientSelect.value,
                clientName: clientSelect.options[clientSelect.selectedIndex].text,
                deadline: deadlineInput.value,
                status: statusInput.value,
                items: orderItems,              // Array de prendas
                appliedMeasures: currentMeasures, // Objeto de medidas
                totalAmount: totalAmount,
                notes: orderNotesInput.value,
                
                // --- NUEVOS CAMPOS ---
                responsableId: respId,
                responsableName: respName,
                // ---------------------

                updatedAt: serverTimestamp()
            };

            // C. Lógica específica para NUEVA ORDEN (Anticipos y Creación)
            if (!isEdit) {
                orderData.createdAt = serverTimestamp();
                orderData.orderNumber = orderNumber;
                orderData.advancePayment = advance;
                orderData.balanceDue = totalAmount - advance; // Deuda inicial
                orderData.paymentAccount = targetAccountSelect.value || null;
                
                // Historial de pagos inicial
                if (advance > 0) {
                    orderData.paymentHistory = [{ 
                        amount: advance, 
                        accountId: targetAccountSelect.value, 
                        date: new Date().toISOString(), 
                        type: 'advance' 
                    }];
                }

                // Guardar Orden
                transaction.set(orderRef, orderData);

                // D. Mover Dinero (Si hubo anticipo)
                if (advance > 0) {
                    const accRef = doc(db, "accounts", targetAccountSelect.value);
                    
                    // 1. Sumar saldo a la cuenta
                    transaction.update(accRef, { balance: increment(advance) });
                    
                    // 2. Crear registro en Tesorería
                    const logRef = doc(collection(db, "transactions"));
                    transaction.set(logRef, { 
                        accountId: targetAccountSelect.value, 
                        type: 'income', 
                        amount: advance, 
                        description: `Anticipo Orden #${orderNumber} - ${orderData.clientName}`, 
                        relatedDocId: orderRef.id, // ID de la orden recién creada (si es auto-id funciona igual)
                        date: serverTimestamp() 
                    });
                }

            } else { 
                // Lógica para EDICIÓN (Update simple)
                // Nota: En edición no solemos recalcular el balanceDue automáticamente 
                // para no romper pagos parciales previos, a menos que sea una regla de negocio estricta.
                // Aquí solo actualizamos datos básicos.
                transaction.update(orderRef, orderData); 
            }
        });

        // Éxito
        closeModal(); 
        alert("Orden guardada exitosamente."); 
        loadOrders('reset');

    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Error al procesar la orden: " + error.message);
    } finally {
        // Restaurar botón
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
    }
};

window.formatCurrencyInput = (input) => { let value = input.value.replace(/\D/g, ''); if (value === '') { input.value = ''; return; } input.value = new Intl.NumberFormat('es-CO').format(parseInt(value)); };
window.openModal = () => {
    // 1. Resetear inputs de texto y selects básicos
    orderIdInput.value = "";
    clientSelect.value = "";
    clientInfoBox.classList.add('hidden');
    deadlineInput.value = "";
    statusInput.value = "recibido";
    orderNotesInput.value = "";
    
    // 2. Resetear lógica interna (Medidas e Ítems)
    currentMeasures = {};
    orderItems = [];
    activeTab = 'chaqueta'; // Pestaña por defecto
    
    // 3. Resetear sección de agregar productos
    inventorySearch.value = "";
    selectedInventoryId.value = "";
    addItemDesc.value = "";
    addItemDesc.readOnly = false;
    addItemQty.value = "1";
    addItemPrice.value = "";
    addItemNotes.value = "";
    selectedSizeInput.value = "";
    sizeSelectorContainer.classList.add('hidden');
    sizeButtons.innerHTML = "";
    imgPreviewContainer.classList.add('hidden');
    imgPreviewSrc.src = "";
    
    // 4. Resetear sección financiera (Anticipo)
    advanceInput.value = "";
    targetAccountSelect.value = "";
    
    // 5. Renderizar UI limpia
    renderMeasuresInputs();
    renderOrderItems();
    showMeasureTab('chaqueta'); // Asegurar estilo de tab activo

    // 6. --- LÓGICA DE RESPONSABLE (NUEVO) ---
    if (currentUserInfo) {
        // Por defecto, seleccionamos al usuario logueado
        responsableSelect.value = currentUserInfo.uid;

        // Lógica de Bloqueo: Solo ADMIN puede cambiar el responsable
        if (currentUserInfo.role === 'admin') {
            responsableSelect.disabled = false;
            responsableSelect.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-800');
            responsableSelect.classList.add('bg-gray-900');
        } else {
            responsableSelect.disabled = true;
            responsableSelect.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-800');
            responsableSelect.classList.remove('bg-gray-900');
        }
    }

    // 7. Mostrar el modal
    modalTitle.textContent = "Nueva Orden";
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};
window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
window.deleteOrder = async (id) => { if(confirm("¿Eliminar orden?")) await deleteDoc(doc(db, "orders", id)); };

async function loadUsersForSelect() {
    try {
        const q = query(collection(db, "users"), orderBy("name")); // Asegúrate de importar 'orderBy' y 'collection'
        const snap = await getDocs(q);
        
        responsableSelect.innerHTML = '';
        snap.forEach(doc => {
            const u = doc.data();
            // Creamos la opción
            const opt = document.createElement('option');
            opt.value = doc.id; // UID
            opt.text = u.name || u.email;
            responsableSelect.appendChild(opt);
        });
    } catch (e) {
        console.error("Error cargando usuarios:", e);
        responsableSelect.innerHTML = '<option value="">Error carga</option>';
    }
}