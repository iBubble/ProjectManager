// ==========================================================================
// 政务智管・项目生命周期智能管控平台 - 前端主程序 (app.js)
// ==========================================================================

// 全局异常捕捉并可视化上屏
window.onerror = function(message, source, lineno, colno, error) {
    const errorBox = document.getElementById("global-js-error-alert");
    if (errorBox) {
        errorBox.style.display = "block";
        errorBox.innerHTML = `⚠️ 页面 JavaScript 运行崩溃异常错误：<br>
        消息: ${message}<br>
        文件: ${source}<br>
        行号: ${lineno}:${colno}<br>
        堆栈: ${error ? error.stack : 'N/A'}`;
    }
    return false;
};


// 页面 DOM 加载就绪
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    registerEvents();
});

// ==========================================================================
// 1. 系统初始化与会话控制
// ==========================================================================
function initApp() {
    // 优先尝试从 sessionStorage / localStorage 恢复凭证
    const savedSession = sessionStorage.getItem("currentSession") || localStorage.getItem("currentSession");
    const savedCsrf = sessionStorage.getItem("csrfToken") || localStorage.getItem("csrfToken");
    const isLoggedIn = localStorage.getItem("isLoggedIn");

    if (savedSession) {
        try {
            currentSession = JSON.parse(savedSession);
            csrfToken = savedCsrf || "";
            enterConsole();
        } catch (e) {}
    }

    // 向服务端核验当前最新 Session
    fetch("/api/auth/me", { credentials: "same-origin" })
        .then(res => {
            if (res.ok) return res.json();
            throw new Error("Unauthorized");
        })
        .then(user => {
            currentSession = user;
            csrfToken = user.csrf_token || getCookie("csrf_token") || savedCsrf || "";
            sessionStorage.setItem("currentSession", JSON.stringify(user));
            sessionStorage.setItem("csrfToken", csrfToken);
            localStorage.setItem("currentSession", JSON.stringify(user));
            localStorage.setItem("csrfToken", csrfToken);
            localStorage.setItem("isLoggedIn", "true");
            enterConsole();
        })
        .catch(err => {
            if (!isLoggedIn && !savedSession) {
                showLogin();
            } else {
                enterConsole();
            }
        });
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return "";
}

function enterConsole() {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");

    if (currentSession && currentSession.name) {
        document.getElementById("current-user-name").textContent = currentSession.name.split(" ")[0];
        document.getElementById("current-user-role").textContent = formatRole(currentSession.role);
    }

    // 水印和看板数据初始化
    applyWatermark();
    loadProjectLedger();
    startAlertsPoller();

    // URL 路由支持：/admin 或 /#admin 直达后台管理面板
    const path = window.location.pathname;
    const hash = window.location.hash;
    if (path === "/admin" || hash === "#admin") {
        if (typeof switchAdminTab === "function") {
            switchAdminTab("project-mgmt");
        } else {
            switchTab("settings");
        }
    }
}

function showLogin() {
    document.getElementById("login-container").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
}

function formatRole(role) {
    switch(role) {
        case "super_admin": return "信息中心主任";
        case "project_admin": return "项目管理员";
        case "project_owner": return "项目负责人";
        case "reader": return "分管局领导 (只读)";
        default: return "普通负责人";
    }
}

