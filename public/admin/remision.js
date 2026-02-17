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
const tbody = document.querySelector('tbody'); // Para insertar filas
const tfoot = document.querySelector('tfoot'); // Para totales
const elNotes = document.getElementById('orderNotes');

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

        // 2. Cliente
        elClientName.textContent = order.clientName;
        if (order.clientId) {
            const clientSnap = await getDoc(doc(db, "clients", order.clientId));
            if (clientSnap.exists()) {
                const c = clientSnap.data();
                elClientId.textContent = `ID: ${c.idNum || '-'}`;
                elClientAddress.textContent = `Dir: ${c.address || '-'}`;
                elClientPhone.textContent = `Tel: ${c.phone || '-'}`;
            }
        }

        // 3. Tabla de Ítems (Prendas)
        let rowsHtml = '';
        if (order.items && order.items.length > 0) {
            rowsHtml = order.items.map(item => `
                <tr class="border-b border-gray-200">
                    <td class="py-4">
                        <p class="font-bold text-gray-800 text-lg">${item.description}</p>
                        <p class="text-sm text-gray-500">${item.size !== 'N/A' ? 'Talla: ' + item.size : ''} ${item.notes ? '- ' + item.notes : ''}</p>
                    </td>
                    <td class="py-4 text-right">${item.quantity}</td>
                    <td class="py-4 text-right font-medium">${cop.format(item.totalPrice)}</td>
                </tr>
            `).join('');
        } else {
            // Soporte legacy (si hay ordenes viejas)
            rowsHtml = `<tr><td class="py-4">${order.garment || 'Prenda'}</td><td class="py-4 text-right">1</td><td class="py-4 text-right">${cop.format(order.totalAmount)}</td></tr>`;
        }
        tbody.innerHTML = rowsHtml;

        // 4. Totales Financieros
        const total = order.totalAmount || 0;
        const advance = order.advancePayment || 0;
        const balance = order.balanceDue || 0; // Si es 0, está a paz y salvo

        tfoot.innerHTML = `
            <tr>
                <td colspan="2" class="pt-4 text-right font-bold text-gray-500 uppercase text-xs">Valor Total</td>
                <td class="pt-4 text-right font-bold text-xl text-black">${cop.format(total)}</td>
            </tr>
            <tr>
                <td colspan="2" class="text-right font-medium text-gray-500 text-xs">Anticipos / Abonos</td>
                <td class="text-right text-gray-600">- ${cop.format(total - balance)}</td>
            </tr>
            <tr class="border-t border-black">
                <td colspan="2" class="pt-2 text-right font-bold text-black uppercase text-sm">Saldo Pendiente</td>
                <td class="pt-2 text-right font-bold text-2xl ${balance > 0 ? 'text-red-600' : 'text-green-600'}">
                    ${balance > 0 ? cop.format(balance) : 'PAGADO'}
                </td>
            </tr>
        `;

        // Auto print (opcional)
        // setTimeout(() => window.print(), 800);

    } catch (error) {
        console.error(error);
        alert("Error: " + error);
    }
}