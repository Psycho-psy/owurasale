console.log("app.js loaded (All features fully integrated and functional)");

// =========================
// Owura-Ent POS - app.js (FULL FEATURE IMPLEMENTATION)
// =========================

// ⭐️ START: FIREBASE CONFIGURATION & INITIALIZATION ⭐️
// **🚨 ACTION REQUIRED: REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL FIREBASE CONFIGURATION KEYS 🚨**
const firebaseConfig = {
     apiKey: "AIzaSyCOW4jlQlQKZsshbrtrePAwRw6oTI5Orc4", // YOUR KEY
    authDomain: "owurapossystem.firebaseapp.com",
    databaseURL: "https://owurapossystem-default-rtdb.firebaseio.com",
    projectId: "owurapossystem",
    storageBucket: "owurapossystem.firebasestorage.app",
    messagingSenderId: "198112930058",
    appId: "1:198112930058:web:529894408d4272f2ecf2f3"
};

// Initialize Firebase
let dbRef = null;
try {
  if (typeof firebase !== 'undefined') {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    dbRef = firebase.database().ref(); 
    console.log("Firebase initialized successfully.");
  } else {
    console.error("Firebase SDK not found. Check index.html script tags.");
  }
} catch (e) {
  console.error("Firebase initialization failed. Check your config and script tags.", e);
}
// ⭐️ END: FIREBASE CONFIGURATION & INITIALIZATION ⭐️


// ===== Global State (Local Cache) =====
let currentUser = null;
let cart = []; // The cart for the current transaction
let database = {
  products: [],
  sales: [],
  debtors: [],
  payments: [],
  admins: [
    { username: "admin", password: "admin123", role: "Super Admin", date: new Date().toISOString() } 
  ]
};
let salesChart = null; // For the dashboard chart
let currentEditingSku = null; // Used for product modal
let currentEditingDebtorId = null; // NEW: Used for debtor modal

// ===================================
// ===== DATABASE & PERSISTENCE =====
// ===================================

/**
 * Robust cloud loader using a real-time listener.
 */
function loadDatabaseFromCloud() {
    if (!dbRef) return;
    
    dbRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // Use fallback to empty array if data doesn't exist or is not an array
            database.products = Array.isArray(data.products) ? data.products : [];
            database.sales = Array.isArray(data.sales) ? data.sales : [];
            database.debtors = Array.isArray(data.debtors) ? data.debtors : [];
            database.payments = Array.isArray(data.payments) ? data.payments : [];
            
            // Handle admins separately to ensure default admin exists
            if(Array.isArray(data.admins) && data.admins.length > 0) {
                 database.admins = data.admins;
            } else {
                 // If admins array is missing/empty, restore default admin and save
                 dbRef.child('admins').set(database.admins); 
            }

            updateDebtorStatus();
            renderAll();
        } else {
            console.log("No data found in Firebase. Initializing default structure.");
            dbRef.set(database); 
            renderAll();
        }
    }, (errorObject) => {
        console.error("Firebase Read Failed:", errorObject.code);
        alert("CRITICAL ERROR: Failed to load data from cloud. Check your connection.");
    });
}

/**
 * Saves the entire local 'database' state to the cloud.
 */
function saveDatabaseToCloud() {
  if (!dbRef) return;
  dbRef.set(database)
    .catch((error) => {
      console.error("Data save failed:", error);
      alert("CRITICAL: Failed to save data to cloud. Check your connection.");
    });
}

/**
 * Clears all dynamic POS data from the cloud.
 */
function clearPOSData() { 
    if (!confirm("This will clear ALL Products, Sales, Debtors, and Payments data from the cloud. Continue?")) return;

    if (dbRef) {
        Promise.all([
            dbRef.child('products').remove(),
            dbRef.child('sales').remove(),
            dbRef.child('debtors').remove(),
            dbRef.child('payments').remove()
        ]).then(() => {
            alert("All cloud data cleared (Admins preserved). The UI will refresh shortly.");
        }).catch(e => {
            console.error("Clear failed:", e);
            alert("Error clearing data on Firebase.");
        });
    }
}


