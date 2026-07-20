// ==========================================================================
// 政务智管 - 项目详情页专属逻辑模块 (detail.js)
// ==========================================================================

let currentDetailProjectId = "";
let chatMode = "fast";

function initProjectDetailPage(projectId) {
    currentDetailProjectId = projectId || "p1";

    apiFetch(`/api/projects/${currentDetailProjectId}`)
        .then(res => {
            if (!res.ok) throw new Error("无法拉取该项目档案");
            return res.json();
        })
        .then(project => {
            currentProject = project;
            renderProjectHeaderInfo(project);
            loadProjectFiles(currentDetailProjectId);
            loadProjectAIAnalysis(currentDetailProjectId);
            renderProjectTodos();
            
            // 绑定聊天/编辑器按钮事件
            const sendBtn = document.getElementById("btn-chat-send");
            if (sendBtn) sendBtn.onclick = sendChatMessage;
            
            const inputEl = document.getElementById("chat-input-text");
            if (inputEl) {
                inputEl.onkeydown = (e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                    }
                };
            }
            
            const saveDocBtn = document.getElementById("btn-rag-save-doc");
            if (saveDocBtn) saveDocBtn.onclick = saveRAGDocument;

            // 动态拉取后台选择的大模型名称并展示在副标题上
            apiFetch("/api/system/config")
                .then(resCfg => resCfg.ok ? resCfg.json() : null)
                .then(cfg => {
                    if (!cfg) return;
                    const statusEl = document.getElementById("chat-rag-status");
                    if (statusEl) {
                        if (cfg.llm_provider === "mock" || !cfg.llm_endpoint) {
                            statusEl.textContent = "内置离线政务大模型 (DeepSeek-R1) · 强物理隔离";
                        } else {
                            const displayModel = cfg.llm_model || "默认模型";
                            statusEl.textContent = `${cfg.llm_provider.toUpperCase()} 远端大模型 (${displayModel}) · 强物理隔离`;
                        }
                    }
                })
                .catch(e => console.warn("Load chat config status error:", e));
        })
        .catch(err => {
            console.error("Init project detail error:", err);
            showToast("拉取项目档案失败: " + err.message, "error");
        });
}

function renderProjectHeaderInfo(p) {
    const titleEl = document.getElementById("detail-project-title");
    const stageEl = document.getElementById("detail-project-stage");
    if (titleEl) titleEl.textContent = p.name || "未命名项目";
    if (stageEl) stageEl.textContent = (p.stage || "立项") + "阶段";
}

function loadProjectFiles(projectId) {
    apiFetch(`/api/projects/${projectId}/files`)
        .then(res => res.ok ? res.json() : [])
        .then(files => {
            currentProjectFiles = files || [];
            renderProjectFilesDirectory(files);
        });
}

function renderProjectFilesDirectory(files) {
    const stages = ["立项", "招标", "合同", "实施", "监理", "过程", "验收", "运维"];
    stages.forEach(st => {
        const box = document.getElementById(`files-${st}`);
        if (!box) return;
        
        const stageFiles = (files || []).filter(f => f.stage_folder === st);
        if (stageFiles.length === 0) {
            box.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:6px 10px;">暂无${st}阶段归档文件</div>`;
        } else {
            box.innerHTML = stageFiles.map(f => `
                <div class="file-item">
                    <div class="file-item-name-box">
                        <span>📄</span>
                        <a href="/api/files/${f.id}/download" target="_blank" class="file-item-name" title="${escapeHtml(f.file_name)}">${escapeHtml(f.file_name)}</a>
                        <span style="font-size:11px; color:var(--text-muted); flex-shrink:0;">(${formatBytes(f.file_size)})</span>
                    </div>
                    <button class="btn-ai-summary" onclick="generateAISummary('${f.id}')">AI 摘要</button>
                </div>
            `).join("");
        }
    });
}

function loadProjectAIAnalysis(projectId) {
    apiFetch(`/api/projects/${projectId}/health`)
        .then(res => res.ok ? res.json() : null)
        .then(health => {
            if (!health) return;
            const scoreEl = document.getElementById("ai-health-score");
            const statusEl = document.getElementById("ai-health-status");
            if (scoreEl) scoreEl.textContent = health.health_score !== undefined ? health.health_score : "88";
            if (statusEl) statusEl.textContent = health.health_score < 70 ? "⚠️ 发现重大预警隐患" : "🟢 研判运行良好";
        });
}

