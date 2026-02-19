import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, getDocs, limit, startAfter, startAt, serverTimestamp, getDoc, runTransaction, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM Main
const tableBody = document.getElementById('externalTableBody');
const mainSearch = document.getElementById('mainSearch');
const kpiActive = document.getElementById('kpiActive');
const kpiCost = document.getElementById('kpiCost');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');
const tabPending = document.getElementById('tabPending');
const tabHistory = document.getElementById('tabHistory');

// DOM Modal Salida
const modal = document.getElementById('externalModal');
const form = document.getElementById('externalForm');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveBtn');
const workshopSelect = document.getElementById('workshopSelect');
const orderSearch = document.getElementById('orderSearch');
const orderResults = document.getElementById('orderResults');
const selectedOrderId = document.getElementById('selectedOrderId');
const selectedOrderText = document.getElementById('selectedOrderText');
const selectedGarmentInfo = document.getElementById('selectedGarmentInfo'); 
const idInput = document.getElementById('processId');
const serviceInput = document.getElementById('serviceType');
const costInput = document.getElementById('estimatedCost');
const dateOutInput = document.getElementById('dateOut');
const dateReturnInput = document.getElementById('dateReturn');
const notesInput = document.getElementById('notes');

// DOM Modal Recepción (Pago)
const receiveModal = document.getElementById('receiveModal');
const receiveForm = document.getElementById('receiveForm');
const expenseAccount = document.getElementById('expenseAccount');
const displayRecCost = document.getElementById('displayRecCost');
const recId = document.getElementById('recId');
const recCost = document.getElementById('recCost');
const recWorkshop = document.getElementById('recWorkshop');
const recService = document.getElementById('recService');
const recOrderId = document.getElementById('recOrderId');

// Cache & State
let ordersCache = [];
let suppliersCache = [];
let accountsCache = []; // NUEVO: Cache de cuentas para validar 4x1000 localmente
let currentTab = 'pending';
let currentPage = 1;
let lastVisibleDoc = null;
let firstVisibleDoc = null;
let pageStack = []; 

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// Init
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    await loadInitialData();
    await loadAccountsForExpense(); 
    loadJobs('reset');
    updateKPIs();
    
    dateOutInput.valueAsDate = new Date();
});

// 1. Cargar Datos
async function loadInitialData() {
    const ordersSnap = await getDocs(query(collection(db, "orders"), where("status", "!=", "entregado")));
    ordersCache = [];
    ordersSnap.forEach(d => {
        const o = d.data();
        let garmentDesc = "";
        
        if (o.items && o.items.length > 0) {
            const customItems = o.items.filter(i => !i.inventoryId);
            if (customItems.length > 0) {
                garmentDesc = customItems.map(i => i.description).join(", ");
            }
        }

        if (garmentDesc === "") garmentDesc = "Sin prendas a medida";

        ordersCache.push({ id: d.id, label: `#${o.orderNumber} - ${o.clientName}`, garment: garmentDesc, number: o.orderNumber });
    });

    const suppliersSnap = await getDocs(query(collection(db, "suppliers"), orderBy("companyName")));
    suppliersCache = [];
    suppliersSnap.forEach(d => {
        const s = d.data();
        suppliersCache.push({ id: d.id, name: s.companyName, category: s.category });
    });
    renderWorkshopOptions();
}

async function loadAccountsForExpense() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"));
    const snap = await getDocs(q);
    expenseAccount.innerHTML = '<option value="">Seleccionar cuenta...</option>';
    accountsCache = []; 
    snap.forEach(d => {
        const acc = d.data();
        acc.id = d.id;
        accountsCache.push(acc);
        // Solo mostramos el nombre limpio
        expenseAccount.innerHTML += `<option value="${d.id}">${acc.name}</option>`;
    });
}

// 2. Control de Pestañas y Paginación
window.setTab = (tab) => {
    currentTab = tab;
    tabPending.className = `tab-btn px-4 py-2 rounded-md text-xs font-bold uppercase transition ${tab === 'pending' ? 'active bg-[#1f2937] text-white border border-[#374151]' : 'text-gray-400 hover:text-white'}`;
    tabHistory.className = `tab-btn px-4 py-2 rounded-md text-xs font-bold uppercase transition ${tab === 'history' ? 'active bg-[#1f2937] text-white border border-[#374151]' : 'text-gray-400 hover:text-white'}`;
    loadJobs('reset');
};

