
(function () {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userInfo = document.getElementById('userInfo');
  const userEmailEl = document.getElementById('userEmail');
  const userPhoto = document.getElementById('userPhoto');
  const itemForm = document.getElementById('itemForm');
  const itemsList = document.getElementById('itemsList');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const toastEl = document.getElementById('toast');
  const clearBtn = document.getElementById('clearBtn');
  const config = window._FIREBASE_CONFIG || {};
  let useLocal = false;
  let currentUser = null;
  let dbRef = null;
  const LOCAL_KEY = 'lostFound_items_v1';
  function showToast(msg, ms = 3000) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
      toastEl.classList.add('hidden');
    }, ms);
  }
  function fmtTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString();
  }
  function initFirebase() {
    try {
      const placeholder = Object.values(config).some(v => typeof v === 'string' && /YOUR_|YOUR-/.test(v));
      if (!config || placeholder) throw new Error('Firebase not configured');

      firebase.initializeApp(config);
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      dbRef = firebase.database().ref('items');
      useLocal = false;
      console.log('Firebase initialized.');
    } catch (e) {
      console.warn('Firebase not available — falling back to localStorage:', e.message);
      useLocal = true;
      dbRef = null;
    }
  }
  function loadLocalItems() {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  }
  function saveLocalItems(obj) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(obj));
  }
  function itemsFromData(dataObj) {
    return Object.keys(dataObj || {}).map(k => {
      return Object.assign({}, dataObj[k], { itemId: k });
    }).sort((a,b) => b.timestamp - a.timestamp);
  }
  async function signIn() {
    if (useLocal) {
      currentUser = { uid: 'local_guest', email: 'guest@local', displayName: 'Local Guest', photoURL: '' };
      updateUserUI();
      showToast('Local mode: signed in as guest');
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      const res = await firebase.auth().signInWithPopup(provider);
      currentUser = res.user;
      updateUserUI();
      showToast('Signed in: ' + (currentUser.email || 'Google user'));
    } catch (err) {
      console.error(err);
      showToast('Sign-in failed');
    }
  }
  async function signOut() {
    if (useLocal) {
      currentUser = null; updateUserUI();
      showToast('Signed out (local)');
      return;
    }
    await firebase.auth().signOut();
    currentUser = null;
    updateUserUI();
    showToast('Signed out');
  }
  function updateUserUI() {
    if (currentUser) {
      loginBtn.classList.add('hidden');
      userInfo.classList.remove('hidden');
      userEmailEl.textContent = currentUser.email || currentUser.displayName || '';
      userPhoto.src = currentUser.photoURL || 'https://via.placeholder.com/64?text=U';
    } else {
      loginBtn.classList.remove('hidden');
      userInfo.classList.add('hidden');
      userEmailEl.textContent = '';
      userPhoto.src = '';
    }
  }
  async function submitItem(e) {
    e.preventDefault();
    const name = document.getElementById('itemName').value.trim();
    const description = document.getElementById('description').value.trim();
    const status = document.getElementById('status').value;
    const location = document.getElementById('location').value.trim();
    const contactInfo = document.getElementById('contactInfo').value.trim();
    if (!name || !location || !contactInfo) {
      showToast('Please fill required fields');
      return;
    }
    const ts = Date.now();
    const ownerId = (currentUser && currentUser.uid) ? currentUser.uid : 'anonymous';
    const ownerEmail = (currentUser && currentUser.email) ? currentUser.email : 'anonymous';
    const itemObj = {
      itemName: name,
      description,
      status,
      location,
      contactInfo,
      timestamp: ts,
      ownerId,
      ownerEmail
    };
    if (useLocal) {
      const items = loadLocalItems();
      const id = 'local_' + ts;
      items[id] = itemObj;
      saveLocalItems(items);
      renderItems();
      showToast('Item saved locally');
    } else {
      const newRef = await dbRef.push(itemObj);
      showToast('Item submitted');
    }
    itemForm.reset();
  }
  async function markReturned(item) {
    const uid = currentUser ? currentUser.uid : 'anonymous';
    if (item.ownerId !== uid) {
      showToast('You are not authorized.');
      return;
    }
    const updates = {
      status: 'returned',
      returnedDate: Date.now()
    };

    if (useLocal) {
      const items = loadLocalItems();
      if (!items[item.itemId]) { showToast('Item not found locally'); return; }
      items[item.itemId] = Object.assign({}, items[item.itemId], updates);
      saveLocalItems(items);
      renderItems();
      showToast('Marked returned (local)');
    } else {
      await firebase.database().ref('items/' + item.itemId).update(updates);
      showToast('Marked returned');
    }
  }
  async function deleteItem(item) {
    const uid = currentUser ? currentUser.uid : 'anonymous';
    if (item.ownerId !== uid) {
      showToast('You are not authorized.');
      return;
    }
    if (!confirm('Delete this item?')) return;
    if (useLocal) {
      const items = loadLocalItems();
      delete items[item.itemId];
      saveLocalItems(items);
      renderItems();
      showToast('Deleted (local)');
    } else {
      await firebase.database().ref('items/' + item.itemId).remove();
      showToast('Item deleted');
    }
  }
  let activeFilter = 'all';
  function setFilter(f) {
    activeFilter = f;
    filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === f));
    renderItems();
  }
  async function renderItems() {
    itemsList.innerHTML = '<div class="small" style="padding:10px">Loading...</div>';
    if (useLocal) {
      const dataObj = loadLocalItems();
      const arr = itemsFromData(dataObj);
      displayCards(arr);
    } else {
      const snap = await firebase.database().ref('items').once('value');
      const dataObj = snap.val() || {};
      const arr = itemsFromData(dataObj);
      displayCards(arr);
    }
  }
  function displayCards(arr) {
    let filtered = arr;
    if (activeFilter === 'lost') filtered = arr.filter(i => i.status === 'lost');
    else if (activeFilter === 'found') filtered = arr.filter(i => i.status === 'found');
    else if (activeFilter === 'returned') filtered = arr.filter(i => i.status === 'returned');
    if (filtered.length === 0) {
      itemsList.innerHTML = '<div class="small" style="padding:10px">No items found.</div>';
      return;
    }
    itemsList.innerHTML = '';
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      const badgeCls = item.status === 'lost' ? 'lost' : (item.status === 'found' ? 'found' : 'returned');
      card.innerHTML = `
        <div class="meta">
          <span class="badge ${badgeCls}">${item.status.toUpperCase()}</span>
          <span class="small">${fmtTime(item.timestamp)}</span>
        </div>
        <h3>${escapeHtml(item.itemName)}</h3>
        <p class="small">${escapeHtml(item.description || '')}</p>
        <div class="small">Location: <strong>${escapeHtml(item.location)}</strong></div>
        <div class="small">Contact: <strong>${escapeHtml(item.contactInfo)}</strong></div>
        <div class="small">Reported by: <strong>${escapeHtml(item.ownerEmail || 'unknown')}</strong></div>
        ${item.status === 'returned' ? `<div class="small">Returned on: <strong>${fmtTime(item.returnedDate)}</strong></div>` : ''}
        <div class="card-actions"></div>
      `;
      const actions = card.querySelector('.card-actions');
      if (item.status !== 'returned') {
        const retBtn = document.createElement('button');
        retBtn.className = 'btn small';
        retBtn.textContent = 'Mark Returned';
        retBtn.addEventListener('click', () => markReturned(item));
        actions.appendChild(retBtn);
      }
      const delBtn = document.createElement('button');
      delBtn.className = 'btn small ghost';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteItem(item));
      actions.appendChild(delBtn);

      itemsList.appendChild(card);
    });
  }
  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }
  function setupRealtime() {
    if (!useLocal && dbRef) {
      dbRef.on('value', snapshot => {
        renderItems();
      });
      firebase.auth().onAuthStateChanged(user => {
        currentUser = user;
        updateUserUI();
      });
    }
  }
  function attachEvents() {
    loginBtn.addEventListener('click', signIn);
    logoutBtn.addEventListener('click', signOut);
    itemForm.addEventListener('submit', submitItem);
    clearBtn.addEventListener('click', () => itemForm.reset());
    filterBtns.forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  }
  function boot() {
    initFirebase();
    attachEvents();
    if (useLocal) {
      showToast('Running in localStorage fallback mode. Sign-in will be a local guest session.');
      currentUser = null;
      updateUserUI();
      renderItems();
    } else {
      setupRealtime();
      renderItems();
    }
  }
  boot();
})();
