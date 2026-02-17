import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, getDocs, doc, writeBatch, onSnapshot, query, orderBy, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM Elements
const tableBody = document.getElementById('purchasesTableBody');
const modal = document.getElementById('purchaseModal');
const materialSelect = document.getElementById('materialSelect');
const cartBody = document.getElementById('cartTableBody');
const cartTotalDisplay = document.getElementById('cartTotalDisplay');
const stockInputsContainer = document.getElementById('stockInputsContainer');

// Proveedor Interactivo
const supplierSearch = document.getElementById('supplierSearch');
const supplierList = document.getElementById('supplierList');
const supplierIdInput = document.getElementById('supplierId');

// Inputs Carrito
const addCost = document.getElementById('addCost');
const invoiceRef = document.getElementById('invoiceRef');
const purchaseDate = document.getElementById('purchaseDate');

let cart = [];
let inventoryMap = {}; 
let suppliersCache = [];

// Misma configuración que en inventario.js
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
    // A. Proveedores (Cache para buscador)
    const supSnap = await getDocs(query(collection(db, "suppliers"), orderBy("companyName")));
    suppliersCache = [];
    supSnap.forEach(d => {
        suppliersCache.push({ id: d.id, name: d.data().companyName });
    });

    // B. Inventario
    const invSnap = await getDocs(query(collection(db, "inventory"), orderBy("name")));
    materialSelect.innerHTML = '<option value="">Seleccionar Ítem...</option>';
    invSnap.forEach(d => {
        const item = d.data();
        inventoryMap[d.id] = item;
        materialSelect.innerHTML += `<option value="${d.id}">${item.name} (${item.sku})</option>`;
    });
}

// 3. LÓGICA BUSCADOR PROVEEDOR
supplierSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    supplierList.innerHTML = '';
    
    if(term.length > 0) {
        const filtered = suppliersCache.filter(s => s.name.toLowerCase().includes(term));
        supplierList.classList.remove('hidden');
        
        filtered.forEach(s => {
            const div = document.createElement('div');
            div.className = "px-4 py-2 hover:bg-soriano-red cursor-pointer text-sm text-gray-300 hover:text-white";
            div.textContent = s.name;
            div.onclick = () => {
                supplierSearch.value = s.name;
                supplierIdInput.value = s.id;
                supplierList.classList.add('hidden');
            };
            supplierList.appendChild(div);
        });
    } else {
        supplierList.classList.add('hidden');
    }
});

// Cerrar lista si clic fuera
document.addEventListener('click', (e) => {
    if (!supplierSearch.contains(e.target) && !supplierList.contains(e.target)) {
        supplierList.classList.add('hidden');
    }
});

// 4. LÓGICA DE TALLAS AL SELECCIONAR MATERIAL
materialSelect.addEventListener('change', () => {
    const id = materialSelect.value;
    stockInputsContainer.innerHTML = ''; // Limpiar

    if (!id) {
        stockInputsContainer.innerHTML = '<p class="text-xs text-gray-600">Seleccione un ítem primero</p>';
        return;
    }

    const item = inventoryMap[id];

    if (item.classification === 'producto') {
        // --- ES PRODUCTO TERMINADO (Mostrar Tallas) ---
        const sizes = sizeConfigs[item.type] || ['Única'];
        let html = `<div class="grid grid-cols-4 md:grid-cols-6 gap-2 w-full">`;
        
        sizes.forEach(size => {
            html += `
                <div>
                    <label class="text-[9px] text-center block text-gray-400">${size}</label>
                    <input type="number" min="0" data-size="${size}" class="size-buy-input input-soriano text-center px-1 text-xs h-7" placeholder="0" oninput="if(this.value < 0) this.value = 0;">
                </div>
            `;
        });
        html += `</div>`;
        stockInputsContainer.innerHTML = html;

    } else {
        // --- ES MATERIA PRIMA (Input Simple) ---
        stockInputsContainer.innerHTML = `
            <div class="w-full">
                <label class="block text-xs text-gray-400 mb-1 uppercase">Cantidad Total (${item.unit})</label>
                <input type="number" id="simpleQty" min="0" class="input-soriano text-center" placeholder="0.00" oninput="if(this.value < 0) this.value = 0;">
            </div>
        `;
    }
});