nextPageBtn.addEventListener('click', () => loadJobs('next'));
prevPageBtn.addEventListener('click', () => loadJobs('prev'));

async function loadJobs(action) {
    tableBody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-gray-500 italic"><i class="fas fa-circle-notch fa-spin mr-2"></i> Cargando...</td></tr>`;
    try {
        let q = collection(db, "external_jobs");
        if (currentTab === 'pending') { q = query(q, where("status", "==", "en_proceso"), orderBy("dateOut", "desc"), limit(30)); } 
        else { q = query(q, where("status", "==", "recibido"), orderBy("dateOut", "desc"), limit(30)); }

        if (action === 'next' && lastVisibleDoc) { pageStack.push(firstVisibleDoc); q = query(q, startAfter(lastVisibleDoc)); currentPage++; } 
        else if (action === 'prev' && pageStack.length > 0) { const prevDoc = pageStack.pop(); q = query(q, startAt(prevDoc)); currentPage--; } 
        else if (action === 'reset') { currentPage = 1; pageStack = []; }

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-gray-500 italic">No hay registros en esta vista.</td></tr>`;
            nextPageBtn.disabled = true;
            if (currentPage === 1) prevPageBtn.disabled = true;
            return;
        }

        firstVisibleDoc = snapshot.docs[0];
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        renderTable(snapshot.docs);
        pageIndicator.textContent = `Página ${currentPage}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = snapshot.docs.length < 30;
    } catch (e) { console.error(e); tableBody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-red-500 italic">Error cargando datos.</td></tr>`; }
}

