// ==========================================================================
// 政务智管 - 项目总揽台账首页专属逻辑模块 (ledger.js)
// ==========================================================================

var currentCardFilter = "all";
var currentSortField = "start_date";
var currentSortOrder = "desc";

function initLedgerPage() {
    loadProjectLedger();
}

function loadProjectLedger(retryCount = 0) {
    apiFetch("/api/projects")
        .then(res => res.ok ? res.json() : [])
        .then(projects => {
            if ((!projects || projects.length === 0) && retryCount < 2) {
                setTimeout(() => loadProjectLedger(retryCount + 1), 200);
                return;
            }
            globalProjects = projects || [];
            updateMetricsDashboard(globalProjects);
            renderLedgerTable();
        })
        .catch(err => {
            console.error("loadProjectLedger error:", err);
        });
}

function updateMetricsDashboard(projects) {
    const totalEl = document.getElementById("metric-total-projects");
    const acceptEl = document.getElementById("metric-pending-acceptance");
    const payEl = document.getElementById("metric-pending-payment");
    const riskEl = document.getElementById("metric-risk-projects");

    if (totalEl) totalEl.textContent = projects.length;
    if (acceptEl) acceptEl.textContent = projects.filter(p => p.stage === "验收" || p.stage === "验收阶段").length;

    let unPaid = 0;
    projects.forEach(p => {
        if (p.payment_nodes) {
            p.payment_nodes.forEach(n => {
                if (!n.is_paid) unPaid++;
            });
        }
    });
    if (payEl) payEl.textContent = unPaid;
    if (riskEl) riskEl.textContent = projects.filter(p => p.health_score < 70).length;
}

function setCardFilter(type) {
    currentCardFilter = type || "all";

    document.querySelectorAll(".filter-card").forEach(c => c.classList.remove("active"));
    const cardId = (type === "all" ? "card-filter-all" : (type === "acceptance" ? "card-filter-acceptance" : (type === "payment" ? "card-filter-payment" : "card-filter-risk")));
    const activeCard = document.getElementById(cardId);
    if (activeCard) activeCard.classList.add("active");

    const filterTag = document.getElementById("active-filter-tag");
    const tagText = document.getElementById("filter-tag-text");

    if (type === "all") {
        if (filterTag) filterTag.style.display = "none";
    } else {
        if (filterTag) filterTag.style.display = "inline-flex";
        if (tagText) {
            if (type === "acceptance") tagText.textContent = "当前筛选: 处于验收阶段项目";
            if (type === "payment") tagText.textContent = "当前筛选: 待拨付款项项目";
            if (type === "risk") tagText.textContent = "当前筛选: 存在合规预警高危项目";
        }
    }

    renderLedgerTable();
}

function sortLedgerBy(field) {
    if (currentSortField === field) {
        currentSortOrder = (currentSortOrder === "asc" ? "desc" : "asc");
    } else {
        currentSortField = field;
        currentSortOrder = "asc";
    }

    renderLedgerTable();
}

