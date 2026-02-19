import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, doc, query, orderBy, where, getDocs, serverTimestamp, runTransaction, getDoc, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const clientSelect = document.getElementById('clientSelect');
const clientInfoBox = document.getElementById('clientInfoBox');
const deadlineInput = document.getElementById('deadline');
const orderNotesInput = document.getElementById('orderNotes');
const responsableSelect = document.getElementById('responsableSelect');

// Buscador Inventario & Items
const inventorySearch = document.getElementById('inventorySearch');
const inventoryList = document.getElementById('inventoryList');
const selectedInventoryId = document.getElementById('selectedInventoryId');
const addItemDesc = document.getElementById('addItemDesc');
const addItemQty = document.getElementById('addItemQty');
const addItemPrice = document.getElementById('addItemPrice');
const addItemNotes = document.getElementById('addItemNotes');
const sizeSelectorContainer = document.getElementById('sizeSelectorContainer');
const selectedSizeInput = document.getElementById('selectedSize');
const imgPreviewContainer = document.getElementById('productImagePreview');
const imgPreviewSrc = document.getElementById('imgPreviewSrc');
const orderItemsBody = document.getElementById('orderItemsBody');
const orderTotalDisplay = document.getElementById('orderTotalDisplay');
const itemsCountDisplay = document.getElementById('itemsCount');
const measuresContainer = document.getElementById('measuresContainer');
// NUEVAS REFERENCIAS DOM
const paymentsContainer = document.getElementById('paymentsContainer');
const paymentLabel = document.getElementById('paymentLabel');
const totalPaymentDisplay = document.getElementById('totalPaymentDisplay');

// Variable para guardar el HTML de las opciones de cuentas (para no consultar a Firebase cada vez que agregamos fila)
let accountsOptionsCache = "";

// --- ESTADO LOCAL ---
let clientsCache = [];
let productsCache = [];
let orderItems = [];
let currentMeasures = {};
let activeTab = 'chaqueta';
let currentUserInfo = null;

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const measureFields = {
    chaqueta: ['Pecho', 'Cintura', 'Espalda', 'Manga', 'Hombro', 'Contorno'],
    pantalon: ['Cintura', 'Base', 'Pierna', 'Largo', 'Entube'],
    camisa:   ['Cuello', 'Manga', 'Largo', 'Modelo'],
    chaleco:  ['Pecho', 'Hombro', 'Contorno', 'Largo']
};

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if(userSnap.exists()) {
        currentUserInfo = userSnap.data();
        currentUserInfo.uid = user.uid;
        updateSidebarUser(user, currentUserInfo);
    }

    await Promise.all([
        loadClients(), 
        loadInventoryProducts(), 
        loadAccounts(),
        loadUsersForSelect()
    ]);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    deadlineInput.valueAsDate = tomorrow;

    showMeasureTab('chaqueta');
});

// --- CARGAS INICIALES ---
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
    snap.forEach(d => { const p = d.data(); p.id = d.id; productsCache.push(p); });
}
async function loadAccounts() {
    const q = query(collection(db, "accounts"), where("status", "==", "active"), orderBy("name"));
    const snap = await getDocs(q);
    
    // Guardamos el HTML de las opciones en memoria
    accountsOptionsCache = '<option value="">Seleccionar cuenta...</option>' + 
        snap.docs.map(doc => `<option value="${doc.id}">${doc.data().name}</option>`).join('');
    
    // Iniciamos con una fila vacía por defecto
    resetPayments();
}

