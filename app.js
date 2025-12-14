console.log("app.js loaded");

// =========================
// Owura-Ent POS - app.js (CLOUD-ENABLED)
// =========================

// ⭐️ START: FIREBASE CONFIGURATION & INITIALIZATION ⭐️
// **🚨 ACTION REQUIRED: REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL FIREBASE CONFIGURATION KEYS 🚨**
const firebaseConfig = {
     apiKey: "AIzaSyCOW4jlQlQKZsshbrtrePAwRw6oTI5Orc4",
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
  // Check if Firebase is already initialized
  if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
  // Reference to the root of the database
  dbRef = firebase.database().ref(); 
  console.log("Firebase initialized successfully.");
} catch (e) {
  console.error("Firebase initialization failed. Check your config and script tags.", e);
}
// ⭐️ END: FIREBASE CONFIGURATION & INITIALIZATION ⭐️


// ===== Global State (will be populated from cloud) =====
let currentUser = null;
let cart = [];
// Database object starts empty and gets populated by the Firebase listener
let database = {
  products: [],
  sales: [],
  debtors: [],
  payments: [],
  admins: [] 
};


// ⭐️ Helper function to generate SKU based on category
function generateSKU(category) {
  const prefix = category.slice(0, 3).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${random}`;
}

// ===== CLOUD SAVE/LOAD FUNCTIONS =====

// Replaces the old saveDatabase()
function saveDatabaseToCloud() {
  if (dbRef) {
    dbRef.set(database)
      .then(() => console.log("Database saved to Firebase successfully."))
      .catch(error => console.error("Firebase Save Error:", error));
  }
}

// Replaces the old loadDatabase() and handles all rendering upon data update
function loadAndListenToDatabase() {
  if (dbRef) {
    // Listen for changes at the root of the database (real-time update)
    dbRef.on('value', (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        console.log("Database updated from Firebase.");
        
        // Update local database object
        database = {
          products: Array.isArray(data.products) ? data.products : [],
          sales: Array.isArray(data.sales) ? data.sales : [],
          debtors: Array.isArray(data.debtors) ? data.debtors : [],
          payments: Array.isArray(data.payments) ? data.payments : [],
          admins: Array.isArray(data.admins) ? data.admins : [
            // Ensure a default admin exists if the node is empty
            { username: "admin", password: "admin123", role: "Super Admin", date: new Date().toLocaleString() }
          ]
        };
        
        // Data Migration: Ensure old debtors have 'receipt' and 'dueDate' fields
        database.debtors = database.debtors.map(d => {
          if (!d.receipt) d.receipt = Date.now() + Math.random(); 
          if (!d.dueDate) d.dueDate = getFutureDate(7); 
          if (d.initialAmount === undefined) d.initialAmount = d.amount;
          return d;
        });
        
      } else {
        // Database is empty (first run or cleared), set initial structure
        database = {
          products: [], sales: [], debtors: [], payments: [], 
          admins: [
            { username: "admin", password: "admin123", role: "Super Admin", date: new Date().toLocaleString() }
          ]
        };
        // This initial structure is saved back to the cloud immediately
        saveDatabaseToCloud(); 
        return; // Exit here as the save will trigger another 'value' event
      }
      
      // --- Re-render the application UI with new data ---
      // This runs every time data changes on Firebase.
      renderInventory();
      renderSales();
      renderDebtors();
      renderReports();
      updateDatabaseStats();
      updateProductDropdown();
      
    }, (errorObject) => {
      console.error("Firebase Read Error:", errorObject.code);
    });
  }
}

// ===== Bootstrapping / Initialization =====
document.addEventListener("DOMContentLoaded", () => {
  // Start listening to Firebase for data changes
  loadAndListenToDatabase();
  
  // Initial setup for POS payment
  const paymentTypeEl = document.getElementById("paymentType");
  if(paymentTypeEl) paymentTypeEl.addEventListener("change", toggleDateAndCashFields);
  toggleDateAndCashFields(); 
});


// ===== Login / Logout =====
function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  // Search local 'database.admins' which is kept updated by the Firebase listener
  const admin = database.admins.find(a => a.username === username && a.password === password);
  if (!admin) {
    alert("Invalid credentials. Try admin / admin123");
    return;
  }

  currentUser = username;
  document.getElementById("currentUser").innerText = `👤 ${username}`;
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");
  
  // No need to call render functions here, as the Firebase listener will
  // execute the render functions automatically upon initial data load.
}

function logout() {
  currentUser = null;
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

// ===== Navigation (Unchanged) =====
function showSection(id, ev) {
  document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  if (ev && ev.target) {
    ev.target.classList.add("active");
  }

  // Rerender reports/inventory/sales when entering the section
  if(id === 'inventory') renderInventory();
  if(id === 'sales') renderSales();
  if(id === 'debtors') renderDebtors();
  if(id === 'reports') renderReports();
}

// ===================================
// ===== Inventory Management =====
// ===================================

function showAddProductModal() {
  document.getElementById("productModalTitle").innerText = "Add New Product";
  
  // Clear all fields for new product
  document.getElementById("productName").value = "";
  document.getElementById("productCategory").value = "";
  document.getElementById("costPrice").value = "";
  document.getElementById("sellingPrice").value = "";
  document.getElementById("stockQuantity").value = ""; 
  document.getElementById("stockLimit").value = ""; 
  
  // Set button for adding new product
  const saveBtn = document.querySelector("#productModal .btn-primary");
  saveBtn.innerText = "Add Product";
  saveBtn.onclick = saveProduct;
  
  openModal("productModal");
}

function saveProduct() {
  const name = document.getElementById("productName").value.trim();
  const category = document.getElementById("productCategory").value.trim(); 
  const cost = parseFloat(document.getElementById("costPrice").value);
  const sell = parseFloat(document.getElementById("sellingPrice").value);
  const stock = parseInt(document.getElementById("stockQuantity").value, 10); 
  const limit = parseInt(document.getElementById("stockLimit").value, 10); 

  // Comprehensive Validation
  if (!name || !category || isNaN(sell) || isNaN(cost) || isNaN(stock) || isNaN(limit)) {
    alert("Please fill all product fields correctly.");
    return;
  }
  if (cost < 0 || sell < 0 || stock < 0 || limit < 0) { 
    alert("Values cannot be negative.");
    return;
  }

  const id = Date.now();
  const sku = generateSKU(category); // Generate SKU

  database.products.push({ id, sku, name, category, cost, sell, stock, limit });
  
  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
  closeModal("productModal");
}

function editProduct(id) {
  const product = database.products.find(p => p.id == id);
  if (!product) return;

  document.getElementById("productModalTitle").innerText = "Edit Product: " + product.name;
  
  // Populate all 7 fields
  document.getElementById("productName").value = product.name;
  document.getElementById("productCategory").value = product.category || "";
  document.getElementById("costPrice").value = product.cost;
  document.getElementById("sellingPrice").value = product.sell;
  document.getElementById("stockQuantity").value = product.stock;
  document.getElementById("stockLimit").value = product.limit || 0;
  
  // Set button for saving changes
  const saveBtn = document.querySelector("#productModal .btn-primary");
  saveBtn.innerText = "Save Changes";
  openModal("productModal");

  // Override saveProduct for edit mode
  saveBtn.onclick = function () {
    const name = document.getElementById("productName").value.trim();
    const category = document.getElementById("productCategory").value.trim();
    const cost = parseFloat(document.getElementById("costPrice").value);
    const sell = parseFloat(document.getElementById("sellingPrice").value);
    const stock = parseInt(document.getElementById("stockQuantity").value, 10);
    const limit = parseInt(document.getElementById("stockLimit").value, 10);

    if (!name || !category || isNaN(cost) || isNaN(sell) || isNaN(stock) || isNaN(limit)) {
      alert("Please fill all product fields correctly.");
      return;
    }
    
    // Update product properties
    product.name = name;
    product.category = category;
    product.cost = cost;
    product.sell = sell;
    product.stock = stock;
    product.limit = limit;

    saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
    closeModal("productModal");
    
    // Restore original function for next time showAddProductModal is called
    saveBtn.onclick = saveProduct; 
  };
}

function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  database.products = database.products.filter(p => p.id !== id);
  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
}

function renderInventory(data = database.products) {
  const tbody = document.getElementById("inventoryTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  data.forEach((p) => {
    let statusBadge;
    const stockLimit = p.limit || 0;

    // Stock Status Logic (Out of Stock, Low Stock, Available)
    if (p.stock === 0) {
      statusBadge = `<span class="badge badge-danger">Out of Stock</span>`;
    } else if (p.stock <= stockLimit) { 
      statusBadge = `<span class="badge badge-warning">Low Stock</span>`;
    } else {
      statusBadge = `<span class="badge badge-success">Available</span>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.sku || 'N/A'}</td>
      <td>${p.name}</td>
      <td>${p.category || 'N/A'}</td>
      <td>GH₵ ${p.sell.toFixed(2)}</td>
      <td>GH₵ ${p.cost.toFixed(2)}</td>
      <td>${p.stock}</td>
      <td>${stockLimit}</td> 
      <td class="action-btns">
        ${statusBadge}
        <button class="btn btn-warning btn-sm" onclick="editProduct(${p.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterInventory() {
  const query = document.getElementById("inventorySearch").value.toLowerCase();
  const filtered = database.products.filter(p => 
    (p.name && p.name.toLowerCase().includes(query)) ||
    (p.sku && p.sku.toLowerCase().includes(query)) ||
    (p.category && p.category.toLowerCase().includes(query))
  );
  renderInventory(filtered);
}

