import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, query, orderBy, where, limit, startAfter, startAt, serverTimestamp, writeBatch, increment, getAggregateFromServer, sum } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const tableBody = document.getElementById('expensesTableBody');
const monthTotalDisplay = document.getElementById('monthTotalDisplay');
const monthFilter = document.getElementById('monthFilter');

// Paginación
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');

// Modal Gasto
const modal = document.getElementById('expenseModal');
const form = document.getElementById('expenseForm');
const modalTitle = document.getElementById('modalTitle');

// Inputs
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

// Modal Auditoría
const auditModal = document.getElementById('auditModal');
const auditTableBody = document.getElementById('auditTableBody');

// --- ESTADO ---
let accountsCache = [];
let lastVisibleDoc = null; 
let firstVisibleDoc = null; 
let currentPage = 1;
let pageStack = []; // Pila para navegación atrás

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// --- 1. INICIALIZACIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    // Set mes actual por defecto
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    monthFilter.value = `${now.getFullYear()}-${month}`;

    await loadAccounts();
    loadExpenses('first'); 
});

// --- 2. LÓGICA DE CARGA DE GASTOS (Paginada) ---
monthFilter.addEventListener('change', () => loadExpenses('first'));
nextPageBtn.addEventListener('click', () => loadExpenses('next'));
prevPageBtn.addEventListener('click', () => loadExpenses('prev'));

async function loadExpenses(direction) {
    const monthVal = monthFilter.value;
    if (!monthVal) return;

    // Rango de fechas del mes
    const [year, month] = monthVal.split('-');
    const lastDay = new Date(year, month, 0).getDate();
    const startDateStr = `${year}-${month}-01`;
    const endDateStr = `${year}-${month}-${lastDay}`;

    // Query Base
    let q = query(
        collection(db, "expenses"),
        where("date", ">=", startDateStr),
        where("date", "<=", endDateStr),
        orderBy("date", "desc"),
        limit(30)
    );

    // Paginación
    if (direction === 'next' && lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
        pageStack.push(firstVisibleDoc);
        currentPage++;
    } else if (direction === 'prev' && pageStack.length > 0) {
        const prevDoc = pageStack.pop();
        q = query(
            collection(db, "expenses"),
            where("date", ">=", startDateStr),
            where("date", "<=", endDateStr),
            orderBy("date", "desc"),
            startAt(prevDoc),
            limit(30)
        );
        currentPage--;
    } else {
        // Reset / Primera carga
        currentPage = 1;
        pageStack = [];
    }

    tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500"><i class="fas fa-circle-notch fa-spin"></i> Cargando...</td></tr>`;
    
    try {
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No hay gastos en este periodo.</td></tr>`;
            nextPageBtn.disabled = true;
            if (currentPage === 1) prevPageBtn.disabled = true;
            if (direction === 'first' || direction === 'reset') monthTotalDisplay.textContent = "$0";
            return;
        }

        firstVisibleDoc = snapshot.docs[0];
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        const rows = snapshot.docs.map(doc => {
            const data = doc.data();
            return `
                <tr class="hover:bg-gray-800/50 transition-colors group border-b border-gray-800/50">
                    <td class="px-6 py-4 text-gray-300 font-mono text-xs">${data.date}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded text-xs border border-gray-700 bg-gray-800 text-gray-400 capitalize">
                            ${formatCategory(data.category)}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-400">${data.description}</td>
                    <td class="px-6 py-4 text-xs text-gray-500">
                        ${data.accountName || '<span class="italic text-gray-600">Desconocido</span>'}
                    </td>
                    <td class="px-6 py-4 text-right text-red-400 font-medium font-mono">
                        -${copFormatter.format(data.amount)}
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                        <button onclick="window.editExpense('${doc.id}', '${encodeURIComponent(JSON.stringify(data))}')" 
                            class="text-soriano-gold hover:text-white transition p-1" title="Ver Info">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button onclick="window.deleteExpense('${doc.id}', '${data.description}')" 
                            class="text-gray-600 hover:text-red-500 transition p-1" title="Anular y Devolver Dinero">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tableBody.innerHTML = rows;

        // UI Updates
        if (pageIndicator) pageIndicator.textContent = `Página ${currentPage}`;
        if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = snapshot.docs.length < 30;

        // Calcular Total (Solo en primera carga o reset)
        if (direction === 'first' || direction === 'reset') {
            calculateMonthTotal(startDateStr, endDateStr);
        }

    } catch (error) {
        console.error("Error:", error);
        tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500 text-xs">Error de índice en Firebase. (Ver Consola)</td></tr>`;
    }
}