window.addPaymentRow = (amount = "") => {
    const rowId = Date.now(); // ID único para el div
    const row = document.createElement('div');
    row.className = "payment-row flex gap-2 items-center animate-fade-in"; // animate-fade-in es opcional si tienes css
    row.id = `row-${rowId}`;

    row.innerHTML = `
        <div class="w-1/3">
            <select class="pay-account w-full bg-[#0f0f10] border border-gray-600 text-gray-300 text-[10px] rounded px-2 py-2 outline-none">
                ${accountsOptionsCache}
            </select>
        </div>
        <div class="w-2/3 relative flex items-center gap-1">
            <div class="relative w-full">
                <span class="absolute left-2 top-2 text-gray-500 text-xs">$</span>
                <input type="text" class="pay-amount w-full bg-[#0f0f10] border border-gray-600 text-white text-sm font-bold pl-5 py-2 rounded focus:border-green-500 outline-none text-right placeholder-gray-600" 
                    placeholder="0" oninput="formatCurrencyInput(this); updateTotalPaymentDisplay();" value="${amount}">
            </div>
            <button type="button" onclick="removePaymentRow('${rowId}')" class="text-red-500 hover:text-red-400 p-1">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `;
    
    paymentsContainer.appendChild(row);
    updateTotalPaymentDisplay();
};

window.removePaymentRow = (id) => {
    const row = document.getElementById(`row-${id}`);
    if (row) row.remove();
    updateTotalPaymentDisplay();
};

window.resetPayments = () => {
    paymentsContainer.innerHTML = "";
    addPaymentRow(); // Agrega una fila limpia
    checkPaymentRules(); // Revisa si debe auto-llenarse
};

// Función auxiliar para sumar visualmente lo que el usuario va ingresando
window.updateTotalPaymentDisplay = () => {
    let total = 0;
    document.querySelectorAll('.pay-amount').forEach(input => {
        const val = parseInt(input.value.replace(/\D/g, '')) || 0;
        total += val;
    });
    if(totalPaymentDisplay) totalPaymentDisplay.textContent = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(total);
};

async function loadUsersForSelect() {
    try {
        const q = query(collection(db, "users"), orderBy("name"));
        const snap = await getDocs(q);
        responsableSelect.innerHTML = '';
        snap.forEach(doc => {
            const u = doc.data();
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.text = u.name || u.email;
            responsableSelect.appendChild(opt);
        });
        if(currentUserInfo) responsableSelect.value = currentUserInfo.uid;
    } catch (e) { console.error(e); }
}

// --- MEDIDAS ---
clientSelect.addEventListener('change', () => {
    const clientId = clientSelect.value;
    if (!clientId) { currentMeasures = {}; renderMeasuresInputs(); clientInfoBox.classList.add('hidden'); return; }
    
    const client = clientsCache.find(c => c.id === clientId);
    if (client) { 
        currentMeasures = JSON.parse(JSON.stringify(client.measures || {})); 
        document.getElementById('infoPhone').textContent = client.phone || 'Sin tel'; 
        clientInfoBox.classList.remove('hidden'); 
        renderMeasuresInputs(); 
    }
});

// CORRECCIÓN: Lógica estricta para seleccionar pestañas
window.showMeasureTab = (tab) => {
    activeTab = tab;
    
    const buttons = document.querySelectorAll('.measure-tab');
    buttons.forEach(btn => {
        // Usamos dataset para asegurar coincidencia exacta
        if(btn.dataset.tab === tab) {
            btn.classList.add('active'); // Clase definida en el HTML
        } else {
            btn.classList.remove('active');
        }
    });
    renderMeasuresInputs();
};

function renderMeasuresInputs() {
    const fields = measureFields[activeTab] || [];
    const prefixMap = { chaqueta: 'chk_', pantalon: 'pan_', camisa: 'cam_', chaleco: 'cha_' };
    const prefix = prefixMap[activeTab];
    const storedValues = currentMeasures[activeTab] || {};
    
    if (!clientSelect.value) {
        measuresContainer.innerHTML = '<p class="text-xs text-gray-500 col-span-full text-center py-8 italic border border-dashed border-gray-800 rounded">Seleccione un cliente primero.</p>';
        return;
    }

    measuresContainer.innerHTML = fields.map(field => {
        const key = prefix + field.toLowerCase(); 
        const val = storedValues[key] || '';
        return `
            <div>
                <label class="block text-[9px] text-gray-500 uppercase font-bold mb-1">${field}</label>
                <input type="text" class="w-full bg-[#0f0f10] border border-gray-700 text-white text-center text-sm rounded py-1.5 focus:border-soriano-gold outline-none" 
                    data-category="${activeTab}" data-key="${key}" value="${val}" onchange="updateLocalMeasure(this)">
            </div>
        `;
    }).join('');
}

