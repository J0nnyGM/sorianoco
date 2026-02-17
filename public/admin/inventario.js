import { auth, db, storage, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const tableBody = document.getElementById('inventoryTableBody');
const modal = document.getElementById('itemModal');
const form = document.getElementById('inventoryForm');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveBtn');

// Inputs Principales
const itemIdInput = document.getElementById('itemId');
const classificationSelect = document.getElementById('classification');
const typeSelect = document.getElementById('itemType');
const nameInput = document.getElementById('itemName');
const skuInput = document.getElementById('itemSku');
const costInput = document.getElementById('itemCost'); // Ahora es type="text"
const currentImageUrl = document.getElementById('currentImageUrl');

// Imagen
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const imageIcon = document.getElementById('imageIcon');

// Secciones de Stock
const simpleStockSection = document.getElementById('simpleStockSection');
const sizesStockSection = document.getElementById('sizesStockSection');
const sizesContainer = document.getElementById('sizesContainer'); 
const totalSizesDisplay = document.getElementById('totalSizesDisplay');
const itemQty = document.getElementById('itemQty');
const itemUnit = document.getElementById('itemUnit');
const itemMin = document.getElementById('itemMin');

// --- CONFIGURACIÓN ---

// Categorías por Clasificación
const categories = {
    material: ['Tela', 'Hilo', 'Botón/Cierre', 'Adorno', 'Empaque', 'Otro'],
    producto: ['Camisa', 'Chaqueta', 'Pantalón', 'Blazer', 'Chaleco', 'Calzado', 'Accesorio']
};

// Tallas específicas por Categoría de Producto
const sizeConfigs = {
    'Camisa': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Chaqueta': ['34', '36', '38', '40', '42', '44'],
    'Pantalón': ['28', '30', '32', '34', '36', '38', '40', '42'],
    'Blazer': ['34', '36', '38', '40', '42', '44'],
    'Chaleco': ['34', '36', '38', '40', '42', '44'],
    'Calzado': ['38', '39', '40', '41', '42'],
    'Accesorio': ['Única']
};

// Formateador visual para la tabla (Pesos Colombianos sin decimales)
const copFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

// --- 1. INICIALIZACIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    // Cargar Usuario en Sidebar
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    subscribeInventory();
});

// --- 2. LÓGICA DE INTERFAZ (UI) ---

// A. Formateo de Moneda en Input (Mientras escribes)
window.formatCurrencyInput = (input) => {
    // Quitar todo lo que no sea número
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') {
        input.value = '';
        return;
    }
    // Formatear con puntos (Ej: 50.000)
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};

// B. Cambio de Clasificación (Material vs Producto)
classificationSelect.addEventListener('change', () => { 
    populateCategories(); 
    updateFormUI(); 
});

// C. Cambio de Categoría (Actualiza las tallas)
typeSelect.addEventListener('change', renderSizeInputs); 

// Previsualización de Imagen
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden');
            imageIcon.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
});