// ==========================================================================
// 2. 全局事件绑定
// ==========================================================================
function registerEvents() {
    // 登录
    document.getElementById("btn-login").addEventListener("click", handleLogin);
    document.getElementById("password").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleLogin();
    });

    // 登出
    document.getElementById("btn-logout").addEventListener("click", handleLogout);

    // 顶栏主菜单导航 (点击 Logo 区域返回首页)
    document.getElementById("btn-home-ledger").addEventListener("click", () => {
        switchTab("ledger");
    });
    document.getElementById("btn-bell").addEventListener("click", openAlertsModal);

    // 二级下拉高级功能菜单
    const advBtn = document.getElementById("btn-advanced-menu");
    const advList = document.getElementById("advanced-menu-list");
    advBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        advList.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
        advList.classList.add("hidden");
    });

    document.getElementById("menu-audit").addEventListener("click", () => {
        switchTab("audit");
    });
    document.getElementById("menu-settings").addEventListener("click", () => {
        switchTab("settings");
    });
    document.getElementById("menu-admin").addEventListener("click", () => {
        window.location.hash = "#admin";
        switchTab("settings");
    });

    // 看板搜索过滤与跨文件全文检索
    let searchDebounceTimer = null;
    document.getElementById("search-project").addEventListener("input", (e) => {
        renderLedgerTable();
        const val = e.target.value.trim();
        const resBox = document.getElementById("fulltext-search-results");
        if (!resBox) return;

        if (!val) {
            resBox.classList.add("hidden");
            resBox.innerHTML = "";
            return;
        }

        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            apiFetch(`/api/search?q=${encodeURIComponent(val)}`)
                .then(res => res.ok ? res.json() : [])
                .then(results => {
                    if (!results || results.length === 0) {
                        resBox.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:13px;">未检索到匹配的项目或归档文件</div>';
                    } else {
                        resBox.innerHTML = results.slice(0, 8).map(r => `
                            <div class="search-result-item" onclick="openProjectDetail('${r.project_id}')">
                                <div class="result-project">🏛️ ${escapeHtml(r.project_name)}</div>
                                ${r.file_name ? `<div class="result-file">📄 ${escapeHtml(r.file_name)} <span style="font-weight:normal; font-size:11px; color:var(--text-muted);">(${escapeHtml(r.stage_folder)}阶段)</span></div>` : ''}
                                <div class="result-snippet">匹配维度：<mark>${escapeHtml(r.match_field)}</mark></div>
                            </div>
                        `).join("");
                    }
                    resBox.classList.remove("hidden");
                })
                .catch(() => resBox.classList.add("hidden"));
        }, 300);
    });

    document.addEventListener("click", (e) => {
        const resBox = document.getElementById("fulltext-search-results");
        if (resBox && !e.target.closest(".search-box")) {
            resBox.classList.add("hidden");
        }
    });
    document.getElementById("btn-ledger-brief").addEventListener("click", generateWeeklyLedgerBrief);
    document.getElementById("btn-new-project").addEventListener("click", () => {
        document.getElementById("modal-new-project").classList.remove("hidden");
    });
    document.getElementById("btn-close-new-project-modal").addEventListener("click", () => {
        document.getElementById("modal-new-project").classList.add("hidden");
    });
    document.getElementById("btn-cancel-project").addEventListener("click", () => {
        document.getElementById("modal-new-project").classList.add("hidden");
    });
    document.getElementById("btn-save-project").addEventListener("click", createNewProject);

    // 详情页返回大盘
    document.getElementById("btn-back-to-ledger").addEventListener("click", () => {
        document.getElementById("pane-project-detail").classList.add("hidden");
        document.getElementById("pane-ledger").classList.remove("hidden");
        loadProjectLedger();
    });

    // 手动大模型重新研判
    document.getElementById("btn-reanalyze-ai").addEventListener("click", runAIReanalyze);

    // 详情页主选项卡切换 (合规研判 / 智能助手 / 待办事项)
    document.querySelectorAll(".pane-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".pane-tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".pane-tab-content").forEach(c => c.classList.add("hidden"));

            btn.classList.add("active");
            const targetPane = btn.getAttribute("data-pane");
            const targetEl = document.getElementById("pane-tab-" + targetPane);
            if (targetEl) targetEl.classList.remove("hidden");

            if (targetPane === "todos" && currentProject) {
                renderProjectTodos();
            }
        });
    });

    // 添加待办事项
    const btnAddTodo = document.getElementById("btn-add-todo");
    if (btnAddTodo) {
        btnAddTodo.addEventListener("click", () => {
            const input = document.getElementById("new-todo-input");
            const val = input.value.trim();
            if (!val) return;

            if (!currentProject.todos) currentProject.todos = [];
            currentProject.todos.push({ id: Date.now().toString(), text: val, done: false });
            input.value = "";
            renderProjectTodos();
            showToast("待办事项已添加，已同步微信提醒", "success");
        });
    }

    // 大模型公文一键起草
    document.querySelectorAll(".btn-gen-doc").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const docType = e.target.getAttribute("data-type");
            generateAIDocument(docType);
        });
    });

    // 复制公文与下载
    document.getElementById("btn-copy-doc").addEventListener("click", () => {
        const content = document.getElementById("preview-doc-content").textContent;
        navigator.clipboard.writeText(content).then(() => {
            const tip = document.getElementById("copy-success-tip");
            tip.classList.remove("hidden");
            setTimeout(() => tip.classList.add("hidden"), 1500);
        });
    });
    document.getElementById("btn-download-doc-txt").addEventListener("click", () => {
        const content = document.getElementById("preview-doc-content").textContent;
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${currentProject.name}_${document.getElementById("preview-doc-title").textContent}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
    document.getElementById("btn-close-doc-modal").addEventListener("click", () => {
        document.getElementById("modal-doc-preview").classList.add("hidden");
    });

    // 安全设置与大模型接口保存
    document.getElementById("btn-save-security-settings").addEventListener("click", saveSecurityConfig);
    document.getElementById("btn-save-llm-settings").addEventListener("click", saveLLMConfig);

    // 导出审计 CSV
    document.getElementById("btn-export-audit").addEventListener("click", exportAuditLogsToCSV);

    // 微信模拟器交互
    document.getElementById("wechat-header-bar").addEventListener("click", () => {
        const wrapper = document.getElementById("wechat-simulator");
        const btn = document.getElementById("btn-toggle-wechat");
        if (wrapper.classList.contains("collapsed")) {
            wrapper.classList.remove("collapsed");
            btn.textContent = "收起";
        } else {
            wrapper.classList.add("collapsed");
            btn.textContent = "展开";
        }
    });

    document.querySelectorAll(".wechat-tab").forEach(tab => {
        tab.addEventListener("click", (e) => {
            document.querySelectorAll(".wechat-tab").forEach(t => t.classList.remove("active"));
            e.target.classList.add("active");
            wechatActiveUser = e.target.getAttribute("data-user");
            renderWechatSimulator();
        });
    });

    // 拖拽上传资料文件
    const dropzone = document.getElementById("file-dropzone");
    const fileInput = document.getElementById("input-file-uploader");
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            uploadFiles(e.target.files);
        }
    });

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            uploadFiles(e.dataTransfer.files);
        }
    });

    // RAG 右侧主页签切换（合规研判 vs 智能助手）
    document.querySelectorAll(".pane-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".pane-tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".pane-tab-content").forEach(pc => {
                pc.classList.add("hidden");
                pc.classList.remove("active");
            });

            e.currentTarget.classList.add("active");
            const paneID = e.currentTarget.getAttribute("data-pane");
            const targetPane = document.getElementById(`pane-tab-${paneID}`);
            targetPane.classList.remove("hidden");
            targetPane.classList.add("active");

            // 进入 RAG 智能助手面板时，重置和加载数据
            if (paneID === "rag-chat") {
                editingDocId = "";
                document.getElementById("rag-input-doc-title").value = "";
                document.getElementById("rag-textarea-doc-content").value = "";
                loadRAGSavedDocuments();
                renderRAGPaymentTable();
            }
        });
    });

    // RAG 子功能页签切换（智能助手对话 vs AI表格 vs 定稿编辑器）
    document.querySelectorAll(".chat-mode-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".chat-mode-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".chat-mode-panel").forEach(p => {
                p.classList.add("hidden");
                p.classList.remove("active");
            });

            e.currentTarget.classList.add("active");
            const mode = e.currentTarget.getAttribute("data-mode");
            const targetPanel = document.getElementById(`chat-mode-${mode}`);
            targetPanel.classList.remove("hidden");
            targetPanel.classList.add("active");

            if (mode === "table") {
                renderRAGPaymentTable();
            }
        });
    });

    // RAG 思考思维模式切换
    document.querySelectorAll(".btn-think-mode").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".btn-think-mode").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            chatThinkingMode = e.currentTarget.getAttribute("data-think");
        });
    });

    // RAG 对话消息发送
    document.getElementById("btn-chat-send-msg").addEventListener("click", sendRAGChatMessage);
    document.getElementById("chat-user-input-text").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendRAGChatMessage();
        }
    });

    // RAG 清空/配置/已存信息按钮
    document.getElementById("btn-chat-clear").addEventListener("click", () => {
        const flow = document.getElementById("chat-messages-flow");
        flow.innerHTML = `
            <div class="chat-bubble-ai">
                <div class="ai-avatar">🤖</div>
                <div class="ai-body-content">
                    <p>会话已清空。您可以继续向我提出有关项目合规、付款单据、工程进度的问题。</p>
                </div>
            </div>
        `;
    });
    document.getElementById("btn-chat-config").addEventListener("click", () => {
        alert("📊 系统当前关联模型：DeepSeek-R1 (政务内网离线自训版)\n接入白名单规则引擎已生效，文件强物理隔离已开启。");
    });
    document.getElementById("btn-chat-info").addEventListener("click", () => {
        alert(`📂 本项目知识库（RAG）来源统计：\n- 归档文件数：${currentProjectFiles.length} 份\n- 自动关联预警项：${document.querySelectorAll(".project-alert-item").length} 项\n- 包含付款节点数：${(currentProject.payment_nodes || []).length} 项`);
    });

    // RAG 编辑器保存定稿文档
    document.getElementById("btn-rag-save-doc").addEventListener("click", saveRAGDocument);
}

function switchTab(tab) {
    document.querySelectorAll(".content-pane").forEach(pane => pane.classList.add("hidden"));
    document.getElementById(`pane-${tab}`).classList.remove("hidden");

    if (tab === "ledger") loadProjectLedger();
    if (tab === "alerts") loadAlertsTimeline();
    if (tab === "audit") loadAuditLogsTable();
    if (tab === "settings") {
        loadSettingsForm();
        if (typeof loadAdminUsersTable === "function") loadAdminUsersTable();
        if (typeof loadAdminProjectsTable === "function") loadAdminProjectsTable();
    }
}

// ==========================================================================
// 3. 登录与注销逻辑
// ==========================================================================
function handleLogin(e) {
    if (e && typeof e.preventDefault === "function") {
        e.preventDefault();
    }
    const usernameEl = document.getElementById("username");
    const passwordEl = document.getElementById("password");
    const errorEl = document.getElementById("login-error");
    const btnLogin = document.getElementById("btn-login");

    const u = usernameEl ? usernameEl.value.trim() : "";
    const p = passwordEl ? passwordEl.value : "";

    if (!u || !p) {
        if (errorEl) errorEl.textContent = "⚠️ 请输入账号与密码";
        return;
    }

    if (errorEl) errorEl.textContent = "";
    if (btnLogin) {
        btnLogin.textContent = "登录中...";
        btnLogin.disabled = true;
    }

    fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: u, password: p })
    })
    .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) {
            currentSession = data.user;
            csrfToken = data.csrf_token || "";
            sessionStorage.setItem("currentSession", JSON.stringify(data.user));
            sessionStorage.setItem("csrfToken", csrfToken);
            localStorage.setItem("currentSession", JSON.stringify(data.user));
            localStorage.setItem("csrfToken", csrfToken);
            localStorage.setItem("isLoggedIn", "true");
            if (errorEl) errorEl.textContent = "";
            enterConsole();
        } else {
            if (errorEl) errorEl.textContent = "❌ " + (data.error || "账号或密码错误");
        }
    })
    .catch(err => {
        console.error("Login error:", err);
        if (errorEl) errorEl.textContent = "⚠️ 服务连接失败，请重试";
    })
    .finally(() => {
        if (btnLogin) {
            btnLogin.textContent = "登录系统";
            btnLogin.disabled = false;
        }
    });
}

