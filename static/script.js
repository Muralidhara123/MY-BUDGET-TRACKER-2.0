document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // ELEMENTS
    const totalBalanceEl = document.getElementById('total-balance');
    const totalIncomeEl = document.getElementById('stats-income');
    const totalExpenseEl = document.getElementById('stats-expense');

    // Lists
    const txListEl = document.getElementById('tx-list');
    const txListStatsEl = document.getElementById('tx-list-stats');

    // Views
    const viewHome = document.getElementById('view-home');
    const viewStats = document.getElementById('view-stats');
    const viewWallet = document.getElementById('view-wallet');
    const viewProfile = document.getElementById('view-profile');
    const views = [viewHome, viewStats, viewWallet, viewProfile];

    // Nav Items
    const navHome = document.getElementById('nav-home');
    const navStats = document.getElementById('nav-stats');
    const navWallet = document.getElementById('nav-wallet');
    const navProfile = document.getElementById('nav-profile');
    const navItems = [navHome, navStats, navWallet, navProfile];

    // Modals & Forms
    const addModal = document.getElementById('add-modal');
    const fabAdd = document.getElementById('fab-add');
    const closeAdd = document.getElementById('close-add');
    const transactionForm = document.getElementById('transaction-form');
    const tabBtns = document.querySelectorAll('.tab-btn');

    const setupModal = document.getElementById('setup-modal');
    const setupForm = document.getElementById('setup-form');

    const resetModal = document.getElementById('reset-modal');
    const resetBtn = document.getElementById('reset-btn');
    const resetBtnProfile = document.getElementById('reset-btn-profile');
    const cancelResetBtn = document.getElementById('cancel-reset');
    const confirmResetBtn = document.getElementById('confirm-reset');

    const logoutBtn = document.getElementById('logout-btn');
    const logoutBtnProfile = document.getElementById('logout-btn-profile');

    let currentType = 'expense';
    let myChart = null;
    let weeklyChartInst = null;

    // Theme Logic
    const themeBtn = document.getElementById('theme-btn');
    const themeIcon = themeBtn ? themeBtn.querySelector('i') : null;

    function setTheme(isDark) {
        if (isDark) {
            document.body.classList.add('dark-mode');
            if (themeIcon) {
                themeIcon.classList.remove('fa-moon');
                themeIcon.classList.add('fa-sun');
            }
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            if (themeIcon) {
                themeIcon.classList.remove('fa-sun');
                themeIcon.classList.add('fa-moon');
            }
            localStorage.setItem('theme', 'light');
        }
        // Re-render charts to update colors
        if (typeof fetchData === 'function') fetchData();
    }

    // Init Theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        setTheme(true);
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark-mode');
            setTheme(!isDark);
        });
    }

    // ----------------------------------------------------
    // VIEW NAVIGATION
    // ----------------------------------------------------
    function switchView(targetView, targetNav) {
        views.forEach(v => v ? v.classList.remove('active') : null);
        navItems.forEach(n => n ? n.classList.remove('active') : null);

        if (targetView) targetView.classList.add('active');
        if (targetNav) targetNav.classList.add('active');

        if (targetView === viewStats) {
            fetchData();
        }
    }

    if (navHome) navHome.addEventListener('click', () => switchView(viewHome, navHome));
    if (navStats) navStats.addEventListener('click', () => switchView(viewStats, navStats));
    if (navWallet) navWallet.addEventListener('click', () => switchView(viewWallet, navWallet));
    if (navProfile) navProfile.addEventListener('click', () => switchView(viewProfile, navProfile));

    // ----------------------------------------------------
    // UI INTERACTION
    // ----------------------------------------------------
    if (fabAdd) fabAdd.addEventListener('click', () => addModal.classList.add('active'));
    if (closeAdd) closeAdd.addEventListener('click', () => addModal.classList.remove('active'));

    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.boxShadow = 'none';
                b.style.color = 'var(--text-secondary)';
            });
            btn.classList.add('active');
            btn.style.background = 'white';
            btn.style.boxShadow = 'var(--shadow-sm)';
            btn.style.color = 'var(--text-primary)';
            currentType = btn.dataset.type;
        });
    });

    const openReset = () => resetModal ? resetModal.classList.add('active') : null;
    if (resetBtn) resetBtn.addEventListener('click', openReset);
    if (resetBtnProfile) resetBtnProfile.addEventListener('click', openReset);

    if (cancelResetBtn) cancelResetBtn.addEventListener('click', () => resetModal.classList.remove('active'));

    if (confirmResetBtn) {
        confirmResetBtn.addEventListener('click', async () => {
            await fetch('/api/reset_data', { method: 'POST' });
            resetModal.classList.remove('active');
            switchView(viewHome, navHome);
            fetchData();
        });
    }

    const handleLogout = async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
    };
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (logoutBtnProfile) logoutBtnProfile.addEventListener('click', handleLogout);

    // ----------------------------------------------------
    // DATA & CHART
    // ----------------------------------------------------

    function formatMoney(amount) {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
    }

    function getIcon(desc) {
        desc = desc.toLowerCase();
        if (desc.includes('uber') || desc.includes('taxi') || desc.includes('bus') || desc.includes('fuel')) return 'fa-car';
        if (desc.includes('food') || desc.includes('burger') || desc.includes('pizza') || desc.includes('dinner')) return 'fa-utensils';
        if (desc.includes('shop') || desc.includes('buy') || desc.includes('clothes')) return 'fa-shopping-bag';
        if (desc.includes('movie') || desc.includes('game') || desc.includes('netflix')) return 'fa-gamepad';
        if (desc.includes('salary') || desc.includes('income')) return 'fa-money-bill-wave';
        if (desc.includes('home') || desc.includes('rent')) return 'fa-home';
        return 'fa-wallet';
    }

    // Delete Logic
    window.deleteTx = async (id) => {
        if (!confirm('Delete this transaction?')) return;
        try {
            const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
            if (res.ok) fetchData();
        } catch (e) { console.error(e); }
    };

    function updateChart(income, expense) {
        const ctx = document.getElementById('expenseChart');
        if (!ctx) return;

        if (myChart) myChart.destroy();

        // If no data, show empty placeholders or keep blank
        if (income === 0 && expense === 0) return;

        myChart = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Income', 'Expense'],
                datasets: [{
                    data: [income, expense],
                    backgroundColor: ['#10b981', '#ff7235'],
                    borderWidth: 0,
                    borderRadius: 20, // Modern rounded corners
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '80%', // Thinner ring
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: { family: "'Inter', sans-serif", size: 12 },
                            color: document.body.classList.contains('dark-mode') ? '#9ca3af' : '#1f2937'
                        }
                    }
                },
                layout: {
                    padding: 10
                }
            }
        });
    }

    function updateWeeklyChart(transactions) {
        const ctx = document.getElementById('weeklyChart');
        if (!ctx) return;

        // 1. Process Data: Last 7 Days
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date();
        const labels = [];
        const dataPoints = [];

        // Initialize 7 days back map
        const dayMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateKey = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const dayName = days[d.getDay()];

            // Key: "Mon" (or date specific if you prefer) - let's use Day Name
            // Warning: If multiple same days (unlikely in 7 days), this logic is simple.
            // Better: Store full date key for mapping, show Day Name in label

            dayMap.set(d.toDateString(), 0);
            labels.push(dayName);
        }

        // Filter Expenses & Sum
        transactions.forEach(tx => {
            if (tx.type === 'expense') {
                const txDate = new Date(tx.timestamp).toDateString();
                if (dayMap.has(txDate)) {
                    dayMap.set(txDate, dayMap.get(txDate) + tx.amount);
                }
            }
        });

        // Convert Map values to array
        const values = Array.from(dayMap.values());

        if (weeklyChartInst) weeklyChartInst.destroy();

        // Chart Style
        const isDark = document.body.classList.contains('dark-mode');
        const gridColor = isDark ? '#374151' : '#f3f4f6';
        const textColor = isDark ? '#9ca3af' : '#6b7280';
        const barColor = isDark ? '#8b5cf6' : '#7c3aed';

        weeklyChartInst = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Spending',
                    data: values,
                    backgroundColor: barColor,
                    borderRadius: 4,
                    barThickness: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1f2937' : '#ffffff',
                        titleColor: isDark ? '#f3f4f6' : '#1f2937',
                        bodyColor: isDark ? '#d1d5db' : '#4b5563',
                        borderColor: isDark ? '#374151' : '#e5e7eb',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                return formatMoney(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { display: false } // Hide Y axis labels for cleaner look
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: textColor, font: { size: 10 } }
                    }
                },
                layout: {
                    padding: { top: 10, bottom: 0 }
                }
            }
        });
    }

    // Reuse population logic
    function renderList(listEl, transactions) {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (transactions.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; opacity: 0; animation: fadeInUp 0.5s ease forwards;">
                    <div style="width: 80px; height: 80px; background: rgba(139, 92, 246, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                        <i class="fas fa-receipt" style="font-size: 2rem; color: #c4b5fd;"></i>
                    </div>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">No transactions yet</p>
                </div>
            `;
            return;
        }

        transactions.forEach((tx, index) => {
            const isExpense = tx.type === 'expense';
            const iconClass = getIcon(tx.description);
            const colorClass = isExpense ? 'money-out' : 'money-in';
            const sign = isExpense ? '-' : '+';

            const dateObj = new Date(tx.timestamp);
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Simple date check
            let dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            const item = document.createElement('div');
            item.className = 'transaction-item';
            item.style.animationDelay = `${index * 0.05}s`;

            item.innerHTML = `
                <div style="display: flex; align-items: center; flex: 1;">
                    <div class="t-icon"><i class="fas ${iconClass}"></i></div>
                    <div>
                        <h4 style="margin-bottom: 2px;">${tx.description}</h4>
                        <p style="font-size: 0.8rem; color: var(--text-secondary);">${dateStr} • ${timeStr}</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="${colorClass}" style="font-weight: 700;">${sign}${formatMoney(tx.amount)}</div>
                    <button onclick="deleteTx(${tx.id})" class="delete-btn"><i class="fas fa-trash"></i></button>
                </div>
            `;
            listEl.appendChild(item);
        });
    }

    async function fetchData() {
        try {
            const res = await fetch('/api/transactions');
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            const data = await res.json();

            if (data.transactions.length === 0) {
                setupModal.classList.add('active');
            } else {
                setupModal.classList.remove('active');
            }

            const { balance, income, expense } = data.summary;

            // Update Header Stats
            if (totalBalanceEl) totalBalanceEl.innerText = formatMoney(balance);
            if (totalIncomeEl) totalIncomeEl.innerText = formatMoney(income);
            if (totalExpenseEl) totalExpenseEl.innerText = formatMoney(expense);

            // Population
            renderList(txListEl, data.transactions);
            renderList(txListStatsEl, data.transactions);

            // Charts
            updateChart(income, expense);
            updateWeeklyChart(data.transactions);

        } catch (err) {
            console.error(err);
        }
    }

    // ----------------------------------------------------
    // FORM SUBMISSIONS
    // ----------------------------------------------------



    if (transactionForm) {
        transactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const desc = document.getElementById('t-desc').value;
            const amount = document.getElementById('t-amount').value;

            await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: currentType, description: desc, amount: amount })
            });

            transactionForm.reset();
            addModal.classList.remove('active');
            fetchData();
        });
    }

    if (setupForm) {
        setupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('initial-amount').value;
            await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'income', description: 'Initial Balance', amount: amount })
            });
            setupModal.classList.remove('active');
            fetchData();
        });
    }

    // Initial Load
    fetchData();
});
