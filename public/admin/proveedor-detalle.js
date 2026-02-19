import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { doc, getDoc, collection, query, where, getDocs, orderBy, addDoc, serverTimestamp, runTransaction, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM Info
const pName = document.getElementById('pName');
const pCatBadge = document.getElementById('pCatBadge');
const pNit = document.getElementById('pNit');
const pContact = document.getElementById('pContact');
const pPhone = document.getElementById('pPhone');
const pBank = document.getElementById('pBank');
const pAccount = document.getElementById('pAccount');
const pQr = document.getElementById('pQr');

const totalDebtDisplay = document.getElementById('totalDebt');
const modalDebtDisplay = document.getElementById('modalDebtDisplay');
const debtsTableBody = document.getElementById('debtsTableBody');

// DOM Modals
const debtModal = document.getElementById('debtModal');
const debtForm = document.getElementById('debtForm');
const debtDesc = document.getElementById('debtDesc');
const debtAmount = document.getElementById('debtAmount');

const payModal = document.getElementById('payModal');
const payForm = document.getElementById('payForm');
const payAmount = document.getElementById('payAmount');
const expenseAccount = document.getElementById('expenseAccount');

const urlParams = new URLSearchParams(window.location.search);
const supplierId = urlParams.get('id');
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

let currentGlobalDebt = 0;
let pendingBillsCache = []; // Almacena facturas con deuda ordenadas por fecha
let accountsCache = []; // <-- AÑADIR ESTA LÍNEA AQUÍ

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    getDoc(doc(db, "users", user.uid)).then(s => { if(s.exists()) updateSidebarUser(user, s.data()) });

    if (!supplierId) { alert("Proveedor inválido"); window.location.href = 'proveedores.html'; return; }

    await loadSupplierProfile();
    await loadAccountsForExpense();
    loadBills();
});

// 1. CARGAR PERFIL
async function loadSupplierProfile() {
    try {
        const docSnap = await getDoc(doc(db, "suppliers", supplierId));
        if (!docSnap.exists()) throw "No encontrado";
        
        const data = docSnap.data();
        
        pName.textContent = data.companyName;
        pNit.textContent = `NIT: ${data.nit || 'No registrado'}`;
        pContact.textContent = data.contactName || 'Sin contacto';
        pPhone.textContent = data.phone || '-';

        pCatBadge.textContent = data.category;
        if(data.category === 'taller') pCatBadge.className = 'px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-900/30 text-blue-400 border border-blue-900';
        else if(data.category === 'telas') pCatBadge.className = 'px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-900/30 text-green-400 border border-green-900';

        // Bancos
        if (data.bankName || data.accountType) {
            pBank.textContent = `${data.bankName || 'Banco'} - ${data.accountType || ''}`;
            pAccount.innerHTML = `# ${data.accountNumber || '-'} <br> Llave: ${data.accountKey || '-'}`;
        } else {
            pBank.textContent = "No registrado";
            pAccount.textContent = "Actualice el proveedor para añadir cuentas";
        }

        if (data.qrUrl) {
            pQr.src = data.qrUrl;
            pQr.classList.remove('hidden');
            pQr.onclick = () => window.open(data.qrUrl);
        }

    } catch (error) {
        console.error(error);
        pName.textContent = "Error cargando datos";
    }
}