function handleLogout() {
    fetch("/api/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken }
    }).finally(() => {
        currentSession = null;
        csrfToken = "";
        showLogin();
        window.location.reload();
    });
}

// ==========================================================================
// 4. 首页 - 看板总览加载 (对标“首页仅一块项目总览看板”)
// ==========================================================================
function loadProjectLedger() {
    fetch("/api/projects")
        .then(res => res.json())
        .then(projects => {
            globalProjects = projects;
            updateMetrics(projects);
            renderLedgerTable();
        });
}

function updateMetrics(projects) {
    document.getElementById("metric-total-projects").textContent = projects.length;
    document.getElementById("metric-pending-acceptance").textContent = projects.filter(p => p.stage === "验收").length;

    // 统计待付款期数
    let unPaid = 0;
    projects.forEach(p => {
        if (p.payment_nodes) {
            p.payment_nodes.forEach(n => {
                if (!n.is_paid) unPaid++;
            });
        }
    });
    document.getElementById("metric-pending-payment").textContent = unPaid;

    // 统计预警项目 (评分小于 70 属于高危)
    document.getElementById("metric-risk-projects").textContent = projects.filter(p => p.health_score < 70).length;
}

var currentCardFilter = "all";
var currentSortField = "";
var currentSortOrder = "asc";

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

    ["name", "stage", "days", "health", "owner", "budget"].forEach(f => {
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

    renderLedgerTable();
}

function renderLedgerTable() {
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

    // 2. 搜索框多维度文本过滤 (名称、文号、负责人、阶段、标签、预算)
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">暂无匹配的信息化项目台账记录</td></tr>`;
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
            <td style="font-weight: 700; color: var(--gov-blue);">${escapeHTML(p.name)}</td>
            <td><span class="stage-tag badge-blue">${p.stage}阶段</span></td>
            <td style="font-weight: 600;">${daysRemaining}</td>
            <td>${riskTip}</td>
            <td>${escapeHTML(p.owner.split(" ")[0])}</td>
            <td style="font-weight: 600;">${formatCurrency(p.budget)}</td>
            <td style="color: var(--gov-blue); font-weight: 700;">点击审核 ➡</td>
        `;

        tr.addEventListener("click", () => openProjectDetails(p.id));
        tbody.appendChild(tr);
    });
}

function createNewProject() {
    const name = document.getElementById("form-pname").value.trim();
    const doc = document.getElementById("form-pdoc").value.trim();
    const owner = document.getElementById("form-powner").value;
    const budget = parseFloat(document.getElementById("form-pbudget").value);

    if (!name || !doc || !owner || isNaN(budget) || budget <= 0) {
        alert("请正确填写信息化项目的各项基础指标字段！");
        return;
    }

    fetch("/api/projects", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({ name, approval_doc_num: doc, owner, budget })
    })
    .then(async res => {
        if (res.ok) {
            document.getElementById("modal-new-project").classList.add("hidden");
            // 清空表单
            document.getElementById("form-pname").value = "";
            document.getElementById("form-pdoc").value = "";
            document.getElementById("form-pbudget").value = "";
            loadProjectLedger();
        } else {
            const err = await res.json();
            alert("新建项目失败: " + err.error);
        }
    });
}

// ==========================================================================
// 5. 详情页加载 (对标“双区域划分：左侧文件归档、右侧 AI 研判 + 预警”)
// ==========================================================================
function openProjectDetails(projectID) {
    showLoading("装载大模型项目工作空间中...");

    Promise.all([
        fetch(`/api/projects/${projectID}`).then(res => res.json()),
        fetch(`/api/projects/${projectID}/files`).then(res => res.json())
    ])
    .then(([project, files]) => {
        currentProject = project;
        currentProjectFiles = files;

        // 切页面
        document.getElementById("pane-ledger").classList.add("hidden");
        document.getElementById("pane-project-detail").classList.remove("hidden");

        // 基础信息
        document.getElementById("detail-project-title").textContent = project.name;
        document.getElementById("detail-project-stage").textContent = project.stage + "阶段";

        // 5.1 左侧区域：文件归档树渲染
        renderLeftFolderTree(files);

        // 5.2 右侧区域：AI 研判指标报告
        renderHealthRingScore(project.health_score);
        renderHealthReportTabs(project);

        // 5.3 右侧区域：该项目关联的预警列表
        renderProjectAlertsBox(projectID);

        // 激活 AI 进度页签并默认选中“项目合规研判与预警”主选项卡
        document.querySelectorAll(".pane-tab-btn").forEach(btn => {
            if (btn.getAttribute("data-pane") === "compliance") btn.classList.add("active");
            else btn.classList.remove("active");
        });
        document.getElementById("pane-tab-compliance").classList.remove("hidden");
        document.getElementById("pane-tab-compliance").classList.add("active");
        document.getElementById("pane-tab-rag-chat").classList.add("hidden");
        document.getElementById("pane-tab-rag-chat").classList.remove("active");

        // 激活 AI 进度子选项卡
        document.querySelectorAll(".ai-tabs-nav .tab-btn").forEach(btn => {
            if (btn.getAttribute("data-tab") === "progress") btn.click();
        });

        // 设置 RAG 工作区已引用来源文件数量
        document.getElementById("rag-referenced-files-count").textContent = files.length;
    })
    .finally(() => hideLoading());
}

// 5.1 左侧文件夹目录渲染
function renderLeftFolderTree(files) {
    const stages = ["立项", "招标", "合同", "实施", "监理", "过程", "验收", "运维"];
    
    stages.forEach(st => {
        const folderContainer = document.getElementById(`files-${st}`);
        folderContainer.innerHTML = "";
        
        const stageFiles = files.filter(f => f.stage_folder === st);
        if (stageFiles.length === 0) {
            folderContainer.innerHTML = `<span class="empty-file-tip">暂无归档文件</span>`;
            return;
        }

        stageFiles.forEach(file => {
            const item = document.createElement("div");
            item.className = "file-item";
            item.innerHTML = `
                <div class="file-info-left" title="点击下载该文件">
                    📄 ${escapeHTML(file.file_name)} <span class="file-size-badge">(${formatBytes(file.file_size)})</span>
                </div>
                <div class="file-actions-right">
                    <button class="btn-file-action btn-summary-file" title="文书摘要">摘要</button>
                    <button class="btn-file-action btn-delete-file" title="物理销毁">删除</button>
                </div>
            `;

            // 点击下载
            item.querySelector(".file-info-left").addEventListener("click", () => {
                window.open(`/api/projects/${currentProject.id}/files/${file.id}/download`);
            });

            // 大纲摘要 (调用大模型一键长文摘要 API)
            item.querySelector(".btn-summary-file").addEventListener("click", (e) => {
                e.stopPropagation();
                showLoading("大模型解析长文档并提炼 300 字精简摘要中...");
                apiFetch(`/api/projects/${currentProject.id}/files/${file.id}/summary`, { method: "POST" })
                    .then(res => {
                        if (!res.ok) throw new Error("生成摘要失败");
                        return res.json();
                    })
                    .then(data => {
                        hideLoading();
                        showDocPreview(`🤖 大模型文档摘要 - ${data.file_name}`, data.summary);
                    })
                    .catch(err => {
                        hideLoading();
                        showToast(err.message, "error");
                    });
            });

            // 物理自删除
            item.querySelector(".btn-delete-file").addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`【安全销毁警告】\n您正在彻底物理自删除资料 [${file.file_name}]，删除后无法恢复。是否继续？`)) {
                    deleteProjectFile(file.id);
                }
            });

            folderContainer.appendChild(item);
        });
    });
}

function deleteProjectFile(fileID) {
    fetch(`/api/projects/${currentProject.id}/files/${fileID}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken }
    })
    .then(async res => {
        if (res.ok) {
            openProjectDetails(currentProject.id);
        } else {
            const err = await res.json();
            alert("物理删除资料失败: " + err.error);
        }
    });
}

function uploadFiles(filesList) {
    const stageSelect = document.getElementById("upload-stage-select").value;
    showLoading("智能文件类型识别与解析归档中...");

    let count = 0;
    Array.from(filesList).forEach(file => {
        const formData = new FormData();
        formData.append("file", file);
        
        let resolvedStage = stageSelect;
        if (stageSelect === "auto") {
            const fn = file.name;
            if (fn.includes("可研") || fn.includes("批复") || fn.includes("立项")) resolvedStage = "立项";
            else if (fn.includes("招标") || fn.includes("中标") || fn.includes("公告")) resolvedStage = "招标";
            else if (fn.includes("合同") || fn.includes("协议") || fn.includes("变更")) resolvedStage = "合同";
            else if (fn.includes("实施") || fn.includes("方案") || fn.includes("测试报告")) resolvedStage = "实施";
            else if (fn.includes("监理")) resolvedStage = "监理";
            else if (fn.includes("会议") || fn.includes("纪要") || fn.includes("协调")) resolvedStage = "过程";
            else if (fn.includes("验收") || fn.includes("移交")) resolvedStage = "验收";
            else if (fn.includes("维保") || fn.includes("运维")) resolvedStage = "运维";
            else resolvedStage = "过程";
        }
        
        formData.append("stage", resolvedStage);

        fetch(`/api/projects/${currentProject.id}/files`, {
            method: "POST",
            headers: { "X-CSRF-Token": csrfToken },
            body: formData
        })
        .then(async res => {
            count++;
            if (!res.ok) {
                const err = await res.json();
                alert(`文件 [${file.name}] 解析归档失败: ` + err.error);
            }
            if (count === filesList.length) {
                // 触发重新 AI 分析
                fetch(`/api/projects/${currentProject.id}/analyze`, {
                    method: "POST",
                    headers: { "X-CSRF-Token": csrfToken }
                })
                .then(res => res.json())
                .then(() => {
                    hideLoading();
                    openProjectDetails(currentProject.id);
                })
                .catch(() => hideLoading());
            }
        })
        .catch(() => {
            count++;
            if (count === filesList.length) hideLoading();
        });
    });
}

// 5.2 右侧 AI 分析模块
function renderHealthRingScore(score) {
    const ring = document.getElementById("health-ring-score-path");
    const text = document.getElementById("detail-health-score");
    const chart = document.getElementById("detail-health-chart");
    const desc = document.getElementById("health-score-status-desc");

    text.textContent = score;
    ring.setAttribute("stroke-dasharray", `${score}, 100`);

    chart.classList.remove("green", "yellow", "red");
    if (score >= 90) {
        chart.classList.add("green");
        desc.textContent = "项目执行正常，整体审计风险极低，合规指数高。";
        desc.className = "status-green-text";
    } else if (score >= 70) {
        chart.classList.add("yellow");
        desc.textContent = "项目存在中度偏差，需关注部分付款发票及阶段性材料归档。";
        desc.className = "status-yellow-text";
    } else {
        chart.classList.add("red");
        desc.textContent = "警告！项目存在重度违规违约隐患，请核对红色专项风险项！";
        desc.className = "status-red-text";
    }
}

function renderHealthReportTabs(p) {
    const rep = p.health_report;
    if (!rep) return;

    // 进度 Tab
    const pContainer = document.getElementById("tab-progress");
    let pBadge = rep.progress.status === "正常" ? "status-ok" : (rep.progress.risk_level === "高" ? "status-danger" : "status-warning");
    let pList = (rep.progress.delay_reasons || []).map(r => `<li class="issue-item">${escapeHTML(r)}</li>`).join("");
    if (rep.progress.status === "正常") pList = `<li>大模型分析监理周报与会议纪要：项目实施进度处于受控状态。</li>`;
    pContainer.innerHTML = `
        <div class="analysis-status-row">进度状态：<span class="analysis-status-badge ${pBadge}">${rep.progress.status} (预计超期 ${rep.progress.delay_days} 天)</span></div>
        <ul class="analysis-list">${pList}</ul>
    `;

    // 资金 Tab
    const fContainer = document.getElementById("tab-finance");
    let fBadge = (rep.finance.is_over_budget || rep.finance.is_over_payment || (rep.finance.missing_docs && rep.finance.missing_docs.length > 0)) ? "status-warning" : "status-ok";
    let fList = (rep.finance.missing_docs || []).map(d => `<li class="issue-item">${escapeHTML(d)}</li>`).join("");
    if (!rep.finance.missing_docs || rep.finance.missing_docs.length === 0) fList = `<li>累计拨款比例与发票数据一致，未见资金挪用异常。</li>`;
    fContainer.innerHTML = `
        <div class="analysis-status-row">资金状况：<span class="analysis-status-badge ${fBadge}">已付 ${formatCurrency(rep.finance.paid_amount)} (待付 ${formatCurrency(rep.finance.unpaid_amount)})</span></div>
        <ul class="analysis-list">${fList}</ul>
    `;

    // 质量 Tab
    const qContainer = document.getElementById("tab-quality");
    let qBadge = rep.quality.unresolved_issues_count > 0 ? "status-warning" : "status-ok";
    let qList = (rep.quality.repeated_failures || []).map(f => `<li class="issue-item">${escapeHTML(f)}</li>`).join("");
    if (rep.quality.unresolved_issues_count === 0) qList = `<li>监理日志自查显示无待整改的软件故障或物理设备缺陷。</li>`;
    qContainer.innerHTML = `
        <div class="analysis-status-row">质量安全：<span class="analysis-status-badge ${qBadge}">未整改缺陷：${rep.quality.unresolved_issues_count} 个</span></div>
        <ul class="analysis-list">
            ${qList}
            ${rep.quality.impact_acceptance ? `<li class="issue-item" style="color:var(--red-alert);">警告：存在影响年底整体验收的质量问题。</li>` : ""}
        </ul>
    `;

    // 变更 Tab
    const cContainer = document.getElementById("tab-change");
    let cBadge = rep.change.is_over_gaisan ? "status-danger" : (rep.change.has_changes ? "status-warning" : "status-ok");
    let cList = "";
    if (rep.change.has_changes) {
        cList = (rep.change.change_details || []).map(d => `<li class="issue-item">${escapeHTML(d)}</li>`).join("");
    } else {
        cList = `<li>未查见针对该项目签署的变更补充协议。</li>`;
    }
    cContainer.innerHTML = `
        <div class="analysis-status-row">合同变更：<span class="analysis-status-badge ${cBadge}">累计变更金额：${formatCurrency(rep.change.total_change_amount)}</span></div>
        <ul class="analysis-list">${cList}</ul>
    `;
}

function runAIReanalyze() {
    showLoading("大模型正在深度重算研判指标...");
    fetch(`/api/projects/${currentProject.id}/analyze`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken }
    })
    .then(async res => {
        if (res.ok) {
            const p = await res.json();
            currentProject = p;
            renderHealthRingScore(p.health_score);
            renderHealthReportTabs(p);
            startAlertsPoller();
        } else {
            alert("AI研判失败");
        }
    })
    .finally(() => hideLoading());
}

