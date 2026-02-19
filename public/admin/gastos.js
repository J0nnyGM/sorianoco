import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, query, orderBy, where, limit, startAfter, startAt, serverTimestamp, writeBatch, increment, getAggregateFromServer, sum, runTransaction } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const tableBody = document.getElementById('expensesTableBody');
const monthTotalDisplay = document.getElementById('monthTotalDisplay');
const monthFilter = document.getElementById('monthFilter');

const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');

const modal = document.getElementById('expenseModal');
const form = document.getElementById('expenseForm');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveBtn');

const idInput = document.getElementById('expenseId');
const dateInput = document.getElementById('expenseDate');
const catInput = document.getElementById('expenseCategory');
const descInput = document.getElementById('expenseDesc');
const amountInput = document.getElementById('expenseAmount');
const accountSelect = document.getElementById('expenseAccount');
const accountBalanceDisplay = document.getElementById('accountBalanceDisplay');
const taxPreview = document.getElementById('taxPreview');
const taxAmountDisplay = document.getElementById('taxAmountDisplay');
const editWarning = document.getElementById('editWarning');

const auditModal = document.getElementById('auditModal');
const auditTableBody = document.getElementById('auditTableBody');

// --- ESTADO ---
let accountsCache = [];
let lastVisibleDoc = null; 
let firstVisibleDoc = null; 
let currentPage = 1;
let pageStack = []; 

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// --- 1. INICIALIZACIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    monthFilter.value = `${now.getFullYear()}-${month}`;

    await loadAccounts();
    loadExpenses('first'); 
});

// --- 2. LÓGICA DE CARGA DE GASTOS ---
monthFilter.addEventListener('change', () => loadExpenses('first'));
nextPageBtn.addEventListener('click', () => loadExpenses('next'));
prevPageBtn.addEventListener('click', () => loadExpenses('prev'));

async function loadExpenses(direction) {
    const monthVal = monthFilter.value;
    if (!monthVal) return;

    const [year, month] = monthVal.split('-');
    const lastDay = new Date(year, month, 0).getDate();
    const startDateStr = `${year}-${month}-01`;
    const endDateStr = `${year}-${month}-${lastDay}`;

    let q = query(collection(db, "expenses"), where("date", ">=", startDateStr), where("date", "<=", endDateStr), orderBy("date", "desc"), limit(30));

    if (direction === 'next' && lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
        pageStack.push(firstVisibleDoc);
        currentPage++;
    } else if (direction === 'prev' && pageStack.length > 0) {
        const prevDoc = pageStack.pop();
        q = query(collection(db, "expenses"), where("date", ">=", startDateStr), where("date", "<=", endDateStr), orderBy("date", "desc"), startAt(prevDoc), limit(30));
        currentPage--;
    } else {
        currentPage = 1;
        pageStack = [];
    }

    tableBody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-gray-500 italic"><i class="fas fa-circle-notch fa-spin mr-2"></i> Consultando registros...</td></tr>`;
    
    try {
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-gray-500 italic">No hay gastos en este periodo.</td></tr>`;
            if (nextPageBtn) nextPageBtn.disabled = true;
            if (prevPageBtn && currentPage === 1) prevPageBtn.disabled = true;
            if (direction === 'first' || direction === 'reset') monthTotalDisplay.textContent = "$0";
            return;
        }

        firstVisibleDoc = snapshot.docs[0];
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        tableBody.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            
            // 1. Colores de Categoría
            let catColor = 'bg-gray-800 text-gray-400 border-gray-700';
            if(data.category === 'pago_proveedor' || data.category === 'compra_inventario') catColor = 'bg-blue-900/30 text-blue-400 border-blue-900';
            if(data.category === 'taller_externo') catColor = 'bg-yellow-900/30 text-yellow-400 border-yellow-900';
            if(data.category === 'nomina') catColor = 'bg-purple-900/30 text-purple-400 border-purple-900';

            // 2. CRUCE DINÁMICO DE CUENTAS (Arregla el "Desconocido")
            // Busca la cuenta en el caché usando el accountId
            const accountObj = accountsCache.find(a => a.id === data.accountId);
            // Si la encuentra usa el nombre actual, sino intenta usar el que venía guardado, o dice Desconocido
            const displayAccountName = accountObj ? accountObj.name : (data.accountName || '<span class="italic text-gray-600">Desconocido</span>');

            return `
                <tr class="hover:bg-white/5 transition-colors border-b border-gray-800/50">
                    <td class="px-6 py-4 text-gray-400 font-mono text-xs">${data.date}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase border ${catColor}">
                            ${formatCategory(data.category)}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-300 font-medium">${data.description}</td>
                    
                    <td class="px-6 py-4 text-xs text-gray-400 font-mono font-bold">
                        ${displayAccountName}
                    </td>

                    <td class="px-6 py-4 text-right text-red-400 font-bold font-mono text-base">
                        -${copFormatter.format(data.amount)}
                    </td>
                    
                    <td class="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <div class="flex justify-end gap-2">
                            <button onclick="window.editExpense('${doc.id}', '${encodeURIComponent(JSON.stringify(data))}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-soriano-gold hover:text-black text-gray-400 transition flex items-center justify-center border border-gray-700" title="Ver Info">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                            <button onclick="window.deleteExpense('${doc.id}', '${data.description}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-red-900/50 hover:text-red-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Anular y Devolver Dinero">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (pageIndicator) pageIndicator.textContent = `Página ${currentPage}`;
        if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = snapshot.docs.length < 30;

        if (direction === 'first' || direction === 'reset') {
            calculateMonthTotal(startDateStr, endDateStr);
        }

    } catch (error) {
        console.error("Error:", error);
        tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500 text-xs">Error de índice. (Ver Consola)</td></tr>`;
    }
}