window.updateLocalMeasure = (input) => { 
    const cat = input.dataset.category; 
    const key = input.dataset.key; 
    if(!currentMeasures[cat]) currentMeasures[cat] = {}; 
    currentMeasures[cat][key] = input.value; 
};

// --- PRODUCTOS E INVENTARIO ---
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

    // Opción Manual
    const manualDiv = document.createElement('div');
    manualDiv.className = "px-4 py-3 border-b border-gray-700 bg-gray-800 hover:bg-soriano-gold hover:text-black cursor-pointer transition flex items-center group";
    manualDiv.innerHTML = `<i class="fas fa-cut mr-2 text-soriano-gold group-hover:text-black"></i> <span class="font-bold text-sm">Prenda Sobre Medida (Manual)</span>`;
    manualDiv.onclick = () => selectProduct(null);
    inventoryList.appendChild(manualDiv);

    const filtered = productsCache.filter(p => 
        p.name.toLowerCase().includes(lowerTerm) || 
        p.sku.toLowerCase().includes(lowerTerm)
    );

    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-800 last:border-0";
        div.innerHTML = `<div class="font-bold text-white">${p.name}</div><div class="text-[10px] text-gray-500 flex justify-between"><span>SKU: ${p.sku}</span></div>`;
        div.onclick = () => selectProduct(p);
        inventoryList.appendChild(div);
    });
    inventoryList.classList.remove('hidden');
}

