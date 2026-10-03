// script.js

// db is already available from firebase.js

let debts = [];
let unsubscribe = null;

// DOM Elements
const form = document.getElementById('debtForm');
const debtList = document.getElementById('debtList');
const totalDebtEl = document.getElementById('totalDebt');
const emptyMessage = document.getElementById('emptyMessage');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const exportBtn = document.getElementById('exportBtn');
const themeToggle = document.getElementById('themeToggle');
const printBtn = document.getElementById('printBtn');
const connectionStatus = document.getElementById('connectionStatus');

document.getElementById('debtDate').valueAsDate = new Date();

// ========== HELPERS ==========
function getStatus(remaining, original) {
  if (remaining <= 0) return 'paid';
  if (remaining < original) return 'partial';
  return 'pending';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function formatMoney(n) {
  return Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ========== REALTIME LISTENER ==========
function startRealtimeListener() {
  if (connectionStatus) {
    connectionStatus.textContent = 'Connecting to database...';
    connectionStatus.className = 'connection-status connecting';
  }

  unsubscribe = db.collection('debts')
    .orderBy('date', 'desc')
    .onSnapshot(
      (snapshot) => {
        debts = [];
        snapshot.forEach(doc => {
          debts.push({ id: doc.id, ...doc.data() });
        });

        if (connectionStatus) {
          connectionStatus.textContent = '● Connected';
          connectionStatus.className = 'connection-status connected';
        }
        renderDebts();
      },
      (error) => {
        console.error('Firestore error:', error);
        if (connectionStatus) {
          connectionStatus.textContent = '● Connection error';
          connectionStatus.className = 'connection-status error';
        }
      }
    );
}

// ========== RENDER ==========
function renderDebts() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const statusValue = statusFilter.value;

  let filtered = debts.filter(d => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm) ||
      (d.os && d.os.toLowerCase().includes(searchTerm)) ||
      (d.note && d.note.toLowerCase().includes(searchTerm));
    const matchesStatus = statusValue === 'all' || d.status === statusValue;
    return matchesSearch && matchesStatus;
  });

  debtList.innerHTML = '';

  if (filtered.length === 0) {
    emptyMessage.style.display = 'block';
    updateSummary(filtered);
    return;
  }

  emptyMessage.style.display = 'none';

  filtered.forEach(debt => {
    const paid = debt.original - debt.remaining;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(debt.date)}</td>
      <td><strong>${debt.name}</strong></td>
      <td>${debt.os || '—'}</td>
      <td>₱${formatMoney(debt.original)}</td>
      <td>₱${formatMoney(paid)}</td>
      <td>₱${formatMoney(debt.remaining)}</td>
      <td><span class="status-badge status-${debt.status}">${debt.status}</span></td>
      <td>${debt.note || '—'}</td>
      <td class="actions no-print">
  ${debt.status !== 'paid' ? `<button class="btn-pay" onclick="payDebt('${debt.id}')">Pay</button>` : ''}
  <button class="btn-edit" onclick="openEditModal('${debt.id}')">Edit</button>
  <button class="btn-history" onclick="openHistory('${debt.id}')">History</button>
  <button class="btn-print" onclick="printReceipt('${debt.id}')">Print</button>
  <button class="btn-delete" onclick="deleteDebt('${debt.id}')">Del</button>
</td>
    `;
    debtList.appendChild(row);
  });

  updateSummary(filtered);
}

function updateSummary(filtered) {
  const outstanding = filtered
    .filter(d => d.status !== 'paid')
    .reduce((sum, d) => sum + d.remaining, 0);

  totalDebtEl.textContent = formatMoney(outstanding);
  document.getElementById('countPending').textContent = debts.filter(d => d.status === 'pending').length;
  document.getElementById('countPartial').textContent = debts.filter(d => d.status === 'partial').length;
  document.getElementById('countPaid').textContent = debts.filter(d => d.status === 'paid').length;
}

// ========== ADD ==========
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('employeeName').value.trim();
  const amount = parseFloat(document.getElementById('debtAmount').value);
  const date = document.getElementById('debtDate').value;
  const os = document.getElementById('osNumber').value.trim();
  const note = document.getElementById('note').value.trim();

  if (!name || isNaN(amount) || amount <= 0 || !date) {
    alert('Please fill required fields correctly.');
    return;
  }

  try {
    await db.collection('debts').add({
      name,
      original: amount,
      remaining: amount,
      date,
      os,
      note,
      status: 'pending',
      payments: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    form.reset();
    document.getElementById('debtDate').valueAsDate = new Date();
  } catch (error) {
    console.error(error);
    alert('Failed to add debt.');
  }
});

// ========== PAY ==========
async function payDebt(id) {
  const debt = debts.find(d => d.id === id);
  if (!debt) return;

  const payment = prompt(`Payment for ${debt.name}\nRemaining: ₱${formatMoney(debt.remaining)}`, debt.remaining);
  if (payment === null) return;

  const amountPaid = parseFloat(payment);
  if (isNaN(amountPaid) || amountPaid <= 0) {
    alert('Invalid amount');
    return;
  }

  const actualPaid = Math.min(amountPaid, debt.remaining);
  const newRemaining = debt.remaining - actualPaid;
  const newStatus = getStatus(newRemaining, debt.original);

  const newPayment = {
    amount: actualPaid,
    date: new Date().toISOString().slice(0, 10),
    note: ''
  };

  try {
    await db.collection('debts').doc(id).update({
      remaining: newRemaining,
      status: newStatus,
      payments: firebase.firestore.FieldValue.arrayUnion(newPayment)
    });
  } catch (error) {
    console.error(error);
    alert('Failed to record payment.');
  }
}

// ========== DELETE ==========
async function deleteDebt(id) {
  const debt = debts.find(d => d.id === id);
  if (!debt) return;

  if (!confirm(`Delete debt of ${debt.name}?`)) return;

  try {
    await db.collection('debts').doc(id).delete();
  } catch (error) {
    console.error(error);
    alert('Failed to delete.');
  }
}

// ========== EDIT ==========
function openEditModal(id) {
  const debt = debts.find(d => d.id === id);
  if (!debt) return;

  document.getElementById('editId').value = debt.id;
  document.getElementById('editName').value = debt.name;
  document.getElementById('editOriginal').value = debt.original;
  document.getElementById('editDate').value = debt.date;
  document.getElementById('editOs').value = debt.os || '';
  document.getElementById('editNote').value = debt.note || '';

  document.getElementById('editModal').classList.add('show');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('show');
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const debt = debts.find(d => d.id === id);
  if (!debt) return;

  const newOriginal = parseFloat(document.getElementById('editOriginal').value);
  const paidSoFar = debt.original - debt.remaining;

  try {
    await db.collection('debts').doc(id).update({
      name: document.getElementById('editName').value.trim(),
      original: newOriginal,
      remaining: Math.max(0, newOriginal - paidSoFar),
      date: document.getElementById('editDate').value,
      os: document.getElementById('editOs').value.trim(),
      note: document.getElementById('editNote').value.trim(),
      status: getStatus(Math.max(0, newOriginal - paidSoFar), newOriginal)
    });
    closeEditModal();
  } catch (error) {
    console.error(error);
    alert('Failed to save changes.');
  }
});

// ========== HISTORY ==========
function openHistory(id) {
  const debt = debts.find(d => d.id === id);
  if (!debt) return;

  document.getElementById('historyName').textContent = debt.name;
  const container = document.getElementById('historyContent');

  if (!debt.payments || debt.payments.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8">No payments recorded yet.</p>';
  } else {
    container.innerHTML = debt.payments.map(p => `
      <div class="history-item">
        <span>${formatDate(p.date)}</span>
        <strong>₱${formatMoney(p.amount)}</strong>
      </div>
    `).join('');
  }

  document.getElementById('historyModal').classList.add('show');
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('show');
}

// ========== EVENTS ==========
searchInput.addEventListener('input', renderDebts);
statusFilter.addEventListener('change', renderDebts);

exportBtn.addEventListener('click', () => {
  if (debts.length === 0) return alert('No data to export.');

  const headers = ['EMPLOYEE', 'TOTAL', 'Date', 'OS#', 'PARTIAL', 'BALANCE', 'STATUS', 'REMARKS'];
  
  const rows = debts.map(d => {
    const partial = d.original - d.remaining;
    return [
      d.name,
      d.original.toFixed(2),
      d.date,
      d.os || '',
      partial.toFixed(2),
      d.remaining.toFixed(2),
      d.status.toUpperCase(),
      d.note || ''
    ];
  });

  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(cell => `"${cell}"`).join(',') + '\n';
  });

  const totalOriginal = debts.reduce((sum, d) => sum + d.original, 0);
  const totalBalance = debts.reduce((sum, d) => sum + d.remaining, 0);
  csv += `\n"","${totalOriginal.toFixed(2)}","","","","${totalBalance.toFixed(2)}","",""\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Utang_Employees_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
});

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light');
}

// Top Print Receipt button → opens select modal
printBtn.addEventListener('click', () => {
  openPrintSelectModal();
});

function openPrintSelectModal() {
  const select = document.getElementById('printEmployeeSelect');
  select.innerHTML = '<option value="">-- Select Employee --</option>';

  // Only show employees with remaining balance
  const outstanding = debts.filter(d => d.status !== 'paid');

  if (outstanding.length === 0) {
    alert('No outstanding debts to print.');
    return;
  }

  outstanding.forEach(debt => {
    const option = document.createElement('option');
    option.value = debt.id;
    option.textContent = `${debt.name}  –  ₱${formatMoney(debt.remaining)}`;
    select.appendChild(option);
  });

  document.getElementById('printSelectModal').classList.add('show');
}

function closePrintSelectModal() {
  document.getElementById('printSelectModal').classList.remove('show');
}

function printSelectedEmployee() {
  const select = document.getElementById('printEmployeeSelect');
  const selectedId = select.value;

  if (!selectedId) {
    alert('Please select an employee first.');
    return;
  }

  closePrintSelectModal();
  printReceipt(selectedId); // Uses the existing print function
}

// ========== PRINT RECEIPT (per employee) ==========
function printReceipt(id) {
  const debt = debts.find(d => d.id === id);

  if (!debt) {
    alert('Employee not found!');
    return;
  }

  console.log('Printing for:', debt.name); // ← Check this in Console

  document.getElementById('receiptDate').textContent = formatDate(new Date().toISOString().slice(0, 10));
  document.getElementById('receiptName').textContent = debt.name;
  document.getElementById('receiptOS').textContent = debt.os || '—';
  document.getElementById('receiptTotal').textContent = '₱' + formatMoney(debt.original);
  document.getElementById('receiptPaid').textContent = '₱' + formatMoney(debt.original - debt.remaining);
  document.getElementById('receiptBalance').textContent = '₱' + formatMoney(debt.remaining);
  document.getElementById('receiptStatus').textContent = debt.status.toUpperCase();
  document.getElementById('receiptNote').textContent = debt.note || '—';

  window.print();
}

// ========== START ==========
startRealtimeListener();