// Funciones Auxiliares UI
function populateCategories() {
    const type = classificationSelect.value;
    typeSelect.innerHTML = '';
    categories[type].forEach(cat => {
        typeSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
    // Si es producto, dibujar las tallas de la primera categoría por defecto
    if(type === 'producto') renderSizeInputs();
}

function updateFormUI() {
    const type = classificationSelect.value;
    if (type === 'producto') {
        simpleStockSection.classList.add('hidden');
        sizesStockSection.classList.remove('hidden');
        itemQty.removeAttribute('required');
        renderSizeInputs();
    } else {
        simpleStockSection.classList.remove('hidden');
        sizesStockSection.classList.add('hidden');
        itemQty.setAttribute('required', 'true');
    }
}

// Renderizar Inputs de Tallas Dinámicos
function renderSizeInputs() {
    const category = typeSelect.value;
    const sizes = sizeConfigs[category] || ['Única']; // Fallback
    
    sizesContainer.innerHTML = sizes.map(size => `
        <div>
            <label class="text-[10px] text-center block text-gray-400 mb-1">${size}</label>
            <input 
                type="number" 
                min="0" 
                data-size="${size}" 
                class="size-input input-soriano text-center px-1 text-sm h-8" 
                placeholder="0"
                oninput="if(this.value < 0) this.value = 0;"
            >
        </div>
    `).join('');

    // Agregar listeners para calcular total automáticamente
    document.querySelectorAll('.size-input').forEach(input => {
        input.addEventListener('input', () => {
             if(input.value < 0) input.value = 0; // Doble seguridad
             calculateTotalStock();
        });
    });
    calculateTotalStock();
}

function calculateTotalStock() {
    let total = 0;
    document.querySelectorAll('.size-input').forEach(i => total += parseFloat(i.value || 0));
    totalSizesDisplay.textContent = total;
}

// --- 3. LECTURA DE DATOS (TABLA) ---
function subscribeInventory() {
    const q = query(collection(db, "inventory"), orderBy("name"));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">El inventario está vacío.</td></tr>`;
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const isProduct = data.classification === 'producto';
            
            // Lógica de Stock Visual
            let stockHtml = '';
            
            if (isProduct && data.sizes) {
                // Mostrar chips de tallas con stock > 0
                const sizesHtml = Object.entries(data.sizes)
                    .filter(([_, qty]) => qty > 0)
                    .map(([size, qty]) => `<span class="text-[10px] bg-gray-800 border border-gray-600 px-1 rounded text-gray-300 mr-1 whitespace-nowrap">${size}:${qty}</span>`)
                    .join(' ');
                
                stockHtml = `
                    <div class="flex flex-wrap justify-end gap-1 mb-1">${sizesHtml || '<span class="text-red-500 text-xs">Sin Stock</span>'}</div>
                    <div class="text-[10px] text-gray-500">Total: <strong>${data.quantity}</strong> und</div>
                `;
            } else {
                // Materiales
                const totalQty = parseFloat(data.quantity || 0);
                const isLow = totalQty <= parseFloat(data.minStock || 0);
                stockHtml = `<div class="${isLow ? 'text-red-500 font-bold animate-pulse' : 'text-white'}">
                                ${totalQty} ${data.unit}
                             </div>`;
            }

            // Imagen Thumbnail
            const imgHtml = data.imageUrl 
                ? `<img src="${data.imageUrl}" class="w-10 h-10 rounded object-cover border border-gray-700 hover:scale-150 transition-transform cursor-pointer shadow-sm" onclick="window.open('${data.imageUrl}')">` 
                : `<div class="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-600 border border-gray-700"><i class="fas fa-box"></i></div>`;

            return `
                <tr class="hover:bg-gray-800/50 transition-colors border-b border-gray-800/50 group">
                    <td class="px-6 py-4">${imgHtml}</td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-white text-base">${data.name}</div>
                        <div class="text-xs text-gray-500 font-mono tracking-wide bg-gray-900 inline-block px-1 rounded mt-1 border border-gray-800">${data.sku}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded text-xs border border-gray-700 bg-gray-800 text-gray-300 capitalize">
                            ${data.type}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right">${stockHtml}</td>
                    <td class="px-6 py-4 text-right text-gray-300 font-mono">
                        ${copFormatter.format(data.cost)}
                    </td>
                    <td class="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <a href="inventory-detail.html?id=${doc.id}" 
                        class="text-blue-400 hover:text-blue-300 transition p-2 inline-block" title="Ver Estadísticas">
                        <i class="fas fa-chart-line"></i>
                        </a>
                        <button onclick="window.editItem('${doc.id}', '${encodeURIComponent(JSON.stringify(data))}')" 
                            class="text-soriano-gold hover:text-white transition p-2 bg-gray-800 rounded-full hover:bg-gray-700" title="Editar">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button onclick="window.deleteItem('${doc.id}', '${data.name}')" 
                            class="text-gray-600 hover:text-red-500 transition p-2 hover:bg-gray-800 rounded-full" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

// --- 4. GUARDAR (CREATE / UPDATE) ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // UI Feedback
    const originalBtn = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    saveBtn.disabled = true;

    try {
        const id = itemIdInput.value;
        const classification = classificationSelect.value;
        
        // 1. Generar SKU Automático si está vacío
        let finalSku = skuInput.value.trim().toUpperCase();
        if (!finalSku) {
            const prefix = nameInput.value.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'ITM';
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            finalSku = `${prefix}-${randomNum}`;
        }

        // 2. Limpiar el Costo (Quitar puntos visuales "50.000" -> 50000)
        const rawCost = costInput.value.replace(/\./g, '').replace(/,/g, '');
        const finalCost = parseInt(rawCost) || 0;

        // 3. Preparar Objeto Base
        let data = {
            classification: classification,
            name: nameInput.value,
            sku: finalSku,
            type: typeSelect.value,
            cost: finalCost,
            updatedAt: serverTimestamp()
        };

        // 4. Subir Imagen (Si se seleccionó una nueva)
        let imageUrl = currentImageUrl.value;
        if (imageInput.files[0]) {
            const file = imageInput.files[0];
            const storageRef = ref(storage, `inventory/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }
        data.imageUrl = imageUrl || null;

        // 5. Lógica Específica de Stock
        if (classification === 'producto') {
            const sizesObj = {};
            let total = 0;
            // Recolectar tallas
            document.querySelectorAll('.size-input').forEach(input => {
                const val = parseFloat(input.value || 0);
                if (val > 0) sizesObj[input.dataset.size] = val;
                total += val;
            });
            data.sizes = sizesObj;
            data.quantity = total; // Total global
            data.unit = 'und';
            data.minStock = 0; // No aplica estricto
        } else {
            // Materiales
            data.quantity = parseFloat(itemQty.value);
            data.unit = itemUnit.value;
            data.minStock = parseFloat(itemMin.value);
            data.sizes = null;
        }

        // 6. Guardar en Firestore
        if (id) {
            await updateDoc(doc(db, "inventory", id), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "inventory"), data);
        }
        
        closeModal();

    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar: " + error.message);
    } finally {
        saveBtn.innerHTML = originalBtn;
        saveBtn.disabled = false;
    }
});

