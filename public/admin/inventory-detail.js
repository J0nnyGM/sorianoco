import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const elImage = document.getElementById('itemImage');
const elNoImage = document.getElementById('noImage');
const elName = document.getElementById('itemName');
const elSku = document.getElementById('itemSku');
const elCost = document.getElementById('itemCost');
const elBadge = document.getElementById('itemBadge');

const elStock = document.getElementById('itemStock');
const elTotalPurchased = document.getElementById('totalPurchased');
const elTotalUsed = document.getElementById('totalUsed');
const purchasedBreakdown = document.getElementById('purchasedBreakdown');
const usedBreakdown = document.getElementById('usedBreakdown');

const purchasesList = document.getElementById('purchasesList');
const usageList = document.getElementById('usageList');

// Params
const urlParams = new URLSearchParams(window.location.search);
const itemId = urlParams.get('id');
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// LISTA MAESTRA PARA ORDENAR TALLAS
const orderedSizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "Unica", "Única", "4", "6", "8", "10", "12", "14", "16", "18", "20", "28", "30", "32", "34", "36", "38", "40", "42", "44"];

// 1. INIT
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    getDoc(doc(db, "users", user.uid)).then(s => { if(s.exists()) updateSidebarUser(user, s.data()) });

    if (!itemId) { alert("Ítem no especificado"); window.location.href = 'inventario.html'; return; }

    loadItemData();
    loadMovements();
});

// Función auxiliar para ordenar tallas
function sortSizeEntries(entries) {
    return entries.sort((a, b) => {
        let indexA = orderedSizes.indexOf(a[0].toUpperCase());
        let indexB = orderedSizes.indexOf(b[0].toUpperCase());
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;
        
        if (indexA === 999 && indexB === 999) {
            return a[0].localeCompare(b[0], undefined, { numeric: true });
        }
        return indexA - indexB;
    });
}

// 2. CARGAR DATOS
async function loadItemData() {
    try {
        const docSnap = await getDoc(doc(db, "inventory", itemId));
        if (!docSnap.exists()) { elName.textContent = "Ítem no encontrado"; return; }

        const data = docSnap.data();
        
        elName.textContent = data.name;
        elSku.textContent = `SKU: ${data.sku}`;
        elCost.textContent = cop.format(data.cost);
        
        const isProd = data.classification === 'producto';
        elBadge.textContent = isProd ? 'Producto Terminado' : 'Materia Prima';
        elBadge.className = `px-2.5 py-1 text-[10px] uppercase font-bold rounded-full border mb-3 inline-block tracking-wider ${isProd ? 'bg-blue-900/30 text-blue-300 border-blue-800' : 'bg-green-900/30 text-green-300 border-green-800'}`;

        // STOCK DISPLAY (ORDENADO)
        if (isProd && data.sizes) {
            const entries = Object.entries(data.sizes).filter(([_, qty]) => qty > 0);
            const sortedEntries = sortSizeEntries(entries);

            const sizesHtml = sortedEntries.map(([size, qty]) => 
                    `<span class="inline-flex items-center bg-black border border-gray-700 px-2 py-1 rounded mr-1 mb-1 shadow-sm">
                        <span class="text-[10px] text-gray-500 mr-1.5 uppercase font-bold">${size}</span>
                        <span class="text-sm text-white font-mono font-bold">${qty}</span>
                    </span>`
                ).join('');

            const total = Object.values(data.sizes).reduce((a, b) => a + b, 0);

            if (sizesHtml) {
                elStock.innerHTML = `
                    <div class="flex flex-wrap mb-2">${sizesHtml}</div>
                    <div class="text-xs text-gray-500 pt-2 border-t border-gray-800">Total Global: <span class="text-white font-bold">${total}</span> und</div>
                `;
            } else {
                elStock.innerHTML = `<span class="text-red-500 font-bold text-sm bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-900/50">Agotado (0)</span>`;
            }
        } else {
            elStock.innerHTML = `<span class="text-4xl text-white font-serif">${parseFloat(data.quantity)}</span> <span class="text-sm text-gray-500 font-bold uppercase ml-2">${data.unit}</span>`;
        }

        if (data.imageUrl) {
            elImage.src = data.imageUrl;
            elImage.classList.remove('hidden');
            elNoImage.classList.add('hidden');
        }

    } catch (e) { console.error(e); }
}