// =================================
// ===== POS / Product Selection (Unchanged) =====
// =================================

let allProducts = [];

function updateProductDropdown() {
  const select = document.getElementById("productSelect");
  if (!select) return;

  allProducts = database.products.slice(); // store full list
  renderProductOptions(allProducts);
}

function renderProductOptions(list) {
  const select = document.getElementById("productSelect");
  select.innerHTML = `<option value="">-- Select Product --</option>`;
  list.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.category || "Uncategorized"}) - Stock: ${p.stock}`;
    select.appendChild(opt);
  });
}

function filterProductDropdown() {
  const query = document.getElementById("productSearch").value.toLowerCase();
  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(query) ||
    (p.category && p.category.toLowerCase().includes(query))
  );
  renderProductOptions(filtered);
}


function updateProductInfo() {
  const id = document.getElementById("productSelect").value;
  const product = database.products.find(p => p.id == id);
  if (product) {
    document.getElementById("unitPrice").value = product.sell;
  } else {
    document.getElementById("unitPrice").value = "";
  }
}

// =========================
// ===== POS / Cart Logic (Unchanged) =====
// =========================

function addToCart() {
  const id = document.getElementById("productSelect").value;
  const qty = parseInt(document.getElementById("quantity").value);
  const product = database.products.find(p => p.id == id);

  if (!product) {
    alert("Select a product.");
    return;
  }
  if (isNaN(qty) || qty < 1) {
    alert("Enter a valid quantity (min 1).");
    return;
  }
  if (qty > product.stock) {
    alert("Not enough stock for this item.");
    return;
  }

  const existing = cart.find(i => i.id == product.id);
  if (existing) {
    if (existing.qty + qty > product.stock) {
      alert("Adding this exceeds available stock.");
      return;
    }
    existing.qty += qty;
  } else {
    cart.push({ id: product.id, name: product.name, cost: product.cost, sell: product.sell, qty });
  }
  renderCart();
}

function renderCart() {
  const container = document.getElementById("cartItems");
  if (!container) return;
  container.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    total += item.qty * item.sell;
    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <span>${item.name} x${item.qty}</span>
      <span>GH₵ ${(item.qty * item.sell).toFixed(2)}</span>
      <div class="action-btns">
        <button class="btn btn-warning btn-sm" onclick="changeCartQty(${index}, -1)">-</button>
        <button class="btn btn-success btn-sm" onclick="changeCartQty(${index}, 1)">+</button>
        <button class="btn btn-danger btn-sm" onclick="removeCartItem(${index})">X</button>
      </div>
    `;
    container.appendChild(div);
  });

  document.getElementById("cartTotal").innerText = total.toFixed(2);
}

