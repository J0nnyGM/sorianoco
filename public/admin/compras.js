import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, getDocs, doc, writeBatch, onSnapshot, query, orderBy, serverTimestamp, increment, where, runTransaction } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM Elements
const tableBody = document.getElementById('purchasesTableBody');
const modal = document.getElementById('purchaseModal');
const materialSelect = document.getElementById('materialSelect');
const cartBody = document.getElementById('cartTableBody');
const cartTotalDisplay = document.getElementById('cartTotalDisplay');
const stockInputsContainer = document.getElementById('stockInputsContainer');

// Formulario Superior
const supplierSearch = document.getElementById('supplierSearch');
const supplierList = document.getElementById('supplierList');
const supplierIdInput = document.getElementById('supplierId');
const paymentAccount = document.getElementById('paymentAccount');

// Inputs Carrito
const addCost = document.getElementById('addCost');
const invoiceRef = document.getElementById('invoiceRef');
const purchaseDate = document.getElementById('purchaseDate');

// Modal Pago Directo
const payPurchaseModal = document.getElementById('payPurchaseModal');
const payPurchaseForm = document.getElementById('payPurchaseForm');
const payPurchaseAmount = document.getElementById('payPurchaseAmount');
const payPurchaseAccountSelect = document.getElementById('payPurchaseAccountSelect');
const payPurchaseDebtDisplay = document.getElementById('payPurchaseDebtDisplay');
const payPurchaseId = document.getElementById('payPurchaseId');
const payBillId = document.getElementById('payBillId');
const paySupplierName = document.getElementById('paySupplierName');

let cart = [];
let inventoryMap = {}; 
let suppliersCache = [];
let accountsCache = []; // Caché para validar 4x1000

const sizeConfigs = {
    'Camisa': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Chaqueta': ['34', '36', '38', '40', '42', '44'],
    'Pantalón': ['28', '30', '32', '34', '36', '38', '40', '42'],
    'Blazer': ['34', '36', '38', '40', '42', '44'],
    'Chaleco': ['34', '36', '38', '40', '42', '44'],
    'Calzado': ['38', '39', '40', '41', '42'],
    'Accesorio': ['Única']
};

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// 1. INIT
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    await loadData();
    subscribePurchases();
    purchaseDate.valueAsDate = new Date();
});

// 2. CARGA DE DATOS
async function loadData() {
    const supSnap = await getDocs(query(collection(db, "suppliers"), orderBy("companyName")));
    suppliersCache = [];
    supSnap.forEach(d => { suppliersCache.push({ id: d.id, name: d.data().companyName }); });

    const invSnap = await getDocs(query(collection(db, "inventory"), orderBy("name")));
    materialSelect.innerHTML = '<option value="">Seleccionar Ítem...</option>';
    invSnap.forEach(d => {
        const item = d.data();
        inventoryMap[d.id] = item;
        materialSelect.innerHTML += `<option value="${d.id}">${item.name} (${item.sku || 'S/N'})</option>`;
    });

    // Cuentas de Pago
    const accSnap = await getDocs(query(collection(db, "accounts"), where("status", "==", "active")));
    accountsCache = [];
    paymentAccount.innerHTML = '<option value="pendiente" class="text-orange-400 font-bold">Pendiente (Generar Deuda)</option>';
    payPurchaseAccountSelect.innerHTML = '<option value="">Seleccionar cuenta...</option>';
    
    accSnap.forEach(d => {
        const acc = d.data();
        acc.id = d.id;
        accountsCache.push(acc);
        paymentAccount.innerHTML += `<option value="${d.id}">Pagar de: ${acc.name}</option>`;
        payPurchaseAccountSelect.innerHTML += `<option value="${d.id}">${acc.name}</option>`;
    });
}

// 3. LÓGICA BUSCADOR PROVEEDOR
supplierSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    supplierList.innerHTML = '';
    
    if(term.length > 0) {
        const filtered = suppliersCache.filter(s => s.name.toLowerCase().includes(term));
        supplierList.classList.remove('hidden');
        supplierList.style.display = 'block'; 
        
        filtered.forEach(s => {
            const div = document.createElement('div');
            div.textContent = s.name;
            div.onclick = () => {
                supplierSearch.value = s.name;
                supplierIdInput.value = s.id;
                supplierList.classList.add('hidden');
                supplierList.style.display = 'none';
            };
            supplierList.appendChild(div);
        });
    } else {
        supplierList.classList.add('hidden');
        supplierList.style.display = 'none';
    }
});

