/**
 * SplitEase — Smart Group Expense Splitter
 * Modern JavaScript Application Logic, Debt Settlement Engine & Supabase Real-time Cloud Sync
 */

(function () {
  'use strict';

  // --- Constants & Color Themes ---
  const AVATAR_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ec4899', 
    '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6'
  ];

  const CATEGORY_META = {
    Food: { icon: 'fa-utensils', color: '#f59e0b', label: 'Food & Dining' },
    Travel: { icon: 'fa-car', color: '#3b82f6', label: 'Travel & Cab' },
    Stay: { icon: 'fa-hotel', color: '#8b5cf6', label: 'Stay & Hotel' },
    Drinks: { icon: 'fa-martini-glass-citron', color: '#ec4899', label: 'Drinks & Party' },
    Groceries: { icon: 'fa-basket-shopping', color: '#10b981', label: 'Groceries' },
    Entertainment: { icon: 'fa-ticket', color: '#06b6d4', label: 'Entertainment' },
    Other: { icon: 'fa-receipt', color: '#6b7280', label: 'Other' },
    Settlement: { icon: 'fa-handshake', color: '#10b981', label: 'Settlement' }
  };

  const SQL_SCHEMA_SCRIPT = `-- SplitEase Supabase Schema
CREATE TABLE IF NOT EXISTS public.groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'My Group',
    currency TEXT NOT NULL DEFAULT '₹',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category TEXT DEFAULT 'Other',
    paid_by TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    split_mode TEXT DEFAULT 'EQUAL',
    splits JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_settlement BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public groups" ON public.groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public members" ON public.members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;`;

  // --- Initial Default State ---
  const DEFAULT_STATE = {
    groupId: 'default-trip',
    groupName: 'Goa Vacation 🌴',
    currency: '₹',
    members: [
      { id: 'm1', name: 'Rahul', color: AVATAR_COLORS[0] },
      { id: 'm2', name: 'Priya', color: AVATAR_COLORS[1] },
      { id: 'm3', name: 'Amit', color: AVATAR_COLORS[2] },
      { id: 'm4', name: 'Sneha', color: AVATAR_COLORS[3] }
    ],
    expenses: [
      {
        id: 'exp-1',
        title: 'Beach Villa Booking',
        amount: 12000,
        paidBy: 'm1',
        category: 'Stay',
        date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
        splitMode: 'EQUAL',
        splits: { m1: 3000, m2: 3000, m3: 3000, m4: 3000 },
        isSettlement: false
      },
      {
        id: 'exp-2',
        title: 'Seafood Shack Dinner',
        amount: 4500,
        paidBy: 'm2',
        category: 'Food',
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        splitMode: 'EQUAL',
        splits: { m1: 1125, m2: 1125, m3: 1125, m4: 1125 },
        isSettlement: false
      },
      {
        id: 'exp-3',
        title: 'Airport Taxi & Tolls',
        amount: 2200,
        paidBy: 'm3',
        category: 'Travel',
        date: new Date().toISOString().split('T')[0],
        splitMode: 'EQUAL',
        splits: { m1: 550, m2: 550, m3: 550, m4: 550 },
        isSettlement: false
      }
    ]
  };

  // --- Application State ---
  let state = {
    groupId: DEFAULT_STATE.groupId,
    groupName: DEFAULT_STATE.groupName,
    currency: DEFAULT_STATE.currency,
    members: JSON.parse(JSON.stringify(DEFAULT_STATE.members)),
    expenses: JSON.parse(JSON.stringify(DEFAULT_STATE.expenses))
  };

  // Supabase Client & Config
  let supabaseClient = null;
  let supabaseRealtimeChannel = null;
  let supabaseConfig = {
    url: '',
    key: '',
    groupId: 'default-trip'
  };

  // --- DOM Elements ---
  const el = {
    groupNameDisplay: document.getElementById('groupNameDisplay'),
    renameGroupBtn: document.getElementById('renameGroupBtn'),
    groupMembersCount: document.getElementById('groupMembersCount'),
    currencySelect: document.getElementById('currencySelect'),
    currencySymbolLabels: document.querySelectorAll('.currency-symbol-label'),
    totalExpenseAmount: document.getElementById('totalExpenseAmount'),
    avgExpenseAmount: document.getElementById('avgExpenseAmount'),
    totalExpenseCount: document.getElementById('totalExpenseCount'),
    membersChipList: document.getElementById('membersChipList'),
    
    // DB Status
    dbStatusBtn: document.getElementById('dbStatusBtn'),
    dbStatusDot: document.getElementById('dbStatusDot'),
    dbStatusText: document.getElementById('dbStatusText'),
    supabaseStatusBadge: document.getElementById('supabaseStatusBadge'),

    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    expensesBadgeCount: document.getElementById('expensesBadgeCount'),
    settleBadgeCount: document.getElementById('settleBadgeCount'),

    // Expenses Tab
    expenseSearchInput: document.getElementById('expenseSearchInput'),
    filterCategorySelect: document.getElementById('filterCategorySelect'),
    expensesList: document.getElementById('expensesList'),
    expensesEmptyState: document.getElementById('expensesEmptyState'),
    openAddExpenseBtn: document.getElementById('openAddExpenseBtn'),
    emptyAddExpenseBtn: document.getElementById('emptyAddExpenseBtn'),
    mobileAddExpenseBtn: document.getElementById('mobileAddExpenseBtn'),

    // Modals
    expenseModal: document.getElementById('expenseModal'),
    expenseForm: document.getElementById('expenseForm'),
    editExpenseId: document.getElementById('editExpenseId'),
    expenseModalTitle: document.getElementById('expenseModalTitle'),
    closeExpenseModalBtn: document.getElementById('closeExpenseModalBtn'),
    cancelExpenseModalBtn: document.getElementById('cancelExpenseModalBtn'),
    expenseTitle: document.getElementById('expenseTitle'),
    expenseAmount: document.getElementById('expenseAmount'),
    expenseCategory: document.getElementById('expenseCategory'),
    expensePaidBy: document.getElementById('expensePaidBy'),
    expenseDate: document.getElementById('expenseDate'),
    splitMembersList: document.getElementById('splitMembersList'),
    splitSummaryInfo: document.getElementById('splitSummaryInfo'),
    segmentBtns: document.querySelectorAll('.segment-btn'),

    // Members Modal
    memberModal: document.getElementById('memberModal'),
    addMemberQuickBtn: document.getElementById('addMemberQuickBtn'),
    closeMemberModalBtn: document.getElementById('closeMemberModalBtn'),
    finishMemberModalBtn: document.getElementById('finishMemberModalBtn'),
    addMemberForm: document.getElementById('addMemberForm'),
    newMemberName: document.getElementById('newMemberName'),
    existingMembersList: document.getElementById('existingMembersList'),

    // Settle / Balance Elements
    settlementsList: document.getElementById('settlementsList'),
    allSettledState: document.getElementById('allSettledState'),
    balancesGrid: document.getElementById('balancesGrid'),
    copySettlementSummaryBtn: document.getElementById('copySettlementSummaryBtn'),

    // Settlement Record Modal
    settlePaymentModal: document.getElementById('settlePaymentModal'),
    settlePaymentForm: document.getElementById('settlePaymentForm'),
    closeSettlePaymentModalBtn: document.getElementById('closeSettlePaymentModalBtn'),
    cancelSettlePaymentModalBtn: document.getElementById('cancelSettlePaymentModalBtn'),
    settleNoticeText: document.getElementById('settleNoticeText'),
    settleFromMember: document.getElementById('settleFromMember'),
    settleToMember: document.getElementById('settleToMember'),
    settleAmountInput: document.getElementById('settleAmountInput'),
    settleNotes: document.getElementById('settleNotes'),

    // Share Modal
    shareModal: document.getElementById('shareModal'),
    shareGroupBtn: document.getElementById('shareGroupBtn'),
    closeShareModalBtn: document.getElementById('closeShareModalBtn'),
    shareLinkInput: document.getElementById('shareLinkInput'),
    copyShareLinkBtn: document.getElementById('copyShareLinkBtn'),
    whatsappShareBtn: document.getElementById('whatsappShareBtn'),
    copyTextSummaryBtn: document.getElementById('copyTextSummaryBtn'),
    qrcodeContainer: document.getElementById('qrcode'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    groupMenuBtn: document.getElementById('groupMenuBtn'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    loadSampleDataBtn: document.getElementById('loadSampleDataBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    importJsonInput: document.getElementById('importJsonInput'),
    resetAllDataBtn: document.getElementById('resetAllDataBtn'),

    // Supabase Modal
    supabaseModal: document.getElementById('supabaseModal'),
    openSupabaseModalBtn: document.getElementById('openSupabaseModalBtn'),
    closeSupabaseModalBtn: document.getElementById('closeSupabaseModalBtn'),
    supabaseConfigForm: document.getElementById('supabaseConfigForm'),
    supabaseUrlInput: document.getElementById('supabaseUrlInput'),
    supabaseKeyInput: document.getElementById('supabaseKeyInput'),
    supabaseGroupIdInput: document.getElementById('supabaseGroupIdInput'),
    disconnectSupabaseBtn: document.getElementById('disconnectSupabaseBtn'),
    copySqlSchemaBtn: document.getElementById('copySqlSchemaBtn'),

    // Analytics
    categoryBarsList: document.getElementById('categoryBarsList'),
    paidBarsList: document.getElementById('paidBarsList'),

    toastContainer: document.getElementById('toastContainer')
  };

  let currentSplitMode = 'EQUAL';
  let qrCodeInstance = null;

  // ==========================================================================
  // INITIALIZATION & URL / STORAGE / SUPABASE SYNC
  // ==========================================================================

  function init() {
    loadSupabaseConfig();
    loadStateFromUrlOrStorage();
    setupEventListeners();
    renderAll();

    // Check if Supabase credentials exist and initialize cloud sync
    if (supabaseConfig.url && supabaseConfig.key) {
      connectToSupabase(supabaseConfig.url, supabaseConfig.key, supabaseConfig.groupId);
    } else {
      updateDbStatusUI('offline');
    }

    // Set today's date in add expense modal by default
    el.expenseDate.value = new Date().toISOString().split('T')[0];
  }

  function loadSupabaseConfig() {
    const saved = localStorage.getItem('splitease_supabase_config');
    if (saved) {
      try {
        supabaseConfig = JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
  }

  function loadStateFromUrlOrStorage() {
    // 1. Check if URL contains shared state or room
    try {
      const hash = window.location.hash;
      if (hash) {
        // Direct Encoded State
        if (hash.startsWith('#data=')) {
          const encoded = hash.substring(6);
          const decoded = decodeURIComponent(atob(encoded));
          const parsed = JSON.parse(decoded);
          if (parsed && parsed.members && parsed.expenses) {
            state = parsed;
            showToast('Loaded shared group expenses from link! 🚀', 'success');
            saveStateToStorage();
            return;
          }
        }
        // Supabase Room Link
        if (hash.startsWith('#room=')) {
          const roomId = hash.substring(6).split('&')[0];
          if (roomId) {
            state.groupId = roomId;
            supabaseConfig.groupId = roomId;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse URL state', e);
    }

    // 2. Otherwise load from localStorage
    const saved = localStorage.getItem('splitease_state');
    if (saved) {
      try {
        state = JSON.parse(saved);
      } catch (e) {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
    }
  }

  function saveStateToStorage() {
    try {
      localStorage.setItem('splitease_state', JSON.stringify(state));
    } catch (e) {
      console.error('Storage error', e);
    }
  }

  function generateShareableUrl() {
    if (supabaseClient && supabaseConfig.groupId) {
      const baseUrl = window.location.origin + window.location.pathname;
      return `${baseUrl}#room=${encodeURIComponent(supabaseConfig.groupId)}`;
    }

    const compactState = {
      groupId: state.groupId,
      groupName: state.groupName,
      currency: state.currency,
      members: state.members,
      expenses: state.expenses
    };
    const json = JSON.stringify(compactState);
    const encoded = btoa(encodeURIComponent(json));
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#data=${encoded}`;
  }

  // ==========================================================================
  // SUPABASE DATABASE & REAL-TIME ENGINE
  // ==========================================================================

  async function connectToSupabase(url, key, groupId) {
    if (!window.supabase) {
      showToast('Supabase library not loaded. Check internet connection.', 'error');
      return;
    }

    updateDbStatusUI('syncing');

    try {
      supabaseClient = window.supabase.createClient(url, key);
      supabaseConfig = { url, key, groupId: groupId || 'default-trip' };
      localStorage.setItem('splitease_supabase_config', JSON.stringify(supabaseConfig));
      state.groupId = supabaseConfig.groupId;

      // 1. Check or Create Group Record
      const { data: groupData, error: groupErr } = await supabaseClient
        .from('groups')
        .select('*')
        .eq('id', state.groupId)
        .single();

      if (groupErr && groupErr.code === 'PGRST116') {
        // Group doesn't exist yet, insert local state into Supabase
        await supabaseClient.from('groups').insert({
          id: state.groupId,
          name: state.groupName,
          currency: state.currency
        });

        // Insert initial members
        for (const m of state.members) {
          await supabaseClient.from('members').upsert({
            id: m.id,
            group_id: state.groupId,
            name: m.name,
            color: m.color
          });
        }

        // Insert initial expenses
        for (const exp of state.expenses) {
          await supabaseClient.from('expenses').upsert({
            id: exp.id,
            group_id: state.groupId,
            title: exp.title,
            amount: exp.amount,
            category: exp.category,
            paid_by: exp.paidBy,
            date: exp.date,
            split_mode: exp.splitMode,
            splits: exp.splits,
            is_settlement: exp.isSettlement
          });
        }
      } else if (groupData) {
        // Group exists in Supabase, load cloud records
        state.groupName = groupData.name || state.groupName;
        state.currency = groupData.currency || state.currency;

        // Fetch members
        const { data: membersData } = await supabaseClient
          .from('members')
          .select('*')
          .eq('group_id', state.groupId);
        if (membersData && membersData.length > 0) {
          state.members = membersData.map(m => ({ id: m.id, name: m.name, color: m.color }));
        }

        // Fetch expenses
        const { data: expensesData } = await supabaseClient
          .from('expenses')
          .select('*')
          .eq('group_id', state.groupId);
        if (expensesData) {
          state.expenses = expensesData.map(e => ({
            id: e.id,
            title: e.title,
            amount: parseFloat(e.amount) || 0,
            category: e.category,
            paidBy: e.paid_by,
            date: e.date,
            splitMode: e.split_mode,
            splits: e.splits || {},
            isSettlement: e.is_settlement
          }));
        }
      }

      // 2. Setup Realtime Subscription
      setupSupabaseRealtime(state.groupId);

      updateDbStatusUI('online');
      saveStateToStorage();
      renderAll();
      showToast('Connected to Supabase! Real-time live sync active 🟢', 'success');
      el.supabaseModal.classList.add('hidden');
    } catch (err) {
      console.error('Supabase connection error:', err);
      updateDbStatusUI('offline');
      showToast('Supabase connection failed. Check URL & Key.', 'error');
    }
  }

  function setupSupabaseRealtime(groupId) {
    if (!supabaseClient) return;
    if (supabaseRealtimeChannel) {
      supabaseClient.removeChannel(supabaseRealtimeChannel);
    }

    supabaseRealtimeChannel = supabaseClient.channel(`room:${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` }, payload => {
        handleRealtimeExpense(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `group_id=eq.${groupId}` }, payload => {
        handleRealtimeMember(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, payload => {
        handleRealtimeGroup(payload);
      })
      .subscribe();
  }

  function handleRealtimeExpense(payload) {
    const { eventType, new: newRec, old: oldRec } = payload;
    if (eventType === 'INSERT') {
      if (!state.expenses.some(e => e.id === newRec.id)) {
        state.expenses.unshift({
          id: newRec.id,
          title: newRec.title,
          amount: parseFloat(newRec.amount) || 0,
          category: newRec.category,
          paidBy: newRec.paid_by,
          date: newRec.date,
          splitMode: newRec.split_mode,
          splits: newRec.splits || {},
          isSettlement: newRec.is_settlement
        });
        showToast(`Synced new expense: ${newRec.title} ⚡`, 'success');
      }
    } else if (eventType === 'UPDATE') {
      const idx = state.expenses.findIndex(e => e.id === newRec.id);
      if (idx !== -1) {
        state.expenses[idx] = {
          id: newRec.id,
          title: newRec.title,
          amount: parseFloat(newRec.amount) || 0,
          category: newRec.category,
          paidBy: newRec.paid_by,
          date: newRec.date,
          splitMode: newRec.split_mode,
          splits: newRec.splits || {},
          isSettlement: newRec.is_settlement
        };
      }
    } else if (eventType === 'DELETE') {
      state.expenses = state.expenses.filter(e => e.id !== oldRec.id);
    }
    saveStateToStorage();
    renderAll();
  }

  function handleRealtimeMember(payload) {
    const { eventType, new: newRec, old: oldRec } = payload;
    if (eventType === 'INSERT') {
      if (!state.members.some(m => m.id === newRec.id)) {
        state.members.push({ id: newRec.id, name: newRec.name, color: newRec.color });
      }
    } else if (eventType === 'DELETE') {
      state.members = state.members.filter(m => m.id !== oldRec.id);
    }
    saveStateToStorage();
    renderAll();
  }

  function handleRealtimeGroup(payload) {
    const { new: newRec } = payload;
    if (newRec) {
      state.groupName = newRec.name || state.groupName;
      state.currency = newRec.currency || state.currency;
      saveStateToStorage();
      renderAll();
    }
  }

  function updateDbStatusUI(status) {
    if (status === 'online') {
      el.dbStatusDot.className = 'status-dot status-online';
      el.dbStatusText.textContent = 'Supabase Live';
      el.supabaseStatusBadge.textContent = `Connected (${supabaseConfig.groupId})`;
      el.supabaseStatusBadge.className = 'badge badge-subtle text-xs text-accent';
    } else if (status === 'syncing') {
      el.dbStatusDot.className = 'status-dot status-syncing';
      el.dbStatusText.textContent = 'Syncing...';
      el.supabaseStatusBadge.textContent = 'Connecting...';
    } else {
      el.dbStatusDot.className = 'status-dot status-offline';
      el.dbStatusText.textContent = 'Local Mode';
      el.supabaseStatusBadge.textContent = 'Local Storage (Not Connected)';
      el.supabaseStatusBadge.className = 'badge badge-subtle text-xs';
    }
  }

  function disconnectSupabase() {
    supabaseClient = null;
    if (supabaseRealtimeChannel) {
      supabaseRealtimeChannel.unsubscribe();
      supabaseRealtimeChannel = null;
    }
    localStorage.removeItem('splitease_supabase_config');
    supabaseConfig = { url: '', key: '', groupId: 'default-trip' };
    updateDbStatusUI('offline');
    el.supabaseModal.classList.add('hidden');
    showToast('Switched to Local Storage mode.', 'success');
  }

  // ==========================================================================
  // DEBT SIMPLIFICATION ALGORITHM (Min Cash Flow Algorithm)
  // ==========================================================================

  function calculateNetBalances() {
    const netBalances = {};
    state.members.forEach(m => {
      netBalances[m.id] = 0;
    });

    state.expenses.forEach(exp => {
      const payerId = exp.paidBy;
      const totalAmount = parseFloat(exp.amount) || 0;

      // The payer gets credited
      if (netBalances[payerId] !== undefined) {
        netBalances[payerId] += totalAmount;
      }

      // Each participant owes their split share
      if (exp.splits) {
        Object.entries(exp.splits).forEach(([memId, share]) => {
          if (netBalances[memId] !== undefined) {
            netBalances[memId] -= parseFloat(share) || 0;
          }
        });
      }
    });

    return netBalances;
  }

  /**
   * Computes the minimal number of direct transfers to settle all debts.
   */
  function calculateOptimalSettlements(netBalances) {
    const debtors = [];  // People who owe money (negative balance)
    const creditors = []; // People who are owed money (positive balance)

    Object.entries(netBalances).forEach(([memberId, balance]) => {
      const rounded = Math.round(balance * 100) / 100;
      if (rounded < -0.01) {
        debtors.push({ id: memberId, amount: -rounded });
      } else if (rounded > 0.01) {
        creditors.push({ id: memberId, amount: rounded });
      }
    });

    // Sort descending by amount
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements = [];
    let i = 0; // debtor index
    let j = 0; // creditor index

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const settleAmount = Math.min(debtor.amount, creditor.amount);
      if (settleAmount > 0.01) {
        settlements.push({
          from: debtor.id,
          to: creditor.id,
          amount: Math.round(settleAmount * 100) / 100
        });
      }

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount <= 0.01) i++;
      if (creditor.amount <= 0.01) j++;
    }

    return settlements;
  }

  // ==========================================================================
  // RENDERING FUNCTIONS
  // ==========================================================================

  function renderAll() {
    renderHeaderInfo();
    renderMembersChipList();
    renderExpensesList();
    renderSettlementsAndBalances();
    renderAnalytics();
    updateCurrencySymbols();
  }

  function renderHeaderInfo() {
    el.groupNameDisplay.innerText = state.groupName || 'Untitled Group';
    el.currencySelect.value = state.currency || '₹';
    
    // Count real expenses (excluding pure settlements from total spend)
    const nonSettlementExpenses = state.expenses.filter(e => !e.isSettlement);
    const total = nonSettlementExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const memberCount = state.members.length;
    const avg = memberCount > 0 ? total / memberCount : 0;

    el.totalExpenseAmount.textContent = formatCurrency(total);
    el.avgExpenseAmount.textContent = formatCurrency(avg);
    el.totalExpenseCount.textContent = state.expenses.length;
    el.groupMembersCount.textContent = `${memberCount} friend${memberCount === 1 ? '' : 's'} in this group`;

    el.expensesBadgeCount.textContent = state.expenses.length;
  }

  function renderMembersChipList() {
    el.membersChipList.innerHTML = '';
    state.members.forEach(member => {
      const chip = document.createElement('div');
      chip.className = 'member-chip';
      chip.innerHTML = `
        <div class="member-avatar" style="background-color: ${member.color || '#3b82f6'};">
          ${getInitials(member.name)}
        </div>
        <span>${escapeHtml(member.name)}</span>
      `;
      el.membersChipList.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'member-chip-btn-add';
    addBtn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Edit Friends`;
    addBtn.addEventListener('click', openMembersModal);
    el.membersChipList.appendChild(addBtn);
  }

  function renderExpensesList() {
    const searchTerm = (el.expenseSearchInput.value || '').toLowerCase().trim();
    const filterCat = el.filterCategorySelect.value;

    const filtered = state.expenses.filter(exp => {
      if (filterCat !== 'ALL' && exp.category !== filterCat) {
        return false;
      }
      if (searchTerm) {
        const payer = getMemberById(exp.paidBy);
        const payerName = payer ? payer.name.toLowerCase() : '';
        const titleMatch = (exp.title || '').toLowerCase().includes(searchTerm);
        const catMatch = (exp.category || '').toLowerCase().includes(searchTerm);
        const payerMatch = payerName.includes(searchTerm);
        if (!titleMatch && !catMatch && !payerMatch) {
          return false;
        }
      }
      return true;
    });

    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    el.expensesList.innerHTML = '';

    if (filtered.length === 0) {
      el.expensesEmptyState.classList.remove('hidden');
    } else {
      el.expensesEmptyState.classList.add('hidden');

      filtered.forEach(exp => {
        const payer = getMemberById(exp.paidBy);
        const catMeta = CATEGORY_META[exp.category] || CATEGORY_META.Other;
        const participantIds = Object.keys(exp.splits || {});
        const count = participantIds.length;

        const card = document.createElement('div');
        card.className = `expense-card ${exp.isSettlement ? 'is-settlement' : ''}`;

        card.innerHTML = `
          <div class="expense-card-left">
            <div class="category-icon-box" style="color: ${catMeta.color}; background-color: ${catMeta.color}18;">
              <i class="fa-solid ${catMeta.icon}"></i>
            </div>
            <div class="expense-details">
              <div class="expense-title-row">
                <span class="expense-title">${escapeHtml(exp.title)}</span>
                ${exp.isSettlement ? '<span class="badge badge-subtle">Settlement</span>' : ''}
              </div>
              <div class="expense-meta">
                <span>Paid by <strong class="expense-payer-tag">${payer ? escapeHtml(payer.name) : 'Unknown'}</strong></span>
                <span>•</span>
                <span>${formatDate(exp.date)}</span>
                ${!exp.isSettlement ? `<span>•</span><span>Split between ${count} friend${count === 1 ? '' : 's'}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="expense-card-right">
            <div class="expense-amount-display">
              <div class="expense-total">${formatCurrency(exp.amount)}</div>
              ${!exp.isSettlement && count > 0 ? `<div class="expense-per-person">${formatCurrency(exp.amount / count)} / person</div>` : ''}
            </div>

            <div class="expense-card-actions">
              <button class="action-icon-btn btn-edit" title="Edit Expense" data-id="${exp.id}">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="action-icon-btn btn-delete" title="Delete Expense" data-id="${exp.id}">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        `;

        card.querySelector('.btn-edit').addEventListener('click', () => openEditExpenseModal(exp.id));
        card.querySelector('.btn-delete').addEventListener('click', () => deleteExpense(exp.id));

        el.expensesList.appendChild(card);
      });
    }
  }

  function renderSettlementsAndBalances() {
    const netBalances = calculateNetBalances();
    const settlements = calculateOptimalSettlements(netBalances);

    el.settleBadgeCount.textContent = settlements.length;

    // 1. Render Settlements
    el.settlementsList.innerHTML = '';
    if (settlements.length === 0) {
      el.allSettledState.classList.remove('hidden');
    } else {
      el.allSettledState.classList.add('hidden');

      settlements.forEach(s => {
        const fromMem = getMemberById(s.from);
        const toMem = getMemberById(s.to);

        const row = document.createElement('div');
        row.className = 'settle-row';
        row.innerHTML = `
          <div class="settle-instruction">
            <div class="settle-payer">
              <div class="member-avatar" style="background-color: ${fromMem?.color || '#3b82f6'}; width: 24px; height: 24px; font-size: 0.65rem;">
                ${getInitials(fromMem?.name || '')}
              </div>
              <span>${escapeHtml(fromMem?.name || 'Someone')}</span>
            </div>
            
            <i class="fa-solid fa-arrow-right-long settle-arrow"></i>

            <div class="settle-receiver">
              <div class="member-avatar" style="background-color: ${toMem?.color || '#10b981'}; width: 24px; height: 24px; font-size: 0.65rem;">
                ${getInitials(toMem?.name || '')}
              </div>
              <span>${escapeHtml(toMem?.name || 'Someone')}</span>
            </div>
          </div>

          <div class="settle-amount">${formatCurrency(s.amount)}</div>

          <button class="btn btn-sm btn-primary-glow btn-record-settle" 
                  data-from="${s.from}" data-to="${s.to}" data-amount="${s.amount}">
            <i class="fa-solid fa-check"></i> Settle
          </button>
        `;

        row.querySelector('.btn-record-settle').addEventListener('click', () => {
          openSettlePaymentModal(s.from, s.to, s.amount);
        });

        el.settlementsList.appendChild(row);
      });
    }

    // 2. Render Member Balances Cards
    el.balancesGrid.innerHTML = '';
    state.members.forEach(member => {
      const balance = netBalances[member.id] || 0;
      const rounded = Math.round(balance * 100) / 100;
      let statusClass = 'is-zero';
      let statusLabel = 'Settled Up';

      if (rounded > 0.01) {
        statusClass = 'is-positive';
        statusLabel = 'Gets back in total';
      } else if (rounded < -0.01) {
        statusClass = 'is-negative';
        statusLabel = 'Owes in total';
      }

      const card = document.createElement('div');
      card.className = `balance-card ${statusClass}`;
      card.innerHTML = `
        <div class="balance-card-header">
          <div class="member-avatar" style="background-color: ${member.color || '#3b82f6'};">
            ${getInitials(member.name)}
          </div>
          <span class="balance-member-name">${escapeHtml(member.name)}</span>
        </div>
        <div>
          <div class="balance-status-label">${statusLabel}</div>
          <div class="balance-status-amount">${rounded >= 0 ? '+' : ''}${formatCurrency(rounded)}</div>
        </div>
      `;

      el.balancesGrid.appendChild(card);
    });
  }

  function renderAnalytics() {
    // 1. Spending by Category
    const nonSettlementExpenses = state.expenses.filter(e => !e.isSettlement);
    const categoryTotals = {};
    let grandTotal = 0;

    nonSettlementExpenses.forEach(exp => {
      const amt = parseFloat(exp.amount) || 0;
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + amt;
      grandTotal += amt;
    });

    el.categoryBarsList.innerHTML = '';
    if (grandTotal === 0) {
      el.categoryBarsList.innerHTML = '<p class="text-sm text-muted">No expense data to display yet.</p>';
    } else {
      Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
        const percentage = Math.round((amt / grandTotal) * 100);
        const meta = CATEGORY_META[cat] || CATEGORY_META.Other;

        const item = document.createElement('div');
        item.className = 'progress-bar-item';
        item.innerHTML = `
          <div class="progress-bar-label">
            <span><i class="fa-solid ${meta.icon}"></i> ${escapeHtml(meta.label || cat)}</span>
            <span><strong>${formatCurrency(amt)}</strong> (${percentage}%)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${percentage}%; background-color: ${meta.color};"></div>
          </div>
        `;
        el.categoryBarsList.appendChild(item);
      });
    }

    // 2. Who Paid What
    const payerTotals = {};
    state.members.forEach(m => payerTotals[m.id] = 0);

    nonSettlementExpenses.forEach(exp => {
      const amt = parseFloat(exp.amount) || 0;
      if (payerTotals[exp.paidBy] !== undefined) {
        payerTotals[exp.paidBy] += amt;
      }
    });

    el.paidBarsList.innerHTML = '';
    if (grandTotal === 0) {
      el.paidBarsList.innerHTML = '<p class="text-sm text-muted">No payments recorded yet.</p>';
    } else {
      state.members.forEach(member => {
        const amt = payerTotals[member.id] || 0;
        const percentage = grandTotal > 0 ? Math.round((amt / grandTotal) * 100) : 0;

        const item = document.createElement('div');
        item.className = 'progress-bar-item';
        item.innerHTML = `
          <div class="progress-bar-label">
            <span>${escapeHtml(member.name)}</span>
            <span><strong>${formatCurrency(amt)}</strong> (${percentage}%)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${percentage}%; background-color: ${member.color || '#3b82f6'};"></div>
          </div>
        `;
        el.paidBarsList.appendChild(item);
      });
    }
  }

  function updateCurrencySymbols() {
    el.currencySymbolLabels.forEach(label => {
      label.textContent = state.currency || '₹';
    });
  }

  // ==========================================================================
  // MODAL & EXPENSE CONTROLS
  // ==========================================================================

  function populatePayerDropdown(selectedId) {
    el.expensePaidBy.innerHTML = '';
    state.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === selectedId) opt.selected = true;
      el.expensePaidBy.appendChild(opt);
    });
  }

  function populateSplitChecklist(existingSplits = null) {
    el.splitMembersList.innerHTML = '';

    state.members.forEach(member => {
      const isChecked = existingSplits ? (existingSplits[member.id] !== undefined) : true;
      const exactVal = existingSplits && existingSplits[member.id] !== undefined ? existingSplits[member.id] : '';

      const row = document.createElement('div');
      row.className = 'split-member-row';
      row.innerHTML = `
        <label class="split-member-left">
          <input type="checkbox" class="split-checkbox" value="${member.id}" ${isChecked ? 'checked' : ''} />
          <div class="member-avatar" style="background-color: ${member.color}; width: 22px; height: 22px; font-size: 0.65rem;">
            ${getInitials(member.name)}
          </div>
          <span>${escapeHtml(member.name)}</span>
        </label>
        <div class="split-exact-wrapper ${currentSplitMode === 'EXACT' ? '' : 'hidden'}">
          <input type="number" step="0.01" min="0" class="split-member-exact-input" 
                 data-member="${member.id}" placeholder="0.00" value="${exactVal}" />
        </div>
      `;

      el.splitMembersList.appendChild(row);
    });

    el.splitMembersList.querySelectorAll('.split-checkbox').forEach(cb => {
      cb.addEventListener('change', updateSplitSummary);
    });
    el.splitMembersList.querySelectorAll('.split-member-exact-input').forEach(input => {
      input.addEventListener('input', updateSplitSummary);
    });

    updateSplitSummary();
  }

  function updateSplitSummary() {
    const totalAmount = parseFloat(el.expenseAmount.value) || 0;
    const checkedBoxes = Array.from(el.splitMembersList.querySelectorAll('.split-checkbox:checked'));
    const count = checkedBoxes.length;

    if (currentSplitMode === 'EQUAL') {
      if (count === 0) {
        el.splitSummaryInfo.textContent = 'Select at least 1 person to split among.';
        el.splitSummaryInfo.style.color = 'var(--color-negative)';
      } else {
        const perPerson = totalAmount > 0 ? (totalAmount / count) : 0;
        el.splitSummaryInfo.textContent = `Split equally between ${count} friend${count === 1 ? '' : 's'} (${formatCurrency(perPerson)} each)`;
        el.splitSummaryInfo.style.color = 'var(--accent-primary)';
      }
    } else {
      let enteredTotal = 0;
      el.splitMembersList.querySelectorAll('.split-member-exact-input').forEach(input => {
        enteredTotal += parseFloat(input.value) || 0;
      });
      const diff = totalAmount - enteredTotal;
      if (Math.abs(diff) < 0.01) {
        el.splitSummaryInfo.textContent = `Exact sum matches total: ${formatCurrency(totalAmount)} ✓`;
        el.splitSummaryInfo.style.color = 'var(--accent-primary)';
      } else if (diff > 0) {
        el.splitSummaryInfo.textContent = `${formatCurrency(diff)} remaining to allocate.`;
        el.splitSummaryInfo.style.color = 'var(--color-warning)';
      } else {
        el.splitSummaryInfo.textContent = `${formatCurrency(Math.abs(diff))} over total amount!`;
        el.splitSummaryInfo.style.color = 'var(--color-negative)';
      }
    }
  }

  function openAddExpenseModal() {
    if (state.members.length === 0) {
      showToast('Please add at least one friend first!', 'error');
      openMembersModal();
      return;
    }

    el.expenseModalTitle.innerHTML = '<i class="fa-solid fa-receipt"></i> Add New Expense';
    el.editExpenseId.value = '';
    el.expenseTitle.value = '';
    el.expenseAmount.value = '';
    el.expenseCategory.value = 'Food';
    el.expenseDate.value = new Date().toISOString().split('T')[0];

    currentSplitMode = 'EQUAL';
    setSplitModeSegment('EQUAL');

    populatePayerDropdown();
    populateSplitChecklist();

    el.expenseModal.classList.remove('hidden');
  }

  function openEditExpenseModal(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;

    el.expenseModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Expense';
    el.editExpenseId.value = exp.id;
    el.expenseTitle.value = exp.title;
    el.expenseAmount.value = exp.amount;
    el.expenseCategory.value = exp.category;
    el.expenseDate.value = exp.date;

    currentSplitMode = exp.splitMode || 'EQUAL';
    setSplitModeSegment(currentSplitMode);

    populatePayerDropdown(exp.paidBy);
    populateSplitChecklist(exp.splits);

    el.expenseModal.classList.remove('hidden');
  }

  function setSplitModeSegment(mode) {
    currentSplitMode = mode;
    el.segmentBtns.forEach(btn => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const exactInputs = el.splitMembersList.querySelectorAll('.split-exact-wrapper');
    exactInputs.forEach(w => {
      if (mode === 'EXACT') w.classList.remove('hidden');
      else w.classList.add('hidden');
    });
    updateSplitSummary();
  }

  async function saveExpense(e) {
    e.preventDefault();

    const title = el.expenseTitle.value.trim();
    const amount = parseFloat(el.expenseAmount.value);
    const category = el.expenseCategory.value;
    const paidBy = el.expensePaidBy.value;
    const date = el.expenseDate.value;
    const editId = el.editExpenseId.value;

    if (!title || isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid title and amount.', 'error');
      return;
    }

    const splits = {};

    if (currentSplitMode === 'EQUAL') {
      const checkedBoxes = Array.from(el.splitMembersList.querySelectorAll('.split-checkbox:checked'));
      if (checkedBoxes.length === 0) {
        showToast('Please select at least 1 person to split among.', 'error');
        return;
      }
      const perPerson = Math.round((amount / checkedBoxes.length) * 100) / 100;
      let totalAssigned = 0;

      checkedBoxes.forEach((cb, idx) => {
        if (idx === checkedBoxes.length - 1) {
          splits[cb.value] = Math.round((amount - totalAssigned) * 100) / 100;
        } else {
          splits[cb.value] = perPerson;
          totalAssigned += perPerson;
        }
      });
    } else {
      let sum = 0;
      el.splitMembersList.querySelectorAll('.split-member-exact-input').forEach(input => {
        const memId = input.dataset.member;
        const memAmt = parseFloat(input.value) || 0;
        if (memAmt > 0) {
          splits[memId] = memAmt;
          sum += memAmt;
        }
      });

      if (Math.abs(sum - amount) > 0.05) {
        showToast(`Sum of exact splits (${formatCurrency(sum)}) must equal total amount (${formatCurrency(amount)}).`, 'error');
        return;
      }
    }

    let savedExp = null;

    if (editId) {
      const idx = state.expenses.findIndex(e => e.id === editId);
      if (idx !== -1) {
        state.expenses[idx] = {
          ...state.expenses[idx],
          title,
          amount,
          category,
          paidBy,
          date,
          splitMode: currentSplitMode,
          splits
        };
        savedExp = state.expenses[idx];
        showToast('Expense updated successfully! ✨', 'success');
      }
    } else {
      savedExp = {
        id: 'exp-' + Date.now(),
        title,
        amount,
        category,
        paidBy,
        date,
        splitMode: currentSplitMode,
        splits,
        isSettlement: false
      };
      state.expenses.unshift(savedExp);
      showToast('Expense added! 🎉', 'success');
    }

    saveStateToStorage();
    renderAll();
    el.expenseModal.classList.add('hidden');

    // Sync to Supabase if connected
    if (supabaseClient && savedExp) {
      try {
        await supabaseClient.from('expenses').upsert({
          id: savedExp.id,
          group_id: state.groupId,
          title: savedExp.title,
          amount: savedExp.amount,
          category: savedExp.category,
          paid_by: savedExp.paidBy,
          date: savedExp.date,
          split_mode: savedExp.splitMode,
          splits: savedExp.splits,
          is_settlement: savedExp.isSettlement
        });
      } catch (err) {
        console.error('Supabase expense upsert error', err);
      }
    }
  }

  async function deleteExpense(id) {
    if (confirm('Are you sure you want to delete this expense?')) {
      state.expenses = state.expenses.filter(e => e.id !== id);
      saveStateToStorage();
      renderAll();
      showToast('Expense deleted.', 'success');

      if (supabaseClient) {
        try {
          await supabaseClient.from('expenses').delete().eq('id', id);
        } catch (err) {
          console.error('Supabase expense delete error', err);
        }
      }
    }
  }

  // ==========================================================================
  // SETTLEMENT PAYMENTS MODAL
  // ==========================================================================

  function openSettlePaymentModal(fromId, toId, defaultAmount) {
    const fromMem = getMemberById(fromId);
    const toMem = getMemberById(toId);

    el.settleFromMember.value = fromId;
    el.settleToMember.value = toId;
    el.settleAmountInput.value = defaultAmount;
    el.settleNotes.value = '';

    el.settleNoticeText.innerHTML = `Recording direct payment from <strong>${escapeHtml(fromMem?.name || 'Someone')}</strong> to <strong>${escapeHtml(toMem?.name || 'Someone')}</strong>`;

    el.settlePaymentModal.classList.remove('hidden');
  }

  async function recordSettlementPayment(e) {
    e.preventDefault();

    const fromId = el.settleFromMember.value;
    const toId = el.settleToMember.value;
    const amount = parseFloat(el.settleAmountInput.value);
    const notes = el.settleNotes.value.trim();

    if (!fromId || !toId || isNaN(amount) || amount <= 0) {
      showToast('Invalid settlement amount.', 'error');
      return;
    }

    const fromMem = getMemberById(fromId);
    const toMem = getMemberById(toId);

    const newSettlementExp = {
      id: 'settle-' + Date.now(),
      title: `Payment: ${fromMem?.name} ➔ ${toMem?.name} ${notes ? '(' + notes + ')' : ''}`,
      amount: amount,
      paidBy: fromId,
      category: 'Settlement',
      date: new Date().toISOString().split('T')[0],
      splitMode: 'EXACT',
      splits: { [toId]: amount },
      isSettlement: true
    };

    state.expenses.unshift(newSettlementExp);
    saveStateToStorage();
    renderAll();

    el.settlePaymentModal.classList.add('hidden');
    showToast('Payment recorded successfully! 🤝', 'success');

    if (supabaseClient) {
      try {
        await supabaseClient.from('expenses').upsert({
          id: newSettlementExp.id,
          group_id: state.groupId,
          title: newSettlementExp.title,
          amount: newSettlementExp.amount,
          category: newSettlementExp.category,
          paid_by: newSettlementExp.paidBy,
          date: newSettlementExp.date,
          split_mode: newSettlementExp.splitMode,
          splits: newSettlementExp.splits,
          is_settlement: true
        });
      } catch (err) {
        console.error('Supabase settlement sync error', err);
      }
    }

    const netBalances = calculateNetBalances();
    const remaining = calculateOptimalSettlements(netBalances);
    if (remaining.length === 0 && typeof confetti === 'function') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  // ==========================================================================
  // MEMBERS MANAGEMENT MODAL
  // ==========================================================================

  function openMembersModal() {
    renderExistingMembersList();
    el.memberModal.classList.remove('hidden');
  }

  function renderExistingMembersList() {
    el.existingMembersList.innerHTML = '';
    state.members.forEach(m => {
      const row = document.createElement('div');
      row.className = 'setting-item';
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <div class="member-avatar" style="background-color: ${m.color || '#3b82f6'};">
            ${getInitials(m.name)}
          </div>
          <strong>${escapeHtml(m.name)}</strong>
        </div>
        <button class="action-icon-btn btn-delete btn-remove-member" title="Remove Friend" data-id="${m.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;

      row.querySelector('.btn-remove-member').addEventListener('click', () => {
        removeMember(m.id);
      });

      el.existingMembersList.appendChild(row);
    });
  }

  async function addMember(e) {
    e.preventDefault();
    const name = el.newMemberName.value.trim();
    if (!name) return;

    const newId = 'm-' + Date.now();
    const color = AVATAR_COLORS[state.members.length % AVATAR_COLORS.length];
    const newMember = { id: newId, name, color };

    state.members.push(newMember);
    el.newMemberName.value = '';

    saveStateToStorage();
    renderExistingMembersList();
    renderAll();
    showToast(`Added ${name} to group!`, 'success');

    if (supabaseClient) {
      try {
        await supabaseClient.from('members').insert({
          id: newMember.id,
          group_id: state.groupId,
          name: newMember.name,
          color: newMember.color
        });
      } catch (err) {
        console.error('Supabase member insert error', err);
      }
    }
  }

  async function removeMember(memberId) {
    const hasExpense = state.expenses.some(e => e.paidBy === memberId || (e.splits && e.splits[memberId] !== undefined));
    if (hasExpense) {
      if (!confirm('This member has recorded expenses. Removing them may affect balances. Continue?')) {
        return;
      }
    }

    state.members = state.members.filter(m => m.id !== memberId);
    saveStateToStorage();
    renderExistingMembersList();
    renderAll();
    showToast('Member removed.', 'success');

    if (supabaseClient) {
      try {
        await supabaseClient.from('members').delete().eq('id', memberId);
      } catch (err) {
        console.error('Supabase member delete error', err);
      }
    }
  }

  // ==========================================================================
  // SHARING & BACKUP FEATURES
  // ==========================================================================

  function openShareModal() {
    const url = generateShareableUrl();
    el.shareLinkInput.value = url;

    const textSummary = generateTextSummary();
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textSummary + '\n\n🔗 View & update in SplitEase:\n' + url)}`;
    el.whatsappShareBtn.href = whatsappUrl;

    el.qrcodeContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      qrCodeInstance = new QRCode(el.qrcodeContainer, {
        text: url,
        width: 140,
        height: 140,
        colorDark: '#0b0f19',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    el.shareModal.classList.remove('hidden');
  }

  function generateTextSummary() {
    const nonSettlementExpenses = state.expenses.filter(e => !e.isSettlement);
    const total = nonSettlementExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const netBalances = calculateNetBalances();
    const settlements = calculateOptimalSettlements(netBalances);

    let summary = `📊 *${state.groupName}* — Expense Summary\n`;
    summary += `💰 Total Expenses: ${formatCurrency(total)} (${state.expenses.length} records)\n`;
    summary += `👥 Members (${state.members.length}): ${state.members.map(m => m.name).join(', ')}\n\n`;

    summary += `⚡ *Settlements (Who owes Who):*\n`;
    if (settlements.length === 0) {
      summary += `🎉 All settled up! No pending debts.\n`;
    } else {
      settlements.forEach(s => {
        const fromMem = getMemberById(s.from);
        const toMem = getMemberById(s.to);
        summary += `• ${fromMem?.name} ➔ pays ${toMem?.name}: ${formatCurrency(s.amount)}\n`;
      });
    }

    return summary;
  }

  function copyTextSummary() {
    const summary = generateTextSummary() + '\n🔗 Open link: ' + generateShareableUrl();
    navigator.clipboard.writeText(summary).then(() => {
      showToast('Expense summary copied to clipboard! 📋', 'success');
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  }

  function copyShareLink() {
    navigator.clipboard.writeText(el.shareLinkInput.value).then(() => {
      showToast('Shareable Link copied! Send it to your friends 🚀', 'success');
    });
  }

  function exportDataAsJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `SplitEase_${state.groupName.replace(/\s+/g, '_')}_Backup.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Group data exported to JSON!', 'success');
  }

  function importDataFromJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (parsed.members && parsed.expenses) {
          state = parsed;
          saveStateToStorage();
          renderAll();
          el.settingsModal.classList.add('hidden');
          showToast('Backup restored successfully! 🎉', 'success');
        } else {
          showToast('Invalid JSON backup file format.', 'error');
        }
      } catch (err) {
        showToast('Error parsing JSON file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    if (confirm('Are you sure you want to clear all data and start a new group?')) {
      state = {
        groupId: 'room-' + Date.now(),
        groupName: 'New Group 🌟',
        currency: '₹',
        members: [
          { id: 'm1', name: 'You', color: AVATAR_COLORS[0] },
          { id: 'm2', name: 'Friend 1', color: AVATAR_COLORS[1] }
        ],
        expenses: []
      };
      saveStateToStorage();
      renderAll();
      el.settingsModal.classList.add('hidden');
      showToast('Group reset to blank!', 'success');
    }
  }

  function loadSampleData() {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveStateToStorage();
    renderAll();
    el.settingsModal.classList.add('hidden');
    showToast('Sample demo loaded! 🌴', 'success');
  }

  // ==========================================================================
  // EVENT LISTENERS & UI SETUP
  // ==========================================================================

  function switchTab(tabName) {
    el.tabBtns.forEach(btn => {
      if (btn.dataset.tab === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    document.querySelectorAll('.mobile-nav-item[data-tab]').forEach(btn => {
      if (btn.dataset.tab === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    el.tabPanels.forEach(panel => {
      if (panel.id === `tab-${tabName}`) panel.classList.add('active');
      else panel.classList.remove('active');
    });
  }

  function setupEventListeners() {
    // Desktop Tabs Navigation
    el.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Mobile Bottom Dock Tabs
    document.querySelectorAll('.mobile-nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Mobile Bottom Dock Actions
    const mobileNavAddBtn = document.getElementById('mobileNavAddBtn');
    if (mobileNavAddBtn) {
      mobileNavAddBtn.addEventListener('click', openAddExpenseModal);
    }

    const mobileNavShareBtn = document.getElementById('mobileNavShareBtn');
    if (mobileNavShareBtn) {
      mobileNavShareBtn.addEventListener('click', openShareModal);
    }

    // Group Name Inline Editing
    el.groupNameDisplay.addEventListener('blur', async () => {
      state.groupName = el.groupNameDisplay.innerText.trim() || 'Untitled Group';
      saveStateToStorage();
      renderHeaderInfo();

      if (supabaseClient) {
        await supabaseClient.from('groups').update({ name: state.groupName }).eq('id', state.groupId);
      }
    });

    el.groupNameDisplay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.groupNameDisplay.blur();
      }
    });

    el.renameGroupBtn.addEventListener('click', () => {
      el.groupNameDisplay.focus();
    });

    // Currency Change
    el.currencySelect.addEventListener('change', async () => {
      state.currency = el.currencySelect.value;
      saveStateToStorage();
      renderAll();

      if (supabaseClient) {
        await supabaseClient.from('groups').update({ currency: state.currency }).eq('id', state.groupId);
      }
    });

    // Search & Filter
    el.expenseSearchInput.addEventListener('input', renderExpensesList);
    el.filterCategorySelect.addEventListener('change', renderExpensesList);

    // Add Expense Buttons
    el.openAddExpenseBtn.addEventListener('click', openAddExpenseModal);
    el.emptyAddExpenseBtn.addEventListener('click', openAddExpenseModal);
    el.mobileAddExpenseBtn.addEventListener('click', openAddExpenseModal);

    // Expense Form & Modal
    el.closeExpenseModalBtn.addEventListener('click', () => el.expenseModal.classList.add('hidden'));
    el.cancelExpenseModalBtn.addEventListener('click', () => el.expenseModal.classList.add('hidden'));
    el.expenseForm.addEventListener('submit', saveExpense);
    el.expenseAmount.addEventListener('input', updateSplitSummary);

    // Split Mode Segments
    el.segmentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setSplitModeSegment(btn.dataset.mode);
      });
    });

    // Member Modal
    el.addMemberQuickBtn.addEventListener('click', openMembersModal);
    el.closeMemberModalBtn.addEventListener('click', () => el.memberModal.classList.add('hidden'));
    el.finishMemberModalBtn.addEventListener('click', () => el.memberModal.classList.add('hidden'));
    el.addMemberForm.addEventListener('submit', addMember);

    // Settlement Modal
    el.closeSettlePaymentModalBtn.addEventListener('click', () => el.settlePaymentModal.classList.add('hidden'));
    el.cancelSettlePaymentModalBtn.addEventListener('click', () => el.settlePaymentModal.classList.add('hidden'));
    el.settlePaymentForm.addEventListener('submit', recordSettlementPayment);
    el.copySettlementSummaryBtn.addEventListener('click', copyTextSummary);

    // Share Modal
    el.shareGroupBtn.addEventListener('click', openShareModal);
    el.closeShareModalBtn.addEventListener('click', () => el.shareModal.classList.add('hidden'));
    el.copyShareLinkBtn.addEventListener('click', copyShareLink);
    el.copyTextSummaryBtn.addEventListener('click', copyTextSummary);

    // Settings Modal
    el.groupMenuBtn.addEventListener('click', () => el.settingsModal.classList.remove('hidden'));
    el.closeSettingsModalBtn.addEventListener('click', () => el.settingsModal.classList.add('hidden'));
    el.loadSampleDataBtn.addEventListener('click', loadSampleData);
    el.exportJsonBtn.addEventListener('click', exportDataAsJson);
    el.importJsonInput.addEventListener('change', importDataFromJson);
    el.resetAllDataBtn.addEventListener('click', resetAllData);

    // Supabase Configuration Modal
    el.dbStatusBtn.addEventListener('click', () => {
      populateSupabaseModal();
      el.supabaseModal.classList.remove('hidden');
    });
    el.openSupabaseModalBtn.addEventListener('click', () => {
      el.settingsModal.classList.add('hidden');
      populateSupabaseModal();
      el.supabaseModal.classList.remove('hidden');
    });
    el.closeSupabaseModalBtn.addEventListener('click', () => el.supabaseModal.classList.add('hidden'));
    el.disconnectSupabaseBtn.addEventListener('click', disconnectSupabase);
    el.copySqlSchemaBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(SQL_SCHEMA_SCRIPT).then(() => {
        showToast('SQL Schema script copied to clipboard! 📋', 'success');
      });
    });

    el.supabaseConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = el.supabaseUrlInput.value.trim();
      const key = el.supabaseKeyInput.value.trim();
      const groupId = el.supabaseGroupIdInput.value.trim() || 'default-trip';

      if (!url || !key) {
        showToast('Please provide both Supabase URL and Anon Key.', 'error');
        return;
      }
      await connectToSupabase(url, key, groupId);
    });

    // Close modals on click outside
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        e.target.classList.add('hidden');
      }
    });
  }

  function populateSupabaseModal() {
    el.supabaseUrlInput.value = supabaseConfig.url || '';
    el.supabaseKeyInput.value = supabaseConfig.key || '';
    el.supabaseGroupIdInput.value = supabaseConfig.groupId || state.groupId || 'goa-trip-2026';
  }

  // ==========================================================================
  // UTILITY HELPERS
  // ==========================================================================

  function getMemberById(id) {
    return state.members.find(m => m.id === id) || null;
  }

  function formatCurrency(num) {
    const val = parseFloat(num) || 0;
    return `${state.currency} ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${type === 'success' ? 'fa-circle-check text-accent' : 'fa-circle-exclamation text-danger'}"></i>
      <span>${message}</span>
    `;

    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Start app
  init();

})();