// Cálculo eficiente en Servidor
async function calculateMonthTotal(startDateStr, endDateStr) {
    monthTotalDisplay.textContent = "...";
    try {
        const coll = collection(db, "expenses");
        const q = query(coll, where("date", ">=", startDateStr), where("date", "<=", endDateStr));
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
        accountSelect.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type})</option>`;
    });
}

// --- 4. CÁLCULOS EN FORMULARIO ---
accountSelect.addEventListener('change', updateCalculation);
amountInput.addEventListener('input', updateCalculation);

function updateCalculation() {
    if (idInput.value) return; // No calcular si es edición

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

// --- 5. GUARDAR GASTO (Transacción) ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = idInput.value;
    const rawAmt = amountInput.value.replace(/\D/g, '');
    const amount = parseInt(rawAmt) || 0;
    const accId = accountSelect.value;
    
    if (!id && !accId) { alert("Seleccione cuenta de origen."); return; }
    if (amount <= 0) { alert("Monto inválido"); return; }

    const account = accountsCache.find(a => a.id === accId);
    let tax = 0;
    // Calcular solo si es nuevo
    if (!id && account && account.isTaxable) tax = Math.ceil(amount * 0.004);
    const totalDeduction = amount + tax;

    // Validar fondos solo si es nuevo
    if (!id && account && account.balance < totalDeduction) { alert("Fondos insuficientes."); return; }

    try {
        const batch = writeBatch(db);
        
        const data = {
            date: dateInput.value,
            category: catInput.value,
            description: descInput.value,
            updatedAt: serverTimestamp()
        };

        if (id) {
            // EDITAR (Solo datos, no financiero)
            await updateDoc(doc(db, "expenses", id), data);
            alert("Información actualizada.");
        } else {
            // CREAR (Con movimiento financiero)
            data.amount = amount;
            data.accountId = accId;
            data.accountName = account.name;
            data.createdAt = serverTimestamp();
            
            const expenseRef = doc(collection(db, "expenses"));
            batch.set(expenseRef, data);

            // 1. Restar
            const accRef = doc(db, "accounts", accId);
            batch.update(accRef, { balance: increment(-totalDeduction) });

            // 2. Log Extracto
            const logRef = doc(collection(db, "transactions"));
            batch.set(logRef, {
                accountId: accId,
                type: 'expense',
                amount: -amount,
                description: `Gasto: ${descInput.value} (${formatCategory(catInput.value)})`,
                date: serverTimestamp()
            });

            // 3. Log Impuesto
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
    }
});

// --- 6. ELIMINAR CON REVERSO Y AUDITORÍA ---
window.deleteExpense = async (id, description) => {
    const reason = prompt(`Para anular "${description}" y DEVOLVER el dinero, escriba el motivo:`);
    if (!reason) return;

    try {
        const expenseRef = doc(db, "expenses", id);
        const expenseSnap = await getDoc(expenseRef);
        
        if (!expenseSnap.exists()) { alert("El gasto ya no existe."); return; }

        const expenseData = expenseSnap.data();
        const amount = parseFloat(expenseData.amount);
        const accountId = expenseData.accountId;

        const batch = writeBatch(db);

        // 1. Devolver Dinero
        if (accountId && amount > 0) {
            const accRef = doc(db, "accounts", accountId);
            batch.update(accRef, { balance: increment(amount) });

            // 2. Log de Devolución en Extracto
            const txRef = doc(collection(db, "transactions"));
            batch.set(txRef, {
                accountId: accountId,
                type: 'reversal',
                amount: amount, 
                description: `Devolución por anulación: ${description}`,
                date: serverTimestamp()
            });
        }

        // 3. Auditoría (Papelera)
        const auditRef = doc(collection(db, "audit_deleted_expenses"));
        batch.set(auditRef, {
            originalData: expenseData,
            deletedAt: serverTimestamp(),
            deletedReason: reason,
            user: auth.currentUser.email
        });

        // 4. Borrar
        batch.delete(expenseRef);

        await batch.commit();
        alert("Gasto anulado correctamente.");
        loadExpenses('reset');

    } catch (error) {
        console.error("Error eliminando:", error);
        alert("Error al anular.");
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
            auditTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">No hay registros eliminados.</td></tr>`;
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
                        <div class="text-[10px] text-gray-500">Por: ${log.user || 'Sistema'}</div>
                    </td>
                    <td class="p-4">
                        <div class="text-gray-300 text-sm">${log.originalData.description}</div>
                        <div class="text-[10px] text-gray-500">${origDate} | ${log.originalData.category}</div>
                    </td>
                    <td class="p-4 text-xs italic text-gray-400">"${log.deletedReason}"</td>
                    <td class="p-4 text-right text-green-400 font-mono text-sm">+${copFormatter.format(log.originalData.amount)}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error("Error audit:", error);
        auditTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Error permisos.</td></tr>`;
    }
};

// Helpers & Modals
function formatCategory(cat) { if (!cat) return '-'; return cat.charAt(0).toUpperCase() + cat.slice(1); }

window.formatCurrencyInput = (input) => {
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; }
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};

window.openModal = () => {
    form.reset();
    idInput.value = "";
    dateInput.valueAsDate = new Date();
    amountInput.disabled = false; amountInput.classList.remove('opacity-50', 'bg-gray-800');
    accountSelect.disabled = false; accountSelect.classList.remove('opacity-50', 'bg-gray-800');
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
    amountInput.disabled = true; amountInput.classList.add('opacity-50', 'bg-gray-800');
    
    accountSelect.value = data.accountId || "";
    accountSelect.disabled = true; accountSelect.classList.add('opacity-50', 'bg-gray-800');
    
    editWarning.classList.remove('hidden'); taxPreview.classList.add('hidden'); accountBalanceDisplay.textContent = "";
    modalTitle.textContent = "Editar Gasto";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };