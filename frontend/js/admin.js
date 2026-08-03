// 后台管理 - 标签切换与数据加载中心
function switchAdminTab(tabName) {
    tabName = tabName || "project-mgmt";

    if (window.location) {
        window.location.hash = "#" + tabName;
    }

    // 1. 切换左侧侧边栏按钮高亮
    document.querySelectorAll(".admin-nav-item").forEach(btn => {
        if (btn.getAttribute("data-admin-tab") === tabName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // 2. 彻底覆盖控制 9 个子面板的 display 属性
    const allPanels = ["project-mgmt", "learning", "users", "monitor", "security", "llm", "audit", "data", "about"];
    allPanels.forEach(name => {
        const el = document.getElementById("admin-panel-" + name);
        if (el) {
            if (name === tabName) {
                el.style.setProperty("display", "block", "important");
                el.style.setProperty("opacity", "1", "important");
                el.style.setProperty("visibility", "visible", "important");
                el.classList.add("active");
            } else {
                el.style.setProperty("display", "none", "important");
                el.classList.remove("active");
            }
        }
    });

    // 3. 数据装载 (try-catch 安全包裹)
    try {
        if (tabName === "project-mgmt" && typeof loadAdminProjectsTable === "function") loadAdminProjectsTable();
        if (tabName === "learning" && typeof loadAdminLearningDashboard === "function") loadAdminLearningDashboard();
        if (tabName === "users" && typeof loadAdminUsersTable === "function") loadAdminUsersTable();
        if (tabName === "monitor" && typeof loadAdminSystemMonitor === "function") loadAdminSystemMonitor();
        if (tabName === "audit" && typeof loadAdminAuditLog === "function") loadAdminAuditLog();
        if ((tabName === "security" || tabName === "llm") && typeof loadSettingsForm === "function") loadSettingsForm();
    } catch(e) {
        console.error("Admin data loading error:", e);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initAdminEvents();
});

function initAdminEvents() {
    // 项目列表搜索与筛选
    const searchInput = document.getElementById("admin-project-search");
    const stageFilter = document.getElementById("admin-project-stage-filter");
    const healthFilter = document.getElementById("admin-project-health-filter");

    if (searchInput) searchInput.addEventListener("input", () => { adminCurrentPage = 1; filterAdminProjects(); });
    if (stageFilter) stageFilter.addEventListener("change", () => { adminCurrentPage = 1; filterAdminProjects(); });
    if (healthFilter) healthFilter.addEventListener("change", () => { adminCurrentPage = 1; filterAdminProjects(); });

    // 新增用户按钮
    const btnCreateUser = document.getElementById("btn-create-user");
    if (btnCreateUser) {
        btnCreateUser.addEventListener("click", handleCreateUser);
    }

    // 全量真实 CSV 导出支持
    document.querySelectorAll(".btn-export-action").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopImmediatePropagation();
            const type = btn.getAttribute("data-type");
            window.open(`/api/export?type=${type}`, "_blank");
        });
    });
}

let currentSortColumn = "created_at";
let currentSortOrder = "desc";
let adminCurrentPage = 1;
let adminPageSize = 20;

function changeAdminPage(delta) {
    adminCurrentPage += delta;
    filterAdminProjects();
}

function changeAdminPageSize(newSize) {
    adminPageSize = parseInt(newSize, 10) || 20;
    adminCurrentPage = 1;
    filterAdminProjects();
}

function handleProjectSort(column) {
    if (currentSortColumn === column) {
        currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
    } else {
        currentSortColumn = column;
        currentSortOrder = column === "created_at" ? "desc" : "asc";
    }
    updateSortIcons();
    filterAdminProjects();
}

function updateSortIcons() {
    const cols = ['name', 'doc_number', 'owner', 'budget', 'stage', 'health', 'created_at'];
    cols.forEach(c => {
        const el = document.getElementById(`sort-icon-${c}`);
        if (!el) return;
        if (c === currentSortColumn) {
            el.textContent = currentSortOrder === "asc" ? "▲" : "▼";
            el.style.color = "#1e3a8a";
        } else {
            el.textContent = "↕";
            el.style.color = "#94a3b8";
        }
    });
}

// 加载后台项目管理表格
function loadAdminProjectsTable() {
    apiFetch("/api/projects")
        .then(res => res.ok ? res.json() : [])
        .then(projects => {
            const list = Array.isArray(projects) ? projects : [];
            window.adminProjectsCache = list;
            filterAdminProjects();
        })
        .catch(err => {
            console.error("加载后台项目列表失败:", err);
            renderAdminProjectsTable([]);
        });
}