async function calculateMonthTotal(startDateStr, endDateStr) {
    monthTotalDisplay.textContent = "...";
    try {
        const q = query(collection(db, "expenses"), where("date", ">=", startDateStr), where("date", "<=", endDateStr));
        const snapshot = await getAggregateFromServer(q, { totalCost: sum('amount') });
        monthTotalDisplay.textContent = copFormatter.format(snapshot.data().totalCost);
    } catch (e) {
        console.error("Error total:", e);
        monthTotalDisplay.textContent = "Error";
    }
}

// --- 3. CARGAR CUENTAS ---
async function loadAccounts() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"), orderBy("name"));
    const snap = await getDocs(q);
    accountsCache = [];
    accountSelect.innerHTML = '<option value="">Seleccionar cuenta...</option>';
    
    snap.forEach(doc => {
        const acc = doc.data();
        acc.id = doc.id;
        accountsCache.push(acc);
        accountSelect.innerHTML += `<option value="${acc.id}">${acc.name}</option>`;
    });
}

// --- 4. CÁLCULOS EN FORMULARIO ---
accountSelect.addEventListener('change', updateCalculation);
amountInput.addEventListener('input', updateCalculation);

function updateCalculation() {
    if (idInput.value) return; 

    const accId = accountSelect.value;
    const rawAmt = amountInput.value.replace(/\D/g, '');
    const amount = parseInt(rawAmt) || 0;

    const account = accountsCache.find(a => a.id === accId);

    if (account) {
        let maxTransferable = account.balance;
        if (account.isTaxable) maxTransferable = Math.floor(account.balance / 1.004);
        
        accountBalanceDisplay.innerHTML = `Saldo: ${copFormatter.format(account.balance)} <span class="text-gray-500">| Max: ${copFormatter.format(maxTransferable)}</span>`;

        if (account.isTaxable && amount > 0) {
            const tax = Math.ceil(amount * 0.004);
            taxAmountDisplay.textContent = `-${copFormatter.format(tax)}`;
            taxPreview.classList.remove('hidden');

            if ((amount + tax) > account.balance) {
                taxPreview.className = "mt-2 bg-red-900/40 p-2 rounded border border-red-500 text-xs flex justify-between items-center animate-pulse";
                taxAmountDisplay.innerHTML = `Insuficiente`;
            } else {
                taxPreview.className = "mt-2 bg-red-900/20 p-2 rounded border border-red-900/50 text-xs flex justify-between items-center";
            }
        } else { taxPreview.classList.add('hidden'); }
    } else {
        accountBalanceDisplay.textContent = "";
        taxPreview.classList.add('hidden');
    }
}

// --- 5. GUARDAR GASTO (Simple) ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    saveBtn.disabled = true;
    
    const id = idInput.value;
    const rawAmt = amountInput.value.replace(/\D/g, '');
    const amount = parseInt(rawAmt) || 0;
    const accId = accountSelect.value;
    
    if (!id && !accId) { alert("Seleccione cuenta de origen."); saveBtn.disabled=false; return; }
    if (amount <= 0) { alert("Monto inválido"); saveBtn.disabled=false; return; }

    const account = accountsCache.find(a => a.id === accId);
    let tax = 0;
    if (!id && account && account.isTaxable) tax = Math.ceil(amount * 0.004);
    const totalDeduction = amount + tax;

    if (!id && account && account.balance < totalDeduction) { alert("Fondos insuficientes."); saveBtn.disabled=false; return; }

    try {
        const batch = writeBatch(db);
        const data = {
            date: dateInput.value,
            category: catInput.value,
            description: descInput.value,
            updatedAt: serverTimestamp()
        };

        if (id) {
            await updateDoc(doc(db, "expenses", id), data);
        } else {
            data.amount = amount;
            data.accountId = accId;
            data.accountName = account.name;
            data.createdAt = serverTimestamp();
            
            const expenseRef = doc(collection(db, "expenses"));
            batch.set(expenseRef, data);

            const accRef = doc(db, "accounts", accId);
            batch.update(accRef, { balance: increment(-totalDeduction) });

            const logRef = doc(collection(db, "transactions"));
            batch.set(logRef, {
                accountId: accId,
                type: 'expense',
                amount: -amount,
                description: `Gasto: ${descInput.value}`,
                date: serverTimestamp()
            });

            if (tax > 0) {
                const taxLogRef = doc(collection(db, "transactions"));
                batch.set(taxLogRef, { accountId: accId, type: 'tax_gmf', amount: -tax, description: `GMF 4x1000 Gasto`, date: serverTimestamp() });
            }
            await batch.commit();
        }
        
        closeModal();
        loadExpenses('reset'); 

    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar.");
    } finally {
        saveBtn.innerHTML = 'Registrar Gasto';
        saveBtn.disabled = false;
    }
});

// --- 6. ELIMINAR CON REVERSO, 4x1000 Y DEUDAS DE PROVEEDOR ---
window.deleteExpense = async (id, description) => {
    const reason = prompt(`ATENCIÓN: Se anulará "${description}".\nSe devolverá el dinero a la cuenta.\n\nMotivo de anulación:`);
    if (!reason) return;

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Leer Gasto Original
            const expenseRef = doc(db, "expenses", id);
            const expenseSnap = await transaction.get(expenseRef);
            if (!expenseSnap.exists()) throw "El gasto no existe.";
            const expenseData = expenseSnap.data();

            const amount = parseFloat(expenseData.amount || 0);
            const accountId = expenseData.accountId;

            // 2. Devolver Dinero a la Cuenta
            if (accountId && amount > 0) {
                const accRef = doc(db, "accounts", accountId);
                const accSnap = await transaction.get(accRef);
                
                let refundAmount = amount;
                
                // Evaluar si la cuenta aplicaba 4x1000, para devolverlo también
                if (accSnap.exists() && accSnap.data().isTaxable) {
                    const originalTax = Math.ceil(amount * 0.004);
                    refundAmount += originalTax;
                }

                transaction.update(accRef, { balance: increment(refundAmount) });

                // Registrar Reversión en Extracto
                const txRef = doc(collection(db, "transactions"));
                transaction.set(txRef, {
                    accountId: accountId,
                    type: 'reversal',
                    amount: refundAmount, // Positivo, porque vuelve a entrar
                    description: `Devolución por anulación: ${description}`,
                    date: serverTimestamp()
                });
            }

            // 3. SI EL GASTO ERA DE UN PROVEEDOR, DEVOLVER DEUDA
            // (Requiere buscar en la transacción qué factura se pagó, lo buscaremos por description simple o asumiendo que es todo el gasto)
            // Como no guardamos el billId directo en expenses, la regla es: si fue pago_proveedor o compra_inventario
            // y encontramos una factura con monto similar, se podría revertir, pero lo ideal es requerir intervención manual
            // Para simplificar, advertiremos al usuario:
            if (expenseData.category === 'pago_proveedor' || expenseData.category === 'compra_inventario') {
                alert(`⚠️ ATENCIÓN MODO MANUAL:\nEste gasto estaba asociado a un proveedor o compra. El dinero volvió a su cuenta, pero debe ir a "Proveedores" o "Compras" y restaurar manualmente el saldo de la deuda (factura) si corresponde.`);
            }

            // 4. Auditoría (Papelera)
            const auditRef = doc(collection(db, "audit_deleted_expenses"));
            transaction.set(auditRef, {
                originalData: expenseData,
                deletedAt: serverTimestamp(),
                deletedReason: reason,
                user: auth.currentUser.email
            });

            // 5. Borrar Gasto Final
            transaction.delete(expenseRef);
        });

        alert("Gasto anulado. El dinero ha regresado a la cuenta.");
        loadExpenses('reset');

    } catch (error) {
        console.error("Error eliminando:", error);
        alert("Error al anular: " + error);
    }
};