// 2. CARGAR FACTURAS Y CALCULAR DEUDA (Colección: supplier_bills)
async function loadBills() {
    try {
        const q = query(collection(db, "supplier_bills"), where("supplierId", "==", supplierId));
        const snap = await getDocs(q);
        
        let bills = [];
        currentGlobalDebt = 0;
        pendingBillsCache = [];

        snap.forEach(d => {
            const data = d.data();
            data.id = d.id;
            bills.push(data);
            
            if (data.balanceDue > 0) {
                currentGlobalDebt += data.balanceDue;
                pendingBillsCache.push(data);
            }
        });

        // Ordenar por fecha (Viejas primero para el cache FIFO, Nuevas primero para la tabla)
        bills.sort((a, b) => new Date(b.date) - new Date(a.date)); // Tabla (Descendente)
        pendingBillsCache.sort((a, b) => new Date(a.date) - new Date(b.date)); // FIFO (Ascendente)

        totalDebtDisplay.textContent = cop.format(currentGlobalDebt);
        if (currentGlobalDebt === 0) totalDebtDisplay.className = "text-4xl font-mono font-bold text-green-500";
        else totalDebtDisplay.className = "text-4xl font-mono font-bold text-red-500";

        if (bills.length === 0) {
            debtsTableBody.innerHTML = `<tr><td colspan="4" class="p-12 text-center text-gray-500 italic">No hay facturas o trabajos registrados.</td></tr>`;
            return;
        }

        debtsTableBody.innerHTML = bills.map(b => {
            const isPaid = b.balanceDue <= 0;
            const statusHtml = isPaid 
                ? `<span class="bg-green-900/30 text-green-400 border border-green-900 px-2 py-0.5 rounded text-[10px] uppercase font-bold">Pagado</span>`
                : `<span class="bg-red-900/30 text-red-400 border border-red-900 px-2 py-0.5 rounded text-[10px] uppercase font-bold">Deuda</span>`;

            const dateStr = b.date ? new Date(b.date).toLocaleDateString('es-CO') : '-';

            return `
                <tr class="hover:bg-white/5 transition border-b border-gray-800/50">
                    <td class="px-6 py-4">
                        <div class="text-gray-400 font-mono text-xs mb-0.5">${dateStr}</div>
                        <div class="text-white text-sm font-medium">${b.description}</div>
                    </td>
                    <td class="px-6 py-4 text-right font-mono text-gray-300">
                        ${cop.format(b.totalAmount)}
                    </td>
                    <td class="px-6 py-4 text-right font-mono font-bold ${isPaid ? 'text-gray-600' : 'text-red-400'}">
                        ${cop.format(b.balanceDue)}
                    </td>
                    <td class="px-6 py-4 text-center">
                        ${statusHtml}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error(error);
        debtsTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">Error cargando historial.</td></tr>`;
    }
}

// 3. REGISTRAR DEUDA (COMPRA/TRABAJO)
debtForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawAmt = debtAmount.value.replace(/\D/g, '');
    const amount = parseFloat(rawAmt || 0);

    if (amount <= 0) return;

    try {
        await addDoc(collection(db, "supplier_bills"), {
            supplierId: supplierId,
            description: debtDesc.value,
            totalAmount: amount,
            balanceDue: amount,
            date: new Date().toISOString(),
            createdAt: serverTimestamp()
        });
        closeDebtModal();
        loadBills();
    } catch (error) {
        console.error(error);
        alert("Error al registrar deuda");
    }
});

// 4. LÓGICA DE PAGO (SISTEMA FIFO + 4x1000 + Sincronización con Compras)
async function loadAccountsForExpense() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"));
    const snap = await getDocs(q);
    expenseAccount.innerHTML = '<option value="">Seleccionar cuenta origen...</option>';
    accountsCache = []; // Limpiar caché
    snap.forEach(d => {
        const acc = d.data();
        acc.id = d.id;
        accountsCache.push(acc);
        expenseAccount.innerHTML += `<option value="${d.id}">${acc.name}</option>`;
    });
}

payForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawAmt = payAmount.value.replace(/\D/g, '');
    let paymentAmount = parseFloat(rawAmt || 0);
    const accountId = expenseAccount.value;

    if (paymentAmount <= 0) return;
    if (!accountId) { alert("Seleccione una cuenta"); return; }
    if (paymentAmount > currentGlobalDebt) { alert("El pago no puede superar la deuda total."); return; }
    if (pendingBillsCache.length === 0) { alert("No hay facturas pendientes a las que abonar."); return; }

    if(!confirm(`¿Registrar abono por ${cop.format(paymentAmount)}?\nEl sistema pagará las facturas más antiguas primero.`)) return;

    // --- CÁLCULO DE IMPUESTO 4x1000 OCULTO ---
    const acc = accountsCache.find(a => a.id === accountId);
    let tax = 0;
    if (acc && acc.isTaxable) {
        tax = Math.ceil(paymentAmount * 0.004);
    }
    const totalDeduction = paymentAmount + tax;

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Validar Cuenta
            const accRef = doc(db, "accounts", accountId);
            const accDoc = await transaction.get(accRef);
            if (!accDoc.exists()) throw "Cuenta no existe.";

            // 2. Descontar Cuenta (Monto del pago + Impuesto)
            transaction.update(accRef, { balance: increment(-totalDeduction) });

            // 3. Crear Registro de Gasto
            const expenseRef = doc(collection(db, "expenses"));
            transaction.set(expenseRef, {
                date: new Date().toISOString().split('T')[0],
                category: 'pago_proveedor',
                description: `Abono a Proveedor: ${pName.textContent}`,
                amount: paymentAmount,
                accountId: accountId,
                createdAt: serverTimestamp()
            });

            // 4. Crear Registro Transacción (Extracto negativo)
            const txRef = doc(collection(db, "transactions"));
            transaction.set(txRef, {
                accountId: accountId,
                type: 'expense',
                amount: -paymentAmount,
                description: `Pago Proveedor: ${pName.textContent}`,
                date: serverTimestamp(),
                category: 'pago_proveedor'
            });

            // 5. Crear Registro de Impuesto 4x1000 (Si aplica)
            if (tax > 0) {
                const taxLogRef = doc(collection(db, "transactions"));
                transaction.set(taxLogRef, {
                    accountId: accountId,
                    type: 'tax_gmf',
                    amount: -tax,
                    description: `GMF 4x1000 (Abono a ${pName.textContent})`,
                    date: serverTimestamp(),
                    category: 'impuestos'
                });
            }

            // 6. DISTRIBUCIÓN FIFO A FACTURAS Y COMPRAS
            let remainingPayment = paymentAmount;

            for (const bill of pendingBillsCache) {
                if (remainingPayment <= 0) break; // Si ya se gastó el abono, salimos del loop
                
                const billRef = doc(db, "supplier_bills", bill.id);
                let amountAppliedToThisBill = 0;
                
                if (remainingPayment >= bill.balanceDue) {
                    // Paga esta factura completa
                    amountAppliedToThisBill = bill.balanceDue;
                    remainingPayment -= bill.balanceDue;
                    transaction.update(billRef, { balanceDue: 0 });
                } else {
                    // Paga solo una parte de esta factura
                    amountAppliedToThisBill = remainingPayment;
                    transaction.update(billRef, { balanceDue: increment(-remainingPayment) });
                    remainingPayment = 0;
                }

                // NUEVO: Sincronizar el saldo con la tabla original de Compras
                if (bill.type === 'compra_inventario' && bill.relatedPurchaseId) {
                    const purchaseRef = doc(db, "purchases", bill.relatedPurchaseId);
                    transaction.update(purchaseRef, { balanceDue: increment(-amountAppliedToThisBill) });
                }
            }
        });

        alert("Pago distribuido correctamente.");
        closePayModal();
        loadBills();

    } catch (error) {
        console.error(error);
        alert("Error en la transacción de pago.");
    }
});

// Helpers
window.formatCurrencyInput = (input) => { 
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; } 
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value)); 
};

window.openDebtModal = () => {
    debtForm.reset();
    debtModal.classList.remove('hidden'); debtModal.classList.add('flex');
};
window.closeDebtModal = () => { debtModal.classList.add('hidden'); debtModal.classList.remove('flex'); };

window.openPayModal = () => {
    if (currentGlobalDebt <= 0) { alert("No hay deuda pendiente."); return; }
    payForm.reset();
    modalDebtDisplay.textContent = cop.format(currentGlobalDebt);
    payAmount.value = cop.format(currentGlobalDebt); // Sugerir pago total por defecto
    payModal.classList.remove('hidden'); payModal.classList.add('flex');
};
window.closePayModal = () => { payModal.classList.add('hidden'); payModal.classList.remove('flex'); };