function changeCartQty(index, delta) {
  const item = cart[index];
  if (!item) return;

  const product = database.products.find(p => p.id === item.id);
  const newQty = item.qty + delta;

  if (newQty < 1) {
    if (confirm(`Remove ${item.name} from cart?`)) {
        removeCartItem(index);
    }
    return;
  } 
  if (newQty > product.stock) {
    alert("Exceeds available stock.");
    return;
  }
  item.qty = newQty;
  renderCart();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();
}

// ===== Checkout & Payment =====
// Toggles visibility for both Cash Amount and Due Date
function toggleDateAndCashFields() {
  const type = document.getElementById("paymentType")?.value;
  const cashGroup = document.getElementById("cashAmountGroup");
  const dueDateGroup = document.getElementById("dueDateGroup");

  if (cashGroup) cashGroup.style.display = type === "cash" ? "block" : "none";
  if (dueDateGroup) dueDateGroup.style.display = type === "credit" ? "block" : "none";
}


function processCheckout() {
  if (cart.length === 0) {
    alert("Cart is empty.");
    return;
  }

  const customer = document.getElementById("customerName").value.trim() || "Walk-in";
  const phone = document.getElementById("customerPhone").value.trim() || "";
  const paymentType = document.getElementById("paymentType").value;
  const total = parseFloat(document.getElementById("cartTotal").innerText);
  const receipt = Date.now(); // Unique ID for sale/debt

  let amountPaid = total;
  if (paymentType === "cash") {
    amountPaid = parseFloat(document.getElementById("cashAmount").value);
    if (isNaN(amountPaid) || amountPaid < total) {
      alert("Amount paid is less than total. Please confirm.");
      return;
    }
  }

  // Create payment record
  const paymentRecord = {
    reference: "PAY" + receipt,
    customer,
    phone,
    amount: amountPaid,
    date: new Date().toLocaleString(),
    method: paymentType,
    status: paymentType === "credit" ? "Pending" : "Paid"
  };

  // Record sale with embedded payment
  const sale = {
    receipt,
    date: new Date().toLocaleString(),
    customer,
    items: cart.map(i => ({ ...i })),
    total,
    payment: paymentType,
    payments: [paymentRecord]
  };
  database.sales.push(sale);

  // Record payment globally
  database.payments.push(paymentRecord);

  // Record debtor if credit
  if (paymentType === "credit") {
    // Get Manual Due Date
    let dueDate = document.getElementById("dueDateInput").value; 
    
    // If user didn't enter a date, use a default 7 days from now (as fallback)
    if (!dueDate) {
        alert("Due Date not set. Defaulting to 7 days.");
        dueDate = getFutureDate(7); // Helper function
    }

    const debtor = {
      receipt,
      customer,
      phone,
      initialAmount: total, // Initial amount is the total sale amount
      amount: total, // Balance starts at total
      date: new Date().toLocaleDateString(),
      dueDate,
      status: "Pending"
    };
    database.debtors.push(debtor);
  }

  // Update product stock
  cart.forEach(item => {
    const product = database.products.find(p => p.id === item.id);
    if (product) {
      product.stock -= item.qty;
    }
  });

  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️

  if (paymentType === "cash") {
    const change = amountPaid - total;
    alert(`Checkout successful! Receipt #${receipt}\nChange due: GH₵ ${change.toFixed(2)}`);
  } else {
    alert(`Checkout successful! Receipt #${receipt}`);
  }
  clearCart();
}

