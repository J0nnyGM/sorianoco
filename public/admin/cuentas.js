import { auth, db, storage, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp, writeBatch, getDocs, limit, increment, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM ELEMENTS
const grid = document.getElementById('accountsGrid');

// Formulario
const modal = document.getElementById('accountModal');
const modalTitle = document.getElementById('modalTitle');
const form = document.getElementById('accountForm');
const saveBtn = document.getElementById('saveBtn');

const accId = document.getElementById('accountId');
const accName = document.getElementById('accName');
const accType = document.getElementById('accType');       // Banco/Nequi/Efectivo
const accSubtype = document.getElementById('accSubtype'); // Ahorros/Corriente
const accNumber = document.getElementById('accNumber');
const accKey = document.getElementById('accKey');         // NUEVO: Llave
const accTax = document.getElementById('accTax');
const accBalance = document.getElementById('accBalance');
const qrInput = document.getElementById('qrInput');
const qrPreview = document.getElementById('qrPreview');
const qrIcon = document.getElementById('qrIcon');
const currentQrUrl = document.getElementById('currentQrUrl');

// Contenedores Condicionales
const bankTypeContainer = document.getElementById('bankTypeContainer');
const numberContainer = document.getElementById('numberContainer');
const numberLabel = document.getElementById('numberLabel');
const keyContainer = document.getElementById('keyContainer');
const taxContainer = document.getElementById('taxContainer');

// Transfer y History Modals (Iguales que antes)
const transferModal = document.getElementById('transferModal');
const transferForm = document.getElementById('transferForm');
const sourceAccount = document.getElementById('sourceAccount');
const destAccount = document.getElementById('destAccount');
const transferAmount = document.getElementById('transferAmount');
const transferNote = document.getElementById('transferNote');
const taxPreview = document.getElementById('taxPreview');
const taxAmountDisplay = document.getElementById('taxAmountDisplay');
const sourceBalanceDisplay = document.getElementById('sourceBalanceDisplay');

const historyModal = document.getElementById('historyModal');
const historyTitle = document.getElementById('historyTitle');
const historyBody = document.getElementById('historyBody');
const historyMonthPicker = document.getElementById('historyMonthPicker');

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
let accountsCache = []; 
let currentHistoryAccountId = null;

// 1. INIT
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    subscribeAccounts();
});

// 2. LISTAR CUENTAS
function subscribeAccounts() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"), orderBy("name"));
    onSnapshot(q, (snapshot) => {
        accountsCache = [];
        if (snapshot.empty) {
            grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10">No hay cuentas activas.</div>`;
            return;
        }
        
        grid.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            data.id = doc.id;
            accountsCache.push(data);

            let icon = 'fa-wallet';
            let color = 'text-gray-400';
            let details = "";

            if(data.type === 'banco') { 
                icon = 'fa-university'; color = 'text-blue-400'; 
                // Ej: BANCO (Ahorros) | # 123... | Llave: ABC
                details = `
                    <div class="flex flex-col gap-1">
                        <span class="uppercase font-bold text-xs">BANCO <span class="text-gray-400 font-normal">(${data.subtype || '-'})</span></span>
                        <span class="text-gray-400 text-[10px]"># ${data.accountNumber}</span>
                        ${data.accountKey ? `<span class="text-soriano-gold text-[10px]">Llave: ${data.accountKey}</span>` : ''}
                    </div>
                `;
            }
            if(data.type === 'nequi') { 
                icon = 'fa-mobile-alt'; color = 'text-pink-500'; 
                details = `
                    <div class="flex flex-col gap-1">
                        <span class="uppercase font-bold text-xs">BILLETERA</span>
                        <span class="text-gray-400 text-[10px]">Cel: ${data.accountNumber}</span>
                        ${data.accountKey ? `<span class="text-soriano-gold text-[10px]">Llave: ${data.accountKey}</span>` : ''}
                    </div>
                `;
            }
            if(data.type === 'efectivo') { 
                icon = 'fa-money-bill-wave'; color = 'text-green-500'; 
                details = `<span class="uppercase font-bold text-green-400 text-xs">CAJA FÍSICA</span>`;
            }

            const taxBadge = data.isTaxable ? '<span class="ml-2 px-2 py-0.5 rounded bg-red-900/40 text-red-400 text-[10px] border border-red-900">4x1000</span>' : '';
            const qrThumb = data.qrUrl ? `<img src="${data.qrUrl}" class="w-8 h-8 rounded border border-gray-600 object-cover ml-auto cursor-pointer hover:scale-150 transition shadow-lg" onclick="window.open('${data.qrUrl}')" title="Ver QR">` : '';
            const dataStr = encodeURIComponent(JSON.stringify(data));

            return `
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 hover:border-gray-600 transition shadow-lg relative group flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-start mb-4">
                            <div class="p-3 bg-gray-800 rounded-lg ${color} text-xl shadow-inner">
                                <i class="fas ${icon}"></i>
                            </div>
                            <div class="flex space-x-2 items-center">
                                ${qrThumb}
                                <button onclick="window.openModal('${doc.id}', '${dataStr}')" class="text-gray-500 hover:text-white transition p-2 hover:bg-gray-800 rounded"><i class="fas fa-pencil-alt"></i></button>
                                <button onclick="window.archiveAccount('${doc.id}', '${data.balance}')" class="text-gray-600 hover:text-orange-500 transition opacity-0 group-hover:opacity-100 p-2 hover:bg-gray-800 rounded"><i class="fas fa-archive"></i></button>
                            </div>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2 flex items-center">${data.name} ${taxBadge}</h3>
                        <div class="mb-4 font-mono">${details}</div>
                    </div>
                    <div>
                        <div class="text-2xl font-mono text-white border-t border-gray-800 pt-4 mb-3">${copFormatter.format(data.balance)}</div>
                        <button onclick="window.viewHistory('${doc.id}', '${data.name}')" class="w-full text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded transition border border-gray-700"><i class="fas fa-list-ul mr-2"></i> Ver Extracto</button>
                    </div>
                </div>
            `;
        }).join('');
    });
}