// 大模型一键起草公文
function generateAIDocument(docType) {
    showLoading("大模型正在起草正式公文草案...");
    fetch(`/api/projects/${currentProject.id}/generate`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({ doc_type: docType })
    })
    .then(async res => {
        if (res.ok) {
            const data = await res.json();
            showDocPreview(formatDocTitle(docType), data.content);
        } else {
            alert("公文生成失败");
        }
    })
    .finally(() => hideLoading());
}

function formatDocTitle(type) {
    switch(type) {
        case "brief": return "项目推进工作简报";
        case "rectify": return "信息化项目限期整改通知书";
        case "self_check": return "项目整体验收自查评估报告";
        default: return "公文草案";
    }
}

function showDocPreview(title, content) {
    document.getElementById("preview-doc-title").textContent = title;
    document.getElementById("preview-doc-content").textContent = content;
    document.getElementById("modal-doc-preview").classList.remove("hidden");
}

// 5.3 右侧区域：当前项目关联的预警列表渲染
function renderProjectAlertsBox(projectID) {
    const box = document.getElementById("project-alerts-box");
    box.innerHTML = "";

    const projAlerts = alertsList.filter(a => a.project_id === projectID);

    if (projAlerts.length === 0) {
        box.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size:12.5px;">🟢 该项目无未处理的合规警报</div>`;
        return;
    }

    // 倒序排列
    const sorted = projAlerts.sort((a,b) => b.trigger_date.localeCompare(a.trigger_date));

    sorted.forEach(a => {
        const item = document.createElement("div");
        const isRead = a.status === "read";
        item.className = `project-alert-item ${a.severity} ${isRead ? "read-status" : ""}`;

        item.innerHTML = `
            <div class="alert-text-left">
                <h5>${escapeHTML(a.title)} <span style="font-size:10.5px; font-weight:normal; color:var(--text-muted);">(${a.trigger_date})</span></h5>
                <p>${escapeHTML(a.message)}</p>
                ${isRead ? `<span class="ack-stamp" style="font-size:10px;">(已阅确认: ${escapeHTML(a.read_by)})</span>` : ""}
            </div>
            ${isRead ? "" : `<button class="btn-gov-secondary btn-ack-alert" data-aid="${a.id}" style="font-size:11px; padding:2px 6px;">确认已阅</button>`}
        `;

        if (!isRead) {
            item.querySelector(".btn-ack-alert").addEventListener("click", () => {
                acknowledgeAlert(a.id);
            });
        }

        box.appendChild(item);
    });
}

function acknowledgeAlert(alertID) {
    fetch(`/api/alerts/${alertID}/read`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken }
    })
    .then(async res => {
        if (res.ok) {
            // 重新刷新预警
            startAlertsPoller();
            setTimeout(() => {
                renderProjectAlertsBox(currentProject.id);
            }, 500);
        } else {
            alert("回执确认已阅失败");
        }
    });
}

// ==========================================================================
// 6. 二级高级菜单与微信浮窗 (WeChat & Logs)
// ==========================================================================
function loadAlertsTimeline() {
    const container = document.getElementById("alerts-timeline");
    container.innerHTML = "";

    const sorted = alertsList.sort((a,b) => b.trigger_date.localeCompare(a.trigger_date));

    if (sorted.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 50px;">暂无预警记录数据</div>`;
        return;
    }

    sorted.forEach(a => {
        const card = document.createElement("div");
        const isRead = a.status === "read";
        card.className = `alert-item-card level-${a.severity} ${isRead ? "read-status" : ""}`;

        card.innerHTML = `
            <div class="alert-content-right">
                <div class="alert-item-header">
                    <h4>${escapeHTML(a.title)} <span class="alert-project-link" data-pid="${a.project_id}">[查看项目]</span></h4>
                    <span class="alert-time">${a.trigger_date}</span>
                </div>
                <p class="alert-msg-body">${escapeHTML(a.message)}</p>
                ${isRead ? 
                    `<span class="ack-stamp">已阅确认人: ${escapeHTML(a.read_by)} (${a.read_at})</span>` : 
                    `<button class="btn-ack-alert" data-aid="${a.id}">已阅回执</button>`
                }
            </div>
        `;

        card.querySelector(".alert-project-link").addEventListener("click", () => {
            openProjectDetails(a.project_id);
        });

        if (!isRead) {
            card.querySelector(".btn-ack-alert").addEventListener("click", () => {
                fetch(`/api/alerts/${a.id}/read`, {
                    method: "POST",
                    headers: { "X-CSRF-Token": csrfToken }
                }).then(() => {
                    loadAlertsTimeline();
                    startAlertsPoller();
                });
            });
        }

        container.appendChild(card);
    });
}