function selectProduct(product) {
    inventoryList.classList.add('hidden');
    selectedSizeInput.value = "";
    
    // 1. Limpiamos el contenedor usando el nombre correcto
    sizeSelectorContainer.innerHTML = ""; 
    
    imgPreviewContainer.classList.add('hidden');
    imgPreviewSrc.src = "";

    if (!product) {
        inventorySearch.value = "Sobre Medida";
        selectedInventoryId.value = "";
        addItemDesc.value = "";
        addItemDesc.focus();
        addItemPrice.value = "";
    } else {
        inventorySearch.value = product.name;
        selectedInventoryId.value = product.id;
        addItemDesc.value = product.name;
        if (product.price) addItemPrice.value = new Intl.NumberFormat('es-CO').format(product.price);
        
        // --- LÓGICA DE TALLAS ORDENADAS ---
        const orderedSizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "Unica", "4", "6", "8", "10", "12", "14", "16", "18", "20", "28", "30", "32", "34", "36", "38", "40", "42", "44"];

        if (product.sizes) {
            // Convertir a array y ordenar
            const entries = Object.entries(product.sizes);

            entries.sort((a, b) => {
                let indexA = orderedSizes.indexOf(a[0].toUpperCase());
                let indexB = orderedSizes.indexOf(b[0].toUpperCase());
                
                // Si no está en la lista, va al final
                if (indexA === -1) indexA = 999;
                if (indexB === -1) indexB = 999;

                // Si ambos son desconocidos, orden alfabético/numérico simple
                if (indexA === 999 && indexB === 999) {
                    return a[0].localeCompare(b[0], undefined, { numeric: true });
                }

                return indexA - indexB;
            });

            // Crear botones
            let hasStock = false;
            entries.forEach(([size, qty]) => {
                if (qty > 0) {
                    hasStock = true;
                    const btn = document.createElement('button');
                    btn.type = "button";
                    // Clase base del botón
                    btn.className = "size-btn px-2 py-1 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-300 hover:bg-gray-700 transition flex items-center gap-1";
                    
                    btn.innerHTML = `<span class="font-bold">${size}</span> <span class="text-gray-500">(${qty})</span>`;
                    
                    btn.onclick = () => {
                        // Resetear estilos de todos
                        document.querySelectorAll('.size-btn').forEach(b => {
                            b.className = "size-btn px-2 py-1 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-300 hover:bg-gray-700 transition flex items-center gap-1";
                            b.querySelector('span:last-child').className = "text-gray-500";
                        });
                        
                        // Activar este botón
                        btn.className = "size-btn px-2 py-1 bg-soriano-red border border-soriano-red rounded text-[10px] text-white font-bold shadow flex items-center gap-1 transform scale-105";
                        btn.querySelector('span:last-child').className = "text-white/70";
                        
                        selectedSizeInput.value = size;
                        addItemDesc.value = `${product.name} (Talla ${size})`;
                    };
                    
                    // CORRECCIÓN AQUÍ: Usamos sizeSelectorContainer
                    sizeSelectorContainer.appendChild(btn);
                }
            });

            if (!hasStock) {
                sizeSelectorContainer.innerHTML = '<span class="text-red-500 text-xs font-bold px-2">Agotado</span>';
            }
        }
        
        if(product.imageUrl) { 
            imgPreviewSrc.src = product.imageUrl; 
            imgPreviewContainer.classList.remove('hidden'); 
            imgPreviewContainer.classList.add('flex'); 
        }
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
    
    if (!desc) { alert("Descripción requerida"); return; }
    if (!price) { alert("Precio requerido"); return; }
    if (invId && !size && productsCache.find(p=>p.id===invId)?.sizes) { alert("Seleccione talla"); return; }

    orderItems.push({
        id: Date.now(),
        inventoryId: invId || null, // null significa "Sobre Medida"
        description: desc,
        size: size || "N/A",
        quantity: qty,
        unitPrice: price,
        totalPrice: price * qty,
        notes: notes
    });

    // Resetear formulario
    inventorySearch.value = ""; selectedInventoryId.value = ""; addItemDesc.value = ""; 
    addItemQty.value = "1"; addItemPrice.value = ""; addItemNotes.value = ""; 
    selectedSizeInput.value = ""; sizeSelectorContainer.innerHTML = ""; 
    imgPreviewContainer.classList.add('hidden');
    
    renderOrderItems();
};

window.removeOrderItem = (id) => { orderItems = orderItems.filter(i => i.id !== id); renderOrderItems(); };

// CORRECCIÓN: Renderizado con lógica de etiqueta de pago
function renderOrderItems() {
    let total = 0;
    let hasCustomItem = false; // Bandera para detectar items sobre medida

    orderItemsBody.innerHTML = orderItems.map(item => {
        total += item.totalPrice;
        
        // Si inventoryId es null o vacío, es un item manual (sobre medida)
        if (!item.inventoryId) hasCustomItem = true;

        return `
            <tr class="border-b border-gray-800 hover:bg-white/5">
                <td class="p-3 text-center font-bold text-white">${item.quantity}</td>
                <td class="p-3">
                    <div class="text-white text-sm">${item.description}</div>
                    ${item.notes ? `<div class="text-[10px] text-soriano-gold italic">${item.notes}</div>` : ''}
                </td>
                <td class="p-3 text-center text-xs text-gray-400">${item.size}</td>
                <td class="p-3 text-right font-mono text-xs text-gray-400">${copFormatter.format(item.unitPrice)}</td>
                <td class="p-3 text-right font-mono text-sm text-white font-bold">${copFormatter.format(item.totalPrice)}</td>
                <td class="p-3 text-center"><button onclick="removeOrderItem(${item.id})" class="text-gray-600 hover:text-red-500"><i class="fas fa-times"></i></button></td>
            </tr>`;
    }).join('');
    
    if (orderItems.length === 0) orderItemsBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-xs text-gray-500">Agregue prendas al pedido.</td></tr>`;
    

    // Al final de la función, llama a la regla:
    orderTotalDisplay.textContent = copFormatter.format(total);
    itemsCountDisplay.textContent = `${orderItems.length} items`;
    
    checkPaymentRules(); // <--- AGREGAR ESTO AL FINAL

    // LÓGICA DE ETIQUETA
    if (orderItems.length > 0 && hasCustomItem) {
        paymentLabel.innerHTML = `<i class="fas fa-hand-holding-usd"></i> Anticipo Requerido`;
        paymentLabel.className = "text-xs text-soriano-gold uppercase font-bold flex items-center gap-1";
    } else {
        paymentLabel.innerHTML = `<i class="fas fa-cash-register"></i> Total a Pagar`;
        paymentLabel.className = "text-xs text-green-500 uppercase font-bold flex items-center gap-1";
    }
}