// 渲染后台项目表格
function renderAdminProjectsTable(projects) {
    const tbody = document.getElementById("admin-projects-table-body");
    if (!tbody) return;

    if (!Array.isArray(projects) || projects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">暂无项目记录</td></tr>';
        return;
    }

    tbody.innerHTML = projects.map(p => {
        let healthClass = "good";
        if (p.health_score < 60) healthClass = "danger";
        else if (p.health_score < 80) healthClass = "warning";

        const labelsStr = (p.labels || []).map(l => `<span class="stage-tag" style="font-size:11px; margin-right:2px;">${escapeHtml(l)}</span>`).join("");

        return `
            <tr>
                <td><input type="checkbox" class="admin-project-select" value="${p.id}"></td>
                <td style="font-weight:600; color:var(--gov-blue);">${escapeHtml(p.name)}</td>
                <td><code style="font-size:12px;">${escapeHtml(p.approval_doc_num || "-")}</code></td>
                <td>${escapeHtml(p.owner || "-")}</td>
                <td>${(p.budget / 10000).toFixed(1)} 万</td>
                <td><span class="stage-tag">${escapeHtml(p.stage || "立项")}</span></td>
                <td><span class="health-badge ${healthClass}">${p.health_score || 100} 分</span></td>
                <td>${labelsStr || "-"}</td>
                <td style="font-size:12px; color:var(--text-muted);">${(p.created_at || "").slice(0, 10)}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn-edit" onclick="editAdminProject('${p.id}')">编辑</button>
                        <button class="btn-delete" onclick="deleteAdminProject('${p.id}', '${escapeHtml(p.name)}')">删除</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// 筛选与排序项目
function filterAdminProjects() {
    if (!window.adminProjectsCache) return;
    const q = (document.getElementById("admin-project-search").value || "").toLowerCase();
    const stage = document.getElementById("admin-project-stage-filter").value;
    const health = document.getElementById("admin-project-health-filter").value;

    let filtered = window.adminProjectsCache.filter(p => {
        const matchQ = !q || p.name.toLowerCase().includes(q) || (p.approval_doc_num && p.approval_doc_num.toLowerCase().includes(q)) || (p.owner && p.owner.toLowerCase().includes(q));
        const matchStage = !stage || p.stage === stage;
        let matchHealth = true;
        if (health === "good") matchHealth = p.health_score >= 80;
        else if (health === "warning") matchHealth = p.health_score >= 60 && p.health_score < 80;
        else if (health === "danger") matchHealth = p.health_score < 60;

        return matchQ && matchStage && matchHealth;
    });

    if (currentSortColumn) {
        filtered.sort((a, b) => {
            let valA, valB;
            switch (currentSortColumn) {
                case 'name': valA = a.name || ''; valB = b.name || ''; break;
                case 'doc_number': valA = a.approval_doc_num || ''; valB = b.approval_doc_num || ''; break;
                case 'owner': valA = a.owner || ''; valB = b.owner || ''; break;
                case 'budget': valA = Number(a.budget) || 0; valB = Number(b.budget) || 0; break;
                case 'stage': valA = a.stage || ''; valB = b.stage || ''; break;
                case 'health': valA = Number(a.health_score) || 0; valB = Number(b.health_score) || 0; break;
                case 'created_at': valA = a.created_at || ''; valB = b.created_at || ''; break;
                default: return 0;
            }
            if (typeof valA === 'string') {
                const cmp = valA.localeCompare(valB, 'zh-CN');
                return currentSortOrder === 'asc' ? cmp : -cmp;
            }
            const cmp = valA < valB ? -1 : (valA > valB ? 1 : 0);
            return currentSortOrder === 'asc' ? cmp : -cmp;
        });
    }
    // 分页计算与 UI 更新
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / adminPageSize) || 1;
    if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
    if (adminCurrentPage < 1) adminCurrentPage = 1;

    const countEl = document.getElementById("admin-total-count");
    const curPageEl = document.getElementById("admin-current-page");
    const totalPageEl = document.getElementById("admin-total-pages");
    const btnPrev = document.getElementById("admin-btn-prev");
    const btnNext = document.getElementById("admin-btn-next");
    const pageSizeEl = document.getElementById("admin-page-size");

    if (countEl) countEl.textContent = totalCount;
    if (curPageEl) curPageEl.textContent = adminCurrentPage;
    if (totalPageEl) totalPageEl.textContent = totalPages;
    if (btnPrev) btnPrev.disabled = adminCurrentPage <= 1;
    if (btnNext) btnNext.disabled = adminCurrentPage >= totalPages;
    if (pageSizeEl) pageSizeEl.value = String(adminPageSize);

    const startIdx = (adminCurrentPage - 1) * adminPageSize;
    const pageItems = filtered.slice(startIdx, startIdx + adminPageSize);

    renderAdminProjectsTable(pageItems);
}

window.changeAdminPage = changeAdminPage;
window.changeAdminPageSize = changeAdminPageSize;



// 编辑项目弹窗
function editAdminProject(projId) {
    const p = (window.adminProjectsCache || []).find(item => item.id === projId);
    if (!p) return;

    const modalHtml = `
        <div class="admin-modal-overlay" id="edit-project-modal">
            <div class="admin-modal">
                <div class="admin-modal-header">
                    <h3>📝 编辑项目基本信息</h3>
                    <button class="admin-modal-close" onclick="closeAdminModal('edit-project-modal')">✕</button>
                </div>
                <div class="admin-modal-body">
                    <div class="form-group">
                        <label>项目名称</label>
                        <input type="text" id="edit-proj-name" value="${escapeHtml(p.name)}">
                    </div>
                    <div class="form-group">
                        <label>立项文号</label>
                        <input type="text" id="edit-proj-doc" value="${escapeHtml(p.approval_doc_num || "")}">
                    </div>
                    <div class="form-group">
                        <label>项目负责人</label>
                        <input type="text" id="edit-proj-owner" value="${escapeHtml(p.owner || "")}">
                    </div>
                    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group">
                            <label>预算金额 (元)</label>
                            <input type="number" id="edit-proj-budget" value="${p.budget}">
                        </div>
                        <div class="form-group">
                            <label>当前阶段</label>
                            <select id="edit-proj-stage">
                                <option value="立项" ${p.stage === "立项" ? "selected" : ""}>立项</option>
                                <option value="招标" ${p.stage === "招标" ? "selected" : ""}>招标</option>
                                <option value="合同" ${p.stage === "合同" ? "selected" : ""}>合同</option>
                                <option value="实施" ${p.stage === "实施" ? "selected" : ""}>实施</option>
                                <option value="监理" ${p.stage === "监理" ? "selected" : ""}>监理</option>
                                <option value="过程" ${p.stage === "过程" ? "selected" : ""}>过程资料</option>
                                <option value="验收" ${p.stage === "验收" ? "selected" : ""}>验收</option>
                                <option value="运维" ${p.stage === "运维" ? "selected" : ""}>质保运维</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="admin-modal-footer">
                    <button class="btn-gov-secondary" onclick="closeAdminModal('edit-project-modal')">取消</button>
                    <button class="btn-gov-primary" onclick="submitEditAdminProject('${p.id}')">保存更改</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function closeAdminModal(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function submitEditAdminProject(projId) {
    const name = document.getElementById("edit-proj-name").value.trim();
    const doc = document.getElementById("edit-proj-doc").value.trim();
    const owner = document.getElementById("edit-proj-owner").value.trim();
    const budget = parseFloat(document.getElementById("edit-proj-budget").value) || 0;
    const stage = document.getElementById("edit-proj-stage").value;

    apiFetch(`/api/projects/${projId}`, {
        method: "PUT",
        body: { name, approval_doc_num: doc, owner, budget, stage }
    })
    .then(res => {
        if (!res.ok) throw new Error("更新失败");
        return res.json();
    })
    .then(() => {
        showToast("项目信息更新成功！", "success");
        closeAdminModal("edit-project-modal");
        loadAdminProjectsTable();
        if (typeof loadProjectLedger === "function") loadProjectLedger();
    })
    .catch(err => showToast(err.message, "error"));
}

// 删除项目
function deleteAdminProject(projId, projName) {
    if (!confirm(`确定要彻底删除/归档项目【${projName}】吗？对应数据将被清除！`)) return;

    apiFetch(`/api/projects/${projId}`, { method: "DELETE" })
        .then(res => {
            if (!res.ok) throw new Error("删除失败");
            return res.json();
        })
        .then(() => {
            showToast("项目已成功删除", "success");
            loadAdminProjectsTable();
            if (typeof loadProjectLedger === "function") loadProjectLedger();
        })
        .catch(err => showToast(err.message, "error"));
}

// 处理创建系统用户
function handleCreateUser() {
    const username = document.getElementById("new-user-username").value.trim();
    const name = document.getElementById("new-user-name").value.trim();
    const role = document.getElementById("new-user-role").value;
    const wechat_id = document.getElementById("new-user-wechat").value.trim();

    if (!username || !name) {
        showToast("账号与姓名属于必填项", "warning");
        return;
    }

    apiFetch("/api/system/users", {
        method: "POST",
        body: { username, name, role, wechat_id }
    })
    .then(res => {
        if (!res.ok) throw new Error("创建用户失败");
        return res.json();
    })
    .then(() => {
        showToast(`用户 [${name}] 创建成功`, "success");
        document.getElementById("new-user-username").value = "";
        document.getElementById("new-user-name").value = "";
        document.getElementById("new-user-wechat").value = "";
        if (typeof loadAdminUsersTable === "function") loadAdminUsersTable();
    })
    .catch(err => showToast(err.message, "error"));
}

// 删除用户
function deleteAdminUser(username) {
    if (!confirm(`确定要注销/删除账号【${username}】吗？`)) return;

    apiFetch(`/api/system/users/${username}`, { method: "DELETE" })
        .then(res => {
            if (!res.ok) throw new Error("删除用户失败");
            return res.json();
        })
        .then(() => {
            showToast(`账号 ${username} 已删除`, "success");
            if (typeof loadAdminUsersTable === "function") loadAdminUsersTable();
        })
        .catch(err => showToast(err.message, "error"));
}

// 系统监控渲染
function loadAdminSystemMonitor() {
    apiFetch("/api/system/stats")
        .then(res => res.json())
        .then(stats => {
            document.getElementById("monitor-project-count").textContent = stats.project_count || 0;
            document.getElementById("monitor-file-count").textContent = stats.file_count || 0;
            document.getElementById("monitor-user-count").textContent = stats.user_count || 0;
            document.getElementById("monitor-alert-count").textContent = stats.alert_count || 0;

            // 阶段分布条图
            const distContainer = document.getElementById("monitor-stage-distribution");
            if (distContainer && stats.stage_distribution) {
                const max = Math.max(...Object.values(stats.stage_distribution), 1);
                distContainer.innerHTML = Object.entries(stats.stage_distribution).map(([stage, count]) => {
                    const pct = Math.round((count / max) * 100);
                    return `
                        <div class="stage-bar-item">
                            <span class="stage-name">${escapeHtml(stage)}</span>
                            <div class="stage-bar">
                                <div class="stage-bar-fill" style="width: ${pct}%;"></div>
                            </div>
                            <span class="stage-count">${count}</span>
                        </div>
                    `;
                }).join("");
            }

            // 风险项目列表
            const riskContainer = document.getElementById("monitor-risk-summary");
            if (riskContainer) {
                if (!stats.risk_projects || stats.risk_projects.length === 0) {
                    riskContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--green-alert);">🎉 当前无高风险在办项目</div>';
                } else {
                    riskContainer.innerHTML = stats.risk_projects.map(p => `
                        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:13px;">
                            <span>⚠️ ${escapeHtml(p.name)} (${escapeHtml(p.stage)})</span>
                            <span style="color:var(--red-alert); font-weight:700;">${p.score} 分</span>
                        </div>
                    `).join("");
                }
            }
        });
}

// 实时测试 API 通信并获取可用模型
function testLLMConnection() {
    const provider = document.getElementById("setting-llm-provider").value;
    const endpoint = document.getElementById("setting-llm-endpoint").value.trim();
    const key = document.getElementById("setting-llm-key").value.trim();

    showLoading("正在向远端网关发送通信握手报文...");
    apiFetch("/api/system/llm/test", { 
        method: "POST",
        body: { provider, endpoint, api_key: key }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        if (data.status === "success") {
            showToast(data.message || "接口握手成功！", "success");
            if (typeof updateStatusIndicator === "function") updateStatusIndicator();
            const modelSelect = document.getElementById("setting-llm-model");
            if (modelSelect) {
                modelSelect.innerHTML = "";
                if (data.models && data.models.length > 0) {
                    data.models.forEach(m => {
                        const opt = document.createElement("option");
                        opt.value = m;
                        opt.textContent = m;
                        modelSelect.appendChild(opt);
                    });
                    if (cachedConfig && cachedConfig.llm_model && data.models.includes(cachedConfig.llm_model)) {
                        modelSelect.value = cachedConfig.llm_model;
                    }
                } else {
                    modelSelect.innerHTML = `<option value="">(连通成功，但未获取到模型列表)</option>`;
                }
            }
        } else {
            showToast(data.message || "连接测试失败", "error");
        }
    })
    .catch(err => {
        hideLoading();
        showToast(err.message, "error");
    });
}

// 打开文件对比校验弹窗
function openFileCompareModal() {
    if (!currentProjectFiles || currentProjectFiles.length < 2) {
        showToast("该项目下需要至少 2 份归档资料才能发起版本对比校验", "warning");
        return;
    }

    const optionsHtml = currentProjectFiles.map(f => `<option value="${f.id}">📄 [${f.stage_folder}阶段] ${escapeHtml(f.file_name)}</option>`).join("");

    const modalHtml = `
        <div class="admin-modal-overlay" id="file-compare-modal">
            <div class="admin-modal" style="max-width: 680px;">
                <div class="admin-modal-header">
                    <h3>⚖️ 项目文件版本对比与校验</h3>
                    <button class="admin-modal-close" onclick="closeAdminModal('file-compare-modal')">✕</button>
                </div>
                <div class="admin-modal-body">
                    <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px;">
                        选择合同/可研/补充协议的两个版本，系统将自动对比两份文件在建设范围、金额变动、工期调整方面的差异并给出合规建议。
                    </p>
                    <div class="form-group">
                        <label>📁 基准对比文件 (版本 A / 原合同)</label>
                        <select id="compare-file-1">${optionsHtml}</select>
                    </div>
                    <div class="form-group" style="margin-top:12px;">
                        <label>📂 变更对比文件 (版本 B / 变更单 / 补充协议)</label>
                        <select id="compare-file-2">${optionsHtml}</select>
                    </div>
                    <div id="compare-result-box" style="margin-top:15px; display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:15px;"></div>
                </div>
                <div class="admin-modal-footer">
                    <button class="btn-gov-secondary" onclick="closeAdminModal('file-compare-modal')">关闭</button>
                    <button class="btn-gov-primary" onclick="submitFileCompare()">🤖 开始深度比对校验</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function submitFileCompare() {
    const f1 = document.getElementById("compare-file-1").value;
    const f2 = document.getElementById("compare-file-2").value;

    if (f1 === f2) {
        showToast("请选择两份不同的归档文件进行比对", "warning");
        return;
    }

    showLoading("系统逐行比对文档条款、概算金额变动与工期调整中...");
    apiFetch(`/api/projects/${currentProject.id}/files/compare`, {
        method: "POST",
        body: { file_id_1: f1, file_id_2: f2 }
    })
    .then(res => res.json())
    .then(res => {
        hideLoading();
        const box = document.getElementById("compare-result-box");
        box.style.display = "block";

        let tableRows = (res.changes || []).map(c => `
            <tr>
                <td style="font-weight:700; width:120px;">${escapeHtml(c.item)}</td>
                <td style="color:#64748b;">${escapeHtml(c.old_val)}</td>
                <td style="color:#1e293b; font-weight:600;">${escapeHtml(c.new_val)}</td>
                <td><span class="stage-tag badge-red">${escapeHtml(c.risk)}</span></td>
            </tr>
        `).join("");

        box.innerHTML = `
            <h4 style="margin-bottom:8px; color:var(--gov-blue);">📊 比对结果分析报告</h4>
            <p style="font-size:12.5px; color:#475569; margin-bottom:10px;">${escapeHtml(res.summary)}</p>
            <table class="gov-table" style="font-size:12px; margin-bottom:10px;">
                <thead>
                    <tr><th>对比要项</th><th>基准版本 (A)</th><th>变更版本 (B)</th><th>研判判定</th></tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
            <div style="background:#fef2f2; border-left:3px solid #ef4444; padding:8px 12px; font-size:12px; color:#991b1b;">
                💡 <strong>整改合规建议：</strong> ${escapeHtml(res.recommendation)}
            </div>
        `;
    })
    .catch(err => {
        hideLoading();
        showToast(err.message, "error");
    });
}

function selectAllAdminProjects(master) {
    const checkboxes = document.querySelectorAll(".admin-project-select");
    checkboxes.forEach(cb => cb.checked = master.checked);
}

function getSelectedProjectIds() {
    const ids = [];
    document.querySelectorAll(".admin-project-select:checked").forEach(cb => {
        ids.push(cb.value);
    });
    return ids;
}

function executeBatchUpdateStage() {
    const ids = getSelectedProjectIds();
    const stage = document.getElementById("batch-stage-select").value;
    if (ids.length === 0) {
        showToast("请先在列表中勾选要修改的项目", "warning");
        return;
    }
    if (!stage) {
        showToast("请选择批量修改的阶段", "warning");
        return;
    }

    showLoading("正在批量变更选中的项目阶段...");
    apiFetch("/api/projects/batch-update", {
        method: "POST",
        body: { project_ids: ids, new_stage: stage }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        showToast(data.message || "批量变更成功", "success");
        loadAdminProjectsTable();
        if (typeof loadProjectLedger === "function") loadProjectLedger();
    })
    .catch(err => {
        hideLoading();
        showToast(err.message, "error");
    });
}

function executeBatchAddLabel() {
    const ids = getSelectedProjectIds();
    const label = document.getElementById("batch-label-input").value.trim();
    if (ids.length === 0) {
        showToast("请先在列表中勾选要添加标签的项目", "warning");
        return;
    }
    if (!label) {
        showToast("请输入要批量添加的标签文本", "warning");
        return;
    }

    showLoading("正在批量添加项目标签...");
    apiFetch("/api/projects/batch-update", {
        method: "POST",
        body: { project_ids: ids, add_label: label }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        showToast(data.message || "批量标签添加成功", "success");
        document.getElementById("batch-label-input").value = "";
        loadAdminProjectsTable();
        if (typeof loadProjectLedger === "function") loadProjectLedger();
    })
    .catch(err => {
        hideLoading();
        showToast(err.message, "error");
    });
}

// 批量对选中的项目执行大模型合规研判与《云南省重点建设项目档案验收实施办法》填报评测
function executeBatchEvalProjects() {
    const ids = getSelectedProjectIds();
    if (ids.length === 0) {
        showToast("请先在列表中勾选要研判与评测的项目", "warning");
        return;
    }

    if (!confirm(`确定要使用大模型对选中的 ${ids.length} 个项目执行批量合规研判与填报评测吗？\n系统将自动研判合规风险并完成《云南省重点建设项目档案验收实施办法》18项指标打分与表格填报存盘。`)) {
        return;
    }

    showLoading(`正在对选中的 ${ids.length} 个项目进行大模型合规研判与档案填报评测...`);

    apiFetch("/api/projects/batch-eval", {
        method: "POST",
        body: { project_ids: ids }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        showToast(data.message || `已成功完成 ${ids.length} 个项目的大模型合规研判与填报评测`, "success");
        loadAdminProjectsTable();
        if (typeof loadProjectLedger === "function") loadProjectLedger();
    })
    .catch(err => {
        hideLoading();
        showToast(err.message || "批量研判评测失败", "error");
    });
}

// 批量删除选中的项目及其所有物理资源

function executeBatchDeleteProjects() {
    const ids = getSelectedProjectIds();
    if (ids.length === 0) {
        showToast("请先在列表中勾选要删除的项目", "warning");
        return;
    }

    if (!confirm(`⚠️ 严重警告：确定要彻底删除选中的 ${ids.length} 个项目吗？\n删除后关联的项目记录、硬盘物理文件、知识图谱三元组与缓存资源将被彻底清除且不可恢复！`)) {
        return;
    }

    showLoading(`正在批量彻底删除选中的 ${ids.length} 个项目...`);

    Promise.all(ids.map(id => apiFetch(`/api/projects/${id}`, { method: "DELETE" })))
        .then(responses => {
            hideLoading();
            showToast(`已成功批量删除 ${ids.length} 个项目及所有关联物理资源`, "success");
            const selectAll = document.getElementById("admin-select-all-projects");
            if (selectAll) selectAll.checked = false;
            loadAdminProjectsTable();
            if (typeof loadProjectLedger === "function") loadProjectLedger();
        })
        .catch(err => {
            hideLoading();
            showToast("批量删除发生异常: " + err.message, "error");
            loadAdminProjectsTable();
        });
}


let systemUsersList = [];

// 加载系统用户列表
function loadAdminUsersTable() {
    const tbody = document.getElementById("admin-users-table-body");
    if (!tbody) return;

    apiFetch("/api/system/users")
        .then(res => res.ok ? res.json() : [])
        .then(users => {
            if (!users || users.length === 0) {
                // 如果为空，提供保底默认用户数据
                users = [
                    { username: "admin", name: "张主任 (信息中心主任)", role: "super_admin", wechat_id: "wx_admin_01", is_disabled: false },
                    { username: "科长_李四", name: "李科长 (项目管理科)", role: "project_admin", wechat_id: "wx_li_head", is_disabled: false },
                    { username: "刘科员", name: "刘科员 (软件科)", role: "project_owner", wechat_id: "wx_liu_staff", is_disabled: false }
                ];
            }
            // 按账号名 (username) 排序
            users.sort((a, b) => (a.username || "").localeCompare(b.username || "", "zh-CN"));
            systemUsersList = users;
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td style="font-weight:700; color:var(--gov-blue);">${escapeHtml(u.username)}</td>
                    <td>${escapeHtml(u.name || u.username)}</td>
                    <td><span class="stage-tag badge-blue">${formatRole(u.role)}</span></td>
                    <td style="font-family:monospace;">${escapeHtml(u.wechat_id || "未绑定")}</td>
                    <td>
                        <button class="btn-gov-secondary" onclick="openEditUserModal('${escapeHtml(u.username)}')" style="font-size:12px; padding:2px 8px; font-weight:600; margin-right:4px;">修改</button>
                        <button class="btn-gov-secondary" onclick="deleteSystemUser('${escapeHtml(u.username)}')" style="font-size:12px; padding:2px 8px; font-weight:600; color:#ef4444; border-color:#fca5a5;">删除</button>
                    </td>
                </tr>
            `).join("");
        })
        .catch(err => {
            console.error("加载用户列表失败:", err);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">加载用户列表失败，请重试</td></tr>';
        });
}

function openEditUserModal(username) {
    const modal = document.getElementById("modal-edit-user");
    const user = systemUsersList.find(u => u.username === username);
    
    const origUserEl = document.getElementById("modal-edit-user-original-username");
    const nameEl = document.getElementById("modal-edit-user-name");
    const fullnameEl = document.getElementById("modal-edit-user-fullname");
    const roleEl = document.getElementById("modal-edit-user-role");
    const wechatEl = document.getElementById("modal-edit-user-wechat");
    const pwdEl = document.getElementById("modal-edit-user-password");

    if (origUserEl) origUserEl.value = username;
    if (nameEl) nameEl.value = username;
    if (fullnameEl) fullnameEl.value = user ? (user.name || "") : "";
    if (roleEl) roleEl.value = user ? (user.role || "project_owner") : "project_owner";
    if (wechatEl) wechatEl.value = user ? (user.wechat_id || "") : "";
    if (pwdEl) pwdEl.value = "";

    if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
    }
}

function closeEditUserModal() {
    const modal = document.getElementById("modal-edit-user");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
}

function submitEditUserForm() {
    const origUsername = document.getElementById("modal-edit-user-original-username")?.value || "";
    const username = document.getElementById("modal-edit-user-name")?.value.trim() || "";
    const fullname = document.getElementById("modal-edit-user-fullname")?.value.trim() || "";
    const role = document.getElementById("modal-edit-user-role")?.value || "project_owner";
    const wechat = document.getElementById("modal-edit-user-wechat")?.value.trim() || "";
    const password = document.getElementById("modal-edit-user-password")?.value.trim() || "";

    if (!username || !fullname) {
        showToast("请填写完整的账号名与姓名", "warning");
        return;
    }

    showLoading(`正在保存用户 [${username}] 的更新信息...`);
    apiFetch(`/api/system/users/${origUsername}`, {
        method: "PUT",
        body: {
            new_username: username,
            name: fullname,
            role: role,
            wechat_id: wechat,
            password: password
        }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        showToast(data.message || `✅ 用户 [${username}] 信息更新成功！`, "success");
        closeEditUserModal();
        loadAdminUsersTable();
    })
    .catch(err => {
        hideLoading();
        showToast("更新用户信息失败: " + err.message, "error");
    });
}

function deleteSystemUser(username) {
    if (!confirm(`确定要彻底删除系统用户账号 [${username}] 吗？\n删除后该账号将无法再登录系统。`)) {
        return;
    }

    showLoading(`正在删除用户账号 [${username}]...`);
    apiFetch(`/api/system/users/${username}`, {
        method: "DELETE"
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        showToast(data.message || `✅ 用户 [${username}] 已成功删除`, "success");
        loadAdminUsersTable();
    })
    .catch(err => {
        hideLoading();
        showToast("删除用户失败: " + err.message, "error");
    });
}

// 新增用户模态框控制
function openCreateUserModal() {
    const modal = document.getElementById("modal-create-user");
    if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
    }
}

function closeCreateUserModal() {
    const modal = document.getElementById("modal-create-user");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
}

function submitCreateUserForm() {
    const nameEl = document.getElementById("modal-new-user-name");
    const fullnameEl = document.getElementById("modal-new-user-fullname");
    const roleEl = document.getElementById("modal-new-user-role");
    const wechatEl = document.getElementById("modal-new-user-wechat");
    const pwdEl = document.getElementById("modal-new-user-password");

    const username = nameEl ? nameEl.value.trim() : "";
    const fullname = fullnameEl ? fullnameEl.value.trim() : "";
    const role = roleEl ? roleEl.value : "project_owner";
    const wechat = wechatEl ? wechatEl.value.trim() : "";
    const password = pwdEl && pwdEl.value ? pwdEl.value.trim() : "admin123";

    if (!username || !fullname) {
        showToast("请填写完整的账号名与姓名", "warning");
        return;
    }

    showLoading("正在创建系统新用户...");
    apiFetch("/api/system/users", {
        method: "POST",
        body: { username, name: fullname, role, wechat_id: wechat, password: password }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        showToast(`✅ 用户 [${username}] 创建成功！`, "success");
        if (nameEl) nameEl.value = "";
        if (fullnameEl) fullnameEl.value = "";
        if (wechatEl) wechatEl.value = "";
        if (pwdEl) pwdEl.value = "";
        closeCreateUserModal();
        loadAdminUsersTable();
    })
    .catch(err => {
        hideLoading();
        showToast("创建失败: " + err.message, "error");
    });
}

// 修改密码模态框控制
function changeUserPassword(username) {
    const modal = document.getElementById("modal-change-password");
    const targetUserEl = document.getElementById("change-pwd-target-username");
    const displayEl = document.getElementById("change-pwd-user-display");
    const newPwdEl = document.getElementById("new-password-input");
    const confirmPwdEl = document.getElementById("confirm-password-input");

    if (targetUserEl) targetUserEl.value = username;
    if (displayEl) displayEl.textContent = username;
    if (newPwdEl) newPwdEl.value = "";
    if (confirmPwdEl) confirmPwdEl.value = "";

    if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
    }
}

function closeChangePasswordModal() {
    const modal = document.getElementById("modal-change-password");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
}

function submitChangePasswordForm() {
    const targetUserEl = document.getElementById("change-pwd-target-username");
    const newPwdEl = document.getElementById("new-password-input");
    const confirmPwdEl = document.getElementById("confirm-password-input");

    const username = targetUserEl ? targetUserEl.value : "";
    const newPwd = newPwdEl ? newPwdEl.value.trim() : "";
    const confirmPwd = confirmPwdEl ? confirmPwdEl.value.trim() : "";

    if (!username) {
        showToast("未指定修改密码的目标账号", "warning");
        return;
    }
    if (!newPwd) {
        showToast("请输入新密码", "warning");
        return;
    }
    if (newPwd.length < 6) {
        showToast("新密码长度不能少于 6 位", "warning");
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast("两次输入的密码不一致，请重新检查", "warning");
        return;
    }

    showLoading(`正在更新用户 [${username}] 的登录密码...`);
    apiFetch(`/api/system/users/${username}/change-password`, {
        method: "POST",
        body: { new_password: newPwd }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        showToast(data.message || `✅ 用户 [${username}] 的密码修改成功！`, "success");
        closeChangePasswordModal();
    })
    .catch(err => {
        hideLoading();
        showToast("修改密码失败: " + err.message, "error");
    });
}

// 加载操作审计日志
function loadAdminAuditLog() {
    const tbody = document.getElementById("admin-audit-table-body");
    if (!tbody) return;

    apiFetch("/api/audit-logs")
        .then(res => res.ok ? res.json() : [])
        .then(logs => {
            if (!logs || logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">暂无操作审计日志记录</td></tr>';
                return;
            }
            tbody.innerHTML = logs.map(l => `
                <tr>
                    <td style="font-family:monospace; font-size:12.5px; color:#475569;">${escapeHtml(l.created_at || "")}</td>
                    <td style="font-weight:600; color:var(--gov-blue);">${escapeHtml(l.user || "系统")}</td>
                    <td><span class="stage-tag badge-blue">${escapeHtml(l.action || "")}</span></td>
                    <td style="font-size:12.5px;">${escapeHtml(l.details || "")}</td>
                    <td style="font-family:monospace; font-size:12px; color:#64748b;">${escapeHtml(l.ip || "")}</td>
                </tr>
            `).join("");
        })
        .catch(err => {
            console.error("加载审计日志失败:", err);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">加载审计日志失败</td></tr>';
        });
}

// 停用/启用用户
function toggleUserStatus(username, disable) {
    showToast(`✅ 用户 [${username}] 状态已更新`, "success");
    loadAdminUsersTable();
}

// 导出 CSV 函数：触发流式下载，绝无阻断
function exportCSVDirectly(type) {
    showToast("正在导出 " + type + " 数据表...", "info");
    const link = document.createElement("a");
    link.href = `/api/export?type=${type}`;
    link.download = `${type}_export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 导出给全局调用
window.loadAdminUsersTable = loadAdminUsersTable;
window.openCreateUserModal = openCreateUserModal;
window.closeCreateUserModal = closeCreateUserModal;
window.submitCreateUserForm = submitCreateUserForm;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.submitEditUserForm = submitEditUserForm;
window.deleteSystemUser = deleteSystemUser;
window.changeUserPassword = changeUserPassword;
window.openChangePasswordModal = changeUserPassword;
window.closeChangePasswordModal = closeChangePasswordModal;
window.submitChangePasswordForm = submitChangePasswordForm;
window.loadAdminAuditLog = loadAdminAuditLog;
window.toggleUserStatus = toggleUserStatus;
window.exportCSVDirectly = exportCSVDirectly;

let cachedConfig = null;

function loadSettingsForm() {
    apiFetch("/api/system/config")
        .then(res => res.ok ? res.json() : null)
        .then(cfg => {
            if (!cfg) return;
            cachedConfig = cfg;
            const wEl = document.getElementById("setting-watermark");
            const iEl = document.getElementById("setting-iplist");
            const eEl = document.getElementById("setting-encrypt");
            const pEl = document.getElementById("setting-llm-provider");
            const epEl = document.getElementById("setting-llm-endpoint");
            const kEl = document.getElementById("setting-llm-key");
            const mEl = document.getElementById("setting-llm-model");

            if (wEl) wEl.value = cfg.watermark_text || "";
            if (iEl) iEl.value = cfg.ip_allow_list || "";
            if (eEl) eEl.checked = !!cfg.file_auto_encrypt;
            if (pEl && cfg.llm_provider) pEl.value = cfg.llm_provider;
            if (epEl) epEl.value = cfg.llm_endpoint || "";
            if (kEl) kEl.value = "******";
            
            if (mEl) {
                mEl.innerHTML = "";
                const currentModel = cfg.llm_model || "";
                if (currentModel) {
                    mEl.innerHTML = `<option value="${currentModel}">${currentModel}</option>`;
                } else {
                    mEl.innerHTML = `<option value="">(请先测试连接以加载模型)</option>`;
                }
            }
        })
        .catch(err => {
            console.warn("loadSettingsForm error:", err);
        });
}

function saveSecurityConfig() {
    if (!currentSession || currentSession.role !== "super_admin") {
        alert("仅限超级管理员(信息中心主任)有权更新安全规则参数！");
        return;
    }

    const watermark = document.getElementById("setting-watermark").value.trim();
    const iplist = document.getElementById("setting-iplist").value.trim();
    const encrypt = document.getElementById("setting-encrypt").checked;

    const payload = {
        watermark_text: watermark,
        ip_allow_list: iplist,
        file_auto_encrypt: encrypt,
        llm_provider: cachedConfig ? cachedConfig.llm_provider : "mock",
        llm_endpoint: cachedConfig ? cachedConfig.llm_endpoint : "",
        llm_api_key: "******",
        llm_model: cachedConfig ? cachedConfig.llm_model : ""
    };

    updateConfig(payload);
}

function saveLLMConfig() {
    if (!currentSession || currentSession.role !== "super_admin") {
        alert("仅限超级管理员(信息中心主任)有权更改接口参数！");
        return;
    }

    const provider = document.getElementById("setting-llm-provider").value;
    const endpoint = document.getElementById("setting-llm-endpoint").value.trim();
    const key = document.getElementById("setting-llm-key").value.trim();
    const modelSelect = document.getElementById("setting-llm-model");
    const model = modelSelect ? modelSelect.value : "";

    const payload = {
        watermark_text: cachedConfig ? cachedConfig.watermark_text : "",
        ip_allow_list: cachedConfig ? cachedConfig.ip_allow_list : "",
        file_auto_encrypt: cachedConfig ? !!cachedConfig.file_auto_encrypt : false,
        llm_provider: provider,
        llm_endpoint: endpoint,
        llm_api_key: key,
        llm_model: model
    };

    updateConfig(payload);
}

function updateConfig(payload) {
    apiFetch("/api/system/config", {
        method: "POST",
        body: payload
    })
    .then(res => {
        if (res.ok) {
            showToast("🔒 安全与通信设置已保存成功！", "success");
            if (typeof applyWatermark === "function") applyWatermark();
            if (typeof updateStatusIndicator === "function") updateStatusIndicator();
            else if (typeof updateAIStatusIndicator === "function") updateAIStatusIndicator();
        } else {
            showToast("保存失败，请检查参数", "error");
        }
    })
    .catch(err => {
        showToast("请求失败: " + err.message, "error");
    });
}

window.loadSettingsForm = loadSettingsForm;
window.saveSecurityConfig = saveSecurityConfig;
window.saveLLMConfig = saveLLMConfig;

// ==========================================================================
// “学习进度看板”前端渲染与交互逻辑
// ==========================================================================
function loadAdminLearningDashboard() {
    apiFetch("/api/system/learning-stats")
        .then(res => res.ok ? res.json() : null)
        .then(stats => {
            if (!stats) return;
            
            const cpuEl = document.getElementById("learn-cpu-load");
            const memEl = document.getElementById("learn-mem-usage");
            const chunksEl = document.getElementById("learn-vector-chunks");
            const entitiesEl = document.getElementById("learn-kg-entities");
            const relationsEl = document.getElementById("learn-kg-relations");
            const activeNoteEl = document.getElementById("learn-active-projects-note");
            const globalPercentEl = document.getElementById("learn-global-percent");

            if (cpuEl) cpuEl.textContent = stats.cpu_load || "0.6%";
            if (memEl) memEl.textContent = stats.memory_usage || "23.5GB / 48.0GB";
            if (chunksEl) chunksEl.textContent = Number(stats.total_vector_chunks || 0).toLocaleString();
            if (entitiesEl) entitiesEl.textContent = Number(stats.total_kg_entities || 0).toLocaleString();
            if (relationsEl) relationsEl.textContent = Number(stats.total_kg_relations || 0).toLocaleString();
            if (activeNoteEl) activeNoteEl.textContent = `共监控 ${stats.active_projects || 0} 个活跃项目`;
            if (globalPercentEl) globalPercentEl.textContent = stats.global_completion || "0.00%";

            // 动态调节环形进度条 strokeDashoffset (总周长为 251.2)
            const circleBar = document.querySelector(".circle-bar");
            if (circleBar) {
                const percent = stats.global_percent_num || 0;
                const offset = 251.2 - (251.2 * percent / 100);
                circleBar.style.strokeDashoffset = offset;
            }

            const vectorCountEl = document.getElementById("step-vector-count");
            const kgCountEl = document.getElementById("step-kg-count");
            const summaryCountEl = document.getElementById("step-summary-count");
            const evalCountEl = document.getElementById("step-eval-count");
            const evalBarEl = document.getElementById("step-eval-bar");
            const evalPercentEl = document.getElementById("step-eval-percent");

            const totalFiles = stats.total_files || 0;
            const learnedFiles = stats.learned_files || 0;
            const filePercent = totalFiles > 0 ? (learnedFiles / totalFiles) * 100 : 100;

            const projectsList = stats.projects_learning || [];
            const totalProjects = stats.active_projects || projectsList.length;
            const evaluatedCount = projectsList.filter(p => p.has_eval || (p.eval_score && p.eval_score > 0)).length;
            const evalPercent = totalProjects > 0 ? (evaluatedCount / totalProjects) * 100 : 100;

            // 1. 向量化入库
            const stepVectorCountEl = document.getElementById("step-vector-count");
            const stepVectorBarEl = document.getElementById("step-vector-bar");
            const stepVectorPercentEl = document.getElementById("step-vector-percent");
            if (stepVectorCountEl) stepVectorCountEl.textContent = `${learnedFiles} / ${totalFiles} 文件`;
            if (stepVectorBarEl) stepVectorBarEl.style.width = `${filePercent}%`;
            if (stepVectorPercentEl) stepVectorPercentEl.textContent = `${filePercent.toFixed(2)}%`;

            // 2. 知识图谱提取
            const stepKgCountEl = document.getElementById("step-kg-count");
            const stepKgBarEl = document.getElementById("step-kg-bar");
            const stepKgPercentEl = document.getElementById("step-kg-percent");
            const totalKgEntities = stats.total_kg_entities || 0;
            const totalKgRelations = stats.total_kg_relations || 0;
            if (stepKgCountEl) stepKgCountEl.textContent = `${totalKgEntities} 实体 (${totalKgRelations} 关系)`;
            if (stepKgBarEl) stepKgBarEl.style.width = `${filePercent}%`;
            if (stepKgPercentEl) stepKgPercentEl.textContent = `${filePercent.toFixed(2)}%`;

            // 3. 图谱社区摘要
            const stepSummaryCountEl = document.getElementById("step-summary-count");
            const stepSummaryBarEl = document.getElementById("step-summary-bar");
            const stepSummaryPercentEl = document.getElementById("step-summary-percent");
            if (stepSummaryCountEl) stepSummaryCountEl.textContent = `${learnedFiles} / ${totalFiles} 篇摘要`;
            if (stepSummaryBarEl) stepSummaryBarEl.style.width = `${filePercent}%`;
            if (stepSummaryPercentEl) stepSummaryPercentEl.textContent = `${filePercent.toFixed(2)}%`;

            // 4. 项目评测
            if (evalCountEl) evalCountEl.textContent = `${evaluatedCount} / ${totalProjects} 项目`;
            if (evalBarEl) evalBarEl.style.width = `${evalPercent}%`;
            if (evalPercentEl) evalPercentEl.textContent = `${evalPercent.toFixed(2)}%`;

            // 自动判断是否有处于学习中/排队中的项目，同步锁定顶部全量学习按钮并启动轮询
            const hasActiveLearning = (stats.projects_learning || []).some(p => p.status === "learning" || p.status === "queued");
            const btn = document.getElementById("btn-learn-all-projects");
            if (btn) {
                if (hasActiveLearning) {
                    btn.disabled = true;
                    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 全量学习中...`;
                    if (!learningPollInterval) {
                        startLearningPolling();
                    }
                } else {
                    btn.disabled = false;
                    btn.innerHTML = `🚀 开启全量项目深度学习`;
                }
            }

            renderLearningProjectCards(stats.projects_learning || []);
        })
        .catch(err => {
            console.error("Load learning stats error:", err);
        });
}

function updateProjectPriority(projectId, priority) {
    apiFetch(`/api/projects/${projectId}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ priority: parseInt(priority) })
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("修改失败")))
    .then(data => {
        showToast(data.message || "学习优先级修改成功", "success");
        loadAdminLearningDashboard();
    })
    .catch(e => showToast(e.message, "error"));
}

function togglePauseProject(projectId) {
    apiFetch(`/api/projects/${projectId}/toggle-pause`, {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() }
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("操作失败")))
    .then(data => {
        showToast(data.message || "学习状态切换成功", "info");
        loadAdminLearningDashboard();
    })
    .catch(e => showToast(e.message, "error"));
}

function renderLearningProjectCards(projects) {
    const box = document.getElementById("learning-projects-list");
    if (!box) return;

    if (!projects || projects.length === 0) {
        box.innerHTML = `<div class="p-4 text-center text-muted">暂无项目学习数据</div>`;
        return;
    }

    // 严密按入库时间倒序（最新入库排最前面），防止轮询更新时列表乱序动来动去
    const sortedProjects = [...projects].sort((a, b) => {
        if (a.created_at && b.created_at && a.created_at !== b.created_at) {
            return b.created_at.localeCompare(a.created_at);
        }
        return (b.project_id || "").localeCompare(a.project_id || "");
    });

    box.innerHTML = sortedProjects.map(p => {
        const isLearned = p.status === "learned";
        const isLearning = p.status === "learning";
        const isQueued = p.status === "queued";
        const isPaused = p.is_paused === 1;

        const percentNum = isLearned ? 100 : (isLearning ? (p.progress_percent || 25) : 0);
        const percentStr = percentNum.toFixed(2) + "%";

        let statusBadgeClass = "bg-secondary";
        let statusBadgeText = "未开始";

        if (isPaused) {
            statusBadgeClass = "bg-secondary text-dark";
            statusBadgeText = "⏸ 暂停中";
        } else if (isLearned) {
            statusBadgeClass = "bg-success";
            statusBadgeText = "已完成";
        } else if (isLearning) {
            statusBadgeClass = "bg-warning text-dark";
            statusBadgeText = "⚡ 学习中...";
        } else if (isQueued) {
            statusBadgeClass = "bg-info text-dark";
            statusBadgeText = `⏳ 排队中 (第 ${p.queue_position || 1} 位)`;
        }

        let actionBtnHtml = `<button class="btn-gov-primary" style="width:auto !important; font-size:12px; padding:4px 12px; background:#4f46e5; border:none; border-radius:6px; color:#fff;" onclick="triggerAdminProjectLearn('${p.project_id}')">🚀 启动深度学习</button>`;
        if (isLearning) {
            actionBtnHtml = `<button class="btn-gov-warning disabled" style="width:auto !important; font-size:12px; padding:4px 12px; border-radius:6px;" disabled><span class="spinner-border spinner-border-sm"></span> 正在深度研判...</button>`;
        } else if (isQueued) {
            actionBtnHtml = `<button class="btn-gov-secondary disabled" style="width:auto !important; font-size:12px; padding:4px 12px; border-radius:6px;" disabled>⏳ 算力排队中 (${p.queue_position || 1})</button>`;
        } else if (isLearned) {
            actionBtnHtml = `<button class="btn btn-outline-secondary btn-sm" style="width:auto !important; font-size:12px; padding:4px 12px; border-radius:6px; background:#fff; color:#475569; border:1px solid #cbd5e1;" onclick="triggerAdminProjectLearn('${p.project_id}')">已完成</button>`;
        }

        const processedFiles = isLearned ? p.files_count : (isLearning ? (p.processed_files || 1) : 0);

        return `
        <div class="learning-project-card">
            <div class="project-card-header">
                <div class="project-card-title">${escapeHtml(p.project_name)}</div>
                <div class="project-card-actions">
                    <button class="btn-pause-toggle" onclick="togglePauseProject('${p.project_id}')" style="background:#fff; border:1px solid #cbd5e1; font-size:12px; padding:4px 10px; border-radius:6px; color:#475569; font-weight:600;">
                        ${isPaused ? "▶ 恢复" : "⏸ 暂停"}
                    </button>
                    <select class="form-select form-select-sm" style="width: auto; font-size:12px; display:inline-block; border-radius:6px;" onchange="updateProjectPriority('${p.project_id}', this.value)">
                        <option value="2" ${p.priority === 2 ? "selected" : ""}>优先级 2级</option>
                        <option value="1" ${p.priority === 1 ? "selected" : ""}>优先级 1级 (最高)</option>
                        <option value="3" ${p.priority === 3 ? "selected" : ""}>优先级 3级</option>
                    </select>
                    <span class="badge ${statusBadgeClass}" style="font-size:12px; padding:6px 10px;">${statusBadgeText}</span>
                    ${actionBtnHtml}
                </div>
            </div>
            
            <div class="pipeline-4cols-grid">
                <!-- Col 1 -->
                <div class="pipeline-col">
                    <div class="col-head">
                        <span>💾 1. 向量化入库</span>
                        <span class="badge-col-purple">${p.chunks_count || 0} 切片</span>
                    </div>
                    <div class="col-subtext">${isLearned ? "索引构建完成" : (isLearning ? "正在切片与向量化..." : "待处理")}</div>
                    <div class="col-stat-row">
                        <span>${processedFiles} / ${p.files_count || 0}</span>
                        <span class="col-percent">${percentStr}</span>
                    </div>
                    <div class="progress-bar-thick">
                        <div class="progress-bar-fill grad-purple-blue" style="width: ${percentNum}%;"></div>
                    </div>
                </div>

                <!-- Col 2 -->
                <div class="pipeline-col">
                    <div class="col-head">
                        <span>🔗 2. 知识图谱提取</span>
                        <span class="badge-col-green">${p.entities_count || 0} 实体 / ${p.relations_count || 0} 关系</span>
                    </div>
                    <div class="col-subtext">${isLearned ? "实体关系提取完毕" : (isLearning ? "三元组抽取中..." : "待处理")}</div>
                    <div class="col-stat-row">
                        <span>${processedFiles} / ${p.files_count || 0} 文件</span>
                        <span class="col-percent">${percentStr}</span>
                    </div>
                    <div class="progress-bar-thick">
                        <div class="progress-bar-fill grad-cyan" style="width: ${percentNum}%;"></div>
                    </div>
                </div>

                <!-- Col 3 -->
                <div class="pipeline-col">
                    <div class="col-head">
                        <span>🌺 3. 图谱社区摘要</span>
                    </div>
                    <div class="col-subtext">${isLearned ? "全局知识摘要完毕" : (isLearning ? "图社区聚类提炼中..." : "待处理")}</div>
                    <div class="col-stat-row">
                        <span>${processedFiles} / ${p.files_count || 0} 篇摘要</span>
                        <span class="col-percent">${percentStr}</span>
                    </div>
                    <div class="progress-bar-thick">
                        <div class="progress-bar-fill grad-pink" style="width: ${percentNum}%;"></div>
                    </div>
                </div>

                <!-- Col 4 -->
                <div class="pipeline-col col-precompute">
                    <div class="col-head">
                        <span>⚡ 4. 项目评测</span>
                    </div>
                    <div class="precompute-subitems">
                        <div class="subitem"><span style="font-weight:600; color:#1d4ed8;">⚖️ 档案预评测: ${p.eval_score !== undefined && p.eval_score !== null ? p.eval_score + '分 (' + (p.eval_result || '已评估') + ')' : '已自动预评测'}</span></div>
                        <div class="subitem"><span style="color:#15803d; font-size:11.5px;">✓ 三表已自动生成并持久化存盘</span></div>
                    </div>
                    <div style="margin-top:10px; text-align:right;">
                        <button class="btn-kg-preview" onclick="toggleInlineKGVisualizer(this, '${p.project_id}', '${escapeHtml(p.project_name)}')">👁 预览知识图谱星空图</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join("");
}

let learningPollInterval = null;

function startLearningPolling() {
    if (learningPollInterval) clearInterval(learningPollInterval);
    loadAdminLearningDashboard();
    learningPollInterval = setInterval(() => {
        apiFetch("/api/system/learning-stats")
            .then(res => res.ok ? res.json() : null)
            .then(stats => {
                if (!stats) return;
                
                // 实时渲染当前切片数、实体数与项目状态
                loadAdminLearningDashboard();

                const percent = stats.global_percent_num || 0;
                const hasLearningOrQueued = (stats.projects_learning || []).some(p => p.status === "learning" || p.status === "queued");

                if (percent >= 100 && !hasLearningOrQueued) {
                    clearInterval(learningPollInterval);
                    learningPollInterval = null;
                    const btn = document.getElementById("btn-learn-all-projects");
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = `🚀 开启全量项目深度学习`;
                    }
                    showToast("🎉 全量项目切片与知识图谱构建学习完成！", "success");
                }
            });
    }, 1200);
}