function renderTable(docs) {
    tableBody.innerHTML = docs.map(doc => {
        const data = doc.data();
        let statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-900/30 text-orange-400 border border-orange-900/50"><i class="fas fa-clock mr-1.5"></i> En proceso</span>`;
        if (data.status === 'recibido') { statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-900/50"><i class="fas fa-check mr-1.5"></i> Recibido</span>`; } 
        else {
            const today = new Date().toISOString().split('T')[0];
            if (data.dateReturn < today) { statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-900/50 animate-pulse"><i class="fas fa-exclamation-triangle mr-1.5"></i> Atrasado</span>`; }
        }
        const garmentText = (data.garmentInfo && data.garmentInfo !== 'undefined') ? data.garmentInfo : 'Confección a Medida';
        return `
            <tr class="hover:bg-white/5 transition border-b border-gray-800/50 group">
                <td class="px-6 py-4">
                    <div class="text-white font-bold text-sm group-hover:text-blue-400 transition">#${data.orderNumber}</div>
                    <div class="text-xs text-gray-500 mt-0.5 truncate max-w-[150px]" title="${garmentText}">${garmentText}</div>
                </td>
                <td class="px-6 py-4 text-gray-300 text-sm">${data.workshopName}</td>
                <td class="px-6 py-4 capitalize text-sm text-gray-400"><span class="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-xs">${data.service.replace('_', ' ')}</span></td>
                <td class="px-6 py-4 text-right text-gray-400 font-mono text-xs tracking-wide">${data.dateReturn}</td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                    <div class="flex justify-end gap-2">
                        <a href="orden-taller.html?id=${doc.id}" target="_blank" class="w-8 h-8 rounded bg-gray-800 hover:bg-blue-900/50 hover:text-blue-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Imprimir Orden Taller"><i class="fas fa-file-contract"></i></a>
                        ${data.status !== 'recibido' ? `
                        <button onclick="window.editJob('${doc.id}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-soriano-gold hover:text-black text-gray-400 transition flex items-center justify-center border border-gray-700" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button onclick="window.openReceiveModal('${doc.id}', '${data.estimatedCost}', '${data.workshopName}', '${data.service}', '${data.orderId}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-green-900/50 hover:text-green-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Recibir y Pagar"><i class="fas fa-check"></i></button>` : ''}
                        ${data.status !== 'recibido' ? `<button onclick="window.deleteJob('${doc.id}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-red-900/50 hover:text-red-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 3. Crear / Editar Salida
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawCost = costInput.value.replace(/\D/g, '');
    const finalCost = parseFloat(rawCost || 0);

    const data = { dateReturn: dateReturnInput.value, estimatedCost: finalCost };

    try {
        if (idInput.value) {
            await updateDoc(doc(db, "external_jobs", idInput.value), data);
        } else {
            if (!selectedOrderId.value) { alert("Debe seleccionar una orden válida."); return; }
            const workshopOption = workshopSelect.options[workshopSelect.selectedIndex];
            
            data.orderId = selectedOrderId.value;
            data.orderNumber = orderSearch.value.split(' - ')[0].replace('#', '').trim();
            data.garmentInfo = selectedGarmentInfo.value || 'Confección a Medida';
            data.workshopId = workshopSelect.value;
            data.workshopName = workshopOption.text;
            data.service = serviceInput.value;
            data.dateOut = dateOutInput.value;
            data.notes = notesInput.value;
            data.status = 'en_proceso';
            data.createdAt = serverTimestamp();

            await addDoc(collection(db, "external_jobs"), data);
        }
        closeModal();
        loadJobs('reset');
        updateKPIs();
    } catch (error) { console.error("Error:", error); alert("Error al guardar."); }
});

// 4. Editar (UI)
window.editJob = async (id) => {
    const docSnap = await getDoc(doc(db, "external_jobs", id));
    if (!docSnap.exists()) return;
    const job = docSnap.data();

    idInput.value = id;
    modalTitle.textContent = "Editar Salida";
    saveBtn.textContent = "Actualizar";
    
    selectedOrderId.value = job.orderId;
    orderSearch.value = `#${job.orderNumber}`;
    serviceInput.value = job.service;
    filterWorkshopsByService(); 
    workshopSelect.value = job.workshopId;
    dateOutInput.value = job.dateOut;
    notesInput.value = job.notes;
    dateReturnInput.value = job.dateReturn;
    costInput.value = copFormatter.format(job.estimatedCost || 0);

    [orderSearch, workshopSelect, serviceInput, dateOutInput, notesInput].forEach(el => {
        el.disabled = true;
        el.classList.add('opacity-50', 'cursor-not-allowed');
    });

    modal.classList.remove('hidden'); modal.classList.add('flex');
};

// 5. RECEPCIÓN Y PAGO
// Evento para mostrar preview del impuesto al cambiar de cuenta
expenseAccount.addEventListener('change', () => {
    const cost = parseFloat(recCost.value || 0);
    displayRecCost.textContent = copFormatter.format(cost);
});

window.openReceiveModal = (id, cost, workshop, service, orderId) => {
    recId.value = id;
    recCost.value = cost;
    recWorkshop.value = workshop;
    recService.value = service;
    recOrderId.value = orderId;

    displayRecCost.textContent = copFormatter.format(cost);
    expenseAccount.value = ""; 
    receiveModal.classList.remove('hidden'); 
    receiveModal.classList.add('flex');
};

window.closeReceiveModal = () => {
    receiveModal.classList.add('hidden');
    receiveModal.classList.remove('flex');
};

// SUBMIT RECEPCIÓN (CON LÓGICA 4x1000)
receiveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const accountId = expenseAccount.value;
    if (!accountId) { alert("Debe seleccionar una cuenta de salida."); return; }
    
    const id = recId.value;
    const cost = parseFloat(recCost.value || 0);
    const workshop = recWorkshop.value;
    const service = recService.value;
    const ordId = recOrderId.value;

    // Mensaje directo y profesional (solo muestra el costo del taller)
    if(!confirm(`¿Confirmar recepción y registrar el pago por ${copFormatter.format(cost)}?`)) return;

    // Cálculo interno del impuesto (No se muestra al usuario)
    const account = accountsCache.find(a => a.id === accountId);
    let tax = 0;
    if (account && account.isTaxable) {
        tax = Math.ceil(cost * 0.004);
    }
    const totalDeduction = cost + tax;

    try {
        await runTransaction(db, async (transaction) => {
            const jobRef = doc(db, "external_jobs", id);
            const accRef = doc(db, "accounts", accountId);
            
            const accDoc = await transaction.get(accRef);
            if (!accDoc.exists()) throw "La cuenta seleccionada no existe.";

            // 1. Actualizar Job
            transaction.update(jobRef, { status: 'recibido', receivedAt: serverTimestamp() });

            // 2. Crear Gasto en Colección Expenses
            const expenseRef = doc(collection(db, "expenses"));
            transaction.set(expenseRef, {
                date: new Date().toISOString().split('T')[0],
                category: 'taller_externo',
                description: `Pago Taller: ${service} - ${workshop}`,
                amount: cost, 
                accountId: accountId,
                createdAt: serverTimestamp()
            });

            // 3. Descontar Saldo de la Cuenta (Costo + Impuesto oculto)
            transaction.update(accRef, { balance: increment(-totalDeduction) });

            // 4. Crear Registro principal en Transacciones (Negativo para extracto)
            const transactionLogRef = doc(collection(db, "transactions"));
            transaction.set(transactionLogRef, {
                accountId: accountId,
                type: 'expense', 
                amount: -cost,
                description: `Pago Taller: ${service} - ${workshop}`,
                date: serverTimestamp(),
                relatedDocId: id,
                category: 'taller_externo'
            });

            // 5. Crear Registro de Impuesto oculto (Si aplica)
            if (tax > 0) {
                const taxLogRef = doc(collection(db, "transactions"));
                transaction.set(taxLogRef, {
                    accountId: accountId,
                    type: 'tax_gmf',
                    amount: -tax,
                    description: `GMF 4x1000 (Pago Taller)`,
                    date: serverTimestamp(),
                    relatedDocId: id
                });
            }

            // 6. Actualizar Costo de la Orden
            if (ordId && ordId !== 'undefined') {
                const orderRef = doc(db, "orders", ordId);
                const serviceItem = {
                    materialId: `ext-${id}`,
                    name: `SERVICIO: ${service.toUpperCase()} - ${workshop}`,
                    qty: 1,
                    unit: 'srv',
                    cost: cost, 
                    total: cost,
                    addedAt: new Date().toISOString()
                };
                transaction.update(orderRef, { materials: arrayUnion(serviceItem) });
            }
        });

        closeReceiveModal();
        loadJobs('reset'); 
        updateKPIs();

    } catch (error) {
        console.error("Error Transaction:", error);
        alert("Error al procesar el pago: " + error);
    }
});

// Utilities & Rest
orderSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    orderResults.innerHTML = '';
    selectedOrderId.value = '';
    if (term.length < 1) { orderResults.style.display = 'none'; return; }
    
    const filtered = ordersCache.filter(o => o.label.toLowerCase().includes(term));
    if (filtered.length > 0) {
        filtered.forEach(o => {
            const div = document.createElement('div');
            div.textContent = o.label;
            div.onclick = () => {
                orderSearch.value = o.label;
                selectedOrderId.value = o.id;
                selectedOrderText.value = o.label;
                selectedGarmentInfo.value = o.garment; 
                orderResults.style.display = 'none';
            };
            orderResults.appendChild(div);
        });
        orderResults.style.display = 'block';
    } else {
        orderResults.innerHTML = '<div class="text-gray-500 italic cursor-default p-2">No encontrada</div>';
        orderResults.style.display = 'block';
    }
});
document.addEventListener('click', (e) => { if (!orderSearch.contains(e.target) && !orderResults.contains(e.target)) orderResults.style.display = 'none'; });