// 3. MOVIMIENTOS (CON DETALLE POR TALLA)
async function loadMovements() {
    try {
        // --- A. COMPRAS ---
        const purchasesSnap = await getDocs(query(collection(db, "purchases"), orderBy("date", "desc")));
        let purchaseRows = '';
        let totalBought = 0;
        let boughtSizesMap = {}; // Mapa para acumular tallas compradas

        purchasesSnap.forEach(doc => {
            const p = doc.data();
            const itemInPurchase = p.items ? p.items.find(i => i.materialId === itemId || i.id === itemId) : null;
            
            if (itemInPurchase) {
                const qty = parseFloat(itemInPurchase.qty || 0);
                totalBought += qty;
                
                // Acumular tallas de compra si existen
                if (itemInPurchase.sizes) {
                    Object.entries(itemInPurchase.sizes).forEach(([s, q]) => {
                        boughtSizesMap[s] = (boughtSizesMap[s] || 0) + parseFloat(q);
                    });
                }

                const unitCost = itemInPurchase.totalCost / qty;
                const fullData = encodeURIComponent(JSON.stringify(p));

                purchaseRows += `
                    <tr class="hover:bg-white/5 transition border-b border-gray-800/50 group">
                        <td class="px-6 py-4 whitespace-nowrap text-gray-300 font-mono text-xs">${p.date}</td>
                        <td class="px-6 py-4">
                            <div class="text-white text-sm font-bold">${p.supplierName}</div>
                            <div class="text-[10px] text-gray-500 uppercase tracking-wider">Ref: ${p.invoiceRef}</div>
                        </td>
                        <td class="px-6 py-4 text-right">
                            <span class="text-green-400 font-bold font-mono">+${qty}</span>
                        </td>
                        <td class="px-6 py-4 text-right text-gray-500 font-mono text-xs">${cop.format(unitCost)}</td>
                        <td class="px-6 py-4 text-right">
                            <button onclick="window.viewPurchaseDetail('${fullData}')" 
                                class="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-blue-600 transition flex items-center justify-center shadow-sm">
                                <i class="fas fa-file-invoice"></i>
                            </button>
                        </td>
                    </tr>`;
            }
        });

        purchasesList.innerHTML = purchaseRows || '<tr><td colspan="5" class="py-8 text-center text-xs text-gray-500 italic">No hay historial de compras.</td></tr>';
        elTotalPurchased.textContent = totalBought;
        renderBreakdown(boughtSizesMap, purchasedBreakdown, 'green');


        // --- B. VENTAS / SALIDAS ---
        const ordersSnap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
        let usageRows = '';
        let totalConsumed = 0;
        let soldSizesMap = {}; // Mapa para acumular tallas vendidas

        ordersSnap.forEach(docSnap => {
            const o = docSnap.data();
            let qtyInOrder = 0;

            // 1. Uso como Material (Materia Prima)
            if (o.materials && Array.isArray(o.materials)) {
                const mat = o.materials.find(m => m.materialId === itemId);
                if (mat) {
                    const q = parseFloat(mat.qty || 0);
                    qtyInOrder += q;
                    // Materiales usualmente no tienen talla en el consumo, pero si tuvieran:
                    // if(mat.size) soldSizesMap[mat.size] = ...
                }
            }

            // 2. Venta como Producto (Items)
            const productsList = o.items || []; 
            if (Array.isArray(productsList)) {
                const soldItem = productsList.find(p => p.inventoryId === itemId);
                if (soldItem) {
                    const q = parseFloat(soldItem.quantity || 1);
                    qtyInOrder += q;
                    
                    // Acumular Tallas Vendidas
                    // En nueva-orden.js se guarda 'size' como string (ej: "M")
                    const sizeKey = soldItem.size;
                    if (sizeKey && sizeKey !== 'N/A') {
                        soldSizesMap[sizeKey] = (soldSizesMap[sizeKey] || 0) + q;
                    }
                }
            }

            if (qtyInOrder > 0) {
                totalConsumed += qtyInOrder;
                
                let dateStr = '-';
                if (o.createdAt && o.createdAt.seconds) {
                    dateStr = new Date(o.createdAt.seconds * 1000).toLocaleDateString();
                }

                usageRows += `
                    <tr class="hover:bg-white/5 transition border-b border-gray-800/50">
                        <td class="px-6 py-4 text-gray-400 text-xs font-mono">${dateStr}</td>
                        <td class="px-6 py-4">
                            <a href="orden-detalle.html?id=${docSnap.id}" class="text-blue-400 hover:text-blue-300 font-bold text-sm hover:underline">
                                Orden #${o.orderNumber || 'S/N'}
                            </a>
                            <div class="text-[10px] text-gray-500 uppercase">${o.clientName || 'Cliente'}</div>
                        </td>
                        <td class="px-6 py-4 text-right font-bold text-soriano-red font-mono">-${qtyInOrder}</td>
                        <td class="px-6 py-4 text-right">
                            <span class="text-[10px] uppercase bg-gray-800 px-2 py-1 rounded text-gray-400 border border-gray-700">
                                ${o.status || 'Completado'}
                            </span>
                        </td>
                    </tr>`;
            }
        });

        usageList.innerHTML = usageRows || '<tr><td colspan="4" class="py-8 text-center text-xs text-gray-500 italic">No hay registros de salida.</td></tr>';
        elTotalUsed.textContent = totalConsumed;
        renderBreakdown(soldSizesMap, usedBreakdown, 'red');

    } catch (e) { 
        console.error("Error en loadMovements:", e); 
    }
}