// --- 5. MODALES Y UTILIDADES ---

window.openModal = () => {
    form.reset();
    itemIdInput.value = "";
    currentImageUrl.value = "";
    
    // Reset Imagen
    imagePreview.src = "";
    imagePreview.classList.add('hidden');
    imageIcon.classList.remove('hidden');
    
    // Defaults
    classificationSelect.value = "material";
    populateCategories();
    updateFormUI();
    
    modalTitle.textContent = "Nuevo Ítem";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.editItem = (id, dataString) => {
    const data = JSON.parse(decodeURIComponent(dataString));
    
    itemIdInput.value = id;
    nameInput.value = data.name;
    skuInput.value = data.sku;
    
    // Cargar costo formateado con puntos (Ej: 50.000)
    if (data.cost) {
        costInput.value = new Intl.NumberFormat('es-CO').format(data.cost);
    } else {
        costInput.value = "";
    }

    classificationSelect.value = data.classification || 'material';
    populateCategories(); // Llenar selects
    typeSelect.value = data.type; // Seleccionar categoría correcta
    updateFormUI(); // Mostrar inputs correctos

    // Cargar Imagen
    if (data.imageUrl) {
        currentImageUrl.value = data.imageUrl;
        imagePreview.src = data.imageUrl;
        imagePreview.classList.remove('hidden');
        imageIcon.classList.add('hidden');
    } else {
        currentImageUrl.value = "";
        imagePreview.classList.add('hidden');
        imageIcon.classList.remove('hidden');
    }

    // Cargar Stock
    if (data.classification === 'producto') {
        renderSizeInputs(); // Dibujar cajitas de la categoría
        if (data.sizes) {
            // Llenar cajitas
            document.querySelectorAll('.size-input').forEach(input => {
                input.value = data.sizes[input.dataset.size] || '';
            });
        }
        calculateTotalStock();
    } else {
        itemQty.value = data.quantity;
        itemUnit.value = data.unit;
        itemMin.value = data.minStock;
    }

    modalTitle.textContent = "Editar Ítem";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeModal = () => { 
    modal.classList.add('hidden'); 
    modal.classList.remove('flex'); 
};

window.deleteItem = async (id, name) => { 
    if(confirm(`¿Estás seguro de eliminar "${name}" del inventario?`)) {
        await deleteDoc(doc(db, "inventory", id)); 
    }
};