// Helper function to calculate future date string (used for default POS credit)
function getFutureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ======================
// ===== Sales Logic (Renders based on Firebase data) =====
// ======================
function renderSales() {
  const tbody = document.getElementById("salesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  database.sales
    .slice()
    .sort((a, b) => b.receipt - a.receipt)
    .forEach(s => {
      // Logic for status badge
      const isCredit = s.payment === "credit";
      let currentStatus = "Paid";
      let statusClass = "badge-success";

      if (isCredit) {
        const debtor = database.debtors.find(d => d.receipt === s.receipt);
        if (debtor) {
          currentStatus = debtor.status;
          if (currentStatus === "Pending" || currentStatus === "Partial") {
            statusClass = "badge-pending";
          } else if (currentStatus === "Overdue") {
            statusClass = "badge-danger";
          }
        } else {
            currentStatus = s.payments.some(p => p.status === "Pending" || p.status === "Partial") ? "Pending" : "Paid";
            statusClass = currentStatus === "Paid" ? "badge-success" : "badge-warning";
        }
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.receipt}</td>
        <td>${s.date}</td>
        <td>${s.customer}</td>
        <td>${s.items.map(i => `${i.name} x${i.qty}`).join(", ")}</td>
        <td>GH₵ ${s.total.toFixed(2)}</td>
        <td>${s.payment === "credit" ? "Credit" : "Cash"}</td>
        <td>
          <span class="badge ${statusClass}">${currentStatus}</span>
        </td>
        <td class="action-btns">
          <button class="btn btn-info btn-sm" onclick="showReceiptModal(${s.receipt})">View Details</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
}

// Placeholder for showReceiptModal - not requested but for completeness
function showReceiptModal(receiptId) {
    const sale = database.sales.find(s => s.receipt === receiptId);
    if (!sale) return;

    let details = `
        <p><strong>Receipt ID:</strong> ${sale.receipt}</p>
        <p><strong>Date:</strong> ${sale.date}</p>
        <p><strong>Customer:</strong> ${sale.customer}</p>
        <p><strong>Payment Type:</strong> ${sale.payment}</p>
        <p><strong>Total Amount:</strong> GH₵ ${sale.total.toFixed(2)}</p>
        <h4>Items Sold:</h4>
        <ul>
            ${sale.items.map(i => `<li>${i.name} x${i.qty} @ GH₵ ${i.sell.toFixed(2)}</li>`).join("")}
        </ul>
    `;
    
    const debtor = database.debtors.find(d => d.receipt === sale.receipt);
    if (debtor) {
        details += `
            <h4>Credit Details:</h4>
            <p><strong>Initial Debt:</strong> GH₵ ${debtor.initialAmount.toFixed(2)}</p>
            <p><strong>Current Balance:</strong> GH₵ ${debtor.amount.toFixed(2)}</p>
            <p><strong>Due Date:</strong> ${debtor.dueDate}</p>
            <p><strong>Status:</strong> ${debtor.status}</p>
        `;
    }

    // Display in a simple alert for now
    alert(details.replace(/<[^>]*>?/gm, '\n').trim());
}

// ======================
// ===== Debtors Logic (Renders based on Firebase data) =====
// ======================
function renderDebtors() {
  const tbody = document.getElementById("debtorsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let totalDebt = 0;
  
  // Sort by status: Overdue first, then Partial/Pending, then Paid
  const sortedDebtors = database.debtors.slice().sort((a, b) => {
      // Logic for Overdue calculation (if dueDate is present)
      const isOverdueA = a.dueDate && new Date(a.dueDate) < new Date() && a.amount > 0;
      const isOverdueB = b.dueDate && new Date(b.dueDate) < new Date() && b.amount > 0;

      if (a.amount === 0 && b.amount === 0) return 0; // Both paid, keep original order
      if (a.amount === 0) return 1; // Put A (paid) last
      if (b.amount === 0) return -1; // Put B (paid) last

      if (isOverdueA && !isOverdueB) return -1; // A (overdue) comes before B (not overdue)
      if (!isOverdueA && isOverdueB) return 1; // B (overdue) comes before A (not overdue)
      
      // If statuses are the same (both pending/partial or both overdue), sort by amount
      return b.amount - a.amount;
  });

  sortedDebtors.forEach(d => {
    let currentStatus = d.status;
    let statusClass = "badge-paid";
    let dueDateText = d.dueDate || "N/A";
    
    // Determine status based on due date and amount
    if (d.amount > 0) {
        if (d.dueDate) {
            const isOverdue = new Date(d.dueDate) < new Date();
            if (isOverdue) {
                currentStatus = "Overdue";
                statusClass = "badge-overdue";
            } else if (d.status === "Partial") {
                currentStatus = "Partial";
                statusClass = "badge-pending";
            } else {
                currentStatus = "Pending";
                statusClass = "badge-pending";
            }
        } else {
            // No due date set (like older records or some manual entries)
            currentStatus = d.status === "Partial" ? "Partial" : "Pending";
            statusClass = "badge-pending";
        }
    } else {
        currentStatus = "Paid";
        statusClass = "badge-success";
    }

    // Only count active pending/partial debt
    if (d.amount > 0) {
      totalDebt += d.amount;
    }
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.customer}</td>
      <td>${d.phone || 'N/A'}</td>
      <td>GH₵ ${(d.initialAmount || d.amount).toFixed(2)}</td> 
      <td>GH₵ ${d.amount.toFixed(2)}</td>
      <td>${d.date}</td>
      <td>${dueDateText}</td>
      <td>
        <span class="debtor-badge ${statusClass}"> ${currentStatus} </span>
      </td>
      <td class="action-btns">
        <button class="btn btn-warning btn-sm" onclick="showAddDebtorModal(${d.receipt})">Edit</button>
        ${d.amount > 0 ? `
          <button class="btn btn-success btn-sm" onclick="markPaid(${d.receipt})">Mark Full Paid</button>
          <button class="btn btn-info btn-sm" onclick="recordPartPayment(${d.receipt})">Part Payment</button>
        ` : ""}
        <button class="btn btn-danger btn-sm" onclick="deleteDebtor(${d.receipt})">Delete Record</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Stats cards
  const totalDebtorsEl = document.getElementById("totalDebtors");
  const totalDebtEl = document.getElementById("totalDebt");
  if (totalDebtorsEl) totalDebtorsEl.innerText = database.debtors.filter(d => d.amount > 0).length;
  if (totalDebtEl) totalDebtEl.innerText = totalDebt.toFixed(2);
}

// Helper to ensure YYYY-MM-DD format for input[type=date]
function convertDateToInputFormat(dateString) {
    if (!dateString) return '';
    try {
        // Attempt to parse standard date formats (like MM/DD/YYYY or YYYY-MM-DD)
        const date = new Date(dateString);
        if (isNaN(date)) return '';
        // Format to YYYY-MM-DD
        return date.toISOString().split('T')[0];
    } catch (e) {
        return '';
    }
}


// Functions for manual debtor entry/editing (Cloud Save enabled)
function showAddDebtorModal(receipt = null) {
  const modalTitle = document.querySelector("#addDebtorModal h3");
  const saveBtn = document.querySelector("#addDebtorModal .btn-primary");
  
  // Clear fields for new entry
  document.getElementById("debtorCustomerName").value = "";
  document.getElementById("debtorPhone").value = "";
  document.getElementById("debtorAmount").value = "";
  document.getElementById("debtorOriginalDate").value = "";
  document.getElementById("debtorDueDate").value = "";
  
  // Store the receipt ID on the modal button (hidden)
  saveBtn.setAttribute('data-receipt-id', receipt);

  if (receipt) {
    const debtor = database.debtors.find(d => d.receipt == receipt);
    if (!debtor) return;

    modalTitle.innerText = `Edit Debtor: ${debtor.customer}`;
    saveBtn.innerText = "Save Changes";
    
    // Populate fields
    document.getElementById("debtorCustomerName").value = debtor.customer;
    document.getElementById("debtorPhone").value = debtor.phone;
    // Note: When editing, we edit the initial amount, not the current balance.
    document.getElementById("debtorAmount").value = debtor.initialAmount; 
    
    // Convert date string for input[type=date]
    document.getElementById("debtorOriginalDate").value = convertDateToInputFormat(debtor.date);
    document.getElementById("debtorDueDate").value = convertDateToInputFormat(debtor.dueDate);
    
  } else {
    modalTitle.innerText = "Add Existing Debtor";
    saveBtn.innerText = "Add Debtor";
  }
  
  openModal("addDebtorModal");
}

function saveDebtorManually() {
  const saveBtn = document.querySelector("#addDebtorModal .btn-primary");
  const existingReceipt = saveBtn.getAttribute('data-receipt-id'); // Check for existing ID

  const customer = document.getElementById("debtorCustomerName").value.trim();
  const phone = document.getElementById("debtorPhone").value.trim() || "";
  const initialAmount = parseFloat(document.getElementById("debtorAmount").value);
  const originalDate = document.getElementById("debtorOriginalDate").value;
  const dueDate = document.getElementById("debtorDueDate").value || getFutureDate(7);

  if (!customer || isNaN(initialAmount) || initialAmount <= 0 || !originalDate) {
    alert("Please enter a valid customer name, amount, and original date.");
    return;
  }
  
  if (existingReceipt && existingReceipt !== 'null') { // Handle 'null' string if attribute wasn't properly removed
    // === EDIT MODE ===
    const receipt = existingReceipt;
    const debtor = database.debtors.find(d => d.receipt == receipt);

    if (debtor) {
      // Calculate change in initial amount
      const balanceChange = initialAmount - debtor.initialAmount;
      
      // Update the debtor details
      debtor.customer = customer;
      debtor.phone = phone;
      debtor.initialAmount = initialAmount;
      debtor.date = new Date(originalDate).toLocaleDateString();
      debtor.dueDate = dueDate;
      
      // Apply the change to the current balance
      debtor.amount += balanceChange;
      if (debtor.amount < 0) debtor.amount = 0; // Prevent negative balance 

      // Re-check status if balance is 0 now or became positive again
      if (debtor.amount === 0) {
        debtor.status = "Paid";
      } else if (debtor.status === "Paid") {
        // If balance became positive again after being paid, reset to Pending
        debtor.status = "Pending";
      }
      
    } else {
        alert("Error: Debtor record not found for editing.");
        return;
    }

  } else {
    // === ADD NEW MODE ===
    const receipt = Date.now(); // Unique ID for new record

    const debtor = {
      receipt,
      customer,
      phone,
      initialAmount, // Initial amount set here
      amount: initialAmount, // Balance starts at initial amount
      date: new Date(originalDate).toLocaleDateString(),
      dueDate,
      status: "Pending" // Always starts as Pending
    };

    database.debtors.push(debtor);
    
    // Create an initial payment record (amount is 0 paid) to track the start of the debt
    const initialDebtPayment = {
      reference: "PAY" + receipt,
      customer,
      phone,
      amount: 0, 
      date: new Date().toLocaleString(),
      method: "credit-initial-debt",
      status: "Pending"
    };
    database.payments.push(initialDebtPayment);
  }
  
  // Clear the attribute after processing
  saveBtn.removeAttribute('data-receipt-id');

  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
  closeModal("addDebtorModal");
}


function markPaid(receipt) {
  const debtor = database.debtors.find(d => d.receipt === receipt);
  if (!debtor || debtor.amount === 0) return;

  if (!confirm(`Mark debt of GH₵ ${debtor.amount.toFixed(2)} from ${debtor.customer} as fully paid?`)) return;

  // Find the original sale record to link payment (May not exist for manual entries)
  const sale = database.sales.find(s => s.receipt === receipt);

  // Record the full payment
  const fullPayment = {
    reference: "PAY" + Date.now(),
    customer: debtor.customer,
    phone: debtor.phone,
    amount: debtor.amount, 
    date: new Date().toLocaleString(),
    method: "credit-full", // Explicitly mark as full payment
    status: "Paid"
  };
  database.payments.push(fullPayment);

  // Update sale record's payment log (if sale exists)
  if (sale) {
    if (!sale.payments) sale.payments = [];
    sale.payments.push(fullPayment);
  }

  debtor.status = "Paid";
  debtor.amount = 0;

  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
}

function recordPartPayment(receipt) {
  const debtor = database.debtors.find(d => d.receipt === receipt);
  if (!debtor || debtor.amount === 0) return;

  const amount = parseFloat(prompt(`Enter part payment for ${debtor.customer} (GH₵ ${debtor.amount.toFixed(2)} remaining):`));

  if (isNaN(amount) || amount <= 0) {
    alert("Invalid amount.");
    return;
  }
  if (amount > debtor.amount) {
    alert("Payment exceeds remaining debt.");
    return;
  }

  // Find the original sale record to link payment (May not exist for manual entries)
  const sale = database.sales.find(s => s.receipt === receipt);

  // Record partial payment
  const partPayment = {
    reference: "PAY" + Date.now(),
    customer: debtor.customer,
    phone: debtor.phone,
    amount,
    date: new Date().toLocaleString(),
    method: "credit-part",
    status: "Partial"
  };
  database.payments.push(partPayment);

  // Update sale record's payment log (if sale exists)
  if (sale) {
    if (!sale.payments) sale.payments = [];
    sale.payments.push(partPayment);
  }

  debtor.amount -= amount;

  if (debtor.amount <= 0) {
    debtor.status = "Paid";
    debtor.amount = 0;
  } else {
    debtor.status = "Partial";
  }

  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
}

function deleteDebtor(receipt) {
  if (!confirm("Are you sure you want to permanently delete this debtor record?")) return;
  database.debtors = database.debtors.filter(d => d.receipt !== receipt);
  
  // NOTE: You might want to remove associated sales/payments too for full cleanup,
  // but keeping history is usually better.
  
  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
}

// ======================
// ===== Reports Logic (Renders based on Firebase data) =====
// ======================

function renderReports() {
  // Reset totals
  let totalSales = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  const productStats = {}; // {name: {units, revenue, cost, profit}}

  // Date constants for reporting
  const today = new Date().toDateString();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let todaySales = 0;
  let monthSales = 0;

  // 1. Process all sales
  database.sales.forEach(s => {
    totalSales++;
    s.items.forEach(i => {
      const revenue = i.qty * i.sell;
      const cost = i.qty * i.cost;
      const profit = revenue - cost;

      totalRevenue += revenue;
      totalCost += cost;
      totalProfit += profit;

      // Update product stats
      if (!productStats[i.name]) {
        productStats[i.name] = { units: 0, revenue: 0, cost: 0, profit: 0 };
      }
      productStats[i.name].units += i.qty;
      productStats[i.name].revenue += revenue;
      productStats[i.name].cost += cost;
      productStats[i.name].profit += profit;
    });

    // Check sales against time periods
    const saleDate = new Date(s.date);
    if (saleDate.toDateString() === today) {
        todaySales += s.total;
    }
    if (saleDate >= monthStart) {
        monthSales += s.total;
    }
  });

  // 2. Update stats cards
  const todaySalesEl = document.getElementById("todaySales");
  const monthSalesEl = document.getElementById("monthSales");
  const totalRevenueEl = document.getElementById("totalRevenue");
  const totalProfitEl = document.getElementById("totalProfit");

  if (todaySalesEl) todaySalesEl.innerText = todaySales.toFixed(2);
  if (monthSalesEl) monthSalesEl.innerText = monthSales.toFixed(2);
  if (totalRevenueEl) totalRevenueEl.innerText = totalRevenue.toFixed(2);
  if (totalProfitEl) totalProfitEl.innerText = totalProfit.toFixed(2);
  
  // Profit table
  const profitTbody = document.getElementById("profitTableBody");
  if (profitTbody) {
    profitTbody.innerHTML = "";
    Object.keys(productStats).forEach(name => {
      const p = productStats[name];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${name}</td>
        <td>${p.units}</td>
        <td>GH₵ ${p.revenue.toFixed(2)}</td>
        <td>GH₵ ${p.cost.toFixed(2)}</td>
        <td>GH₵ ${p.profit.toFixed(2)}</td>
      `;
      profitTbody.appendChild(tr);
    });
  }

  // Prepare daily sales and profit data
  const dailyStats = {};
  database.sales.forEach(s => {
    const parsedDate = new Date(Date.parse(s.date));
    if (isNaN(parsedDate)) return; // skip invalid dates
    const key = parsedDate.toISOString().split("T")[0];

    if (!dailyStats[key]) dailyStats[key] = { sales: 0, profit: 0 };
    dailyStats[key].sales += s.total;
    
    // Calculate profit for the sale
    let saleProfit = 0;
    s.items.forEach(i => {
      saleProfit += (i.qty * i.sell) - (i.qty * i.cost);
    });
    dailyStats[key].profit += saleProfit;
  });

  // Build last 7 days for the chart
  const labels = [];
  const salesData = [];
  const profitData = [];
  const todayD = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayD);
    d.setDate(todayD.getDate() - i);
    const key = d.toISOString().split("T")[0];
    
    // Format label for display (e.g., Dec 10)
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    // Get data or default to 0
    salesData.push(dailyStats[key] ? dailyStats[key].sales.toFixed(2) : 0);
    profitData.push(dailyStats[key] ? dailyStats[key].profit.toFixed(2) : 0);
  }
  
  // 3. Render Chart
  const ctx = document.getElementById("dailySalesChart")?.getContext("2d");
  if (ctx) {
    // Destroy previous chart if it exists
    if (window.dailySalesChartInstance) {
        window.dailySalesChartInstance.destroy();
    }
    
    window.dailySalesChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Daily Sales (GH₵)',
          data: salesData,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: 'Daily Profit (GH₵)',
          data: profitData,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            stacked: false,
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
                display: true,
                text: 'Sales/Profit Amount (GH₵)'
            },
            beginAtZero: true
          },
          y1: {
            type: 'linear',
            display: false, // Hide for cleaner look, sharing the same scale
            position: 'right',
            grid: {
              drawOnChartArea: false, // only want the grid lines for the left axis
            },
            beginAtZero: true
          }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += 'GH₵ ' + context.parsed.y.toFixed(2);
                        }
                        return label;
                    }
                }
            }
        }
      }
    });
  }
}

// ======================
// ===== Data Storage & Stats (Cloud Enabled) =====
// ======================

function updateDatabaseStats() {
  const p = document.getElementById("dbProductCount");
  const s = document.getElementById("dbSaleCount");
  const d = document.getElementById("dbDebtorCount");
  const pay = document.getElementById("dbPaymentCount");
  const a = document.getElementById("dbAdminCount");

  if (p) p.innerText = database.products.length;
  if (s) s.innerText = database.sales.length;
  if (d) d.innerText = database.debtors.filter(d => d.amount > 0).length; // Only active debtors
  if (a) a.innerText = database.admins.length;
  if (pay) pay.innerText = database.payments.length;
}

function clearAllData() {
  if (!confirm("DANGER! This will wipe ALL products, sales, debtors, and payments data on the cloud. Do you want to proceed?")) return;

  // Preserve only the admins and write empty arrays to Firebase
  const adminData = database.admins;
  dbRef.set({
    products: [], 
    sales: [], 
    debtors: [], 
    payments: [],
    admins: adminData // Preserve admins
  }).then(() => {
    // Alert success, the listener will handle the re-rendering automatically
    alert("All data cleared (admins preserved).");
  }).catch(error => {
    console.error("Clear Data Error:", error);
    alert("Error clearing data on Firebase.");
  });
}

// =======================
// ===== Modal Helpers (Unchanged) =====
// =======================

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
  if (el) el.style.display = "flex"; // Use flex for modal overlay centering
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
  if (el) el.style.display = "none";
}

// =======================
// ===== Admin Functions (Cloud Enabled) =====
// =======================

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
  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
}

function deleteAdmin(username) {
  if (!confirm("Delete this admin?")) return;
  if (username === currentUser) {
    alert("Cannot delete the currently logged-in user.");
    return;
  }
  database.admins = database.admins.filter(a => a.username !== username);
  saveDatabaseToCloud(); // ⭐️ CLOUD SAVE ⭐️
}