// --- GUARDAR ORDEN ---
window.saveOrder = async () => {
    // 1. Validaciones Básicas
    if (!clientSelect.value) { alert("Seleccione un cliente"); return; }
    if (orderItems.length === 0) { alert("La orden está vacía"); return; }
    if (!deadlineInput.value) { alert("Defina fecha de entrega"); return; }

    // 2. Recolectar Pagos Dinámicos
    const paymentRows = document.querySelectorAll('.payment-row');
    let collectedPayments = [];
    let totalAdvance = 0;
    let usedAccounts = new Set(); // Para validar duplicados

    for (const row of paymentRows) {
        const select = row.querySelector('.pay-account');
        const input = row.querySelector('.pay-amount');
        
        const amount = parseInt(input.value.replace(/\D/g, '')) || 0;
        const accId = select.value;

        // Solo procesamos filas con dinero > 0
        if (amount > 0) {
            if (!accId) { alert("Hay un monto ingresado sin cuenta seleccionada."); return; }
            /* Si quieres permitir la misma cuenta varias veces (ej: 2 cheques mismo banco), quita este if */
            if (usedAccounts.has(accId)) { alert("Ha seleccionado la misma cuenta dos veces. Por favor súmelos en una sola fila."); return; }
            
            usedAccounts.add(accId);
            collectedPayments.push({
                amount: amount,
                accountId: accId,
                date: new Date().toISOString(),
                type: 'advance'
            });
            totalAdvance += amount;
        }
    }

    const totalOrder = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);

    if (totalAdvance > totalOrder) { alert(`El pago total (${totalAdvance}) supera el valor de la orden (${totalOrder}).`); return; }

    // Advertencia de Producto Terminado
    const isAllFinished = orderItems.every(item => item.inventoryId);
    if (isAllFinished && totalAdvance < totalOrder) {
        if (!confirm("ATENCIÓN: Es venta de productos terminados pero NO se cobra el 100%. ¿Continuar generando deuda?")) return;
    }

    if(!confirm(`¿Generar Orden? Total Abono: ${new Intl.NumberFormat('es-CO').format(totalAdvance)}`)) return;

    try {
        await runTransaction(db, async (transaction) => {
            // --- A. INVENTARIO (Lectura y Validación) ---
            const inventoryReads = [];
            for (const item of orderItems) {
                if (item.inventoryId) {
                    inventoryReads.push({ ref: doc(db, "inventory", item.inventoryId), itemData: item });
                }
            }
            
            const counterRef = doc(db, "counters", "orders");
            const counterPromise = transaction.get(counterRef);
            const inventoryPromises = Promise.all(inventoryReads.map(i => transaction.get(i.ref)));
            const [counterSnap, inventorySnaps] = await Promise.all([counterPromise, inventoryPromises]);

            inventorySnaps.forEach((snap, index) => {
                const item = inventoryReads[index].itemData;
                if (!snap.exists()) throw `Producto no encontrado: ${item.description}`;
                const pData = snap.data();
                const qty = item.quantity;

                if (pData.sizes) {
                    const sizeKey = item.size;
                    const stock = pData.sizes[sizeKey];
                    if (stock < qty) throw `Stock insuficiente: ${item.description} (${sizeKey})`;
                    transaction.update(inventoryReads[index].ref, { [`sizes.${sizeKey}`]: stock - qty });
                } else {
                    const stock = parseInt(pData.quantity || 0);
                    if (stock < qty) throw `Stock insuficiente: ${item.description}`;
                    transaction.update(inventoryReads[index].ref, { quantity: stock - qty });
                }
            });

            // --- B. CREAR ORDEN ---
            let nextId = 1;
            if (counterSnap.exists()) nextId = counterSnap.data().current + 1;
            transaction.set(counterRef, { current: nextId }, { merge: true });

            const orderRef = doc(collection(db, "orders"));
            
            const orderData = {
                orderNumber: nextId,
                clientId: clientSelect.value,
                clientName: clientSelect.options[clientSelect.selectedIndex].text,
                deadline: deadlineInput.value,
                status: isAllFinished && totalAdvance >= totalOrder ? 'entregado' : 'recibido',
                items: orderItems,
                appliedMeasures: currentMeasures,
                totalAmount: totalOrder,
                notes: orderNotesInput.value,
                responsableId: responsableSelect.value,
                responsableName: responsableSelect.options[responsableSelect.selectedIndex]?.text,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                advancePayment: totalAdvance,
                balanceDue: totalOrder - totalAdvance,
                paymentHistory: collectedPayments // Array dinámico de pagos
            };
            
            transaction.set(orderRef, orderData);

            // --- C. TRANSACCIONES FINANCIERAS (Bucle dinámico) ---
            // Iteramos sobre el array que recolectamos al principio
            for (const pay of collectedPayments) {
                const accRef = doc(db, "accounts", pay.accountId);
                transaction.update(accRef, { balance: increment(pay.amount) });
                
                const logRef = doc(collection(db, "transactions"));
                transaction.set(logRef, { 
                    accountId: pay.accountId, 
                    type: 'income', 
                    amount: pay.amount, 
                    description: `Anticipo Orden #${nextId}`, 
                    relatedDocId: orderRef.id, 
                    date: serverTimestamp() 
                });
            }
        });

        alert("Orden creada exitosamente.");
        window.location.href = 'ordenes.html';

    } catch (error) {
        console.error("Error:", error);
        alert(typeof error === 'string' ? error : error.message);
    }
};                                                                                                 

window.formatCurrencyInput = (input) => { 
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; } 
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value)); 
};

function checkPaymentRules() {
    if (orderItems.length === 0) return;

    const totalOrder = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);
    const isAllFinished = orderItems.every(item => item.inventoryId);

    if (isAllFinished) {
        // VENTA DIRECTA: 100% PAGO
        paymentLabel.innerHTML = `<i class="fas fa-check-circle"></i> Venta Directa (100%)`;
        paymentLabel.className = "text-xs text-green-400 uppercase font-bold flex items-center gap-1";
        
        // Reiniciamos a 1 sola fila y le ponemos el valor total
        paymentsContainer.innerHTML = "";
        const formattedTotal = new Intl.NumberFormat('es-CO').format(totalOrder);
        addPaymentRow(formattedTotal);
    
    } else {
        // ANTICIPO TALLER
        paymentLabel.innerHTML = `<i class="fas fa-cut"></i> Anticipo Taller`;
        paymentLabel.className = "text-xs text-soriano-gold uppercase font-bold flex items-center gap-1";
        // Aquí no forzamos valor, dejamos lo que esté o vaciamos si quieres:
        // paymentsContainer.innerHTML = ""; addPaymentRow();
    }
}