// ===================================
// ===== AUTH & NAVIGATION =====
// ===================================

function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  const valid = database.admins.some(admin => 
    admin.username === username && admin.password === password
  );

  if (!valid) {
    alert("Invalid login credentials. Try admin / admin123");
    return;
  }
  
  currentUser = username; 

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");

  document.getElementById("currentUser").textContent = username;

  showSection('pos'); 
}


function logout() {
  if (!confirm("Are you sure you want to log out?")) return;
  currentUser = null;
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

function showSection(id, e) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  if (e && e.target) {
    e.target.classList.add("active");
  } else {
    const targetBtn = document.querySelector(`.nav-btn[onclick*="${id}"]`);
    if (targetBtn) targetBtn.classList.add("active");
  }

  // Clear POS fields when switching sections
  if (id !== 'pos') {
    document.getElementById("productSearch").value = '';
    document.getElementById("quantity").value = 1;
  }
  
  renderAll();
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
  if (el) el.style.display = "flex"; 
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
  if (el) el.style.display = "none";
}

function showAddAdminModal() {
    const username = prompt("New admin username:");
    if (!username) return;
    const password = prompt("New admin password:");
    if (!password) return;
    const role = prompt("Role (e.g., Manager, Cashier):") || "Staff";

    if (database.admins.some(a => a.username === username)) {
        alert("Username already exists.");
        return;
    }
    database.admins.push({ username, password, role, date: new Date().toLocaleString() });
    saveDatabaseToCloud(); 
    alert(`Admin ${username} added successfully.`);
}


// ===================================
// ===== POS FUNCTIONS (FULLY IMPLEMENTED) =====
// ===================================

/**
 * Filters the product dropdown based on search input.
 */
function filterProductDropdown() {
    const search = document.getElementById("productSearch").value.toLowerCase();
    const select = document.getElementById("productSelect");
    
    // Clear existing options except the first placeholder
    select.innerHTML = '<option value="">-- Select Product --</option>';

    const filteredProducts = database.products.filter(p => 
        p.name.toLowerCase().includes(search) && p.stock > 0
    );

    filteredProducts.forEach(p => {
        const option = document.createElement('option');
        option.value = p.sku;
        option.textContent = `${p.name} (GH₵ ${p.sellingPrice.toFixed(2)} - Stock: ${p.stock})`;
        select.appendChild(option);
    });
    
    updateProductInfo();
}

/**
 * Updates price and stock fields when a product is selected.
 */
function updateProductInfo() {
    const sku = document.getElementById("productSelect").value;
    const product = database.products.find(p => p.sku === sku);
    
    document.getElementById("unitPrice").value = product ? product.sellingPrice.toFixed(2) : '';
    document.getElementById("quantity").max = product ? product.stock : 1;
    document.getElementById("quantity").value = 1; 
}


/**
 * Updates the Cart display and total.
 */
function updateCartDisplay() {
    const cartItemsEl = document.getElementById('cartItems');
    const cartTotalEl = document.getElementById('cartTotal');
    
    cartItemsEl.innerHTML = '';
    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.sellingPrice * item.quantity;
        total += itemTotal;
        
        const cartItemEl = document.createElement('div');
        cartItemEl.className = 'cart-item';
        cartItemEl.innerHTML = `
            <span>${item.name} x${item.quantity}</span>
            <span>GH₵ ${itemTotal.toFixed(2)}</span>
            <button class="btn-sm btn-danger" onclick="removeFromCart(${index})">X</button>
        `;
        cartItemsEl.appendChild(cartItemEl);
    });

    cartTotalEl.textContent = total.toFixed(2);
    
    // Update cash amount placeholder if payment is cash
    updateCheckoutFields(); 
}


/**
 * Removes an item from the cart by index.
 */
function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartDisplay();
}

/**
 * Adds the selected product to the cart.
 */