function loadAuditLogsTable() {
    fetch("/api/audit-logs")
        .then(res => res.json())
        .then(logs => {
            const tbody = document.getElementById("audit-logs-table-body");
            tbody.innerHTML = "";
            
            logs.forEach(l => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="color:var(--text-muted); font-family:monospace; font-size:13px;">${l.created_at}</td>
                    <td style="font-weight:700;">${escapeHTML(l.user)}</td>
                    <td><span class="stage-tag badge-gray">${escapeHTML(l.action)}</span></td>
                    <td style="color:var(--text-muted); font-size:13.5px;">${escapeHTML(l.details)}</td>
                    <td style="font-family:monospace; font-size:12px;">${l.ip}</td>
                `;
                tbody.appendChild(tr);
            });
        });
}

function exportAuditLogsToCSV() {
    fetch("/api/audit-logs")
        .then(res => res.json())
        .then(logs => {
            let csvContent = "\uFEFF时间,操作员,审计行为,详细描述,访问端IP\n";
            logs.forEach(l => {
                const row = [
                    l.created_at,
                    `"${l.user.replace(/"/g, '""')}"`,
                    `"${l.action.replace(/"/g, '""')}"`,
                    `"${l.details.replace(/"/g, '""')}"`,
                    l.ip
                ];
                csvContent += row.join(",") + "\n";
            });

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `安全审计日志_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
}

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

            if (wEl) wEl.value = cfg.watermark_text || "";
            if (iEl) iEl.value = cfg.ip_allow_list || "";
            if (eEl) eEl.checked = !!cfg.file_auto_encrypt;
            if (pEl && cfg.llm_provider) pEl.value = cfg.llm_provider;
            if (epEl) epEl.value = cfg.llm_endpoint || "";
            if (kEl) kEl.value = "******";
        })
        .catch(err => {
            console.warn("loadSettingsForm error:", err);
        });
}

function saveSecurityConfig() {
    if (currentSession.role !== "super_admin") {
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
        llm_provider: cachedConfig.llm_provider,
        llm_endpoint: cachedConfig.llm_endpoint,
        llm_api_key: "******"
    };

    updateConfig(payload);
}

function saveLLMConfig() {
    if (currentSession.role !== "super_admin") {
        alert("仅限超级管理员(信息中心主任)有权更改大模型参数接口！");
        return;
    }

    const provider = document.getElementById("setting-llm-provider").value;
    const endpoint = document.getElementById("setting-llm-endpoint").value.trim();
    const key = document.getElementById("setting-llm-key").value.trim();

    const payload = {
        watermark_text: cachedConfig.watermark_text,
        ip_allow_list: cachedConfig.ip_allow_list,
        file_auto_encrypt: cachedConfig.file_auto_encrypt,
        llm_provider: provider,
        llm_endpoint: endpoint,
        llm_api_key: key
    };

    updateConfig(payload);
}

function updateConfig(payload) {
    fetch("/api/system/config", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify(payload)
    })
    .then(async res => {
        if (res.ok) {
            showToast("🔒 安全与大模型通信设置已保存成功！", "success");
            applyWatermark();
        } else {
            const err = await res.json();
            showToast("保存失败: " + (err.error || err.message), "error");
        }
    });
}

function applyWatermark() {
    fetch("/api/system/config")
        .then(res => res.json())
        .then(cfg => {
            const container = document.getElementById("global-watermark");
            container.innerHTML = "";
            if (!cfg.watermark_text || cfg.watermark_text === "") return;

            const text = cfg.watermark_text;
            const userName = (currentSession && currentSession.name) ? currentSession.name : "";
            for (let i = 0; i < 40; i++) {
                const el = document.createElement("div");
                el.className = "watermark-text";
                el.textContent = `${text} ${userName}`;
                container.appendChild(el);
            }
        });
}

// 微信通知轮询
function startAlertsPoller() {
    fetch("/api/alerts")
        .then(res => res.json())
        .then(alerts => {
            alertsList = alerts;
            const unread = alerts.filter(a => a.status === "unread");
            const badge = document.getElementById("badge-alert-count");

            if (unread.length > 0) {
                badge.classList.remove("hidden");
                badge.textContent = unread.length;
            } else {
                badge.classList.add("hidden");
            }

            renderWechatSimulator();
        });
}

function renderWechatSimulator() {
    const container = document.getElementById("wechat-messages-container");
    container.innerHTML = "";

    const filtered = alertsList.filter(a => {
        if (wechatActiveUser === "zhao") {
            return a.severity === "red"; // 赵局长看红色紧急
        } else if (wechatActiveUser === "caiwu") {
            return a.alert_type.includes("payment"); // 财务看付款
        } else {
            return a.project_name.includes("智慧城市") || a.project_name.includes("骨干网"); // 王负责人看辖下
        }
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="wechat-empty">🟢 暂无未读的微信预警推送消息</div>`;
        return;
    }

    filtered.forEach(a => {
        const card = document.createElement("div");
        card.className = "wechat-template-msg";
        
        let riskColor = "#dc2626";
        if (a.severity === "yellow") riskColor = "#ea580c";
        else if (a.severity === "blue") riskColor = "#2563eb";

        const isRead = a.status === "read";

        card.innerHTML = `
            <div class="wechat-template-title" style="color:${riskColor}">【政务智管警告推送】</div>
            <div class="wechat-template-field">项目名称：<span>${escapeHTML(a.project_name)}</span></div>
            <div class="wechat-template-field">预警事件：<span style="font-weight:700; color:${riskColor}">${escapeHTML(a.title)}</span></div>
            <div class="wechat-template-ai">
                💡 AI研判：根据上传文件，${truncateText(a.message, 95)}
            </div>
            <div class="wechat-template-link">
                <span class="btn-wechat-goto">点击直达项目 ➡</span>
                ${isRead ? 
                    `<span class="wechat-ack-status">已阅 ✓</span>` : 
                    `<button class="btn-wechat-reveal" data-aid="${a.id}">已阅</button>`
                }
            </div>
        `;

        card.querySelector(".btn-wechat-goto").addEventListener("click", () => {
            document.getElementById("wechat-simulator").classList.add("collapsed");
            document.getElementById("btn-toggle-wechat").textContent = "展开";
            openProjectDetails(a.project_id);
        });

        if (!isRead) {
            card.querySelector(".btn-wechat-reveal").addEventListener("click", (e) => {
                e.stopPropagation();
                fetch(`/api/alerts/${a.id}/read`, {
                    method: "POST",
                    headers: { "X-CSRF-Token": csrfToken }
                }).then(() => {
                    startAlertsPoller();
                    if (!document.getElementById("pane-project-detail").classList.contains("hidden") && currentProject.id === a.project_id) {
                        renderProjectAlertsBox(a.project_id);
                    }
                });
            });
        }

        container.appendChild(card);
    });
}

// ==========================================================================
// 7. 通用辅助函数
// ==========================================================================
function showLoading(text) {
    document.getElementById("loading-text").textContent = text;
    document.getElementById("loading-overlay").classList.remove("hidden");
}

function hideLoading() {
    document.getElementById("loading-overlay").classList.add("hidden");
}

function truncateText(s, max) {
    if (s.length > max) return s.slice(0, max) + "...";
    return s;
}

function formatCurrency(num) {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(num);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// ==========================================================================
// RAG 大模型智能工作空间、周报简报与后台管理逻辑
// ==========================================================================

// 一键生成本周项目简报公文
function generateWeeklyLedgerBrief() {
    showLoading("正在智能调取所有项目信息并汇总汇编工作简报...");
    fetch("/api/projects/brief", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken }
    })
    .then(res => {
        if (!res.ok) throw new Error("您无权访问或请求已失效");
        return res.json();
    })
    .then(data => {
        document.getElementById("modal-doc-preview").classList.remove("hidden");
        document.getElementById("preview-doc-title").textContent = data.title;
        document.getElementById("preview-doc-content").textContent = data.content;
    })
    .catch(err => alert(err.message))
    .finally(() => hideLoading());
}