// 3. LÓGICA DE CAMPOS (UI)
accType.addEventListener('change', toggleAccountFields);

function toggleAccountFields() {
    const type = accType.value;

    if (type === 'efectivo') {
        // Ocultar todo lo bancario
        bankTypeContainer.classList.add('hidden');
        numberContainer.classList.add('hidden');
        keyContainer.classList.add('hidden');
        taxContainer.classList.add('opacity-50', 'pointer-events-none'); 
        accTax.checked = false;
        
        accNumber.value = "";
        accKey.value = "";
    } 
    else if (type === 'nequi') {
        // Billetera: Sin Subtipo, Con Celular y Llave
        bankTypeContainer.classList.add('hidden');
        numberContainer.classList.remove('hidden');
        numberLabel.textContent = "Número Celular";
        accNumber.placeholder = "Ej. 300 123 4567";
        keyContainer.classList.remove('hidden');
        taxContainer.classList.remove('opacity-50', 'pointer-events-none');
    } 
    else {
        // Banco: Todo visible
        bankTypeContainer.classList.remove('hidden');
        numberContainer.classList.remove('hidden');
        numberLabel.textContent = "# Cuenta";
        accNumber.placeholder = "Ej. 031-456-789";
        keyContainer.classList.remove('hidden');
        taxContainer.classList.remove('opacity-50', 'pointer-events-none');
    }
}

// 4. GUARDAR CUENTA
qrInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => { qrPreview.src = e.target.result; qrPreview.classList.remove('hidden'); qrIcon.classList.add('hidden'); };
        reader.readAsDataURL(file);
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const rawBal = accBalance.value.replace(/\D/g, '');
    const balanceVal = parseInt(rawBal) || 0;
    
    try {
        let qrUrl = currentQrUrl.value;
        if (qrInput.files[0]) {
            const file = qrInput.files[0];
            const storageRef = ref(storage, `cuentas_qr/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            qrUrl = await getDownloadURL(storageRef);
        }

        const data = {
            name: accName.value,
            type: accType.value,
            subtype: accType.value === 'banco' ? accSubtype.value : null, // Guardar Ahorros/Corriente
            accountNumber: accNumber.value || "",
            accountKey: accKey.value || "", // Guardar Llave
            isTaxable: accTax.checked,
            qrUrl: qrUrl,
            status: 'active',
            updatedAt: serverTimestamp()
        };

        if (accId.value) {
            await updateDoc(doc(db, "accounts", accId.value), data);
        } else {
            data.balance = balanceVal;
            data.createdAt = serverTimestamp();
            const batch = writeBatch(db);
            const newRef = doc(collection(db, "accounts"));
            batch.set(newRef, data);
            if(balanceVal > 0) {
                const logRef = doc(collection(db, "transactions"));
                batch.set(logRef, { accountId: newRef.id, type: 'saldo_inicial', amount: balanceVal, description: 'Saldo Inicial', date: serverTimestamp() });
            }
            await batch.commit();
        }
        closeModal();
    } catch (e) { console.error(e); alert("Error: " + e.message); } 
    finally { saveBtn.disabled = false; saveBtn.textContent = originalText; }
});

// 5. TRANSFERENCIAS
sourceAccount.addEventListener('change', () => { updateTaxPreview(); validateAccounts(); });
destAccount.addEventListener('change', () => { validateAccounts(); });
transferAmount.addEventListener('input', updateTaxPreview);

function validateAccounts() {
    const srcId = sourceAccount.value;
    const dstId = destAccount.value;
    if (srcId && dstId && srcId === dstId) { alert("Cuentas iguales no permitidas"); destAccount.value = ""; }
}

function updateTaxPreview() {
    const srcId = sourceAccount.value;
    const rawAmt = transferAmount.value.replace(/\D/g, '');
    const amountToTransfer = parseInt(rawAmt) || 0;
    const account = accountsCache.find(a => a.id === srcId);
    
    if(account) {
        let displayHtml = "";
        if (account.isTaxable) {
            const maxTransferable = Math.floor(account.balance / 1.004);
            const reservedForTax = account.balance - maxTransferable;
            displayHtml = `<span class="block text-gray-400">Saldo: ${copFormatter.format(account.balance)}</span><span class="block text-soriano-gold font-bold text-xs mt-1">Disp. Retiro: ${copFormatter.format(maxTransferable)}</span>`;
        } else {
            displayHtml = `<span class="text-green-400">Disponible: ${copFormatter.format(account.balance)}</span>`;
        }
        sourceBalanceDisplay.innerHTML = displayHtml;

        if (account.isTaxable && amountToTransfer > 0) {
            const tax = Math.ceil(amountToTransfer * 0.004);
            taxAmountDisplay.textContent = `-${copFormatter.format(tax)}`;
            taxPreview.classList.remove('hidden');
            if ((amountToTransfer + tax) > account.balance) {
                taxPreview.className = "bg-red-900/40 p-3 rounded border border-red-500 text-sm flex justify-between items-center animate-pulse";
                taxAmountDisplay.innerHTML = `Insuficiente (Falta ${copFormatter.format((amountToTransfer + tax) - account.balance)})`;
            } else {
                taxPreview.className = "bg-red-900/20 p-3 rounded border border-red-900/50 text-sm flex justify-between items-center";
            }
        } else { taxPreview.classList.add('hidden'); }
    } else { sourceBalanceDisplay.textContent = "Seleccione origen"; taxPreview.classList.add('hidden'); }
}

transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const srcId = sourceAccount.value;
    const dstId = destAccount.value;
    const rawAmt = transferAmount.value.replace(/\D/g, '');
    const amount = parseInt(rawAmt) || 0;
    const note = transferNote.value || "Transferencia";

    if(srcId === dstId) { alert("Error cuentas iguales"); return; }
    if(amount <= 0) { alert("Monto inválido"); return; }

    const srcAcc = accountsCache.find(a => a.id === srcId);
    const dstAcc = accountsCache.find(a => a.id === dstId);
    let tax = srcAcc.isTaxable ? Math.ceil(amount * 0.004) : 0;
    const totalDeduction = amount + tax;

    if(srcAcc.balance < totalDeduction) { alert(`SALDO INSUFICIENTE. Requieres ${copFormatter.format(totalDeduction)}`); return; }
    if(!confirm(`¿Transferir ${copFormatter.format(amount)}?\n(+ ${copFormatter.format(tax)} impuesto)`)) return;

    try {
        const batch = writeBatch(db);
        const srcRef = doc(db, "accounts", srcId);
        batch.update(srcRef, { balance: increment(-totalDeduction) });
        const dstRef = doc(db, "accounts", dstId);
        batch.update(dstRef, { balance: increment(amount) });

        const date = serverTimestamp();
        batch.set(doc(collection(db, "transactions")), { accountId: srcId, relatedAccountId: dstId, type: 'transfer_out', amount: -amount, description: `A: ${dstAcc.name}. ${note}`, date: date });
        if(tax > 0) batch.set(doc(collection(db, "transactions")), { accountId: srcId, type: 'tax_gmf', amount: -tax, description: `GMF 4x1000 Transf.`, date: date });
        batch.set(doc(collection(db, "transactions")), { accountId: dstId, relatedAccountId: srcId, type: 'transfer_in', amount: amount, description: `De: ${srcAcc.name}. ${note}`, date: date });

        await batch.commit();
        alert("Transferencia exitosa.");
        closeTransferModal();
    } catch (e) { console.error(e); alert("Error al transferir."); }
});

// --- 6. EXTRACTO MENSUAL ---
window.viewHistory = async (id, name) => {
    currentHistoryAccountId = id;
    historyTitle.textContent = name;
    historyModal.classList.remove('hidden'); historyModal.classList.add('flex');
    if (!historyMonthPicker.value) {
        const now = new Date();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        historyMonthPicker.value = `${now.getFullYear()}-${month}`;
    }
    filterHistory();
};

window.filterHistory = async () => {
    const id = currentHistoryAccountId;
    const monthVal = historyMonthPicker.value;
    if (!monthVal) return;
    historyBody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-gray-500"><i class="fas fa-circle-notch fa-spin"></i> Cargando...</td></tr>`;

    const [year, month] = monthVal.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const q = query(collection(db, "transactions"), where("accountId", "==", id), where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date", "desc"));
    
    try {
        const snap = await getDocs(q);
        if(snap.empty) { historyBody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-gray-500">Sin movimientos.</td></tr>`; return; }
        historyBody.innerHTML = snap.docs.map(d => {
            const tx = d.data();
            const dateObj = tx.date ? new Date(tx.date.seconds * 1000) : new Date();
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const colorClass = tx.amount < 0 ? 'text-red-400' : 'text-green-400 font-bold';
            
            let icon = '<i class="fas fa-circle text-[6px] mr-2 text-gray-600"></i>';
            if(tx.type === 'tax_gmf') icon = '<i class="fas fa-percentage mr-2 text-red-700"></i>';
            if(tx.type === 'transfer_out') icon = '<i class="fas fa-arrow-right mr-2 text-red-500"></i>';
            if(tx.type === 'transfer_in') icon = '<i class="fas fa-arrow-left mr-2 text-green-500"></i>';
            if(tx.type === 'saldo_inicial') icon = '<i class="fas fa-star mr-2 text-yellow-500"></i>';

            return `<tr class="hover:bg-gray-800/50 border-b border-gray-800/50"><td class="p-4 text-xs text-gray-400 whitespace-nowrap">${dateStr}</td><td class="p-4 text-sm text-gray-300"><div class="flex items-center">${icon} ${tx.description}</div></td><td class="p-4 text-right font-mono text-sm ${colorClass}">${copFormatter.format(tx.amount)}</td></tr>`;
        }).join('');
    } catch (e) { console.error(e); historyBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-500 text-xs">Error de índice. Revise la consola.</td></tr>`; }
};

// Utilidades
window.formatCurrencyInput = (input) => {
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; }
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};

window.openModal = (id = null, dataStr = null) => {
    form.reset();
    qrPreview.src = ""; qrPreview.classList.add('hidden'); qrIcon.classList.remove('hidden'); currentQrUrl.value = "";

    if (id && dataStr) {
        const data = JSON.parse(decodeURIComponent(dataStr));
        accId.value = id;
        accName.value = data.name;
        accType.value = data.type;
        accSubtype.value = data.subtype || "Ahorros"; // Set Subtype
        accNumber.value = data.accountNumber || "";
        accKey.value = data.accountKey || ""; // Set Key
        accTax.checked = data.isTaxable || false;
        
        toggleAccountFields(); // Mostrar campos correctos según tipo

        accBalance.value = copFormatter.format(data.balance); 
        accBalance.disabled = true; 

        if (data.qrUrl) {
            currentQrUrl.value = data.qrUrl;
            qrPreview.src = data.qrUrl;
            qrPreview.classList.remove('hidden');
            qrIcon.classList.add('hidden');
        }
        modalTitle.textContent = "Editar Cuenta";
        saveBtn.textContent = "Guardar Cambios";
    } else {
        accId.value = "";
        accType.value = "banco";
        toggleAccountFields();
        accBalance.value = "";
        accBalance.disabled = false; 
        modalTitle.textContent = "Nueva Cuenta";
        saveBtn.textContent = "Crear Cuenta";
    }
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
window.closeHistoryModal = () => { historyModal.classList.add('hidden'); historyModal.classList.remove('flex'); };
window.archiveAccount = async (id, balance) => { 
    if(parseInt(balance) > 0) { alert("Transfiere el saldo a 0 antes de archivar."); return; }
    if(confirm("¿Archivar cuenta?")) await updateDoc(doc(db, "accounts", id), { status: 'archived', updatedAt: serverTimestamp() });
};

window.openTransferModal = () => {
    transferForm.reset();
    taxPreview.classList.add('hidden');
    sourceBalanceDisplay.textContent = "Saldo: $0";
    const options = accountsCache.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    sourceAccount.innerHTML = '<option value="">Seleccionar...</option>' + options;
    destAccount.innerHTML = '<option value="">Seleccionar...</option>' + options;
    transferModal.classList.remove('hidden'); transferModal.classList.add('flex');
};
window.closeTransferModal = () => { transferModal.classList.add('hidden'); transferModal.classList.remove('flex'); };