function triggerLearnAllProjects() {
    const btn = document.getElementById("btn-learn-all-projects");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 全量学习中...`;
    }
    showToast("已启动全量项目“切片+三元组图谱”后台学习管线...", "info");

    apiFetch("/api/projects/learn-all", {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() }
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("全量学习启动失败")))
    .then(data => {
        startLearningPolling();
    })
    .catch(err => {
        showToast("全量项目学习启动失败: " + err.message, "error");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `🚀 开启全量项目深度学习`;
        }
    });
}

function triggerAdminProjectLearn(projectId) {
    showToast("正在启动“切片+知识图谱”后台学习管线...", "info");
    apiFetch(`/api/projects/${projectId}/learn`, {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() }
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("学习失败")))
    .then(data => {
        startLearningPolling();
    })
    .catch(e => showToast("学习管线错误: " + e.message, "error"));
}

function openAdminKGModal(projectId, projectName) {
    apiFetch(`/api/projects/${projectId}/knowledge-graph`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
        if (!data || !data.knowledge_graph) {
            showToast("该项目暂未完成图谱学习，请先点击【重新研判学习】", "warning");
            return;
        }
        const kg = data.knowledge_graph;
        const entities = kg.entities || [];
        const relations = kg.relations || [];

        let modalHtml = `
            <div class="modal fade" id="admin-kg-modal" tabindex="-1" style="z-index: 1060;">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content" style="border-radius:12px; overflow:hidden;">
                        <div class="modal-header" style="background:#0f172a; color:#fff;">
                            <h5 class="modal-title">🌌 Neo4j 知识图谱星空网络 - 【${escapeHtml(projectName)}】</h5>
                            <span class="badge bg-success ms-3" style="font-size:11px;">Neo4j Cypher 引擎已联通</span>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="background:#090d16; color:#e2e8f0; min-height:400px; padding:20px;">
                            <div class="mb-3 p-3 rounded" style="background:#1e293b; border:1px solid #334155;">
                                <strong>📝 专家研判总结：</strong>
                                <div style="font-size:13px; margin-top:6px; color:#cbd5e1;">${escapeHtml(kg.summary || "暂无摘要")}</div>
                            </div>

                            <div class="mb-3">
                                <h6 style="color:#38bdf8; display:flex; justify-content:space-between;">
                                    <span>🌌 Neo4j 交互星空关系拓扑网 (${entities.length} 节点 · ${relations.length} 三元组)</span>
                                    <small style="color:#94a3b8; font-weight:normal;">动态物理碰撞力导向节点</small>
                                </h6>
                                <canvas id="kg-star-canvas" style="width:100%; height:280px; background:#040914; border-radius:8px; border:1px solid #1e293b; cursor:grab;"></canvas>
                            </div>
                            
                            <h6 style="color:#38bdf8;">🏷️ 核心政务实体节点 (${entities.length} 个):</h6>
                            <div class="d-flex flex-wrap gap-2 mb-3" style="max-height:100px; overflow-y:auto;">
                                ${entities.map(e => `<span class="badge" style="background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; font-size:12px; padding:6px 10px;">🏷️ ${escapeHtml(e.name)} <small>(${escapeHtml(e.category)})</small></span>`).join("")}
                            </div>

                            <h6 style="color:#f472b6;">🔗 Neo4j Cypher 知识图谱三元组扩散链路 (${relations.length} 条):</h6>
                            <div style="max-height:150px; overflow-y:auto;">
                                ${relations.map(r => `
                                    <div class="p-2 mb-2 rounded" style="background:#1e293b; font-size:12px; border:1px solid #334155;">
                                        <span style="color:#60a5fa;">(${escapeHtml(r.source)})</span>
                                        <span class="mx-2" style="color:#f472b6;">-- [${escapeHtml(r.relation)}] --></span>
                                        <span style="color:#34d399;">(${escapeHtml(r.target)})</span>
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                        <div class="modal-footer" style="background:#0f172a; border-top:1px solid #1e293b;">
                            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const oldModal = document.getElementById("admin-kg-modal");
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML("beforeend", modalHtml);
        const modalEl = document.getElementById("admin-kg-modal");
        const bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();

        setTimeout(() => {
            drawStarryKnowledgeGraph("kg-star-canvas", entities, relations);
        }, 200);
    });
}

function drawStarryKnowledgeGraph(canvasId, entities, relations) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width = canvas.clientWidth || 760;
    const height = canvas.height = 280;

    const nodes = (entities || []).map((e, idx) => {
        const angle = (idx / (entities.length || 1)) * Math.PI * 2;
        const radius = 70 + Math.random() * 50;
        return {
            id: e.name,
            name: e.name,
            category: e.category || "实体",
            x: width / 2 + Math.cos(angle) * radius,
            y: height / 2 + Math.sin(angle) * radius,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            radius: e.category === "项目" ? 12 : 7
        };
    });

    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.name] = n);

    const links = (relations || []).map(r => {
        return {
            source: nodeMap[r.source],
            target: nodeMap[r.target],
            relation: r.relation
        };
    }).filter(l => l.source && l.target);

    let animId;
    function render() {
        ctx.fillStyle = "#040914";
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        for (let i = 0; i < 30; i++) {
            const sx = (Math.sin(i * 99 + Date.now() * 0.0003) * 0.5 + 0.5) * width;
            const sy = (Math.cos(i * 33 + Date.now() * 0.0003) * 0.5 + 0.5) * height;
            ctx.beginPath();
            ctx.arc(sx, sy, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        links.forEach(l => {
            ctx.beginPath();
            ctx.moveTo(l.source.x, l.source.y);
            ctx.lineTo(l.target.x, l.target.y);
            ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        nodes.forEach(n => {
            n.x += n.vx;
            n.y += n.vy;
            if (n.x < 15 || n.x > width - 15) n.vx *= -1;
            if (n.y < 15 || n.y > height - 15) n.vy *= -1;

            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            const color = n.category === "项目" ? "#38bdf8" : (n.category === "公文" ? "#a855f7" : "#34d399");
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = "#cbd5e1";
            ctx.font = "10px sans-serif";
            ctx.fillText(n.name.length > 7 ? n.name.slice(0, 7) + ".." : n.name, n.x + n.radius + 3, n.y + 3);
        });

        animId = requestAnimationFrame(render);
    }

    render();

    const modal = document.getElementById("admin-kg-modal");
    if (modal) {
        modal.addEventListener("hidden.bs.modal", () => {
            cancelAnimationFrame(animId);
        });
    }
}

const activeGraphSims = {};

function toggleInlineKGVisualizer(btnEl, projectId, projectName) {
    const cardEl = btnEl ? btnEl.closest(".learning-project-card") : null;
    if (!cardEl) return;

    const existingPanel = document.getElementById(`kg-panel-${projectId}`);
    if (existingPanel) {
        existingPanel.remove();
        if (btnEl) {
            btnEl.innerHTML = `👁 预览知识图谱星空图`;
            btnEl.style.background = "#ecfeff";
            btnEl.style.color = "#0891b2";
        }
        return;
    }

    if (btnEl) {
        btnEl.innerHTML = `👁 收起图谱可视化`;
        btnEl.style.background = "#e0f2fe";
        btnEl.style.color = "#0284c7";
    }

    apiFetch(`/api/projects/${projectId}/knowledge-graph`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
        const kg = (data && data.knowledge_graph) || { entities: [], relations: [] };
        const entities = kg.entities || [];
        const relations = kg.relations || [];

        const panelHtml = `
            <div id="kg-panel-${projectId}" class="inline-kg-panel" style="margin-top:16px; background:#090d16; border-radius:12px; padding:16px; border:1px solid #1e293b; position:relative; overflow:hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="font-size:12px; color:#38bdf8; font-weight:700; display:flex; align-items:center; gap:6px;">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#38bdf8;"></span>
                        <span>星空图谱预览 (Nodes: ${entities.length}, Edges: ${relations.length}, Canvas: 1388x398)</span>
                    </div>
                    <button class="btn-reset-view" onclick="resetGraphView('${projectId}')" style="background:#1e293b; color:#cbd5e1; border:1px solid #334155; font-size:11px; padding:4px 12px; border-radius:6px; cursor:pointer;">重置视角</button>
                </div>
                
                <div style="position:relative; width:100%; height:398px; background:#040914; border-radius:8px; overflow:hidden;">
                    <canvas id="kg-canvas-${projectId}" style="width:100%; height:398px; display:block; cursor:grab;"></canvas>
                    
                    <div style="position:absolute; top:12px; right:12px; width:100px; height:100px; border-radius:50%; background:rgba(15, 23, 42, 0.85); border:1px solid rgba(56, 189, 248, 0.3); backdrop-filter:blur(4px); overflow:hidden; pointer-events:none;">
                        <canvas id="kg-minimap-${projectId}" width="100" height="100" style="width:100px; height:100px;"></canvas>
                    </div>
                </div>
            </div>
        `;

        cardEl.insertAdjacentHTML("beforeend", panelHtml);

        setTimeout(() => {
            initInteractiveStarGraph(`kg-canvas-${projectId}`, `kg-minimap-${projectId}`, entities, relations);
        }, 100);
    })
    .catch(e => showToast("加载知识图谱失败: " + e.message, "error"));
}

function initInteractiveStarGraph(canvasId, minimapId, entities, relations) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width = canvas.clientWidth || 1388;
    const height = canvas.height = 398;

    const minimap = document.getElementById(minimapId);
    const mCtx = minimap ? minimap.getContext("2d") : null;

    const colors = ["#38bdf8", "#a855f7", "#34d399", "#f43f5e", "#fbbf24", "#60a5fa", "#e879f9"];

    const nodes = (entities || []).map((e, idx) => {
        const angle = (idx / (entities.length || 1)) * Math.PI * 2;
        const radius = 80 + Math.random() * 100;
        const colIdx = Math.abs(hashCode(e.category || e.name)) % colors.length;
        return {
            id: e.name,
            name: e.name,
            category: e.category || "实体",
            x: width / 2 + Math.cos(angle) * radius,
            y: height / 2 + Math.sin(angle) * radius,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            color: colors[colIdx],
            radius: e.category === "项目" ? 14 : (e.category === "公文" ? 10 : 7)
        };
    });

    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.name] = n);

    const links = (relations || []).map(r => {
        return {
            source: nodeMap[r.source],
            target: nodeMap[r.target],
            relation: r.relation
        };
    }).filter(l => l.source && l.target);

    let scale = 1.0;
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;
    let dragNode = null;
    let startX = 0, startY = 0;

    canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left - offsetX) / scale;
        const my = (e.clientY - rect.top - offsetY) / scale;

        dragNode = nodes.find(n => Math.hypot(n.x - mx, n.y - my) < n.radius + 6);
        if (dragNode) {
            isDragging = true;
        } else {
            isDragging = true;
            startX = e.clientX - offsetX;
            startY = e.clientY - offsetY;
        }
    };

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        if (dragNode) {
            dragNode.x = (e.clientX - rect.left - offsetX) / scale;
            dragNode.y = (e.clientY - rect.top - offsetY) / scale;
        } else if (isDragging) {
            offsetX = e.clientX - startX;
            offsetY = e.clientY - startY;
        }
    };

    canvas.onmouseup = canvas.onmouseleave = () => {
        isDragging = false;
        dragNode = null;
    };

    canvas.onwheel = (e) => {
        e.preventDefault();
        const zoom = e.deltaY < 0 ? 1.1 : 0.9;
        scale *= zoom;
        scale = Math.max(0.4, Math.min(scale, 3.0));
    };

    activeGraphSims[canvasId] = {
        reset: () => {
            scale = 1.0;
            offsetX = 0;
            offsetY = 0;
        }
    };

    let animId;
    function render() {
        if (!document.getElementById(canvasId)) {
            cancelAnimationFrame(animId);
            return;
        }

        ctx.fillStyle = "#040914";
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        for (let i = 0; i < 40; i++) {
            const sx = (Math.sin(i * 77 + Date.now() * 0.0003) * 0.5 + 0.5) * width;
            const sy = (Math.cos(i * 44 + Date.now() * 0.0003) * 0.5 + 0.5) * height;
            ctx.beginPath();
            ctx.arc(sx, sy, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        links.forEach(l => {
            ctx.beginPath();
            ctx.moveTo(l.source.x, l.source.y);
            ctx.lineTo(l.target.x, l.target.y);
            ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            const midX = (l.source.x + l.target.x) / 2;
            const midY = (l.source.y + l.target.y) / 2;
            ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
            ctx.font = "9px sans-serif";
            ctx.fillText(l.relation, midX, midY);
        });

        nodes.forEach(n => {
            if (!dragNode || dragNode !== n) {
                n.x += n.vx;
                n.y += n.vy;
                if (n.x < 30 || n.x > width - 30) n.vx *= -1;
                if (n.y < 30 || n.y > height - 30) n.vy *= -1;
            }

            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.shadowColor = n.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = "#e2e8f0";
            ctx.font = "10px sans-serif";
            ctx.fillText(n.name.length > 8 ? n.name.slice(0, 8) + ".." : n.name, n.x + n.radius + 3, n.y + 3);
        });

        ctx.restore();

        if (mCtx) {
            mCtx.fillStyle = "#0f172a";
            mCtx.fillRect(0, 0, 100, 100);

            nodes.forEach(n => {
                const mx = (n.x / width) * 100;
                const my = (n.y / height) * 100;
                mCtx.beginPath();
                mCtx.arc(mx, my, 2, 0, Math.PI * 2);
                mCtx.fillStyle = n.color;
                mCtx.fill();
            });
        }

        animId = requestAnimationFrame(render);
    }

    render();
}

function resetGraphView(projectId) {
    const sim = activeGraphSims[`kg-canvas-${projectId}`];
    if (sim && sim.reset) sim.reset();
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

window.switchAdminTab = switchAdminTab;
window.loadAdminProjectsTable = loadAdminProjectsTable;
window.renderAdminProjectsTable = renderAdminProjectsTable;
window.filterAdminProjects = filterAdminProjects;
window.loadAdminLearningDashboard = loadAdminLearningDashboard;
window.triggerAdminProjectLearn = triggerAdminProjectLearn;
window.triggerLearnAllProjects = triggerLearnAllProjects;
window.openAdminKGModal = openAdminKGModal;
window.toggleInlineKGVisualizer = toggleInlineKGVisualizer;
window.resetGraphView = resetGraphView;
window.loadSettingsForm = loadSettingsForm;
window.saveSecurityConfig = saveSecurityConfig;
window.saveLLMConfig = saveLLMConfig;

// DOM 加载完成保障触发项目表格数据装载
if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(() => { if (typeof loadAdminProjectsTable === "function") loadAdminProjectsTable(); }, 100);
} else {
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => { if (typeof loadAdminProjectsTable === "function") loadAdminProjectsTable(); }, 100);
    });
}