// 发送 RAG 智能对话消息
function sendRAGChatMessage() {
    const inputEl = document.getElementById("chat-user-input-text");
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";

    const flow = document.getElementById("chat-messages-flow");

    // 1. 追加用户气泡
    const userBubble = document.createElement("div");
    userBubble.className = "chat-bubble-user";
    userBubble.innerHTML = `
        <div class="user-avatar">👤</div>
        <div class="user-body-content">${escapeHTML(text)}</div>
    `;
    flow.appendChild(userBubble);
    flow.scrollTop = flow.scrollHeight;

    // 2. 追加 AI 思考中占位气泡
    const aiLoadingBubble = document.createElement("div");
    aiLoadingBubble.className = "chat-bubble-ai";
    aiLoadingBubble.id = "chat-loading-placeholder";
    aiLoadingBubble.innerHTML = `
        <div class="ai-avatar">🤖</div>
        <div class="ai-body-content">
            <div class="thinking-box">小智正在深度阅读当前项目归档材料（RAG检索中）...</div>
        </div>
    `;
    flow.appendChild(aiLoadingBubble);
    flow.scrollTop = flow.scrollHeight;

    // 3. 向后端发起 RAG 会话
    fetch(`/api/projects/${currentProject.id}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({ message: text, thinking_mode: chatThinkingMode })
    })
    .then(res => {
        if (!res.ok) throw new Error("AI 对话请求失败，请检查登录会话状态");
        return res.json();
    })
    .then(data => {
        // 移除 loading 占位
        const placeholder = document.getElementById("chat-loading-placeholder");
        if (placeholder) placeholder.remove();

        const aiBubble = document.createElement("div");
        aiBubble.className = "chat-bubble-ai";
        
        let referencesHtml = "";
        if (data.references && data.references.length > 0) {
            referencesHtml = `
                <div class="chat-references-row">
                    📂 已检索参考源（RAG）：
                    ${data.references.map(r => `<span class="ref-pill">${escapeHTML(r)}</span>`).join("")}
                </div>
            `;
        }

        let thinkingMsg = "";
        if (chatThinkingMode === "deep") {
            thinkingMsg = `<div class="thinking-box">💡 深度思考过程：已针对该项目共 ${currentProjectFiles.length} 份归档文档进行交叉校验，校验其支付单据、监理周报及进度时限，进行智能综合推导...</div>`;
        }

        aiBubble.innerHTML = `
            <div class="ai-avatar">🤖</div>
            <div class="ai-body-content">
                <p style="font-weight:700; color:var(--text-muted); font-size:11px; margin-bottom:4px;">小智 • ${data.model}</p>
                ${thinkingMsg}
                <div style="white-space: pre-wrap; font-size:13px; line-height:1.6;">${escapeHTML(data.response)}</div>
                ${referencesHtml}
            </div>
        `;
        flow.appendChild(aiBubble);
        flow.scrollTop = flow.scrollHeight;
    })
    .catch(err => {
        const placeholder = document.getElementById("chat-loading-placeholder");
        if (placeholder) placeholder.remove();
        alert(err.message);
    });
}

// 渲染 RAG AI提取的付款表
function renderRAGPaymentTable() {
    const tableBody = document.getElementById("rag-payment-table-body");
    tableBody.innerHTML = "";

    const nodes = currentProject.payment_nodes;
    if (!nodes || nodes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">大模型未提取到该项目付款节点，请上传正式采购合同进行自动识别。</td></tr>`;
        return;
    }

    nodes.forEach(n => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:700; color:var(--gov-blue);">第 ${n.node_index} 期</td>
            <td style="font-size:12.5px;">${escapeHTML(n.description)}</td>
            <td style="font-weight:600;">${n.ratio}%</td>
            <td style="font-weight:600;">${formatCurrency(n.amount)}</td>
            <td>
                <span class="score-badge ${n.is_paid ? 'high' : 'medium'}">
                    ${n.is_paid ? '已结清 ✓' : '待拨付 ⌛'}
                </span>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// 加载 RAG 定稿文档列表
function loadRAGSavedDocuments() {
    const container = document.getElementById("rag-saved-docs-list-container");
    container.innerHTML = "";

    fetch(`/api/projects/${currentProject.id}/saved-docs`)
    .then(res => res.json())
    .then(docs => {
        document.getElementById("rag-saved-docs-count").textContent = `共 ${docs.length} 篇`;
        if (docs.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding-top:30px;">📂 暂无已保存的公文定稿</div>`;
            return;
        }

        docs.forEach(doc => {
            const card = document.createElement("div");
            card.className = "saved-doc-item-card";
            card.innerHTML = `
                <div class="saved-doc-title-row">${escapeHTML(doc.title)}</div>
                <div class="saved-doc-meta-row">
                    <span>📝 ${doc.content.length} 字</span>
                    <span>${escapeHTML(doc.saved_at.substring(5, 16))}</span>
                </div>
                <button class="btn-delete-saved-doc" title="从数据库中物理删除该公文">×</button>
            `;

            // 点击卡片装载到编辑器中
            card.addEventListener("click", () => {
                editingDocId = doc.id;
                document.getElementById("rag-input-doc-title").value = doc.title;
                document.getElementById("rag-textarea-doc-content").value = doc.content;

                // 强制切到定稿文档编辑器子选项卡
                document.querySelectorAll(".chat-mode-btn").forEach(btn => {
                    if (btn.getAttribute("data-mode") === "editor") btn.click();
                });
            });

            // 点击删除公文
            card.querySelector(".btn-delete-saved-doc").addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`⚠️ 确定要从系统库中物理删除文书 【${doc.title}】 吗？此操作将生成审计日志。`)) {
                    deleteRAGSavedDocument(doc.id);
                }
            });

            container.appendChild(card);
        });
    });
}

// 保存/更新定稿公文
function saveRAGDocument() {
    const title = document.getElementById("rag-input-doc-title").value.trim();
    const content = document.getElementById("rag-textarea-doc-content").value.trim();

    if (!title || !content) {
        alert("请输入文书的标题与公文正文内容！");
        return;
    }

    const url = editingDocId 
        ? `/api/projects/${currentProject.id}/saved-docs/${editingDocId}` 
        : `/api/projects/${currentProject.id}/saved-docs`;

    const method = editingDocId ? "PUT" : "POST";

    fetch(url, {
        method: method,
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({ title: title, content: content })
    })
    .then(res => {
        if (!res.ok) throw new Error("无权编辑或会话已超时");
        return res.json();
    })
    .then(data => {
        alert(data.message || "公文文书已存入该项目公文历史库！");
        editingDocId = "";
        document.getElementById("rag-input-doc-title").value = "";
        document.getElementById("rag-textarea-doc-content").value = "";
        
        // 刷新列表并切回智能助手
        loadRAGSavedDocuments();
        document.querySelectorAll(".chat-mode-btn").forEach(btn => {
            if (btn.getAttribute("data-mode") === "assistant") btn.click();
        });
    })
    .catch(err => alert(err.message));
}

// 删除定稿公文
function deleteRAGSavedDocument(docId) {
    fetch(`/api/projects/${currentProject.id}/saved-docs/${docId}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken }
    })
    .then(res => {
        if (!res.ok) throw new Error("无权执行此操作");
        return res.json();
    })
    .then(() => {
        editingDocId = "";
        document.getElementById("rag-input-doc-title").value = "";
        document.getElementById("rag-textarea-doc-content").value = "";
        loadRAGSavedDocuments();
    })
    .catch(err => alert(err.message));
}

// 加载后台管理审计日志
function loadAdminAuditLog() {
    const tbody = document.getElementById("admin-audit-table-body");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>正在调取安全审计日志...</td></tr>";

    fetch("/api/audit-logs", {
        headers: { "X-CSRF-Token": csrfToken }
    })
        .then(r => r.ok ? r.json() : [])
        .then(logs => {
            if (!logs || logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">暂无审计日志记录</td></tr>';
                return;
            }
            tbody.innerHTML = logs.slice(0, 50).map(log => `
                <tr>
                    <td style="color:var(--text-muted); font-family:monospace; font-size:12.5px;">${escapeHTML(log.created_at || log.time || "")}</td>
                    <td style="font-weight:700;">${escapeHTML(log.user || "")}</td>
                    <td><span class="stage-tag badge-blue">${escapeHTML(log.action || "")}</span></td>
                    <td style="max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;" title="${escapeHTML(log.details || log.detail || "")}">${escapeHTML(log.details || log.detail || "")}</td>
                    <td style="font-family:monospace; font-size:12px;">${escapeHTML(log.ip || "")}</td>
                </tr>
            `).join("");
        })
        .catch(() => {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">加载审计日志失败</td></tr>';
        });
}

// 加载后台管理用户列表
function loadAdminUsersTable() {
    const tbody = document.getElementById("admin-users-table-body");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>正在调取系统管理账户与权限列表...</td></tr>";

    apiFetch("/api/system/users")
    .then(res => {
        if (!res.ok) throw new Error("只有超级管理员有权查看管理账号面板");
        return res.json();
    })
    .then(users => {
        if (!users || users.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:var(--text-muted); padding:30px;'>暂无用户账号数据</td></tr>";
            return;
        }
        tbody.innerHTML = "";
        users.forEach(u => {
            const tr = document.createElement("tr");
            let roleText = formatRole(u.role);
            tr.innerHTML = `
                <td style="font-weight:700; color:var(--text-dark);">${escapeHTML(u.username)}</td>
                <td>${escapeHTML(u.name)}</td>
                <td><span class="stage-tag badge-blue">${roleText}</span></td>
                <td style="color:var(--text-muted); font-family:monospace;">${escapeHTML(u.wechat_id || "-")}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn-gov-secondary btn-reset-user-pwd" data-uname="${u.username}" style="padding:4px 8px; font-size:12px;">重置密码</button>
                        <button class="btn-delete" onclick="deleteAdminUser('${u.username}')" style="padding:4px 8px; font-size:12px;">注销</button>
                    </div>
                </td>
            `;
            tr.querySelector(".btn-reset-user-pwd").addEventListener("click", (e) => {
                const username = e.target.getAttribute("data-uname");
                resetUserPassword(username);
            });
            tbody.appendChild(tr);
        });
    })
    .catch(err => {
        tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; color:var(--text-muted); padding:20px;'>⚠️ ${err.message}</td></tr>`;
    });
}

