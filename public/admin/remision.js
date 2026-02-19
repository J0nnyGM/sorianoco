import { db } from '../js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('id');

// Elementos DOM
const elOrderNumber = document.getElementById('orderNumber');
const elDate = document.getElementById('currentDate');
const elClientName = document.getElementById('clientName');
const elClientId = document.getElementById('clientIdNum');
const elClientAddress = document.getElementById('clientAddress');
const elClientPhone = document.getElementById('clientPhone');
const itemsBody = document.getElementById('itemsBody');
const totalsFooter = document.getElementById('totalsFooter');
const elNotes = document.getElementById('orderNotes');
const elSignature = document.getElementById('authSignature');

// Secciones de Garantía
const sectionCustom = document.getElementById('warrantyCustom');
const sectionFinished = document.getElementById('warrantyFinished');

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

if (!orderId) { alert("Error: Sin ID de orden"); window.close(); }
else { loadData(); }

async function loadData() {
    try {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (!orderSnap.exists()) throw "Orden no encontrada";
        
        const order = orderSnap.data();

        // 1. Datos Generales
        elOrderNumber.textContent = `#${order.orderNumber}`;
        const dateObj = order.createdAt ? new Date(order.createdAt.seconds * 1000) : new Date();
        elDate.textContent = `Fecha: ${dateObj.toLocaleDateString('es-CO')}`;
        elNotes.textContent = order.notes || "Sin observaciones adicionales.";

        // --- FIRMA DINÁMICA ---
        const respName = order.responsableName || "Soriano Admin";
        const nameParts = respName.trim().split(' ');
        let signatureText = respName;
        if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastNameInitial = nameParts[nameParts.length - 1].charAt(0);
            signatureText = `${firstName} ${lastNameInitial}.`;
        }
        elSignature.textContent = signatureText;

        // 2. Cliente
        elClientName.textContent = order.clientName || "Cliente Mostrador";
        if (order.clientId) {
            try {
                const clientSnap = await getDoc(doc(db, "clients", order.clientId));
                if (clientSnap.exists()) {
                    const c = clientSnap.data();
                    elClientId.textContent = c.idNum ? `ID: ${c.idNum}` : '';
                    elClientAddress.textContent = c.address ? `Dir: ${c.address}` : '';
                    elClientPhone.textContent = c.phone ? `Tel: ${c.phone}` : '';
                }
            } catch (e) { console.log("Info cliente base"); }
        }

        // 3. Tabla de Ítems e Identificación de Tipos
        let rowsHtml = '';
        let hasCustomItems = false;   // Bandera: ¿Hay hechos a medida?
        let hasFinishedItems = false; // Bandera: ¿Hay productos terminados?

        if (order.items && order.items.length > 0) {
            rowsHtml = order.items.map(item => {
                // LÓGICA INTELIGENTE DE DETECCIÓN
                if (item.inventoryId) {
                    hasFinishedItems = true; // Tiene ID de inventario -> Producto Terminado
                } else {
                    hasCustomItems = true;   // No tiene ID -> A Medida
                }

                return `
                <tr class="border-b border-gray-200 text-sm">
                    <td class="py-4 pr-4">
                        <p class="font-bold text-gray-800 text-base">${item.description}</p>
                        <p class="text-xs text-gray-500 mt-0.5">
                            ${item.size && item.size !== 'N/A' ? `<span class="bg-gray-200 px-1.5 rounded text-black font-bold mr-1">${item.size}</span>` : ''} 
                            ${item.notes || ''}
                        </p>
                    </td>
                    <td class="py-4 text-right align-top">${item.quantity}</td>
                    <td class="py-4 text-right font-medium align-top">${cop.format(item.totalPrice)}</td>
                </tr>`;
            }).join('');
        } else {
            rowsHtml = `<tr><td class="py-4">Prenda General</td><td class="py-4 text-right">1</td><td class="py-4 text-right">${cop.format(order.totalAmount)}</td></tr>`;
        }
        itemsBody.innerHTML = rowsHtml;

        // 4. Mostrar Garantías Correspondientes
        // Revisamos también si hay medidas aplicadas en la orden (refuerzo para 'custom')
        if (order.appliedMeasures && Object.keys(order.appliedMeasures).length > 0) {
            hasCustomItems = true;
        }

        if (hasCustomItems) sectionCustom.classList.remove('hidden');
        if (hasFinishedItems) sectionFinished.classList.remove('hidden');

        // 5. Totales Financieros
        const total = order.totalAmount || 0;
        const balance = order.balanceDue || 0;
        const paidAmount = total - balance;

        totalsFooter.innerHTML = `
            <tr>
                <td colspan="2" class="pt-6 text-right font-bold text-gray-500 uppercase text-xs">Valor Total Orden</td>
                <td class="pt-6 text-right font-bold text-lg text-black">${cop.format(total)}</td>
            </tr>
            <tr>
                <td colspan="2" class="text-right font-medium text-gray-500 text-xs pb-2">Total Recibido (Abonos)</td>
                <td class="text-right text-gray-600 pb-2 border-b border-gray-300">- ${cop.format(paidAmount)}</td>
            </tr>
            <tr>
                <td colspan="2" class="pt-3 text-right font-bold text-black uppercase text-sm">Saldo Pendiente</td>
                <td class="pt-3 text-right font-bold text-xl ${balance > 0 ? 'text-red-600' : 'text-green-600'}">
                    ${balance > 0 ? cop.format(balance) : 'PAGADO'}
                </td>
            </tr>
        `;

    } catch (error) {
        console.error(error);
        alert("Error generando remisión: " + error);
    }
}