// --- 7. VISOR DE AUDITORÍA ---
window.openAuditModal = async () => {
    auditTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500"><i class="fas fa-circle-notch fa-spin"></i> Cargando historial...</td></tr>`;
    auditModal.classList.remove('hidden'); auditModal.classList.add('flex');

    const q = query(collection(db, "audit_deleted_expenses"), orderBy("deletedAt", "desc"), limit(50));
    
    try {
        const snap = await getDocs(q);
        if(snap.empty) {
            auditTableBody.innerHTML = `<tr><td colspan="4" class="p-12 text-center text-gray-500 italic">La papelera está vacía.</td></tr>`;
            return;
        }

        auditTableBody.innerHTML = snap.docs.map(d => {
            const log = d.data();
            const delDate = log.deletedAt ? new Date(log.deletedAt.seconds * 1000).toLocaleString() : '-';
            const origDate = log.originalData.date || '-';
            return `
                <tr class="border-b border-gray-800 hover:bg-white/5 transition-colors">
                    <td class="p-4">
                        <div class="text-white text-xs font-bold">${delDate}</div>
                        <div class="text-[10px] text-gray-500 font-mono mt-0.5"><i class="fas fa-user mr-1"></i>${log.user || 'Sistema'}</div>
                    </td>
                    <td class="p-4">
                        <div class="text-gray-300 text-sm font-medium">${log.originalData.description}</div>
                        <div class="text-[10px] text-gray-500 mt-0.5"><i class="fas fa-calendar mr-1"></i>${origDate} | <span class="uppercase tracking-wider">${formatCategory(log.originalData.category)}</span></div>
                    </td>
                    <td class="p-4 text-xs italic text-gray-400">"${log.deletedReason}"</td>
                    <td class="p-4 text-right text-green-400 font-mono text-sm font-bold">+${copFormatter.format(log.originalData.amount)}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error("Error audit:", error);
        auditTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Error permisos de consulta.</td></tr>`;
    }
};

// Helpers & Modals
function formatCategory(cat) { 
    if (!cat) return '-'; 
    return cat.replace('_', ' ').toUpperCase(); 
}

window.formatCurrencyInput = (input) => {
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; }
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};

window.openModal = () => {
    form.reset();
    idInput.value = "";
    dateInput.valueAsDate = new Date();
    amountInput.disabled = false; amountInput.classList.remove('opacity-50', 'cursor-not-allowed');
    accountSelect.disabled = false; accountSelect.classList.remove('opacity-50', 'cursor-not-allowed');
    editWarning.classList.add('hidden'); taxPreview.classList.add('hidden'); accountBalanceDisplay.textContent = "";
    modalTitle.textContent = "Nuevo Gasto";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.editExpense = (id, dataString) => {
    const data = JSON.parse(decodeURIComponent(dataString));
    idInput.value = id;
    dateInput.value = data.date;
    catInput.value = data.category;
    descInput.value = data.description;
    
    amountInput.value = copFormatter.format(data.amount);
    amountInput.disabled = true; amountInput.classList.add('opacity-50', 'cursor-not-allowed');
    accountSelect.value = data.accountId || "";
    accountSelect.disabled = true; accountSelect.classList.add('opacity-50', 'cursor-not-allowed');
    
    editWarning.classList.remove('hidden'); taxPreview.classList.add('hidden'); accountBalanceDisplay.textContent = "";
    modalTitle.textContent = "Ver Detalle de Gasto";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };