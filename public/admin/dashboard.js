import { auth, db, signOut, onAuthStateChanged } from '../js/firebase-init.js';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, limit, getAggregateFromServer, sum } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// KPIs Financieros
const kpiSales = document.getElementById('kpiSales');
const kpiExpenses = document.getElementById('kpiExpenses');
const kpiProfit = document.getElementById('kpiProfit');
const kpiPortfolio = document.getElementById('kpiPortfolio');

// KPIs Operativos (Contadores)
const countDiseno = document.getElementById('countDiseno');
const countCorte = document.getElementById('countCorte');
const countConfeccion = document.getElementById('countConfeccion');
const countPrueba = document.getElementById('countPrueba');
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
            
            // Iniciar todos los listeners
            subscribeOrderMetrics(); // Operativo + Cartera
            subscribeFinancials();   // Ventas y Gastos
            subscribeInventory();    // Valor Stock
        }
    } else {
        window.location.href = '../auth/login.html';
    }
});

// 2. MÉTRICAS DE ÓRDENES (Operativo + Cartera)
function subscribeOrderMetrics() {
    // Solo traemos órdenes que NO están entregadas para el tablero operativo
    // Esto ahorra lecturas y se enfoca en lo pendiente
    const q = query(collection(db, "orders"), where("status", "!=", "entregado"), orderBy("status"), orderBy("deadline", "asc"));

    onSnapshot(q, (snapshot) => {
        // Reset contadores
        let counts = { diseno: 0, corte: 0, confeccion: 0, prueba: 0, terminado: 0 };
        let totalActive = 0;
        let pendingMoney = 0; // Cartera
        const upcomingDeliveries = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            totalActive++;
            
            // Sumar cartera
            pendingMoney += (data.balanceDue || 0);

            // Contar por estado
            if (counts[data.status] !== undefined) {
                counts[data.status]++;
            } else if (data.status === 'acabados') {
                counts.prueba++; // Agrupar acabados con prueba
            }

            // Guardar para tabla (próximas entregas)
            if (upcomingDeliveries.length < 5) {
                upcomingDeliveries.push(data);
            }
        });

        // Actualizar DOM Operativo
        if(countDiseno) countDiseno.textContent = counts.diseno;
        if(countCorte) countCorte.textContent = counts.corte;
        if(countConfeccion) countConfeccion.textContent = counts.confeccion;
        // Agrupamos Prueba + Terminado para simplicidad visual, o sumalos
        if(countPrueba) countPrueba.textContent = counts.prueba + counts.terminado;
        if(totalActiveOrders) totalActiveOrders.textContent = `${totalActive} Total`;

        // Actualizar Cartera (KPI Financiero)
        if(kpiPortfolio) kpiPortfolio.textContent = cop.format(pendingMoney);

        // Renderizar Tabla
        renderTable(upcomingDeliveries);
        
        // Recalcular Utilidad (Simple visual update)
        updateProfitCalc();
    });
}

// 3. MÉTRICAS FINANCIERAS (Ventas y Gastos del MES ACTUAL)
function subscribeFinancials() {
    // Calcular rango del mes actual
    const date = new Date();
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

    // Consulta de Transacciones (Ingresos y Gastos)
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

        if(kpiSales) {
            kpiSales.textContent = cop.format(income);
            kpiSales.dataset.val = income;
        }
        if(kpiExpenses) {
            kpiExpenses.textContent = cop.format(expenses);
            kpiExpenses.dataset.val = expenses;
        }

        updateProfitCalc();
    });
}

function updateProfitCalc() {
    // Calculo simple: Ingresos - Gastos (en base a lo cargado en DOM)
    const inc = parseFloat(kpiSales?.dataset.val || 0);
    const exp = parseFloat(kpiExpenses?.dataset.val || 0);
    const profit = inc - exp;

    if(kpiProfit) {
        kpiProfit.textContent = cop.format(profit);
        kpiProfit.className = `text-2xl font-serif ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`;
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
            kpiLowStock.textContent = `${lowStockCount} ítems`;
            kpiLowStock.className = lowStockCount > 0 ? "text-orange-500 font-bold" : "text-gray-500";
        }
    });
}

// 5. TABLA PRÓXIMAS ENTREGAS
function renderTable(orders) {
    if (!recentTable) return;
    if (orders.length === 0) {
        recentTable.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-500">No hay entregas pendientes.</td></tr>`;
        return;
    }

    recentTable.innerHTML = orders.map(order => {
        // Resumen de prendas
        let summary = "Varios";
        if (order.items && order.items.length === 1) summary = order.items[0].description;
        else if (order.items) summary = `${order.items.length} Prendas`;

        const balance = order.balanceDue || 0;
        
        return `
            <tr class="hover:bg-gray-800/30 transition-colors">
                <td class="px-6 py-3 text-white font-medium">${order.clientName}</td>
                <td class="px-6 py-3 text-gray-400 text-xs">${summary}</td>
                <td class="px-6 py-3 text-right text-soriano-gold font-mono text-xs">${order.deadline}</td>
                <td class="px-6 py-3 text-right font-mono text-xs ${balance > 0 ? 'text-red-400' : 'text-green-500'}">
                    ${balance > 0 ? cop.format(balance) : 'Pagado'}
                </td>
            </tr>
        `;
    }).join('');
}