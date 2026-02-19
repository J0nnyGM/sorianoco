import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// KPIs Financieros
const kpiSales = document.getElementById('kpiSales');
const kpiExpenses = document.getElementById('kpiExpenses');
const kpiProfit = document.getElementById('kpiProfit');
const kpiPortfolio = document.getElementById('kpiPortfolio');

// KPIs Operativos (Contadores y Barras)
const countDiseno = document.getElementById('countDiseno');
const countCorte = document.getElementById('countCorte');
const countConfeccion = document.getElementById('countConfeccion');
const countPrueba = document.getElementById('countPrueba');
const barDiseno = document.getElementById('barDiseno');
const barCorte = document.getElementById('barCorte');
const barConfeccion = document.getElementById('barConfeccion');
const barPrueba = document.getElementById('barPrueba');
const totalActiveOrders = document.getElementById('totalActiveOrders');

// Inventario
const kpiInventoryValue = document.getElementById('kpiInventoryValue');
const kpiLowStock = document.getElementById('kpiLowStock');

// Tabla
const recentTable = document.getElementById('recentOrdersTable');

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// 1. INIT
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            updateSidebarUser(user, docSnap.data());
            
            subscribeOrderMetrics(); 
            subscribeFinancials();   
            subscribeInventory();    
        }
    } else {
        window.location.href = '../auth/login.html';
    }
});

// 2. MÉTRICAS DE ÓRDENES (Operativo + Cartera + Barras de Progreso)
function subscribeOrderMetrics() {
    const q = query(collection(db, "orders"), where("status", "!=", "entregado"), orderBy("status"), orderBy("deadline", "asc"));

    onSnapshot(q, (snapshot) => {
        let counts = { diseno: 0, corte: 0, confeccion: 0, prueba: 0, terminado: 0 };
        let totalActive = 0;
        let pendingMoney = 0; 
        const upcomingDeliveries = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            totalActive++;
            pendingMoney += (data.balanceDue || 0);

            if (counts[data.status] !== undefined) {
                counts[data.status]++;
            } else if (data.status === 'acabados') {
                counts.prueba++; 
            }

            // Guardar solo las 5 más próximas para la tabla
            if (upcomingDeliveries.length < 5) upcomingDeliveries.push(data);
        });

        const totalPrueba = counts.prueba + counts.terminado;

        // Actualizar Textos
        if(countDiseno) countDiseno.textContent = counts.diseno;
        if(countCorte) countCorte.textContent = counts.corte;
        if(countConfeccion) countConfeccion.textContent = counts.confeccion;
        if(countPrueba) countPrueba.textContent = totalPrueba;
        if(totalActiveOrders) totalActiveOrders.textContent = `${totalActive} Activas`;

        // Actualizar Barras Visuales (Porcentajes)
        if (totalActive > 0) {
            if(barDiseno) barDiseno.style.width = `${(counts.diseno / totalActive) * 100}%`;
            if(barCorte) barCorte.style.width = `${(counts.corte / totalActive) * 100}%`;
            if(barConfeccion) barConfeccion.style.width = `${(counts.confeccion / totalActive) * 100}%`;
            if(barPrueba) barPrueba.style.width = `${(totalPrueba / totalActive) * 100}%`;
        } else {
            [barDiseno, barCorte, barConfeccion, barPrueba].forEach(bar => { if(bar) bar.style.width = '0%'; });
        }

        // Actualizar Cartera
        if(kpiPortfolio) kpiPortfolio.textContent = cop.format(pendingMoney);

        // Renderizar Tabla
        renderTable(upcomingDeliveries);
        updateProfitCalc();
    });
}

// 3. MÉTRICAS FINANCIERAS (Ventas y Gastos del MES ACTUAL)
function subscribeFinancials() {
    const date = new Date();
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

    const q = query(
        collection(db, "transactions"), 
        where("date", ">=", startOfMonth),
        where("date", "<=", endOfMonth)
    );

    onSnapshot(q, (snapshot) => {
        let income = 0;
        let expenses = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const amt = Math.abs(data.amount || 0);

            if (data.type === 'income' || data.type === 'reversal') {
                income += amt;
            } else if (data.type === 'expense' || data.type === 'tax_gmf') {
                expenses += amt;
            }
        });

        if(kpiSales) { kpiSales.textContent = cop.format(income); kpiSales.dataset.val = income; }
        if(kpiExpenses) { kpiExpenses.textContent = cop.format(expenses); kpiExpenses.dataset.val = expenses; }

        updateProfitCalc();
    });
}

function updateProfitCalc() {
    const inc = parseFloat(kpiSales?.dataset.val || 0);
    const exp = parseFloat(kpiExpenses?.dataset.val || 0);
    const profit = inc - exp;

    if(kpiProfit) {
        kpiProfit.textContent = cop.format(profit);
        kpiProfit.className = `text-3xl font-serif font-bold tracking-wide relative z-10 ${profit >= 0 ? 'text-blue-400' : 'text-red-400'}`;
    }
}

// 4. INVENTARIO (Valor y Alertas)
function subscribeInventory() {
    const q = collection(db, "inventory");
    onSnapshot(q, (snapshot) => {
        let totalValue = 0;
        let lowStockCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const qty = parseFloat(data.quantity) || 0;
            const cost = parseFloat(data.cost) || 0;
            const min = parseFloat(data.minStock) || 0;

            totalValue += (qty * cost);
            if (qty <= min) lowStockCount++;
        });

        if(kpiInventoryValue) kpiInventoryValue.textContent = cop.format(totalValue);
        if(kpiLowStock) {
            kpiLowStock.textContent = `${lowStockCount} Ítems`;
            kpiLowStock.className = lowStockCount > 0 ? "text-orange-500 font-mono font-bold" : "text-gray-500 font-mono";
        }
    });
}

// 5. TABLA PRÓXIMAS ENTREGAS
function renderTable(orders) {
    if (!recentTable) return;
    if (orders.length === 0) {
        recentTable.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500 italic">No hay entregas pendientes.</td></tr>`;
        return;
    }

    recentTable.innerHTML = orders.map(order => {
        let summary = "Varios Ítems";
        if (order.items && order.items.length === 1) summary = order.items[0].description;
        else if (order.items) summary = `${order.items.length} Prendas`;

        const balance = order.balanceDue || 0;
        const balanceHtml = balance > 0 
            ? `<span class="text-red-400 font-bold">${cop.format(balance)}</span>`
            : `<span class="bg-green-900/30 text-green-400 border border-green-900 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest"><i class="fas fa-check mr-1"></i> Pagado</span>`;
        
        return `
            <tr class="hover:bg-white/5 transition-colors group">
                <td class="px-6 py-4">
                    <div class="text-white font-medium text-sm group-hover:text-blue-400 transition">${order.clientName}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-0.5">Orden #${order.orderNumber}</div>
                </td>
                <td class="px-6 py-4 text-gray-400 text-xs">${summary}</td>
                <td class="px-6 py-4 text-right">
                    <span class="text-soriano-gold font-mono text-sm font-bold bg-yellow-900/10 border border-yellow-900/30 px-3 py-1.5 rounded-lg">${order.deadline}</span>
                </td>
                <td class="px-6 py-4 text-right font-mono text-sm">
                    ${balanceHtml}
                </td>
            </tr>
        `;
    }).join('');
}