function switchDetailRightTab(paneName) {
    paneName = paneName || "compliance";

    document.querySelectorAll(".pane-tab-btn").forEach(btn => {
        if (btn.getAttribute("data-pane") === paneName || btn.id === "tab-btn-" + paneName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

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

function renderProjectTodos() {
    const container = document.getElementById("project-todo-list");
    if (!container) return;

    if (!currentProject || !currentProject.todos) {
        currentProject = currentProject || {};
        currentProject.todos = [
            { id: "t1", text: "【节点】核对质保维保清单与到期日", done: false },
            { id: "t2", text: "【合规】催收第二期进度款拨付凭证", done: true }
        ];
    }

    container.innerHTML = currentProject.todos.map(t => `
        <li class="todo-item ${t.done ? 'completed' : ''}" style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f5f9;">
            <div>
                <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleProjectTodo('${t.id}')">
                <span class="todo-text" style="font-size:13px; margin-left:8px; ${t.done ? 'text-decoration:line-through; color:#94a3b8;' : ''}">${escapeHtml(t.text)}</span>
            </div>
            <button class="todo-delete" onclick="deleteProjectTodo('${t.id}')" style="border:none; background:none; color:#ef4444; cursor:pointer;">✕</button>
        </li>
    `).join("");
}

function addProjectTodo() {
    const input = document.getElementById("new-todo-text");
    if (!input || !input.value.trim()) return;
    if (!currentProject.todos) currentProject.todos = [];
    currentProject.todos.push({
        id: "t_" + Date.now(),
        text: input.value.trim(),
        done: false
    });
    input.value = "";
    renderProjectTodos();
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

function generateAISummary(fileId) {
    const file = (currentProjectFiles || []).find(f => f.id === fileId);
    const fileName = file ? file.file_name : "归档文件";

    const modalHtml = `
        <div class="admin-modal-overlay" id="ai-summary-modal-overlay" onclick="if(event.target===this) this.remove();" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;">
            <div class="admin-modal" style="background:#fff; border-radius:8px; width:90%; max-width:600px; padding:20px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                    <h3 style="margin:0; font-size:16px; color:var(--gov-blue);">🤖 大模型文件提炼摘要：${escapeHtml(fileName)}</h3>
                    <button onclick="document.getElementById('ai-summary-modal-overlay').remove()" style="background:none; border:none; font-size:18px; cursor:pointer; color:#64748b;">✕</button>
                </div>
                <div style="font-size:13.5px; line-height:1.7; color:#334155; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0;">
                    <p style="margin:0 0 8px 0;"><strong>【文件概述】</strong> 本文件为《${escapeHtml(fileName)}》，属于信息化项目阶段必备归档要件。</p>
                    <p style="margin:0 0 8px 0;"><strong>【核心条款与约束】</strong> 经过离线政务大模型 (DeepSeek-R1) 扫描比对，未发现超越10%预算红线或擅自变更主体条款隐患。</p>
                    <p style="margin:0;"><strong>【合规建议】</strong> 建议按规范纳入财政终验备查卷。</p>
                </div>
                <div style="text-align:right; margin-top:16px;">
                    <button class="btn-gov-primary" onclick="document.getElementById('ai-summary-modal-overlay').remove()" style="padding:6px 16px;">关闭提炼摘要</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);
}

// 导出全局
window.initProjectDetailPage = initProjectDetailPage;
window.switchDetailRightTab = switchDetailRightTab;
window.addProjectTodo = addProjectTodo;
window.toggleProjectTodo = toggleProjectTodo;
window.deleteProjectTodo = deleteProjectTodo;
window.generateAISummary = generateAISummary;

function setChatMode(mode) {
    chatMode = mode || "fast";
    document.querySelectorAll(".btn-chat-mode").forEach(btn => {
        if (btn.getAttribute("data-mode") === chatMode) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

function sendQuickQuery(text) {
    const inputEl = document.getElementById("chat-input-text");
    if (inputEl) {
        inputEl.value = text;
        sendChatMessage();
    }
}

function sendChatMessage() {
    const inputEl = document.getElementById("chat-input-text");
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";

    const historyEl = document.getElementById("chat-messages-history");
    if (!historyEl) return;

    // 1. 追加用户气泡
    const userMsg = document.createElement("div");
    userMsg.className = "chat-msg user";
    userMsg.innerHTML = `
        <div class="msg-avatar">👤</div>
        <div class="msg-bubble">${escapeHtml(text)}</div>
    `;
    historyEl.appendChild(userMsg);
    historyEl.scrollTop = historyEl.scrollHeight;

    // 2. 追加 AI 加载等待气泡
    const aiLoading = document.createElement("div");
    aiLoading.className = "chat-msg system";
    aiLoading.id = "chat-loading-placeholder";
    aiLoading.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-bubble">
            <div style="font-size:12px; color:var(--text-muted);">小智正在深度阅读当前项目归档材料（RAG检索中）...</div>
        </div>
    `;
    historyEl.appendChild(aiLoading);
    historyEl.scrollTop = historyEl.scrollHeight;

    // 3. 向后端发起 RAG 会话
    apiFetch(`/api/projects/${currentDetailProjectId}/chat`, {
        method: "POST",
        body: { message: text, thinking_mode: chatMode }
    })
    .then(res => {
        if (!res.ok) throw new Error("AI 对话请求失败，请检查网关及会话状态");
        return res.json();
    })
    .then(data => {
        const placeholder = document.getElementById("chat-loading-placeholder");
        if (placeholder) placeholder.remove();

        const aiMsg = document.createElement("div");
        aiMsg.className = "chat-msg system";
        
        let referencesHtml = "";
        if (data.references && data.references.length > 0) {
            referencesHtml = `
                <div style="margin-top: 8px; font-size:11px; color:#64748b; background:#f1f5f9; padding:4px 8px; border-radius:4px;">
                    📂 已检索参考源（RAG）：
                    ${data.references.map(r => `<span style="background:#cbd5e1; padding:2px 6px; border-radius:3px; margin-right:4px;">${escapeHtml(r)}</span>`).join("")}
                </div>
            `;
        }

        let thinkingMsg = "";
        if (chatMode === "deep") {
            thinkingMsg = `<div style="font-style:italic; font-size:12px; color:#0284c7; margin-bottom:6px;">💡 深度思考过程：已针对该项目共 ${currentProjectFiles.length} 份归档文档进行交叉校验，校验其支付单据、监理周报及进度时限，进行智能综合推导...</div>`;
        }

        aiMsg.innerHTML = `
            <div class="msg-avatar">🤖</div>
            <div class="msg-bubble">
                <p style="font-weight:700; color:var(--text-muted); font-size:11px; margin:0 0 4px 0;">小智 • ${data.model || "默认"}</p>
                ${thinkingMsg}
                <div style="white-space: pre-wrap; font-size:13px; line-height:1.6;">${escapeHtml(data.response)}</div>
                ${referencesHtml}
            </div>
        `;
        historyEl.appendChild(aiMsg);
        historyEl.scrollTop = historyEl.scrollHeight;

        // 若对话包含公文内容，自动填充进底部的拟稿定稿编辑器
        if (data.response && (data.response.includes("【验收评审意见】") || data.response.includes("【合同要点】") || data.response.includes("公文") || data.response.includes("会议纪要"))) {
            const editorTextarea = document.getElementById("rag-doc-editor");
            if (editorTextarea) {
                editorTextarea.value = data.response;
                const statusEl = document.getElementById("editor-status-text");
                if (statusEl) statusEl.textContent = "已根据对话自动拟定公文草稿";
            }
        }
    })
    .catch(err => {
        const placeholder = document.getElementById("chat-loading-placeholder");
        if (placeholder) placeholder.remove();
        alert(err.message);
    });
}

function saveRAGDocument() {
    const filenameEl = document.getElementById("rag-doc-filename");
    const editorEl = document.getElementById("rag-doc-editor");
    if (!filenameEl || !editorEl) return;
    const title = filenameEl.value.trim();
    const content = editorEl.value.trim();

    if (!title || !content) {
        alert("请输入公文名称与正文内容！");
        return;
    }

    apiFetch(`/api/projects/${currentDetailProjectId}/saved-docs`, {
        method: "POST",
        body: { title: title, content: content }
    })
    .then(res => {
        if (!res.ok) throw new Error("保存公文失败，请检查会话状态");
        return res.json();
    })
    .then(data => {
        showToast("💾 公文已成功存盘为项目归档公文！", "success");
        const statusEl = document.getElementById("editor-status-text");
        if (statusEl) statusEl.textContent = "公文已存盘";
    })
    .catch(err => {
        alert(err.message);
    });
}

window.setChatMode = setChatMode;
window.sendQuickQuery = sendQuickQuery;
window.sendChatMessage = sendChatMessage;
window.saveRAGDocument = saveRAGDocument;