// 5. AGREGAR AL CARRITO
window.addItemToCart = () => {
    const matId = materialSelect.value;
    const rawCost = addCost.value.replace(/\./g, '').replace(/,/g, ''); // Limpiar moneda
    const cost = parseFloat(rawCost);

    if (!matId || !cost) { alert("Seleccione material y costo"); return; }

    const itemInfo = inventoryMap[matId];
    
    let cartItem = {
        materialId: matId,
        name: itemInfo.name,
        type: itemInfo.classification,
        totalCost: cost,
        unit: itemInfo.unit || 'und',
        imageUrl: itemInfo.imageUrl || null // <--- AGREGAR ESTA LÍNEA
    };

    // Recolectar Cantidades
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
        cartItem.detailText = Object.entries(sizesObj).map(([s,q]) => `${s}:${q}`).join(', ');

    } else {
        const qtyInput = document.getElementById('simpleQty');
        const val = parseFloat(qtyInput.value || 0);
        
        if (val <= 0) { alert("Ingrese una cantidad válida"); return; }
        
        cartItem.qty = val;
        cartItem.detailText = `${val} ${itemInfo.unit}`;
    }

    cart.push(cartItem);
    renderCart();
    
    // Reset inputs
    materialSelect.value = "";
    addCost.value = "";
    stockInputsContainer.innerHTML = '<p class="text-xs text-gray-600">Seleccione un ítem primero</p>';
};

window.removeItem = (index) => {
    cart.splice(index, 1);
    renderCart();
};

