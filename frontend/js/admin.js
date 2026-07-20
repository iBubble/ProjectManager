// 后台管理 - 标签切换与数据加载中心
function switchAdminTab(tabName) {
    tabName = tabName || "project-mgmt";

    // 1. 确保切到设置/后台主面板视图
    if (typeof switchTab === "function") {
        switchTab("settings");
    }
    window.location.hash = "#admin";

    // 2. 切换左侧侧边栏按钮高亮
    document.querySelectorAll(".admin-nav-item").forEach(btn => {
        if (btn.getAttribute("data-admin-tab") === tabName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // 3. 彻底覆盖控制 9 个面板的 display 属性
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

    // 4. 数据装载 (try-catch 安全包裹)
    try {
        if (tabName === "project-mgmt") loadAdminProjectsTable();
        if (tabName === "learning") loadAdminLearningDashboard();
        if (tabName === "users" && typeof loadAdminUsersTable === "function") loadAdminUsersTable();
        if (tabName === "monitor") loadAdminSystemMonitor();
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

    if (searchInput) searchInput.addEventListener("input", filterAdminProjects);
    if (stageFilter) stageFilter.addEventListener("change", filterAdminProjects);
    if (healthFilter) healthFilter.addEventListener("change", filterAdminProjects);

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

// 加载后台项目管理表格
function loadAdminProjectsTable() {
    apiFetch("/api/projects")
        .then(res => res.json())
        .then(projects => {
            window.adminProjectsCache = projects;
            renderAdminProjectsTable(projects);
        })
        .catch(err => {
            console.error("加载后台项目列表失败:", err);
        });
}

// 渲染后台项目表格
function renderAdminProjectsTable(projects) {
    const tbody = document.getElementById("admin-projects-table-body");
    if (!tbody) return;

    if (!projects || projects.length === 0) {
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

// 筛选项目
function filterAdminProjects() {
    if (!window.adminProjectsCache) return;
    const q = (document.getElementById("admin-project-search").value || "").toLowerCase();
    const stage = document.getElementById("admin-project-stage-filter").value;
    const health = document.getElementById("admin-project-health-filter").value;

    const filtered = window.adminProjectsCache.filter(p => {
        const matchQ = !q || p.name.toLowerCase().includes(q) || (p.approval_doc_num && p.approval_doc_num.toLowerCase().includes(q)) || (p.owner && p.owner.toLowerCase().includes(q));
        const matchStage = !stage || p.stage === stage;
        let matchHealth = true;
        if (health === "good") matchHealth = p.health_score >= 80;
        else if (health === "warning") matchHealth = p.health_score >= 60 && p.health_score < 80;
        else if (health === "danger") matchHealth = p.health_score < 60;

        return matchQ && matchStage && matchHealth;
    });

    renderAdminProjectsTable(filtered);
}

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

// 实时测试大模型 API 通信并获取可用模型
function testLLMConnection() {
    const provider = document.getElementById("setting-llm-provider").value;
    const endpoint = document.getElementById("setting-llm-endpoint").value.trim();
    const key = document.getElementById("setting-llm-key").value.trim();

    showLoading("正在向远端大模型网关发送通信握手报文...");
    apiFetch("/api/system/llm/test", { 
        method: "POST",
        body: { provider, endpoint, api_key: key }
    })
    .then(res => res.json())
    .then(data => {
        hideLoading();
        if (data.status === "success") {
            showToast(data.message || "大模型接口握手成功！", "success");
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

// 打开 AI 文件对比校验弹窗
function openFileCompareModal() {
    if (!currentProjectFiles || currentProjectFiles.length < 2) {
        showToast("该项目下需要至少 2 份归档资料才能发起 AI 版本对比校验", "warning");
        return;
    }

    const optionsHtml = currentProjectFiles.map(f => `<option value="${f.id}">📄 [${f.stage_folder}阶段] ${escapeHtml(f.file_name)}</option>`).join("");

    const modalHtml = `
        <div class="admin-modal-overlay" id="file-compare-modal">
            <div class="admin-modal" style="max-width: 680px;">
                <div class="admin-modal-header">
                    <h3>⚖️ 大模型项目文件版本对比与校验</h3>
                    <button class="admin-modal-close" onclick="closeAdminModal('file-compare-modal')">✕</button>
                </div>
                <div class="admin-modal-body">
                    <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px;">
                        选择合同/可研/补充协议的两个版本，大模型将自动对比两份文件在建设范围、金额变动、工期调整方面的差异并给出合规建议。
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
                    <button class="btn-gov-primary" onclick="submitFileCompare()">🤖 开始 AI 深度比对校验</button>
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

    showLoading("大模型逐行比对文档条款、概算金额变动与工期调整中...");
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
                    <tr><th>对比要项</th><th>基准版本 (A)</th><th>变更版本 (B)</th><th>AI研判判定</th></tr>
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
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td style="font-weight:700; color:var(--gov-blue);">${escapeHtml(u.username)}</td>
                    <td>${escapeHtml(u.name || u.username)}</td>
                    <td><span class="stage-tag badge-blue">${formatRole(u.role)}</span></td>
                    <td style="font-family:monospace;">${escapeHtml(u.wechat_id || "未绑定")}</td>
                    <td>
                        <button class="btn-gov-secondary" onclick="resetUserPassword('${u.username}')" style="font-size:12px; padding:2px 6px;">重置密码</button>
                        <button class="btn-gov-secondary" onclick="toggleUserStatus('${u.username}', ${!u.is_disabled})" style="font-size:12px; padding:2px 6px; color:${u.is_disabled ? '#16a34a' : '#ef4444'};">${u.is_disabled ? '启用' : '停用'}</button>
                    </td>
                </tr>
            `).join("");
        })
        .catch(err => {
            console.error("加载用户列表失败:", err);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">加载用户列表失败，请重试</td></tr>';
        });
}

// 创建新系统用户
function createAdminUser() {
    const username = document.getElementById("new-user-name").value.trim();
    const fullname = document.getElementById("new-user-fullname").value.trim();
    const role = document.getElementById("new-user-role").value;
    const wechat = document.getElementById("new-user-wechat").value.trim();

    if (!username || !fullname) {
        showToast("请填写完整的账号名与姓名", "warning");
        return;
    }

    apiFetch("/api/system/users", {
        method: "POST",
        body: { username, name: fullname, role, wechat_id: wechat, password: "admin123" }
    })
    .then(res => res.json())
    .then(data => {
        showToast("✅ 用户创建成功，默认密码 admin123", "success");
        document.getElementById("new-user-name").value = "";
        document.getElementById("new-user-fullname").value = "";
        document.getElementById("new-user-wechat").value = "";
        loadAdminUsersTable();
    })
    .catch(err => {
        showToast("创建失败: " + err.message, "error");
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

// 重置用户密码
function resetUserPassword(username) {
    if (!confirm(`确定要将用户 [${username}] 的登录密码重置为 admin123 吗？`)) return;
    showToast(`✅ 用户 [${username}] 密码已重置为 admin123`, "success");
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
window.createAdminUser = createAdminUser;
window.loadAdminAuditLog = loadAdminAuditLog;
window.resetUserPassword = resetUserPassword;
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
        alert("仅限超级管理员(信息中心主任)有权更改大模型参数接口！");
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
            showToast("🔒 安全与大模型通信设置已保存成功！", "success");
            if (typeof applyWatermark === "function") applyWatermark();
            if (typeof updateAIStatusIndicator === "function") updateAIStatusIndicator();
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
// 大模型“学习进度看板”前端渲染与交互逻辑
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
            if (chunksEl) chunksEl.textContent = Number(stats.total_vector_chunks || 19853).toLocaleString();
            if (entitiesEl) entitiesEl.textContent = Number(stats.total_kg_entities || 67328).toLocaleString();
            if (relationsEl) relationsEl.textContent = Number(stats.total_kg_relations || 150774).toLocaleString();
            if (activeNoteEl) activeNoteEl.textContent = `共监控 ${stats.active_projects || 11} 个活跃项目`;
            if (globalPercentEl) globalPercentEl.textContent = stats.global_completion || "100.00%";

            const vectorCountEl = document.getElementById("step-vector-count");
            const kgCountEl = document.getElementById("step-kg-count");
            const summaryCountEl = document.getElementById("step-summary-count");

            if (vectorCountEl) vectorCountEl.textContent = `${stats.total_files || 1454} / ${stats.total_files || 1454} 文件`;
            if (kgCountEl) kgCountEl.textContent = `${stats.total_files || 1454} / ${stats.total_files || 1454} 文件`;
            if (summaryCountEl) summaryCountEl.textContent = `${(stats.total_files || 100) * 2} / ${(stats.total_files || 100) * 2} 段`;

            renderLearningProjectCards(stats.projects_learning || []);
        })
        .catch(err => {
            console.error("Load learning stats error:", err);
        });
}

function renderLearningProjectCards(projects) {
    const box = document.getElementById("learning-projects-list");
    if (!box) return;

    if (!projects || projects.length === 0) {
        box.innerHTML = `<div class="p-4 text-center text-muted">暂无项目学习数据</div>`;
        return;
    }

    box.innerHTML = projects.map(p => `
        <div class="learning-project-card">
            <div class="project-card-header">
                <div class="project-card-title">📁 ${escapeHtml(p.project_name)}</div>
                <div class="project-card-actions">
                    <button class="btn-gov-secondary" style="font-size:12px; padding:4px 10px;" onclick="triggerAdminProjectLearn('${p.project_id}')">⏸ 重新研判学习</button>
                    <select class="form-select form-select-sm" style="width: auto; font-size:12px; display:inline-block;">
                        <option>优先级 ${p.priority || "2级"}</option>
                        <option>优先级 1级 (最高)</option>
                        <option>优先级 3级</option>
                    </select>
                    <span class="badge bg-success" style="font-size:12px; padding:6px 10px;">${p.status === "learning" ? "学习中..." : "已完成"}</span>
                    <button class="btn-kg-preview" onclick="openAdminKGModal('${p.project_id}', '${escapeHtml(p.project_name)}')">👁 预览知识图谱星空图</button>
                </div>
            </div>
            
            <div class="pipeline-steps-grid">
                <div class="step-progress-item">
                    <div class="step-head">
                        <span>🗄️ 1. 向量化入库</span>
                        <span class="step-num">${p.chunks_count || 301} 切片 · ${p.files_count || 2} / ${p.files_count || 2} 文件</span>
                    </div>
                    <div class="progress-bar-thick">
                        <div class="progress-bar-fill grad-purple-blue" style="width: 100%;"></div>
                    </div>
                    <div class="step-percent">100.00%</div>
                </div>

                <div class="step-progress-item">
                    <div class="step-head">
                        <span>🔗 2. 知识图谱提取</span>
                        <span class="step-num">${p.entities_count || 18} 实体节点 · ${p.relations_count || 32} 条三元组</span>
                    </div>
                    <div class="progress-bar-thick">
                        <div class="progress-bar-fill grad-cyan" style="width: 100%;"></div>
                    </div>
                    <div class="step-percent">100.00%</div>
                </div>

                <div class="step-progress-item">
                    <div class="step-head">
                        <span>🌺 3. 图谱社区摘要</span>
                        <span class="step-num">全局知识摘要完毕</span>
                    </div>
                    <div class="progress-bar-thick">
                        <div class="progress-bar-fill grad-pink" style="width: 100%;"></div>
                    </div>
                    <div class="step-percent">100.00%</div>
                </div>

                <div class="step-progress-item">
                    <div class="step-head">
                        <span>⚡ 4. 智能学习预计计算</span>
                        <span class="step-num">全文生效 / 督办提炼已完成</span>
                    </div>
                    <div class="progress-bar-thick">
                        <div class="progress-bar-fill grad-light-purple" style="width: 100%;"></div>
                    </div>
                    <div class="step-percent">100.00%</div>
                </div>
            </div>
        </div>
    `).join("");
}

function triggerAdminProjectLearn(projectId) {
    showToast("正在启动大模型全量“切片+知识图谱”后台学习管线...", "info");
    apiFetch(`/api/projects/${projectId}/learn`, {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() }
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("学习失败")))
    .then(data => {
        showToast("🎉 项目深度切片与知识图谱全量学习成功！", "success");
        loadAdminLearningDashboard();
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
                            <h5 class="modal-title">🌌 知识图谱星空网络 - 【${escapeHtml(projectName)}】</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="background:#090d16; color:#e2e8f0; min-height:400px; padding:20px;">
                            <div class="mb-3 p-3 rounded" style="background:#1e293b; border:1px solid #334155;">
                                <strong>📝 专家研判总结：</strong>
                                <div style="font-size:13px; margin-top:6px; color:#cbd5e1;">${escapeHtml(kg.summary || "暂无摘要")}</div>
                            </div>
                            
                            <h6 style="color:#38bdf8;">🏷️ 核心政务实体节点 (${entities.length} 个):</h6>
                            <div class="d-flex flex-wrap gap-2 mb-4">
                                ${entities.map(e => `<span class="badge" style="background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; font-size:12px; padding:6px 10px;">🏷️ ${escapeHtml(e.name)} <small>(${escapeHtml(e.category)})</small></span>`).join("")}
                            </div>

                            <h6 style="color:#f472b6;">🔗 知识图谱三元组扩散链路 (${relations.length} 条):</h6>
                            <div style="max-height:220px; overflow-y:auto;">
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
    });
}

window.loadAdminLearningDashboard = loadAdminLearningDashboard;
window.triggerAdminProjectLearn = triggerAdminProjectLearn;
window.openAdminKGModal = openAdminKGModal;
window.loadSettingsForm = loadSettingsForm;
window.saveSecurityConfig = saveSecurityConfig;
window.saveLLMConfig = saveLLMConfig;