document.addEventListener('click', (e) => {
    if (!supplierSearch.contains(e.target) && !supplierList.contains(e.target)) {
        supplierList.classList.add('hidden');
        supplierList.style.display = 'none';
    }
});

// 4. LÓGICA DE TALLAS AL SELECCIONAR MATERIAL
materialSelect.addEventListener('change', () => {
    const id = materialSelect.value;
    stockInputsContainer.innerHTML = ''; 

    if (!id) {
        stockInputsContainer.innerHTML = '<p class="text-xs text-gray-600">Seleccione un ítem primero</p>';
        return;
    }

    const item = inventoryMap[id];

    if (item.classification === 'producto') {
        const sizes = sizeConfigs[item.type] || ['Única'];
        let html = `<div class="grid grid-cols-4 md:grid-cols-6 gap-2 w-full">`;
        sizes.forEach(size => {
            html += `
                <div>
                    <label class="text-[9px] text-center block text-gray-400 mb-1 font-bold">${size}</label>
                    <input type="number" min="0" data-size="${size}" class="size-buy-input w-full bg-[#18181b] border border-gray-700 rounded text-center px-1 text-xs h-8 text-white focus:border-soriano-gold outline-none" placeholder="0" oninput="if(this.value < 0) this.value = 0;">
                </div>
            `;
        });
        html += `</div>`;
        stockInputsContainer.innerHTML = html;
    } else {
        stockInputsContainer.innerHTML = `
            <div class="w-full">
                <label class="block text-[10px] text-gray-400 mb-1.5 uppercase font-bold text-center">Cantidad Total (${item.unit})</label>
                <input type="number" id="simpleQty" min="0" class="w-full bg-[#18181b] border border-gray-700 rounded text-center py-2 text-sm text-white focus:border-soriano-gold outline-none" placeholder="0.00" oninput="if(this.value < 0) this.value = 0;">
            </div>
        `;
    }
});

// 5. AGREGAR AL CARRITO
window.addItemToCart = () => {
    const matId = materialSelect.value;
    const rawCost = addCost.value.replace(/\D/g, ''); 
    const cost = parseFloat(rawCost);

    if (!matId || !cost) { alert("Seleccione material y costo"); return; }

    const itemInfo = inventoryMap[matId];
    
    let cartItem = {
        materialId: matId,
        name: itemInfo.name,
        type: itemInfo.classification,
        totalCost: cost,
        unit: itemInfo.unit || 'und',
        imageUrl: itemInfo.imageUrl || null
    };

    if (itemInfo.classification === 'producto') {
        const sizesObj = {};
        let totalQty = 0;
        document.querySelectorAll('.size-buy-input').forEach(input => {
            const val = parseFloat(input.value || 0);
            if (val > 0) {
                sizesObj[input.dataset.size] = val;
                totalQty += val;
            }
        });

        if (totalQty === 0) { alert("Ingrese al menos una cantidad por talla"); return; }
        
        cartItem.sizes = sizesObj;
        cartItem.qty = totalQty;
        cartItem.detailText = Object.entries(sizesObj).map(([s,q]) => `<span class="bg-gray-800 border border-gray-700 px-1 rounded text-[10px] mr-1">${s}:${q}</span>`).join('');
    } else {
        const qtyInput = document.getElementById('simpleQty');
        const val = parseFloat(qtyInput.value || 0);
        
        if (val <= 0) { alert("Ingrese una cantidad válida"); return; }
        
        cartItem.qty = val;
        cartItem.detailText = `<span class="text-gray-400 font-mono text-xs">${val} ${itemInfo.unit}</span>`;
    }

    cart.push(cartItem);
    renderCart();
    
    materialSelect.value = "";
    addCost.value = "";
    stockInputsContainer.innerHTML = '<p class="text-xs text-gray-600">Seleccione un ítem primero</p>';
};

window.removeItem = (index) => { cart.splice(index, 1); renderCart(); };