window.formatCurrencyInput = (input) => { let value = input.value.replace(/\D/g, ''); if (value === '') { input.value = ''; return; } input.value = new Intl.NumberFormat('es-CO').format(parseInt(value)); };
window.filterWorkshopsByService = () => { renderWorkshopOptions(); };
function renderWorkshopOptions() {
    const service = serviceInput.value;
    const currentVal = workshopSelect.value;
    workshopSelect.innerHTML = '<option value="">Seleccionar Taller...</option>';
    suppliersCache.forEach(s => {
        let show = true;
        if (service === 'confeccion_externa') { show = s.category === 'taller' || s.category === 'confeccion'; } 
        else { show = s.category === 'servicios' || s.category === 'taller'; }
        if (show) workshopSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
    if (currentVal) workshopSelect.value = currentVal;
}
async function updateKPIs() {
    const q = query(collection(db, "external_jobs"), where("status", "==", "en_proceso"));
    const snap = await getDocs(q);
    let total = 0, cost = 0;
    snap.forEach(d => { total++; cost += d.data().estimatedCost || 0; });
    kpiActive.textContent = total;
    kpiCost.textContent = copFormatter.format(cost);
}

window.openModal = () => {
    form.reset();
    idInput.value = ""; 
    modalTitle.textContent = "Registrar Salida";
    saveBtn.textContent = "Registrar Salida";
    selectedOrderId.value = "";
    orderResults.style.display = 'none';
    dateOutInput.valueAsDate = new Date();
    [orderSearch, workshopSelect, serviceInput, dateOutInput, notesInput].forEach(el => { el.disabled = false; el.classList.remove('opacity-50', 'cursor-not-allowed'); });
    filterWorkshopsByService();
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
window.deleteJob = async (id) => { if(confirm("¿Eliminar registro?")) { await deleteDoc(doc(db, "external_jobs", id)); loadJobs('reset'); updateKPIs(); }};