function renderLedgerTable() {
    // 动态同步更新表头所有排序状态图标
    ["name", "stage", "start_date", "planned_completion_date", "days", "health", "owner", "budget"].forEach(f => {
        const iconEl = document.getElementById("sort-icon-" + f);
        if (iconEl) {
            if (f === currentSortField) {
                iconEl.textContent = currentSortOrder === "asc" ? "↑" : "↓";
                iconEl.style.color = "var(--gov-blue)";
                iconEl.style.fontWeight = "bold";
            } else {
                iconEl.textContent = "↕";
                iconEl.style.color = "#94a3b8";
                iconEl.style.fontWeight = "normal";
            }
        }
    });

    const tbody = document.getElementById("project-ledger-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const searchInput = document.getElementById("search-project");
    const searchQ = searchInput ? searchInput.value.trim().toLowerCase() : "";

    // 1. 卡片维度过滤
    let filtered = (globalProjects || []).filter(p => {
        if (currentCardFilter === "acceptance") {
            return p.stage === "验收" || p.stage === "验收阶段";
        }
        if (currentCardFilter === "payment") {
            let hasUnpaid = false;
            if (p.payment_nodes) {
                hasUnpaid = p.payment_nodes.some(n => !n.is_paid);
            }
            return hasUnpaid;
        }
        if (currentCardFilter === "risk") {
            return p.health_score < 70;
        }
        return true;
    });

    // 2. 搜索框文本过滤 (名称、文号、负责人、阶段、标签、预算)
    if (searchQ) {
        filtered = filtered.filter(p => {
            const nameVal = (p.name || "").toLowerCase();
            const docVal = (p.approval_doc_num || "").toLowerCase();
            const ownerVal = (p.owner || "").toLowerCase();
            const stageVal = (p.stage || "").toLowerCase();
            const labelVal = (p.labels || []).join(" ").toLowerCase();
            const budgetVal = String(p.budget || "");

            return nameVal.includes(searchQ) ||
                   docVal.includes(searchQ) ||
                   ownerVal.includes(searchQ) ||
                   stageVal.includes(searchQ) ||
                   labelVal.includes(searchQ) ||
                   budgetVal.includes(searchQ);
        });
    }

    // 3. 多维度排序 (正序/倒序)
    if (currentSortField) {
        filtered.sort((a, b) => {
            let valA = a[currentSortField];
            let valB = b[currentSortField];

            if (currentSortField === "days") {
                valA = a.stage === "验收" ? 5 : (a.stage === "实施" ? (a.health_score < 70 ? 999 : 45) : (a.stage === "运维" ? 320 : 90));
                valB = b.stage === "验收" ? 5 : (b.stage === "实施" ? (b.health_score < 70 ? 999 : 45) : (b.stage === "运维" ? 320 : 90));
            } else if (currentSortField === "health") {
                valA = a.health_score !== undefined ? a.health_score : 100;
                valB = b.health_score !== undefined ? b.health_score : 100;
            } else if (currentSortField === "budget") {
                valA = a.budget || 0;
                valB = b.budget || 0;
            } else {
                valA = String(valA || "").toLowerCase();
                valB = String(valB || "").toLowerCase();
            }

            if (valA < valB) return currentSortOrder === "asc" ? -1 : 1;
            if (valA > valB) return currentSortOrder === "asc" ? 1 : -1;
            return 0;
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 40px;">暂无匹配的信息化项目台账记录</td></tr>`;
        return;
    }

    filtered.forEach(p => {
        const tr = document.createElement("tr");
        
        let daysRemaining = "暂无临期";
        if (p.stage === "验收") {
            daysRemaining = "剩余 5天";
        } else if (p.stage === "实施") {
            if (p.health_score < 70) {
                daysRemaining = "逾期 5天";
            } else {
                daysRemaining = "验收剩余 45天";
            }
        } else if (p.stage === "运维") {
            daysRemaining = "维保剩余 320天";
        } else if (p.stage === "立项") {
            daysRemaining = "初验剩余 90天";
        }

        let riskTip = `<span class="score-badge high">🟢 运行合规</span>`;
        if (p.health_score < 70) {
            let reason = (p.health_report && p.health_report.progress && p.health_report.progress.status !== "正常") ? "进度滞后" : "概算超支";
            riskTip = `<span class="score-badge low">⚠️ ${reason}</span>`;
        } else if (p.health_score < 90) {
            riskTip = `<span class="score-badge medium">⚠️ 付款待补</span>`;
        }

        tr.innerHTML = `
            <td style="font-weight: 700; color: var(--gov-blue); cursor:pointer;" onclick="window.location.href='/detail.html?id=${p.id}'" title="点击查看详情档案">${escapeHtml(p.name)}</td>
            <td><span class="stage-tag badge-blue">${escapeHtml(p.stage)}阶段</span></td>
            <td>${p.start_date || "—"}</td>
            <td>${p.planned_completion_date || "—"}</td>
            <td style="font-weight: 600;">${daysRemaining}</td>
            <td>${riskTip}</td>
            <td>${escapeHtml(p.owner.split(" ")[0])}</td>
            <td style="font-weight: 600;">${formatCurrency(p.budget)}</td>
            <td>
                <button class="btn-gov-secondary" onclick="window.location.href='/detail.html?id=${p.id}'" style="padding: 3px 8px; font-size: 12px;">查看档案</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 导出全局
window.initLedgerPage = initLedgerPage;
window.setCardFilter = setCardFilter;
window.sortLedgerBy = sortLedgerBy;
window.renderLedgerTable = renderLedgerTable;