function renderCart() {
    if (cart.length === 0) {
        cartBody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-xs text-gray-600 italic">Agrega ítems arriba para comenzar...</td></tr>`;
        cartTotalDisplay.textContent = "$0";
        return;
    }

    let total = 0;
    cartBody.innerHTML = cart.map((item, idx) => {
        total += item.totalCost;
        return `
            <tr class="text-gray-300 hover:bg-white/5 transition-colors border-b border-gray-800/50 last:border-0">
                <td class="p-4 text-sm font-medium text-white">${item.name}</td>
                <td class="p-4">${item.detailText}</td>
                <td class="p-4 text-right font-mono text-sm">${copFormatter.format(item.totalCost)}</td>
                <td class="p-4 text-center">
                    <button onclick="removeItem(${idx})" class="text-red-500 hover:text-red-400 p-2 bg-red-900/20 rounded-lg transition"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    cartTotalDisplay.textContent = copFormatter.format(total);
}

// 6. GUARDAR COMPRA (Batch Update Complejo)
window.savePurchase = async () => {
    if (cart.length === 0) { alert("El carrito está vacío"); return; }
    if (!supplierIdInput.value) { alert("Busque y seleccione un proveedor válido"); return; }

    const accId = paymentAccount.value;
    const isPaidNow = accId !== 'pendiente';
    const totalAmount = cart.reduce((sum, item) => sum + item.totalCost, 0);

    let confirmMsg = `¿Confirmar ingreso al inventario por ${copFormatter.format(totalAmount)}?`;
    if (isPaidNow) confirmMsg += `\n\nEste valor se descontará inmediatamente de la cuenta seleccionada.`;
    else confirmMsg += `\n\nQuedará como DEUDA PENDIENTE para este proveedor.`;

    if (!confirm(confirmMsg)) return;

    try {
        const batch = writeBatch(db);

        // Pre-generar IDs
        const purchaseRef = doc(collection(db, "purchases"));
        const billRef = doc(collection(db, "supplier_bills"));

        // A. Documento Histórico de Compra
        batch.set(purchaseRef, {
            supplierId: supplierIdInput.value,
            supplierName: supplierSearch.value,
            invoiceRef: invoiceRef.value || "S/N",
            date: purchaseDate.value,
            items: cart,
            totalAmount: totalAmount,
            balanceDue: isPaidNow ? 0 : totalAmount, // NUEVO: Guardar saldo aquí también
            billId: billRef.id, // NUEVO: Referencia cruzada a la factura
            createdAt: serverTimestamp()
        });

        // B. Actualizar Inventario
        cart.forEach(item => {
            const invRef = doc(db, "inventory", item.materialId);
            if (item.type === 'producto') {
                const updates = {};
                updates.quantity = increment(item.qty); 
                updates.cost = Math.floor(item.totalCost / item.qty); 
                for (const [size, qty] of Object.entries(item.sizes)) {
                    updates[`sizes.${size}`] = increment(qty);
                }
                batch.update(invRef, updates);
            } else {
                batch.update(invRef, {
                    quantity: increment(item.qty),
                    cost: Math.floor(item.totalCost / item.qty)
                });
            }
        });

        // C. Generar Deuda (Factura de Proveedor)
        batch.set(billRef, {
            supplierId: supplierIdInput.value,
            description: `Compra Fac: ${invoiceRef.value || "S/N"}`,
            totalAmount: totalAmount,
            balanceDue: isPaidNow ? 0 : totalAmount,
            date: purchaseDate.value,
            relatedPurchaseId: purchaseRef.id,
            type: 'compra_inventario',
            createdAt: serverTimestamp()
        });

        // D. Lógica Financiera Inmediata
        if (isPaidNow) {
            const acc = accountsCache.find(a => a.id === accId);
            let tax = 0;
            if (acc && acc.isTaxable) tax = Math.ceil(totalAmount * 0.004);
            const totalDeduction = totalAmount + tax;

            const accRef = doc(db, "accounts", accId);
            batch.update(accRef, { balance: increment(-totalDeduction) });

            const expenseRef = doc(collection(db, "expenses"));
            batch.set(expenseRef, {
                date: purchaseDate.value,
                category: 'compra_inventario',
                description: `Compra ${invoiceRef.value || "S/N"} - ${supplierSearch.value}`,
                amount: totalAmount,
                accountId: accId,
                createdAt: serverTimestamp()
            });

            const txRef = doc(collection(db, "transactions"));
            batch.set(txRef, {
                accountId: accId,
                type: 'expense',
                amount: -totalAmount, 
                description: `Pago Compra: ${supplierSearch.value}`,
                date: serverTimestamp(),
                category: 'compra_inventario',
                relatedDocId: purchaseRef.id
            });

            if(tax > 0) {
                const taxLogRef = doc(collection(db, "transactions"));
                batch.set(taxLogRef, { accountId: accId, type: 'tax_gmf', amount: -tax, description: `GMF 4x1000 (Compra)`, date: serverTimestamp(), relatedDocId: purchaseRef.id });
            }
        }

        await batch.commit();
        alert("Operación completada exitosamente.");
        closeModal();
        
    } catch (error) {
        console.error("Error:", error);
        alert("Error al procesar: " + error.message);
    }
};

// 7. HISTORIAL (TABLA PRINCIPAL)
function subscribePurchases() {
    const q = query(collection(db, "purchases"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-gray-500 italic">No hay compras registradas.</td></tr>`;
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            const dataStr = encodeURIComponent(JSON.stringify(data));
            
            const balance = data.balanceDue !== undefined ? data.balanceDue : 0; // Por defecto 0 si es compra vieja
            const isPaid = balance <= 0;

            const statusHtml = isPaid 
                ? `<span class="bg-green-900/30 text-green-400 border border-green-900 px-2 py-0.5 rounded text-[10px] uppercase font-bold"><i class="fas fa-check mr-1"></i> Pagado</span>`
                : `<span class="bg-orange-900/30 text-orange-400 border border-orange-900 px-2 py-0.5 rounded text-[10px] uppercase font-bold">Deuda: ${copFormatter.format(balance)}</span>`;

            return `
                <tr class="hover:bg-white/5 transition-colors border-b border-gray-800/50 group">
                    <td class="px-6 py-4">
                        <div class="text-white font-bold text-sm group-hover:text-soriano-gold transition">${data.date}</div>
                        <div class="text-[10px] text-gray-500 font-mono mt-0.5">Ref: ${data.invoiceRef}</div>
                    </td>
                    <td class="px-6 py-4 text-gray-300 text-sm font-medium">
                        ${data.supplierName}
                        <div class="text-[10px] text-gray-500 mt-0.5">${data.items ? data.items.length : 0} ítems</div>
                    </td>
                    <td class="px-6 py-4 text-right text-soriano-gold font-mono font-bold text-base">
                        ${copFormatter.format(data.totalAmount)}
                    </td>
                    <td class="px-6 py-4 text-center">
                        ${statusHtml}
                    </td>
                    <td class="px-6 py-4 text-right text-xs whitespace-nowrap">
                        <div class="flex justify-end gap-2">
                            <button onclick="window.viewPurchaseDetail('${dataStr}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-blue-900/50 hover:text-blue-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Ver Factura">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${!isPaid ? `
                            <button onclick="window.openPayPurchaseModal('${id}', '${data.billId}', ${balance}, '${data.supplierName}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-green-900/50 hover:text-green-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Abonar / Pagar">
                                <i class="fas fa-hand-holding-usd"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

// 8. LÓGICA DE PAGO DESDE LA TABLA
window.openPayPurchaseModal = (purchaseId, billId, debt, supplierName) => {
    payPurchaseForm.reset();
    payPurchaseId.value = purchaseId;
    payBillId.value = billId || "";
    paySupplierName.value = supplierName;
    
    payPurchaseDebtDisplay.textContent = copFormatter.format(debt);
    payPurchaseAmount.value = copFormatter.format(debt); // Sugerir pago total

    payPurchaseModal.classList.remove('hidden');
    payPurchaseModal.classList.add('flex');
};

window.closePayPurchaseModal = () => {
    payPurchaseModal.classList.add('hidden');
    payPurchaseModal.classList.remove('flex');
};

payPurchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const accountId = payPurchaseAccountSelect.value;
    const rawAmt = payPurchaseAmount.value.replace(/\D/g, '');
    const amount = parseFloat(rawAmt || 0);

    if (!accountId) { alert("Seleccione una cuenta"); return; }
    if (amount <= 0) return;

    if(!confirm(`¿Registrar abono por ${copFormatter.format(amount)} a esta factura?`)) return;

    try {
        const pId = payPurchaseId.value;
        const bId = payBillId.value;
        const sName = paySupplierName.value;

        // Validar 4x1000
        const acc = accountsCache.find(a => a.id === accountId);
        let tax = 0;
        if (acc && acc.isTaxable) tax = Math.ceil(amount * 0.004);
        const totalDeduction = amount + tax;

        await runTransaction(db, async (transaction) => {
            // 1. Descontar Cuenta
            const accRef = doc(db, "accounts", accountId);
            transaction.update(accRef, { balance: increment(-totalDeduction) });

            // 2. Crear Gasto
            const expenseRef = doc(collection(db, "expenses"));
            transaction.set(expenseRef, {
                date: new Date().toISOString().split('T')[0],
                category: 'pago_proveedor',
                description: `Abono Compra: ${sName}`,
                amount: amount,
                accountId: accountId,
                createdAt: serverTimestamp()
            });

            // 3. Crear Transacciones (Extracto)
            const txRef = doc(collection(db, "transactions"));
            transaction.set(txRef, {
                accountId: accountId,
                type: 'expense',
                amount: -amount,
                description: `Pago Proveedor: ${sName}`,
                date: serverTimestamp(),
                category: 'pago_proveedor',
                relatedDocId: pId
            });

            if(tax > 0) {
                const taxLogRef = doc(collection(db, "transactions"));
                transaction.set(taxLogRef, { accountId: accountId, type: 'tax_gmf', amount: -tax, description: `GMF 4x1000 (Abono)`, date: serverTimestamp(), relatedDocId: pId });
            }

            // 4. Actualizar Deuda en Compras
            const purchRef = doc(db, "purchases", pId);
            transaction.update(purchRef, { balanceDue: increment(-amount) });

            // 5. Actualizar Deuda en Proveedores (si existe billId)
            if (bId && bId !== "undefined") {
                const billRef = doc(db, "supplier_bills", bId);
                transaction.update(billRef, { balanceDue: increment(-amount) });
            }
        });

        alert("Pago registrado correctamente.");
        closePayPurchaseModal();

    } catch (error) {
        console.error("Error al pagar:", error);
        alert("Error al procesar el pago.");
    }
});


// FORMATO MONEDA Y MODALES SECUNDARIOS
window.formatCurrencyInput = (input) => {
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; }
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};