function renderCart() {
    if (cart.length === 0) {
        cartBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-xs text-gray-500">Carrito vacío</td></tr>`;
        cartTotalDisplay.textContent = "$0";
        return;
    }

    let total = 0;
    cartBody.innerHTML = cart.map((item, idx) => {
        total += item.totalCost;
        return `
            <tr class="text-gray-300 hover:bg-gray-800/50">
                <td class="p-3 text-sm">${item.name}</td>
                <td class="p-3 text-xs text-gray-400">${item.detailText}</td>
                <td class="p-3 text-right font-mono text-xs">${copFormatter.format(item.totalCost)}</td>
                <td class="p-3 text-center">
                    <button onclick="removeItem(${idx})" class="text-red-500 hover:text-white"><i class="fas fa-times"></i></button>
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

    if (!confirm("¿Confirmar compra e ingreso al inventario?")) return;

    try {
        const batch = writeBatch(db);

        // A. Documento de Compra
        const purchaseRef = doc(collection(db, "purchases"));
        const totalAmount = cart.reduce((sum, item) => sum + item.totalCost, 0);
        
        batch.set(purchaseRef, {
            supplierId: supplierIdInput.value,
            supplierName: supplierSearch.value,
            invoiceRef: invoiceRef.value || "S/N",
            date: purchaseDate.value,
            items: cart,
            totalAmount: totalAmount,
            createdAt: serverTimestamp()
        });

        // B. Actualizar Inventario
        cart.forEach(item => {
            const invRef = doc(db, "inventory", item.materialId);
            
            if (item.type === 'producto') {
                // INCREMENTO POR TALLAS (Dot Notation)
                // Ej: inventory.update({ "sizes.M": increment(5), "sizes.L": increment(2) })
                const updates = {};
                
                // 1. Actualizar stock global
                updates.quantity = increment(item.qty); 
                updates.cost = (item.totalCost / item.qty); // Promedio simple nueva compra

                // 2. Actualizar cada talla
                for (const [size, qty] of Object.entries(item.sizes)) {
                    updates[`sizes.${size}`] = increment(qty);
                }
                
                batch.update(invRef, updates);

            } else {
                // INCREMENTO SIMPLE (Materia Prima)
                batch.update(invRef, {
                    quantity: increment(item.qty),
                    cost: (item.totalCost / item.qty)
                });
            }
        });

        await batch.commit();
        alert("Compra registrada exitosamente.");
        closeModal();
        
    } catch (error) {
        console.error("Error:", error);
        alert("Error al procesar: " + error.message);
    }
};

// 7. HISTORIAL
function subscribePurchases() {
    const q = query(collection(db, "purchases"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">No hay compras registradas.</td></tr>`;
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            // Convertimos el objeto a string seguro para pasar al onclick
            const dataStr = encodeURIComponent(JSON.stringify(data));

            return `
                <tr class="hover:bg-gray-800/50 transition-colors border-b border-gray-800/50">
                    <td class="px-6 py-4">
                        <div class="text-white font-medium text-sm">${data.date}</div>
                        <div class="text-xs text-gray-500">Ref: ${data.invoiceRef}</div>
                    </td>
                    <td class="px-6 py-4 text-gray-300 text-sm">
                        ${data.supplierName}
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-xs bg-gray-800 border border-gray-700 px-2 py-1 rounded text-gray-400">
                            ${data.items ? data.items.length : 0} ítems
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right text-soriano-gold font-medium">
                        ${copFormatter.format(data.totalAmount)}
                    </td>
                    <td class="px-6 py-4 text-right text-xs space-x-2">
                        <button onclick="window.viewPurchaseDetail('${dataStr}')" 
                                class="text-blue-400 hover:text-white transition p-2 bg-blue-900/20 rounded hover:bg-blue-900/50" 
                                title="Ver Factura Completa">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    });
}


// Utilidad Formato Moneda Input
window.formatCurrencyInput = (input) => {
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; }
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};

// Modals
window.openModal = () => {
    cart = [];
    renderCart();
    invoiceRef.value = "";
    supplierSearch.value = "";
    supplierIdInput.value = "";
    materialSelect.value = "";
    stockInputsContainer.innerHTML = '<p class="text-xs text-gray-600">Seleccione un ítem primero</p>';
    addCost.value = "";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };


// 2. Agrega esta NUEVA función al final del archivo (o antes de los exports si usas módulos estrictos)
window.viewPurchaseDetail = (dataStr) => {
    const data = JSON.parse(decodeURIComponent(dataStr));
    const modal = document.getElementById('detailModal');
    
    // Formateador
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    // Llenar Cabecera
    document.getElementById('detailSupplier').textContent = data.supplierName;
    document.getElementById('detailRef').textContent = `REF: ${data.invoiceRef}`;
    document.getElementById('detailDate').textContent = data.date;
    document.getElementById('detailTotal').textContent = fmt.format(data.totalAmount);

    // Llenar Tabla
    const tbody = document.getElementById('detailItemsBody');
    tbody.innerHTML = data.items.map(item => {
        
        // 1. Generar HTML de Tallas o Cantidad
        let detailsHtml = '';
        if (item.sizes) {
            detailsHtml = Object.entries(item.sizes)
                .map(([size, qty]) => `<span class="bg-gray-700 px-1 rounded text-[10px] mr-1 mb-1 inline-block">${size}:${qty}</span>`)
                .join('');
        } else {
            detailsHtml = `<span class="text-gray-400 font-mono text-xs">${item.qty} ${item.unit || 'und'}</span>`;
        }

        // 2. Generar HTML de Imagen
        const imgHtml = item.imageUrl 
            ? `<img src="${item.imageUrl}" class="w-10 h-10 rounded object-cover border border-gray-700 shadow-sm">`
            : `<div class="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-600 border border-gray-700"><i class="fas fa-box"></i></div>`;

        return `
            <tr class="border-b border-gray-800/50 last:border-0 hover:bg-white/5 transition-colors">
                <td class="p-3">
                    ${imgHtml}
                </td>
                <td class="p-3">
                    <div class="text-white font-medium text-sm">${item.name}</div>
                </td>
                <td class="p-3 text-xs align-middle">
                    ${detailsHtml}
                </td>
                <td class="p-3 text-right font-mono text-xs text-gray-400 align-middle">
                    ${fmt.format(item.totalCost)}
                </td>
            </tr>
        `;
    }).join('');

    // Mostrar
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};
