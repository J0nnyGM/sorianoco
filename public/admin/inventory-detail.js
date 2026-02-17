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

const purchasesList = document.getElementById('purchasesList');
const usageList = document.getElementById('usageList');

// Obtener ID de la URL
const urlParams = new URLSearchParams(window.location.search);
const itemId = urlParams.get('id');

// Formateador
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// 1. INIT
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    // Sidebar
    getDoc(doc(db, "users", user.uid)).then(s => { if(s.exists()) updateSidebarUser(user, s.data()) });

    if (!itemId) { alert("Ítem no especificado"); window.location.href = 'inventario.html'; return; }

    loadItemData();
    loadMovements();
});

// 2. CARGAR DATOS BÁSICOS
async function loadItemData() {
    try {
        const docSnap = await getDoc(doc(db, "inventory", itemId));
        if (!docSnap.exists()) {
            elName.textContent = "Ítem no encontrado";
            return;
        }

        const data = docSnap.data();
        
// Render Header
        elName.textContent = data.name;
        elSku.textContent = `SKU: ${data.sku}`;
        elCost.textContent = cop.format(data.cost);
        elBadge.textContent = data.classification === 'producto' ? 'Producto Terminado' : 'Materia Prima';
        
        // --- LÓGICA DE STOCK MEJORADA (TALLAS + TOTAL) ---
        if (data.classification === 'producto' && data.sizes) {
            
            // 1. Generar HTML de las "Pastillas" o "Chips" por talla
            const sizesHtml = Object.entries(data.sizes)
                .filter(([_, qty]) => qty > 0) // Solo mostrar lo que tiene existencias
                .map(([size, qty]) => 
                    `<span class="inline-flex items-center bg-gray-800 border border-gray-600 px-2 py-0.5 rounded mr-1 mb-1">
                        <span class="text-[10px] text-gray-400 mr-1 uppercase">${size}:</span>
                        <span class="text-xs text-white font-bold">${qty}</span>
                    </span>`
                ).join('');

            // 2. Calcular el Gran Total
            const total = Object.values(data.sizes).reduce((a, b) => a + b, 0);

            // 3. Renderizar: Tallas arriba, Total abajo
            if (sizesHtml) {
                elStock.innerHTML = `
                    <div class="flex flex-wrap mb-1 leading-none">
                        ${sizesHtml}
                    </div>
                    <div class="text-xs text-gray-400 font-normal">
                        Total Global: <span class="text-xl text-white font-bold">${total}</span> und
                    </div>
                `;
            } else {
                elStock.innerHTML = `<span class="text-red-500 font-bold">Sin Stock (0)</span>`;
            }

        } else {
            // --- CASO MATERIA PRIMA (Sigue igual, simple) ---
            elStock.innerHTML = `<span class="text-xl text-white font-bold">${parseFloat(data.quantity)}</span> <span class="text-sm text-gray-500">${data.unit}</span>`;
        }

        // Imagen
        if (data.imageUrl) {
            elImage.src = data.imageUrl;
            elImage.classList.remove('hidden');
            elNoImage.classList.add('hidden');
        }

    } catch (error) {
        console.error("Error item:", error);
    }
}

// 3. CARGAR MOVIMIENTOS (COMPRAS Y VENTAS)
async function loadMovements() {
    try {
        // --- A. BUSCAR EN COMPRAS (ENTRADAS) ---
        // Nota: Firestore no permite buscar fácilmente dentro de arrays de objetos sin índices complejos.
        // Para este MVP, traeremos las compras recientes y filtraremos en JS (si el volumen es bajo).
        // Si crece, se necesita una colección 'movements' separada.
        
        const purchasesSnap = await getDocs(query(collection(db, "purchases"), orderBy("date", "desc")));
        let purchaseRows = '';
        let totalBought = 0;

        purchasesSnap.forEach(doc => {
            const p = doc.data();
            const itemInPurchase = p.items.find(i => i.materialId === itemId); 
            
            if (itemInPurchase) {
                totalBought += parseFloat(itemInPurchase.qty);
                const unitCost = itemInPurchase.totalCost / itemInPurchase.qty;
                
                // Preparamos los datos completos de la compra para el modal
                const fullPurchaseData = encodeURIComponent(JSON.stringify(p));

                purchaseRows += `
                    <tr class="hover:bg-gray-800/30 transition-colors">
                        <td class="py-3 pl-2">${p.date}</td>
                        <td class="py-3 text-xs">
                            <div class="text-white">${p.supplierName}</div>
                            <div class="text-[10px] text-gray-500">Ref: ${p.invoiceRef}</div>
                        </td>
                        <td class="py-3 text-right font-bold text-green-400">+${itemInPurchase.qty}</td>
                        <td class="py-3 text-right text-gray-500 text-xs">${cop.format(unitCost)}</td>
                        
                        <td class="py-3 text-right pr-2">
                            <button onclick="window.viewPurchaseDetail('${fullPurchaseData}')" 
                                class="text-gray-500 hover:text-blue-400 p-1" title="Ver Factura Completa">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }
        });

        purchasesList.innerHTML = purchaseRows || '<tr><td colspan="4" class="py-4 text-center text-xs">Sin registros de compra.</td></tr>';
        elTotalPurchased.textContent = totalBought; // Unidad no disponible aquí fácil, asumimos la del ítem

        // --- B. BUSCAR EN ÓRDENES (SALIDAS/USO) ---
        const ordersSnap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
        let usageRows = '';
        let totalConsumed = 0;

        ordersSnap.forEach(doc => {
            const o = doc.data();
            let qtyUsedInOrder = 0;

            // CASO 1: Es Materia Prima (usada en materials[])
            if (o.materials) {
                const mat = o.materials.find(m => m.materialId === itemId);
                if (mat) qtyUsedInOrder = parseFloat(mat.qty);
            }

            // CASO 2: Es Producto Terminado (vendido - esto requiere que conectemos la venta al ID del producto)
            // Por ahora, asumimos la lógica de materia prima que es la que tenemos implementada robusta.
            
            if (qtyUsedInOrder > 0) {
                totalConsumed += qtyUsedInOrder;
                const dateStr = o.createdAt ? new Date(o.createdAt.seconds * 1000).toLocaleDateString() : '-';
                
                usageRows += `
                    <tr class="hover:bg-gray-800/30">
                        <td class="py-3">${dateStr}</td>
                        <td class="py-3">
                            <a href="orden-detalle.html?id=${doc.id}" class="text-blue-400 hover:underline">#${o.orderNumber}</a>
                            <div class="text-[10px] text-gray-500">${o.clientName}</div>
                        </td>
                        <td class="py-3 text-right font-bold text-red-400">-${qtyUsedInOrder}</td>
                        <td class="py-3 text-right text-xs uppercase">${o.status}</td>
                    </tr>
                `;
            }
        });

        usageList.innerHTML = usageRows || '<tr><td colspan="4" class="py-4 text-center text-xs">Sin uso registrado.</td></tr>';
        elTotalUsed.textContent = totalConsumed;

    } catch (error) {
        console.error("Error movimientos:", error);
        purchasesList.innerHTML = '<tr><td colspan="4" class="text-center text-red-500">Error cargando datos.</td></tr>';
    }
}

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