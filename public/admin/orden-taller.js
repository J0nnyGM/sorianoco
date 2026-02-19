import { db } from '../js/firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const jobId = urlParams.get('id');

if (!jobId) { alert("ID no especificado"); window.close(); }
else { loadData(); }

async function loadData() {
    try {
        // 1. Cargar el Trabajo Externo
        const jobSnap = await getDoc(doc(db, "external_jobs", jobId));
        if (!jobSnap.exists()) throw "Registro de taller no encontrado";
        const job = jobSnap.data();

        document.getElementById('orderNumber').textContent = `#${job.orderNumber}`;
        document.getElementById('serviceType').textContent = job.service.toUpperCase().replace('_', ' ');
        document.getElementById('workshopName').textContent = job.workshopName;
        document.getElementById('dateOut').textContent = job.dateOut;
        document.getElementById('dateReturn').textContent = job.dateReturn;
        
        // Nota específica de la salida al taller
        document.getElementById('jobNotes').textContent = job.notes ? `Instrucción Taller: ${job.notes}` : 'Medidas especificadas en la orden.';

        // 2. Cargar la Orden Original
        const orderSnap = await getDoc(doc(db, "orders", job.orderId));
        if (orderSnap.exists()) {
            const order = orderSnap.data();
            document.getElementById('clientRef').textContent = order.clientName;
            
            // --- NUEVO: NOTA GENERAL DE LA ORDEN (Tela, etc) ---
            const generalNotes = order.notes || "Sin observaciones generales registradas en la orden.";
            document.getElementById('orderGeneralNotes').textContent = generalNotes;
            // ---------------------------------------------------

            // Filtrado de Ítems (Solo a Medida)
            let itemsDesc = "";
            if (order.items && order.items.length > 0) {
                const customItems = order.items.filter(i => !i.inventoryId);
                if (customItems.length > 0) {
                    itemsDesc = customItems.map(i => `• ${i.description}`).join('<br>');
                } else {
                    itemsDesc = "<span class='text-gray-400 italic'>No hay prendas sobre medida en esta orden.</span>";
                }
            } else {
                itemsDesc = "Sin ítems registrados.";
            }
            document.getElementById('garmentDesc').innerHTML = itemsDesc;

            // 3. Renderizar Medidas
            renderMeasures(order.appliedMeasures);
        } else {
            document.getElementById('garmentDesc').textContent = "Error: Orden original eliminada.";
        }

    } catch (e) {
        console.error(e);
        alert("Error cargando datos: " + e);
    }
}

function renderMeasures(measuresObj) {
    const grid = document.getElementById('measuresGrid');
    grid.innerHTML = "";

    if (!measuresObj || Object.keys(measuresObj).length === 0) {
        grid.innerHTML = `<div class="col-span-4 p-4 text-center text-gray-500">No hay medidas registradas en esta orden.</div>`;
        return;
    }

    for (const [category, measures] of Object.entries(measuresObj)) {
        if (!measures) continue;

        // Título de Categoría
        const catHeader = document.createElement('div');
        catHeader.className = "col-span-4 bg-black text-white text-xs font-bold uppercase py-1 mt-2 first:mt-0";
        catHeader.textContent = category;
        grid.appendChild(catHeader);

        // Medidas
        for (const [key, value] of Object.entries(measures)) {
            const label = key.split('_')[1] || key; 
            
            if (value) {
                const cell = document.createElement('div');
                cell.className = "border-r border-b border-gray-300 p-2 flex flex-col";
                cell.innerHTML = `
                    <span class="text-[10px] text-gray-500 uppercase mb-1">${label}</span>
                    <span class="font-mono font-bold text-lg">${value}</span>
                `;
                grid.appendChild(cell);
            }
        }
    }
}