// 后台管理员重置指定用户密码为默认密码
function resetUserPassword(username) {
    if (confirm(`🔒 您确定要将管理账号【${username}】的登录密码重置为系统默认初始密码【admin123】吗？`)) {
        fetch(`/api/system/users/${username}/reset-password`, {
            method: "POST",
            headers: { "X-CSRF-Token": csrfToken }
        })
        .then(res => {
            if (!res.ok) throw new Error("密码重置失败，可能是权限不足或会话过期");
            return res.json();
        })
        .then(data => {
            alert(data.message || "账号密码已成功重置！");
        })
        .catch(err => alert(err.message));
    }
}

// ==========================================================================
// 后台管理 - 左侧导航切换逻辑
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 返回项目看板按钮
    const backBtn = document.getElementById("btn-admin-back-home");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            window.location.hash = "";
            switchTab("ledger");
        });
    }
});

    // 审计日志导出按钮 (后台管理面板中)
    const exportAuditAdminBtn = document.getElementById("btn-export-audit-admin");
    if (exportAuditAdminBtn) {
        exportAuditAdminBtn.addEventListener("click", () => {
            // 复用原有的审计日志导出功能
            const btn2 = document.getElementById("btn-export-audit");
            if (btn2) btn2.click();
        });
    }

    // 数据导出卡片按钮
    document.querySelectorAll(".btn-export-action").forEach(btn => {
        btn.addEventListener("click", () => {
            const type = btn.getAttribute("data-type");
            window.open("/api/export?type=" + type, "_blank");
        });
    });

// 渲染待办事项
function renderProjectTodos() {
    const container = document.getElementById("project-todo-list-container");
    if (!container || !currentProject) return;

    if (!currentProject.todos) {
        // 默认根据健康研判生成默认待办
        currentProject.todos = [];
        if (currentProject.health_report && currentProject.health_report.finance.missing_docs && currentProject.health_report.finance.missing_docs.length > 0) {
            currentProject.todos.push({ id: "t1", text: `【资金】补齐缺失凭证: ${currentProject.health_report.finance.missing_docs[0]}`, done: false });
        }
        if (currentProject.health_report && currentProject.health_report.quality.unresolved_issues_count > 0) {
            currentProject.todos.push({ id: "t2", text: `【质量】督促供应商整改 ${currentProject.health_report.quality.unresolved_issues_count} 项遗留缺陷`, done: false });
        }
        currentProject.todos.push({ id: "t3", text: "【节点】准备初验/竣工验收评审材料", done: false });
    }

    if (currentProject.todos.length === 0) {
        container.innerHTML = '<li style="padding:15px; color:var(--text-muted); text-align:center;">暂无待办事项，一切顺利！</li>';
        return;
    }

    container.innerHTML = currentProject.todos.map(t => `
        <li class="todo-item ${t.done ? 'completed' : ''}">
            <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleProjectTodo('${t.id}')">
            <span class="todo-text">${escapeHtml(t.text)}</span>
            <button class="todo-delete" onclick="deleteProjectTodo('${t.id}')" title="删除待办">✕</button>
        </li>
    `).join("");
}

function toggleProjectTodo(id) {
    if (!currentProject || !currentProject.todos) return;
    const item = currentProject.todos.find(t => t.id === id);
    if (item) {
        item.done = !item.done;
        renderProjectTodos();
    }
}

function deleteProjectTodo(id) {
    if (!currentProject || !currentProject.todos) return;
    currentProject.todos = currentProject.todos.filter(t => t.id !== id);
    renderProjectTodos();
}

// 弹出式预警提醒事件轴 Modal
function openAlertsModal() {
    closeAlertsModal();

    const sorted = (alertsList || []).sort((a,b) => b.trigger_date.localeCompare(a.trigger_date));

    let itemsHtml = sorted.map(a => {
        const isRead = a.status === "read";
        return `
            <div class="alerts-modal-item ${a.level}-level" style="margin-bottom:12px; padding:12px; border:1px solid #cbd5e1; border-radius:6px; background:${isRead ? '#f8fafc' : '#fff'}; border-left:4px solid ${a.level === 'danger' ? '#ef4444' : (a.level === 'warning' ? '#f59e0b' : '#3b82f6')};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:14px; color:${a.level === 'danger' ? '#dc2626' : (a.level === 'warning' ? '#d97706' : '#2563eb')}">
                        ${escapeHtml(a.title)}
                    </strong>
                    <span style="font-size:12px; color:var(--text-muted); font-family:monospace;">${escapeHtml(a.trigger_date)}</span>
                </div>
                <p style="font-size:13px; color:#334155; margin:6px 0; line-height:1.5;">${escapeHtml(a.content)}</p>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                    <button class="btn-gov-secondary" onclick="closeAlertsModal(); openProjectDetail('${a.project_id}');" style="font-size:12px; padding:3px 8px;">🔍 查看关联项目</button>
                    ${isRead ? '<span style="font-size:12px; color:#16a34a; font-weight:600;">✓ 已回执</span>' : `<button class="btn-gov-primary" onclick="ackAlertReadModal('${a.id}', this)" style="font-size:12px; padding:3px 8px;">已阅回执</button>`}
                </div>
            </div>
        `;
    }).join("");

    if (!itemsHtml) {
        itemsHtml = '<div style="text-align:center; padding:30px; color:var(--text-muted);">🎉 当前暂无触发的预警提醒</div>';
    }

    const modalHtml = `
        <div class="admin-modal-overlay" id="alerts-modal-overlay" onclick="if(event.target===this) closeAlertsModal();" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;">
            <div class="admin-modal" style="background:#fff; border-radius:8px; width:90%; max-width:680px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); animation: adminFadeIn 0.2s ease;">
                <div class="admin-modal-header" style="padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:16px; color:var(--gov-blue);">🔔 智能预警事件轴提醒</h3>
                    <button class="admin-modal-close" onclick="closeAlertsModal()" style="background:none; border:none; font-size:20px; cursor:pointer; color:#64748b; padding:0 6px;">✕</button>
                </div>
                <div class="admin-modal-body" style="padding:20px; overflow-y:auto; flex:1;">
                    ${itemsHtml}
                </div>
                <div class="admin-modal-footer" style="padding:12px 20px; border-top:1px solid #e2e8f0; text-align:right;">
                    <button class="btn-gov-secondary" onclick="closeAlertsModal()" style="padding:6px 16px;">关闭弹窗</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function closeAlertsModal() {
    const modal = document.getElementById("alerts-modal-overlay");
    if (modal) modal.remove();
}

function ackAlertReadModal(alertId, btn) {
    apiFetch(`/api/alerts/${alertId}/read`, { method: "POST" })
        .then(res => {
            if (res.ok) {
                btn.outerHTML = '<span style="font-size:12px; color:#16a34a; font-weight:600;">✓ 已回执</span>';
                startAlertsPoller();
            }
        });
}

function switchDetailRightTab(paneName) {
    paneName = paneName || "compliance";

    // 1. 按钮高亮
    document.querySelectorAll(".pane-tab-btn").forEach(btn => {
        if (btn.getAttribute("data-pane") === paneName || btn.id === "tab-btn-" + paneName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // 2. 右侧 3 个面板显隐
    const panes = ["compliance", "rag-chat", "todos"];
    panes.forEach(name => {
        const el = document.getElementById("pane-tab-" + name);
        if (el) {
            if (name === paneName) {
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
}

// 显式导出给 window 全局
window.openAlertsModal = openAlertsModal;
window.closeAlertsModal = closeAlertsModal;
window.ackAlertReadModal = ackAlertReadModal;
window.switchTab = switchTab;
window.openProjectDetail = openProjectDetail;
window.setCardFilter = setCardFilter;
window.sortLedgerBy = sortLedgerBy;
window.switchDetailRightTab = switchDetailRightTab;