function addToCart() {
    const sku = document.getElementById("productSelect").value;
    const quantity = parseInt(document.getElementById("quantity").value);

    if (!sku || isNaN(quantity) || quantity <= 0) {
        alert("Please select a product and enter a valid quantity.");
        return;
    }
    
    const product = database.products.find(p => p.sku === sku);
    if (!product) return;

    if (quantity > product.stock) {
        alert(`Insufficient stock. Only ${product.stock} available.`);
        return;
    }
    
    // Check if item is already in cart, if so, update quantity
    const existingItem = cart.find(item => item.sku === sku);
    if (existingItem) {
        if (existingItem.quantity + quantity > product.stock) {
            alert(`Adding this quantity would exceed stock of ${product.stock}.`);
            return;
        }
        existingItem.quantity += quantity;
    } else {
        cart.push({ ...product, quantity: quantity });
    }
    
    // Reset inputs
    document.getElementById("productSelect").value = '';
    document.getElementById("productSearch").value = '';
    document.getElementById("unitPrice").value = '';
    document.getElementById("quantity").value = 1;
    
    filterProductDropdown(); // Re-render dropdown
    updateCartDisplay();
}

/**
 * Clears the cart array and updates the display.
 */
function clearCart() {
    cart = [];
    updateCartDisplay();
}

/**
 * Shows/hides payment-specific fields (Cash/Credit).
 */
function updateCheckoutFields() {
    const paymentType = document.getElementById("paymentType").value;
    const cashGroup = document.getElementById("cashAmountGroup");
    const dueGroup = document.getElementById("dueDateGroup");
    const total = cart.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
    
    cashGroup.style.display = (paymentType === 'cash') ? 'block' : 'none';
    dueGroup.style.display = (paymentType === 'credit') ? 'block' : 'none';

    if (paymentType === 'cash') {
        const cashAmountInput = document.getElementById("cashAmount");
        cashAmountInput.placeholder = total.toFixed(2);
    }
}


/**
 * Handles the core transaction logic (Sales, Inventory, Debtors).
 */
