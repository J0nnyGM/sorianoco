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
const advanceInput = document.getElementById('advancePayment');
const targetAccountSelect = document.getElementById('targetAccount');
const paymentLabel = document.getElementById('paymentLabel'); // La etiqueta dinámica

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
    const options = '<option value="">Cuenta Destino...</option>' + 
        snap.docs.map(doc => `<option value="${doc.id}">${doc.data().name}</option>`).join('');
    targetAccountSelect.innerHTML = options;
}

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
    sizeSelectorContainer.innerHTML = ""; // Limpiar botones anteriores
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
        
        // CORRECCIÓN: Botones de talla con stock visible
        if (product.sizes) {
            Object.entries(product.sizes).forEach(([size, qty]) => {
                if (qty > 0) {
                    const btn = document.createElement('button');
                    btn.type = "button";
                    // Estilo de botón pequeño
                    btn.className = "size-btn px-2 py-1 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-300 hover:bg-gray-700 transition flex items-center gap-1";
                    
                    // HTML con cantidad entre paréntesis
                    btn.innerHTML = `<span class="font-bold">${size}</span> <span class="text-gray-500">(${qty})</span>`;
                    
                    btn.onclick = () => {
                        // Resetear estilos
                        document.querySelectorAll('.size-btn').forEach(b => {
                            b.className = "size-btn px-2 py-1 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-300 hover:bg-gray-700 transition flex items-center gap-1";
                            b.querySelector('span:last-child').className = "text-gray-500"; // Reset color qty
                        });
                        
                        // Estilo activo
                        btn.className = "size-btn px-2 py-1 bg-soriano-red border border-soriano-red rounded text-[10px] text-white font-bold shadow flex items-center gap-1";
                        btn.querySelector('span:last-child').className = "text-white/70"; // Color qty activo
                        
                        selectedSizeInput.value = size;
                        addItemDesc.value = `${product.name} (Talla ${size})`;
                    };
                    sizeSelectorContainer.appendChild(btn);
                }
            });
        }
        
        if(product.imageUrl) { 
            imgPreviewSrc.src = product.imageUrl; 
            imgPreviewContainer.classList.remove('hidden'); 
            imgPreviewContainer.classList.add('flex'); // Asegurar flex display
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
    
    // Actualizar Totales y Texto Dinámico
    orderTotalDisplay.textContent = copFormatter.format(total);
    itemsCountDisplay.textContent = `${orderItems.length} items`;

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
    if (!clientSelect.value) { alert("Seleccione un cliente"); return; }
    if (orderItems.length === 0) { alert("La orden está vacía"); return; }
    if (!deadlineInput.value) { alert("Defina fecha de entrega"); return; }

    const rawAdvance = advanceInput.value.replace(/\D/g, '');
    const advance = parseInt(rawAdvance) || 0;
    
    // Si hay un anticipo ingresado, exigir cuenta destino
    if (advance > 0 && !targetAccountSelect.value) { alert("Seleccione cuenta para el pago"); return; }

    const respId = responsableSelect.value;
    const respName = responsableSelect.options[responsableSelect.selectedIndex]?.text || "Sin Asignar";

    if(!confirm("¿Generar Orden de Producción?")) return;

    try {
        await runTransaction(db, async (transaction) => {
            const counterRef = doc(db, "counters", "orders");
            const counterSnap = await transaction.get(counterRef);
            let nextId = 1;
            if (counterSnap.exists()) nextId = counterSnap.data().current + 1;
            transaction.set(counterRef, { current: nextId }, { merge: true });

            const totalAmount = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);
            const orderRef = doc(collection(db, "orders"));

            const orderData = {
                orderNumber: nextId,
                clientId: clientSelect.value,
                clientName: clientSelect.options[clientSelect.selectedIndex].text,
                deadline: deadlineInput.value,
                status: 'recibido',
                items: orderItems,
                appliedMeasures: currentMeasures,
                totalAmount: totalAmount,
                notes: orderNotesInput.value,
                responsableId: respId,
                responsableName: respName,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                advancePayment: advance,
                balanceDue: totalAmount - advance,
                paymentAccount: targetAccountSelect.value || null
            };

            if (advance > 0) {
                orderData.paymentHistory = [{ 
                    amount: advance, accountId: targetAccountSelect.value, 
                    date: new Date().toISOString(), type: 'advance' 
                }];
                const accRef = doc(db, "accounts", targetAccountSelect.value);
                transaction.update(accRef, { balance: increment(advance) });
                
                const logRef = doc(collection(db, "transactions"));
                transaction.set(logRef, { 
                    accountId: targetAccountSelect.value, type: 'income', amount: advance, 
                    description: `Anticipo Orden #${nextId}`, relatedDocId: orderRef.id, date: serverTimestamp() 
                });
            }

            transaction.set(orderRef, orderData);
        });

        alert("Orden creada correctamente.");
        window.location.href = 'ordenes.html';

    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar: " + error.message);
    }
};

window.formatCurrencyInput = (input) => { 
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; } 
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value)); 
};