window.openModal = () => {
    cart = [];
    renderCart();
    invoiceRef.value = "";
    supplierSearch.value = "";
    supplierIdInput.value = "";
    materialSelect.value = "";
    paymentAccount.value = "pendiente";
    stockInputsContainer.innerHTML = '<p class="text-xs text-gray-600">Seleccione un ítem primero</p>';
    addCost.value = "";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };

window.viewPurchaseDetail = (dataStr) => {
    const data = JSON.parse(decodeURIComponent(dataStr));
    const modalD = document.getElementById('detailModal');
    
    document.getElementById('detailSupplier').textContent = data.supplierName;
    document.getElementById('detailRef').textContent = `REF: ${data.invoiceRef}`;
    document.getElementById('detailDate').textContent = data.date;
    document.getElementById('detailTotal').textContent = copFormatter.format(data.totalAmount);

    const tbody = document.getElementById('detailItemsBody');
    tbody.innerHTML = data.items.map(item => {
        let detailsHtml = item.detailText || `<span class="text-gray-400 font-mono text-xs">${item.qty} ${item.unit || 'und'}</span>`;
        const imgHtml = item.imageUrl 
            ? `<img src="${item.imageUrl}" class="w-10 h-10 rounded-lg object-cover border border-gray-700 shadow-sm">`
            : `<div class="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 border border-gray-700"><i class="fas fa-box"></i></div>`;

        return `
            <tr class="border-b border-gray-800/50 last:border-0 hover:bg-white/5 transition-colors">
                <td class="p-4">${imgHtml}</td>
                <td class="p-4 text-white font-medium text-sm">${item.name}</td>
                <td class="p-4 align-middle">${detailsHtml}</td>
                <td class="p-4 text-right font-mono text-sm text-gray-300 align-middle">${copFormatter.format(item.totalCost)}</td>
            </tr>
        `;
    }).join('');

    modalD.classList.remove('hidden');
    modalD.classList.add('flex');
};