function processCheckout() {
    if (cart.length === 0) {
        alert("Cart is empty. Please add items.");
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
    const paymentType = document.getElementById("paymentType").value;
    const customerName = document.getElementById("customerName").value.trim() || 'Walk-in Customer';
    const customerPhone = document.getElementById("customerPhone").value.trim();
    const dueDate = document.getElementById("dueDateInput").value;
    
    let amountReceived = 0;
    let change = 0;
    let status = "Completed";
    let isDebt = false;

    if (paymentType === 'credit') {
        isDebt = true;
        status = "Credit";
        amountReceived = 0;
        if (!customerName || !customerPhone) {
            alert("Customer Name and Phone are required for credit transactions.");
            return;
        }
    } else if (paymentType === 'cash') {
        const cashInput = document.getElementById("cashAmount");
        amountReceived = parseFloat(cashInput.value) || total; 
        if (amountReceived < total) {
            alert("Cash received is less than total amount. Please enter a valid amount or use 'Credit'.");
            return;
        }
        change = amountReceived - total;
    }
    
    // 1. Create Sale Record
    const receiptId = 'S' + (database.sales.length + 1).toString().padStart(5, '0');
    const now = new Date();
    const profit = cart.reduce((sum, item) => sum + ((item.sellingPrice - item.costPrice) * item.quantity), 0);
    
    const newSale = {
        id: receiptId,
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString(),
        customerName,
        customerPhone,
        items: cart,
        totalAmount: total,
        totalCost: total - profit,
        totalProfit: profit,
        paymentType,
        status: status,
        amountReceived: amountReceived,
        change: change,
        dueDate: isDebt ? (dueDate || 'N/A') : 'N/A',
        soldBy: currentUser
    };

    database.sales.push(newSale);

    // 2. Update Inventory (Deduct stock)
    cart.forEach(cartItem => {
        const product = database.products.find(p => p.sku === cartItem.sku);
        if (product) {
            product.stock -= cartItem.quantity;
        }
    });

    // 3. Handle Debtors
    if (isDebt) {
        const debtId = 'D' + (database.debtors.length + 1).toString().padStart(4, '0');
        database.debtors.push({
            id: debtId,
            customerName: customerName,
            phone: customerPhone,
            originalAmount: total,
            amount: total, 
            originalDate: now.toISOString().split('T')[0],
            dueDate: dueDate || 'N/A',
            status: "Pending",
            payments: [],
            dateAdded: now.toLocaleString(),
            sourceSaleId: receiptId
        });
        alert(`Sale successful. Total debt of GH₵ ${total.toFixed(2)} recorded for ${customerName}. Due Date: ${dueDate || 'N/A'}`);
    } else {
        if (change > 0) {
            alert(`Sale successful. Total: GH₵ ${total.toFixed(2)}. Amount received: GH₵ ${amountReceived.toFixed(2)}. Change: GH₵ ${change.toFixed(2)}.`);
        } else {
             alert(`Sale successful. Total: GH₵ ${total.toFixed(2)}. Payment received.`);
        }
    }
    
    // 4. Reset POS
    clearCart();
    document.getElementById("customerName").value = '';
    document.getElementById("customerPhone").value = '';
    document.getElementById("paymentType").value = 'cash';
    document.getElementById("cashAmount").value = '';
    document.getElementById("dueDateInput").value = '';
    updateCheckoutFields();
    
    // 5. Save and Re-render
    saveDatabaseToCloud(); 
}


// ===================================
// ===== INVENTORY FUNCTIONS (FULLY IMPLEMENTED) =====
// ===================================

function showAddProductModal(sku = null) {
    currentEditingSku = sku;
    document.getElementById('productModalTitle').textContent = sku ? 'Edit Product' : 'Add New Product';
    
    const saveButton = document.querySelector('#productModal .btn-primary');
    saveButton.textContent = sku ? 'Save Changes' : 'Add Product';
    
    if (sku) {
        const product = database.products.find(p => p.sku === sku);
        if (product) {
            document.getElementById('productName').value = product.name;
            document.getElementById('productCategory').value = product.category;
            document.getElementById('sellingPrice').value = product.sellingPrice;
            document.getElementById('costPrice').value = product.costPrice;
            document.getElementById('stockQuantity').value = product.stock;
            document.getElementById('stockLimit').value = product.lowLimit;
        }
    } else {
        document.getElementById('productName').value = '';
        document.getElementById('productCategory').value = '';
        document.getElementById('sellingPrice').value = '';
        document.getElementById('costPrice').value = '';
        document.getElementById('stockQuantity').value = '';
        document.getElementById('stockLimit').value = '';
    }
    
    openModal('productModal');
}

function saveProduct() {
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value.trim();
    const sellingPrice = parseFloat(document.getElementById('sellingPrice').value);
    const costPrice = parseFloat(document.getElementById('costPrice').value);
    const stock = parseInt(document.getElementById('stockQuantity').value);
    const lowLimit = parseInt(document.getElementById('stockLimit').value) || 10;
    
    if (!name || isNaN(sellingPrice) || isNaN(costPrice) || isNaN(stock) || sellingPrice <= 0 || costPrice <= 0 || stock < 0) {
        alert("Please fill all fields with valid data.");
        return;
    }

    if (currentEditingSku) {
        const product = database.products.find(p => p.sku === currentEditingSku);
        if (product) {
            product.name = name;
            product.category = category;
            product.sellingPrice = sellingPrice;
            product.costPrice = costPrice;
            product.stock = stock;
            product.lowLimit = lowLimit;
        }
    } else {
        const newSku = 'P' + (database.products.length + 1).toString().padStart(4, '0');
        database.products.push({
            sku: newSku,
            name,
            category,
            sellingPrice,
            costPrice,
            stock,
            lowLimit,
            dateAdded: new Date().toLocaleString()
        });
    }

    closeModal('productModal');
    saveDatabaseToCloud();
    currentEditingSku = null;
}

function editProduct(sku) {
    showAddProductModal(sku);
}

function deleteProduct(sku) {
    if (!confirm(`Are you sure you want to delete product SKU: ${sku}? This action is irreversible.`)) return;

    const initialLength = database.products.length;
    database.products = database.products.filter(p => p.sku !== sku);

    if (database.products.length < initialLength) {
        saveDatabaseToCloud();
    }
}


/**
 * Renders the inventory table based on search and current stock.
 */
function renderInventory() {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const search = document.getElementById("inventorySearch")?.value.toLowerCase().trim() || '';
    
    const filteredProducts = database.products.filter(p => 
        p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search)
    ).sort((a, b) => a.name.localeCompare(b.name));

    filteredProducts.forEach(p => {
        let status = '';
        let statusClass = '';
        if (p.stock <= 0) {
            status = 'Out of Stock';
            statusClass = 'badge-overdue'; 
        } else if (p.stock <= p.lowLimit) {
            status = 'Low Stock';
            statusClass = 'badge-warning'; 
        } else {
            status = 'In Stock';
            statusClass = 'badge-success';
        }
        
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${p.sku}</td>
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td>GH₵ ${p.sellingPrice.toFixed(2)}</td>
            <td>GH₵ ${p.costPrice.toFixed(2)}</td>
            <td><span class="badge ${statusClass}">${p.stock}</span></td>
            <td>${p.lowLimit}</td>
            <td>
                <div class="action-btns">
                    <button class="btn btn-secondary btn-sm" onclick="editProduct('${p.sku}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.sku}')">Delete</button>
                </div>
            </td>
        `;
    });
}

function filterInventory() {
    renderInventory();
}

// ===================================
// ===== DEBTORS FUNCTIONS (FULLY IMPLEMENTED) =====
// ===================================

// Renamed for dual purpose (Add or Edit)
function showDebtorModal(id = null) {
    currentEditingDebtorId = id;

    const modalTitle = document.getElementById('debtorModalTitle');
    const saveButton = document.querySelector('#addDebtorModal .btn-primary');
    const debtor = id ? database.debtors.find(d => d.id === id) : null;

    // Set Title and Button Text
    modalTitle.textContent = id ? 'Edit Debtor Record' : 'Add Existing Debt';
    saveButton.textContent = id ? 'Save Changes' : 'Add Debtor';

    // Get Input Fields
    const nameInput = document.getElementById('debtorCustomerName');
    const phoneInput = document.getElementById('debtorPhone');
    const amountInput = document.getElementById('debtorAmount');
    const originalDateInput = document.getElementById('debtorOriginalDate');
    const dueDateInput = document.getElementById('debtorDueDate');

    if (debtor) {
        // Populate fields for editing
        nameInput.value = debtor.customerName || '';
        phoneInput.value = debtor.phone || '';
        // originalAmount is the starting point, not the current amount owed
        amountInput.value = debtor.originalAmount || 0; 
        originalDateInput.value = debtor.originalDate || '';
        dueDateInput.value = debtor.dueDate && debtor.dueDate !== 'N/A' ? debtor.dueDate : '';
        
        // Prevent changing initial values during edit for accounting integrity
        amountInput.readOnly = true;
        originalDateInput.readOnly = true;
    } else {
        // Clear fields for new debt
        nameInput.value = '';
        phoneInput.value = '';
        amountInput.value = '';
        originalDateInput.value = new Date().toISOString().split('T')[0];
        dueDateInput.value = '';
        
        // Make fields writable for new debt
        amountInput.readOnly = false;
        originalDateInput.readOnly = false;
    }

    openModal('addDebtorModal');
}

// Function called by the table button
function editDebtor(id) {
    showDebtorModal(id);
}

function updateDebtorStatus() {
    const today = new Date().toISOString().split('T')[0]; 
    let changed = false;
    
    database.debtors.forEach(d => {
        if ((d.status === 'Pending' || d.status === 'Partially Paid') && d.dueDate) {
            if (d.dueDate < today) {
                d.status = 'Overdue';
                changed = true;
            }
        }
    });
    
    if (changed) {
        saveDatabaseToCloud();
    }
}


function renderDebtors() {
    const tableBody = document.getElementById('debtorsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const searchTerm = document.getElementById('debtorSearchInput')?.value.toLowerCase().trim() || '';

    let totalActiveDebtors = 0;
    let totalOutstandingDebt = 0;

    const filteredDebtors = database.debtors.filter(debtor => {
        
        if (debtor.amount > 0) {
            totalActiveDebtors++;
            totalOutstandingDebt += debtor.amount;
        }
        
        const name = debtor.customerName ? debtor.customerName.toLowerCase() : '';
        const phone = debtor.phone ? debtor.phone.toLowerCase() : '';
        
        // Only show paid debtors if search term is active
        if (debtor.amount <= 0 && !searchTerm) return false;
        
        return name.includes(searchTerm) || phone.includes(searchTerm);
    });
    
    const totalDebtorsEl = document.getElementById('totalDebtors');
    if(totalDebtorsEl) totalDebtorsEl.textContent = totalActiveDebtors;
    
    const totalDebtEl = document.getElementById('totalDebt');
    if(totalDebtEl) totalDebtEl.textContent = totalOutstandingDebt.toFixed(2);
    
    filteredDebtors.forEach(d => {
        let statusClass = 'badge-pending';
        if (d.status === 'Paid') {
            statusClass = 'badge-success';
        } else if (d.status === 'Overdue') {
            statusClass = 'badge-overdue';
        } else if (d.status === 'Partially Paid') {
             statusClass = 'badge-warning'; 
        }

        const row = tableBody.insertRow();
        
        row.innerHTML = `
            <td>${d.customerName || 'N/A'}</td>
            <td>${d.phone || 'N/A'}</td>
            <td>GH₵ ${d.originalAmount ? d.originalAmount.toFixed(2) : '0.00'}</td>
            <td>GH₵ ${d.amount.toFixed(2)}</td>
            <td>${d.originalDate || 'N/A'}</td>
            <td>${d.dueDate || 'N/A'}</td>
            <td><span class="badge ${statusClass}">${d.status}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn btn-secondary btn-sm" onclick="editDebtor('${d.id}')">Edit</button>
                    <button class="btn btn-success btn-sm" ${d.amount > 0 ? `onclick="recordFullPayment('${d.id}')"` : 'disabled'}>Mark Full Paid</button>
                    <button class="btn btn-warning btn-sm" ${d.amount > 0 ? `onclick="partPaymentPrompt('${d.id}')"` : 'disabled'}>Part Payment</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDebtor('${d.id}')">Delete Record</button>
                </div>
            </td>
        `;
    });

    if (filteredDebtors.length === 0 && searchTerm) {
        const row = tableBody.insertRow();
        row.innerHTML = `<td colspan="8" style="text-align: center; color: #999; padding: 20px;">No debtors match your search criteria.</td>`;
    } else if (totalActiveDebtors === 0 && !searchTerm) {
         const row = tableBody.insertRow();
        row.innerHTML = `<td colspan="8" style="text-align: center; color: #999; padding: 20px;">No outstanding debts recorded.</td>`;
    }
}


// Renamed and updated saveDebtorManually() to saveDebtor() to handle both Add and Edit
function saveDebtor() {
  const name = document.getElementById("debtorCustomerName").value.trim();
  const phone = document.getElementById("debtorPhone").value.trim();
  const amount = parseFloat(document.getElementById("debtorAmount").value);
  const originalDate = document.getElementById("debtorOriginalDate").value;
  const dueDate = document.getElementById("debtorDueDate").value;

  if (!name || isNaN(amount) || amount <= 0 || !originalDate) {
    alert("Please fill in Customer Name, Amount, and Original Date with valid data.");
    return;
  }
  
  if (currentEditingDebtorId) {
    // EDIT EXISTING DEBTOR
    const debtor = database.debtors.find(d => d.id === currentEditingDebtorId);
    if (debtor) {
        // Only update editable fields: Name, Phone, and Due Date
        debtor.customerName = name;
        debtor.phone = phone;
        debtor.dueDate = dueDate || 'N/A';
        alert(`Debtor record for ${name} updated successfully.`);
    }
  } else {
    // ADD NEW DEBTOR
    const newId = 'D' + (database.debtors.length + 1).toString().padStart(4, '0');

    database.debtors.push({
      id: newId,
      customerName: name,
      phone: phone,
      originalAmount: amount,
      amount: amount, 
      originalDate: originalDate,
      dueDate: dueDate || 'N/A',
      status: "Pending",
      payments: [],
      dateAdded: new Date().toLocaleString()
    });
    alert(`New debtor record for ${name} added successfully.`);
  }

  closeModal('addDebtorModal');
  currentEditingDebtorId = null; // Reset state
  saveDatabaseToCloud();
}

function recordFullPayment(id) {
  if (!confirm("Confirm full payment received?")) return;

  const debtor = database.debtors.find(d => d.id === id);
  if (!debtor || debtor.amount <= 0) return;

  debtor.payments = debtor.payments || [];
  debtor.payments.push({
    amount: debtor.amount,
    date: new Date().toLocaleString(),
    type: "Full Payment"
  });

  debtor.status = "Paid";
  debtor.amount = 0;

  saveDatabaseToCloud();
}


function partPaymentPrompt(id) {
  const debtor = database.debtors.find(d => d.id === id);
  if (!debtor || debtor.amount <= 0) return;

  const payment = parseFloat(prompt(`Enter part payment for ${debtor.customerName} (Amount owed: GH₵ ${debtor.amount.toFixed(2)})`));
  if (isNaN(payment) || payment <= 0) {
    alert("Invalid payment amount.");
    return;
  }
  if (payment > debtor.amount) {
    alert("Payment exceeds the outstanding amount.");
    return;
  }

  debtor.payments = debtor.payments || [];
  debtor.payments.push({
    amount: payment,
    date: new Date().toLocaleString(),
    type: "Part Payment"
  });

  if (payment >= debtor.amount) {
    debtor.amount = 0;
    debtor.status = "Paid";
  } else {
    debtor.amount -= payment;
    debtor.status = "Partially Paid";
  }

  saveDatabaseToCloud();
}

function deleteDebtor(id) {
    if (!confirm(`Are you sure you want to delete the debtor record ID: ${id}? This action cannot be undone.`)) return;

    const initialLength = database.debtors.length;
    database.debtors = database.debtors.filter(d => d.id !== id);

    if (database.debtors.length < initialLength) {
        saveDatabaseToCloud();
        alert(`Debtor ID: ${id} deleted.`);
    }
}


// ===================================
// ===== SALES & REPORTS FUNCTIONS (FULLY IMPLEMENTED) =====
// ===================================

/**
 * Renders the Sales History table.
 */
function renderSales() {
    const tableBody = document.getElementById('salesTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    database.sales.slice().reverse().forEach(s => {
        let statusClass = 'badge-success'; 
        if (s.status === 'Credit') statusClass = 'badge-pending';
        
        const row = tableBody.insertRow();
        
        const itemSummary = s.items.map(i => `${i.name} x${i.quantity}`).join(', ');

        row.innerHTML = `
            <td>${s.id}</td>
            <td>${s.date} ${s.time}</td>
            <td>${s.customerName || 'N/A'}</td>
            <td>${itemSummary}</td>
            <td>GH₵ ${s.totalAmount.toFixed(2)}</td>
            <td>${s.paymentType}</td>
            <td><span class="badge ${statusClass}">${s.status}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="viewSaleDetails('${s.id}')">View</button></td>
        `;
    });
}

function viewSaleDetails(id) {
    const sale = database.sales.find(s => s.id === id);
    if (!sale) return;

    let details = `Receipt #: ${sale.id}\n`;
    details += `Date: ${sale.date} ${sale.time}\n`;
    details += `Customer: ${sale.customerName}\n`;
    details += `------------------------\n`;
    sale.items.forEach(item => {
        details += `${item.name} x ${item.quantity} @ GH₵ ${item.sellingPrice.toFixed(2)} = GH₵ ${(item.sellingPrice * item.quantity).toFixed(2)}\n`;
    });
    details += `------------------------\n`;
    details += `TOTAL: GH₵ ${sale.totalAmount.toFixed(2)}\n`;
    details += `Payment: ${sale.paymentType}\n`;
    if (sale.change > 0) {
        details += `Change: GH₵ ${sale.change.toFixed(2)}\n`;
    }
    if (sale.status === 'Credit') {
        details += `Due Date: ${sale.dueDate}\n`;
    }
    details += `Profit: GH₵ ${sale.totalProfit.toFixed(2)}`;

    alert(details);
}

/**
 * Updates the summary count cards on the Reports section.
 */
function renderCounts() {
    // 1. Calculate General Stats
    const totalRevenue = database.sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalProfit = database.sales.reduce((sum, s) => sum + s.totalProfit, 0);
    
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const todaySales = database.sales
        .filter(s => s.date === today)
        .reduce((sum, s) => sum + s.totalAmount, 0);

    const monthSales = database.sales
        .filter(s => s.date >= monthStart)
        .reduce((sum, s) => sum + s.totalAmount, 0);

    // 2. Update Summary Cards
    document.getElementById('todaySales').textContent = todaySales.toFixed(2);
    document.getElementById('monthSales').textContent = monthSales.toFixed(2);
    document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(2);
    document.getElementById('totalProfit').textContent = totalProfit.toFixed(2);

    // 3. Update DB Status
    document.getElementById('dbProductCount').textContent = database.products.length;
    document.getElementById('dbSaleCount').textContent = database.sales.length;
    document.getElementById('dbDebtorCount').textContent = database.debtors.length;
    document.getElementById('dbAdminCount').textContent = database.admins.length; 
    
    // 4. Update Profit Breakdown Table
    const profitTableBody = document.getElementById('profitTableBody');
    if (profitTableBody) {
        profitTableBody.innerHTML = '';
        const productStats = {};
        
        database.sales.forEach(s => {
            s.items.forEach(item => {
                const sku = item.sku;
                if (!productStats[sku]) {
                    productStats[sku] = { name: item.name, units: 0, revenue: 0, cost: 0, profit: 0 };
                }
                productStats[sku].units += item.quantity;
                // Use the cost/price from the original sale item for accurate historical profit calculation
                productStats[sku].revenue += item.sellingPrice * item.quantity;
                productStats[sku].cost += item.costPrice * item.quantity;
                productStats[sku].profit += (item.sellingPrice - item.costPrice) * item.quantity;
            });
        });

        Object.values(productStats).forEach(stats => {
             const row = profitTableBody.insertRow();
             row.innerHTML = `
                <td>${stats.name}</td>
                <td>${stats.units}</td>
                <td>GH₵ ${stats.revenue.toFixed(2)}</td>
                <td>GH₵ ${stats.cost.toFixed(2)}</td>
                <td>GH₵ ${stats.profit.toFixed(2)}</td>
             `;
        });
    }
}


/**
 * Renders the Chart.js daily sales chart.
 */
function renderSalesChart() {
    const canvas = document.getElementById('dailySalesChart');
    if (!canvas) {
        renderCounts();
        return; // Exit if not on the reports section
    }
    
    // Helper to get dates for the last 7 days
    const dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push({
            date: d.toISOString().split('T')[0],
            label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        });
    }

    // Aggregate sales data by date
    const salesData = {};
    database.sales.forEach(s => {
        if (!salesData[s.date]) salesData[s.date] = 0;
        salesData[s.date] += s.totalAmount;
    });

    // Prepare chart data
    const chartData = dates.map(d => salesData[d.date] || 0);
    const chartLabels = dates.map(d => d.label);
    
    // Destroy previous chart instance if it exists
    if (salesChart) {
        salesChart.destroy();
    }
    
    salesChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Daily Revenue (GH₵)',
                data: chartData,
                borderColor: '#008080',
                backgroundColor: 'rgba(0, 128, 128, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
    
    renderCounts(); // Ensure the summary cards are also updated on this tab
}

// ===================================
// ===== CENTRAL RENDERING (CRITICAL) =====
// ===================================

/**
 * Renders the content of the currently active section.
 */
function renderAll() {
  renderCounts();
  filterProductDropdown(); 
  updateCartDisplay(); 

  const activeSectionId = document.querySelector('.section.active')?.id; 

  if (activeSectionId === 'inventory') renderInventory();
  if (activeSectionId === 'debtors') renderDebtors(); 
  if (activeSectionId === 'sales') renderSales();
  if (activeSectionId === 'reports') renderSalesChart();
}


// ===================================
// ===== INITIALIZATION (CRITICAL) =====
// ===================================

document.addEventListener("DOMContentLoaded", () => {
    loadDatabaseFromCloud(); 
});