// Renderizar las pequeñas etiquetas debajo de los totales
function renderBreakdown(map, container, colorClass) {
    if (Object.keys(map).length === 0) {
        container.innerHTML = '<span class="text-gray-600 italic">Sin detalle de tallas</span>';
        return;
    }

    const entries = Object.entries(map);
    const sorted = sortSizeEntries(entries);
    
    // Colores dinámicos según el tipo (verde para compras, rojo para ventas)
    const bgClass = colorClass === 'green' ? 'bg-green-900/20 border-green-900 text-green-400' : 'bg-red-900/20 border-red-900 text-red-400';

    container.innerHTML = sorted.map(([size, qty]) => 
        `<span class="px-1.5 py-0.5 rounded border ${bgClass} font-mono font-bold text-[9px] flex items-center">
            ${size}: ${qty}
        </span>`
    ).join('');
}

window.viewPurchaseDetail = (dataStr) => {
    const data = JSON.parse(decodeURIComponent(dataStr));
    const modal = document.getElementById('detailModal');
    
    document.getElementById('detailSupplier').textContent = data.supplierName;
    document.getElementById('detailRef').textContent = `FACTURA: ${data.invoiceRef}`;
    document.getElementById('detailDate').textContent = data.date;
    document.getElementById('detailTotal').textContent = cop.format(data.totalAmount);

    const tbody = document.getElementById('detailItemsBody');
    tbody.innerHTML = data.items.map(item => {
        // Ordenar tallas en el modal de detalle también
        let detailHtml = '';
        if (item.sizes) {
            const sortedSizes = sortSizeEntries(Object.entries(item.sizes));
            detailHtml = sortedSizes.map(([s, q]) => `<span class="bg-gray-800 border border-gray-700 px-1.5 rounded text-[10px] mr-1">${s}:${q}</span>`).join('');
        } else {
            detailHtml = `<span class="text-gray-400 font-mono text-xs">${item.qty} ${item.unit || 'und'}</span>`;
        }

        const imgHtml = item.imageUrl 
            ? `<img src="${item.imageUrl}" class="w-10 h-10 rounded border border-gray-700 object-cover">`
            : `<div class="w-10 h-10 rounded bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600"><i class="fas fa-box"></i></div>`;

        return `
            <tr class="hover:bg-white/5 transition border-b border-gray-800/50 last:border-0">
                <td class="px-6 py-3">${imgHtml}</td>
                <td class="px-6 py-3 font-medium text-white text-sm">${item.name}</td>
                <td class="px-6 py-3">${detailHtml}</td>
                <td class="px-6 py-3 text-right text-gray-400 font-mono text-xs">${cop.format(item.totalCost)}</td>
            </tr>`;
    }).join('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};