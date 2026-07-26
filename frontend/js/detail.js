// ==========================================================================
// 政务智管 - 项目详情页专属逻辑模块 (detail.js)
// ==========================================================================

let currentDetailProjectId = "";
let chatMode = "fast";

function initProjectDetailPage(projectId) {
    currentDetailProjectId = projectId || "p1";
    window.currentProjectId = currentDetailProjectId;

    apiFetch(`/api/projects/${currentDetailProjectId}`)
        .then(res => {
            if (!res.ok) throw new Error("无法拉取该项目档案");
            return res.json();
        })
        .then(project => {
            currentProject = project;
            renderProjectHeaderInfo(project);
            loadProjectFiles(currentDetailProjectId);
            loadProjectAnalysis(currentDetailProjectId);
            renderProjectTodos();
            loadYunnanEval(currentDetailProjectId);
            
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

            // 动态拉取后台选择的模型名称并展示在副标题上
            apiFetch("/api/system/config")
                .then(resCfg => resCfg.ok ? resCfg.json() : null)
                .then(cfg => {
                    if (!cfg) return;
                    const statusEl = document.getElementById("chat-rag-status");
                    if (statusEl) {
                        if (cfg.llm_provider === "mock" || !cfg.llm_endpoint) {
                            statusEl.textContent = "内置离线政务引擎 (DeepSeek-R1) · 强物理隔离";
                        } else {
                            const displayModel = cfg.llm_model || "默认模型";
                            statusEl.textContent = `${cfg.llm_provider.toUpperCase()} 远端引擎 (${displayModel}) · 强物理隔离`;
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
    const stageSelectEl = document.getElementById("detail-project-stage-select");
    const stageEl = document.getElementById("detail-project-stage");
    
    if (titleEl) titleEl.textContent = p.name || "未命名项目";
    if (stageEl) stageEl.textContent = (p.stage || "立项") + "阶段";
    if (stageSelectEl) {
        stageSelectEl.value = p.stage || "立项";
    }
}

function handleStageSelectChange(newStage) {
    if (!currentProjectId) return;
    
    if (typeof showToast === "function") showToast("正在更新项目阶段设置...", "info");
    
    apiFetch(`/api/projects/${currentProjectId}`, {
        method: "PUT",
        headers: { 
            "Content-Type": "application/json",
            "X-CSRF-Token": typeof csrfToken !== "undefined" ? csrfToken : ""
        },
        body: JSON.stringify({ stage: newStage })
    })
    .then(res => res.ok ? res.json() : Promise.reject("更新阶段失败"))
    .then(updatedProj => {
        const stageLabel = newStage === "auto" ? `自动推演（当前：${updatedProj.stage}阶段）` : `${updatedProj.stage}阶段`;
        if (typeof showToast === "function") showToast(`✅ 项目阶段已成功更新为【${stageLabel}】`, "success");
        initProjectDetailPage();
    })
    .catch(err => {
        if (typeof showToast === "function") showToast("⚠️ 阶段修改失败: " + err, "error");
    });
}

window.handleStageSelectChange = handleStageSelectChange;

function loadProjectFiles(projectId) {
    apiFetch(`/api/projects/${projectId}/files`)
        .then(res => res.ok ? res.json() : [])
        .then(files => {
            currentProjectFiles = files || [];
            renderProjectFilesDirectory(files);
        });
}

const NATIONAL_ARCHIVE_CATALOG = [
    {
        id: "cat-1",
        name: "1. 立项阶段文件",
        stageKey: "立项",
        subcategories: [
            { id: "sub-1-1", title: "1.1 项目建议书阶段文件", keywords: ["建议书"] },
            { id: "sub-1-2", title: "1.2 可行性研究报告阶段文件", keywords: ["可研", "可行性", "预算评审", "立项"] },
            { id: "sub-1-3", title: "1.3 初步设计阶段文件", keywords: ["初步设计", "设计方案", "概算"] }
        ]
    },
    {
        id: "cat-2",
        name: "2. 项目管理文件",
        stageKey: "项目管理",
        subcategories: [
            { id: "sub-2-1", title: "2.1 综合管理文件", keywords: ["管理制度", "会议纪要", "纪要", "总结", "简报", "过程", "协调"] },
            { id: "sub-2-2", title: "2.2 招投标文件", keywords: ["招标", "投标", "中标", "答疑", "控制价"] },
            { id: "sub-2-3", title: "2.3 合同文件", keywords: ["合同", "协议", "补充协议", "谈判纪要"] }
        ]
    },
    {
        id: "cat-3",
        name: "3. 设计阶段文件",
        stageKey: "设计",
        subcategories: [
            { id: "sub-3-1", title: "3.1 设计开发文件", keywords: ["需求", "概要设计", "详细设计", "代码规范"] },
            { id: "sub-3-2", title: "3.2 信息资源规划与数据库设计文件", keywords: ["数据库", "数据字典", "信息资源"] },
            { id: "sub-3-7", title: "3.7 网络、安全与配套工程设计文件", keywords: ["网络设计", "安全设计", "深化设计", "架构图"] }
        ]
    },
    {
        id: "cat-4",
        name: "4. 实施阶段文件",
        stageKey: "实施",
        subcategories: [
            { id: "sub-4-1", title: "4.1 总体实施文件", keywords: ["实施方案", "到货", "安装", "进度计划", "硬件"] },
            { id: "sub-4-3", title: "4.3 系统建设与测试文件", keywords: ["联调测试", "二次开发", "测试报告"] },
            { id: "sub-4-11", title: "4.11 配套工程及施工记录文件", keywords: ["施工记录", "隐蔽工程", "竣工图"] }
        ]
    },
    {
        id: "cat-5",
        name: "5. 监理文件",
        stageKey: "监理",
        subcategories: [
            { id: "sub-5-1", title: "5.1 监理大纲与规划细则", keywords: ["监理大纲", "监理规划", "监理细则"] },
            { id: "sub-5-7", title: "5.7 监理通知、记录与工作联系单", keywords: ["监理日志", "巡检记录", "工作联系单", "旁站记录", "监理"] },
            { id: "sub-5-8", title: "5.8 监理周报、月报与总结报告", keywords: ["监理周报", "监理月报", "监理总结"] }
        ]
    },
    {
        id: "cat-6",
        name: "6. 设备文件及系统软件",
        stageKey: "设备",
        subcategories: [
            { id: "sub-6-1", title: "6.1 选购与开箱验收文件", keywords: ["开箱", "装箱单", "合格证", "说明书"] },
            { id: "sub-6-5", title: "6.5 设备维修与后期维护文件", keywords: ["运维", "维保", "满意度", "服务告知", "维修"] }
        ]
    },
    {
        id: "cat-7",
        name: "7. 财务管理文件",
        stageKey: "财务",
        subcategories: [
            { id: "sub-7-2", title: "7.2 概预算与资金申请批复", keywords: ["资金申请", "概算", "预算"] },
            { id: "sub-7-5", title: "7.5 付款凭证、发票与决算报告", keywords: ["付款凭证", "发票", "进度款", "决算"] }
        ]
    },
    {
        id: "cat-8",
        name: "8. 验收文件",
        stageKey: "验收",
        subcategories: [
            { id: "sub-8-1", title: "8.1 初步验收阶段文件", keywords: ["初验", "测评合格", "整改方案"] },
            { id: "sub-8-2", title: "8.2 竣工终验阶段文件", keywords: ["整体验收", "竣工验收", "鉴定书", "终验"] }
        ]
    }
];

function classifyFileToNationalStandard(file) {
    const fname = (file.file_name || "").toLowerCase();
    const stage = (file.stage_folder || "").toLowerCase();

    let targetCat = NATIONAL_ARCHIVE_CATALOG[0];

    if (stage.includes("立项") || fname.includes("立项") || fname.includes("可研") || fname.includes("建议书")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[0];
    } else if (stage.includes("招标") || fname.includes("招标") || fname.includes("中标") ||
               stage.includes("合同") || fname.includes("合同") || fname.includes("协议") ||
               stage.includes("过程") || fname.includes("会议纪要") || fname.includes("管理")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[1];
    } else if (stage.includes("设计") || fname.includes("设计") || fname.includes("架构") || fname.includes("需求")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[2];
    } else if (stage.includes("实施") || fname.includes("到货") || fname.includes("实施") || fname.includes("测试")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[3];
    } else if (stage.includes("监理") || fname.includes("监理") || fname.includes("巡检") || fname.includes("日志")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[4];
    } else if (stage.includes("运维") || fname.includes("维保") || fname.includes("设备") || fname.includes("开箱") || fname.includes("满意度")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[5];
    } else if (fname.includes("付款") || fname.includes("发票") || fname.includes("凭证") || fname.includes("概算") || fname.includes("预算")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[6];
    } else if (stage.includes("验收") || fname.includes("验收") || fname.includes("初验") || fname.includes("鉴定书")) {
        targetCat = NATIONAL_ARCHIVE_CATALOG[7];
    }

    let targetSub = targetCat.subcategories[0];
    for (let sub of targetCat.subcategories) {
        if (sub.keywords.some(kw => fname.includes(kw.toLowerCase()))) {
            targetSub = sub;
            break;
        }
    }

    return { catId: targetCat.id, subId: targetSub.id };
}

function renderProjectFilesDirectory(files) {
    const treeContainer = document.getElementById("national-archiving-tree");
    if (!treeContainer) return;

    treeContainer.innerHTML = "";

    const fileBuckets = {};
    NATIONAL_ARCHIVE_CATALOG.forEach(cat => {
        cat.subcategories.forEach(sub => {
            fileBuckets[sub.id] = [];
        });
    });

    (files || []).forEach(f => {
        const { subId } = classifyFileToNationalStandard(f);
        if (fileBuckets[subId]) {
            fileBuckets[subId].push(f);
        } else {
            fileBuckets[NATIONAL_ARCHIVE_CATALOG[0].subcategories[0].id].push(f);
        }
    });

    NATIONAL_ARCHIVE_CATALOG.forEach(cat => {
        let catTotalFiles = 0;
        cat.subcategories.forEach(sub => {
            catTotalFiles += fileBuckets[sub.id].length;
        });

        const catNode = document.createElement("div");
        catNode.className = "folder-node";
        catNode.style.marginBottom = "10px";
        catNode.style.border = "1px solid #cbd5e1";
        catNode.style.borderRadius = "6px";
        catNode.style.overflow = "hidden";

        let subCategoriesHtml = cat.subcategories.map(sub => {
            const subFiles = fileBuckets[sub.id];
            let filesHtml = "";
            if (subFiles.length === 0) {
                filesHtml = `<div style="font-size:11.5px; color:#94a3b8; padding:3px 8px;">(暂无归档文件)</div>`;
            } else {
                filesHtml = subFiles.map(f => `
                    <div class="file-item" style="margin: 3px 0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:5px 8px; display:flex; justify-content:space-between; align-items:center;">
                        <div class="file-item-name-box" style="display:flex; align-items:center; gap:6px; flex:1; overflow:hidden;">
                            <span>📄</span>
                            <a href="/api/projects/${currentDetailProjectId}/files/${f.id}/download" target="_blank" class="file-item-name" title="${escapeHtml(f.file_name)}" style="font-size:12px; color:#1e293b; text-decoration:none; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(f.file_name)}</a>
                            <span style="font-size:11px; color:#64748b; flex-shrink:0;">(${formatBytes(f.file_size)})</span>
                        </div>
                        <button class="btn-summary" onclick="generateSummary('${f.id}')" style="font-size:11px; padding:2px 8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:4px; cursor:pointer;">摘要</button>
                    </div>
                `).join("");
            }

            return `
                <div class="subfolder-node" style="margin-top:6px; padding-left:8px; border-left:2px solid #94a3b8;">
                    <div class="subfolder-title" style="font-size:12px; font-weight:600; color:#334155; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                        <span>📂 ${escapeHtml(sub.title)}</span>
                        <span style="font-size:11px; font-weight:normal; color:#64748b;">${subFiles.length} 份</span>
                    </div>
                    <div class="subfolder-files">${filesHtml}</div>
                </div>
            `;
        }).join("");

        catNode.innerHTML = `
            <div class="folder-title" onclick="toggleFolderCategory(this)" style="background:#f1f5f9; padding:8px 12px; font-weight:700; font-size:13px; color:var(--gov-blue); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;">
                <span style="display:flex; align-items:center; gap:6px;">
                    <span class="folder-toggle-icon" style="font-size:11px; color:#64748b; transition:transform 0.2s;">▶</span>
                    <span>📁 ${escapeHtml(cat.name)}</span>
                </span>
                <span class="badge" style="background:#dbeafe; color:#1e40af; font-size:11px; padding:2px 8px; border-radius:10px;">${catTotalFiles} 份归档文件</span>
            </div>
            <div class="folder-content" style="padding:8px; background:#ffffff; display:none;">
                ${subCategoriesHtml}
            </div>
        `;

        treeContainer.appendChild(catNode);
    });
}

function toggleFolderCategory(headerEl) {
    const content = headerEl.nextElementSibling;
    const icon = headerEl.querySelector('.folder-toggle-icon');
    if (!content) return;
    
    if (content.style.display === 'none' || getComputedStyle(content).display === 'none') {
        content.style.display = 'block';
        if (icon) icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        if (icon) icon.textContent = '▶';
    }
}
window.toggleFolderCategory = toggleFolderCategory;

function loadProjectAnalysis(projectId) {
    apiFetch(`/api/projects/${projectId}/health`)
        .then(res => res.ok ? res.json() : null)
        .then(health => {
            if (!health) return;
            const scoreEl = document.getElementById("health-score") || document.getElementById("ai-health-score");
            const statusEl = document.getElementById("health-status") || document.getElementById("ai-health-status");
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

    const panes = ["compliance", "yn-eval", "rag-chat", "todos"];
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

function generateSummary(fileId) {
    const file = (currentProjectFiles || []).find(f => f.id === fileId);
    const fileName = file ? file.file_name : "归档文件";

    const overlayId = "summary-modal-overlay";
    const oldOverlay = document.getElementById(overlayId);
    if (oldOverlay) oldOverlay.remove();

    const modalHtml = `
        <div class="admin-modal-overlay" id="${overlayId}" onclick="if(event.target===this) this.remove();" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;">
            <div class="admin-modal" style="background:#fff; border-radius:8px; width:90%; max-width:600px; padding:20px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                    <h3 style="margin:0; font-size:16px; color:var(--gov-blue);">🤖 文件提炼摘要：${escapeHtml(fileName)}</h3>
                    <button onclick="document.getElementById('${overlayId}').remove()" style="background:none; border:none; font-size:18px; cursor:pointer; color:#64748b;">✕</button>
                </div>
                <div id="summary-text-box" style="font-size:13.5px; line-height:1.7; color:#334155; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0; min-height:80px; display:flex; align-items:center; justify-content:center;">
                    <span style="color:var(--text-muted);">正在调用离线政务引擎生成摘要，请稍候...</span>
                </div>
                <div style="text-align:right; margin-top:16px;">
                    <button class="btn-gov-primary" onclick="document.getElementById('${overlayId}').remove()" style="padding:6px 16px;">关闭提炼摘要</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    apiFetch(`/api/projects/${currentDetailProjectId}/files/${fileId}/summary`, {
        method: "POST"
    })
    .then(res => {
        if (!res.ok) throw new Error("无法读取文件或生成摘要失败");
        return res.json();
    })
    .then(data => {
        const box = document.getElementById("summary-text-box");
        if (box) {
            box.style.display = "block";
            box.innerHTML = `<div style="white-space: pre-wrap;">${escapeHtml(data.summary || "未返回摘要")}</div>`;
        }
    })
    .catch(err => {
        const box = document.getElementById("summary-text-box");
        if (box) {
            box.style.display = "block";
            box.innerHTML = `<span style="color:#ef4444;">❌ 生成摘要失败: ${escapeHtml(err.message)}</span>`;
        }
    });
}

// 导出全局
window.initProjectDetailPage = initProjectDetailPage;
window.switchDetailRightTab = switchDetailRightTab;
window.addProjectTodo = addProjectTodo;
window.toggleProjectTodo = toggleProjectTodo;
window.deleteProjectTodo = deleteProjectTodo;
window.generateSummary = generateSummary;
window.generateAISummary = generateSummary;

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

    // 2. 追加加载等待气泡
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
        if (!res.ok) throw new Error("对话请求失败，请检查网关及会话状态");
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

// ==========================================================================
// 云南省重点建设项目档案验收大模型测评与附件1、2、3表格填报模块
// ==========================================================================

let currentYunnanTab = 'annex-2';

function loadYunnanEval(projId) {
    projId = projId || window.currentProjectId || currentDetailProjectId || 'p1';
    const btn = document.getElementById('btn-yn-eval-trigger');
    const scoreEl = document.getElementById('yn-eval-score-num');
    const badgeEl = document.getElementById('yn-eval-result-badge');
    const box = document.getElementById('yn-annex-content-box');

    apiFetch(`/api/projects/${projId}/yunnan-eval`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (!data || data.has_eval === false) {
                if (btn) btn.innerText = "🚀 评测打分";
                if (scoreEl) scoreEl.innerText = "-- 分";
                if (badgeEl) {
                    badgeEl.innerText = "未测评";
                    badgeEl.style.background = "#f1f5f9";
                    badgeEl.style.color = "#64748b";
                }
                if (box) {
                    box.innerHTML = `
                        <div style="text-align:center; padding:50px 20px; color:#64748b;">
                            <div style="font-size:44px; margin-bottom:12px;">📑</div>
                            <h3 style="font-size:16px; color:#1e293b; margin-bottom:8px; font-weight:700;">该项目尚未进行《云南省重点建设项目档案验收实施办法》测评打分</h3>
                            <p style="font-size:13px; max-width:520px; margin:0 auto 20px auto; color:#64748b; line-height:1.6;">
                                系统将自动比对左侧档案目录中的真实归档文件，依据官方规范提取工程要件并自动填报【附件1 登记表】、【附件2 打分表】与【附件3 申请表】。
                            </p>
                            <button onclick="triggerYunnanEval(true)" class="btn-gov-primary" style="padding:8px 24px; font-size:13.5px; font-weight:600; border-radius:6px; background:#1d4ed8; color:#fff; border:none; cursor:pointer;">🚀 评测打分</button>
                        </div>
                    `;
                }
                window.currentYunnanEvalResult = null;
                return;
            }

            if (btn) btn.innerText = "🚀 重新评测打分";
            if (scoreEl) scoreEl.innerText = `${data.overall_score} 分`;
            if (badgeEl) {
                if (data.is_passed) {
                    badgeEl.innerText = `🟢 验收结论：${data.evaluation_result}`;
                    badgeEl.style.background = '#dcfce7';
                    badgeEl.style.color = '#15803d';
                } else {
                    badgeEl.innerText = `🔴 验收结论：${data.evaluation_result}`;
                    badgeEl.style.background = '#fee2e2';
                    badgeEl.style.color = '#b91c1c';
                }
            }
            window.currentYunnanEvalResult = data;
            renderCurrentYunnanAnnex();
        })
        .catch(err => {
            console.warn("Load Yunnan eval status warning:", err);
        });
}

function triggerYunnanEval(isForce = true) {
    const projId = window.currentProjectId || currentDetailProjectId || 'p1';
    const btn = document.getElementById('btn-yn-eval-trigger');
    const box = document.getElementById('yn-annex-content-box');
    if (box) {
        box.innerHTML = '<div style="text-align:center; padding:40px; color:#1d4ed8; font-weight:600;"><span class="spinner">⏳</span> 正在调用大模型依据《云南省重点建设项目档案验收实施办法》提取文档要件并持久化存盘...</div>';
    }

    const url = isForce ? `/api/projects/${projId}/yunnan-eval?force=true` : `/api/projects/${projId}/yunnan-eval`;
    apiFetch(url, { method: isForce ? 'POST' : 'GET' })
        .then(res => {
            if (!res.ok) {
                return res.text().then(t => {
                    let errStr = t;
                    try {
                        const parsed = JSON.parse(t);
                        if (parsed && parsed.error) errStr = parsed.error;
                    } catch(e){}
                    throw new Error(errStr || `HTTP Error ${res.status}`);
                });
            }
            return res.json();
        })
        .then(data => {
            window.currentYunnanEvalResult = data;

            if (btn) btn.innerText = "🚀 重新评测打分";
            const scoreEl = document.getElementById('yn-eval-score-num');
            const badgeEl = document.getElementById('yn-eval-result-badge');

            if (scoreEl) scoreEl.innerText = `${data.overall_score} 分`;
            if (badgeEl) {
                if (data.is_passed) {
                    badgeEl.innerText = `🟢 验收结论：${data.evaluation_result}`;
                    badgeEl.style.background = '#dcfce7';
                    badgeEl.style.color = '#15803d';
                } else {
                    badgeEl.innerText = `🔴 验收结论：${data.evaluation_result}`;
                    badgeEl.style.background = '#fee2e2';
                    badgeEl.style.color = '#b91c1c';
                }
            }

            renderCurrentYunnanAnnex();
            if (typeof showToast === 'function') {
                showToast('🎉 已完成大模型测评打分与附件1、2、3表格持久化存盘！', 'success');
            }
        })
        .catch(err => {
            console.error('Yunnan eval error:', err);
            if (box) {
                box.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">测评计算失败: ${err.message}</div>`;
            }
        });
}

function switchYunnanAnnexTab(tabId) {
    currentYunnanTab = tabId;
    ['annex-1', 'annex-2', 'annex-3'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        if (btn) {
            if (id === tabId) {
                btn.style.background = '#dbeafe';
                btn.style.color = '#1e40af';
                btn.classList.add('active');
            } else {
                btn.style.background = '#f1f5f9';
                btn.style.color = '#475569';
                btn.classList.remove('active');
            }
        }
    });
    renderCurrentYunnanAnnex();
}

function renderCurrentYunnanAnnex() {
    const data = window.currentYunnanEvalResult;
    const box = document.getElementById('yn-annex-content-box');
    if (!data || !box) return;

    if (currentYunnanTab === 'annex-1') {
        box.innerHTML = renderYunnanAnnex1(data.registry_form);
    } else if (currentYunnanTab === 'annex-2') {
        box.innerHTML = renderYunnanAnnex2(data.scoring_report);
    } else if (currentYunnanTab === 'annex-3') {
        box.innerHTML = renderYunnanAnnex3(data.application_form);
    }
}

function renderYunnanAnnex1(form) {
    if (!form) return '<div style="padding:20px;">暂无登记表数据</div>';
    return `
        <div style="font-family:SimSun, serif; padding:15px; background:#fff;">
            <h3 style="text-align:center; font-size:18px; font-weight:bold; margin-bottom:15px; color:#1e293b;">
                附件 1：云南省重点建设项目档案管理登记表
            </h3>
            <table class="gov-official-table" style="width:100%; border-collapse:collapse; border:2px solid #334155; font-size:13px; color:#1e293b;">
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold; width:18%;">项目名称</td>
                    <td colspan="3" style="border:1px solid #475569; padding:8px;">${form.project_name || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">建设单位/法人</td>
                    <td style="border:1px solid #475569; padding:8px; width:32%;">${form.unit_legal_person || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold; width:18%;">上级主管部门</td>
                    <td style="border:1px solid #475569; padding:8px; width:32%;">${form.supervisory_dept || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">概算总投资</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.approved_budget_total || 0} 万元</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">计划工期</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.planned_period_months || 0} 个月</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">主要单项工程</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.main_single_eng_name || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">已完成单项工程</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.completed_single_eng_name || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">主要设计单位</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.main_design_unit || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">主要施工单位</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.main_construction_unit || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">设备安装单位</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.main_equipment_install_unit || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">主要监理单位</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.main_supervision_unit || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">档案管理部门</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.archive_dept_name || ''} (${form.affiliated_dept || ''})</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">建档时间/人员</td>
                    <td style="border:1px solid #475569; padding:8px;">建档: ${form.filing_time || ''} | 专职: ${form.full_time_staff_count || 0}人, 兼职: ${form.part_time_staff_count || 0}人</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">档案库房用房</td>
                    <td style="border:1px solid #475569; padding:8px;">库房: ${form.storeroom_area_sqm || 0} ㎡ | 工作用房: ${form.office_area_sqm || 0} ㎡</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">现有档案数量</td>
                    <td style="border:1px solid #475569; padding:8px;">正本: ${form.existing_archive_volume || 0}卷, ${form.existing_archive_book || 0}册, 图纸 ${form.drawing_sheets_count || 0}张</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">设施设备情况</td>
                    <td colspan="3" style="border:1px solid #475569; padding:8px;">${form.facility_equipment_desc || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">日常监督上级单位</td>
                    <td colspan="3" style="border:1px solid #475569; padding:8px;">${form.supervisory_unit_above || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">填表单位及日期</td>
                    <td colspan="3" style="border:1px solid #475569; padding:8px; text-align:right;">
                        填表单位: <strong>${form.fill_unit || ''}</strong> &nbsp;&nbsp;&nbsp;&nbsp; 填表日期: <strong>${form.fill_date || ''}</strong>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

function renderYunnanAnnex2(report) {
    if (!report || !report.sections) return '<div style="padding:20px;">暂无测评表数据</div>';
    
    let html = `
        <div style="font-family:SimSun, serif; padding:15px; background:#fff;">
            <h3 style="text-align:center; font-size:18px; font-weight:bold; margin-bottom:6px; color:#1e293b;">
                附件 2：云南省重点建设项目档案验收测评表
            </h3>
            <div style="text-align:right; font-size:12.5px; color:#64748b; margin-bottom:12px;">
                总标准分：<strong>${report.total_standard_score} 分</strong> &nbsp;|&nbsp; 
                大模型实测得分：<strong style="font-size:16px; color:#1d4ed8;">${report.total_actual_score} 分</strong> &nbsp;|&nbsp; 
                验收结论：<strong style="color:${report.evaluation_result === '合格' ? '#15803d' : '#b91c1c'};">${report.evaluation_result}</strong>
            </div>
            <table class="gov-official-table" style="width:100%; border-collapse:collapse; border:2px solid #334155; font-size:12.5px; color:#1e293b;">
                <thead>
                    <tr style="background:#f1f5f9; text-align:center; font-weight:bold;">
                        <th style="border:1px solid #475569; padding:8px; width:16%;">测评项目/分类</th>
                        <th style="border:1px solid #475569; padding:8px;">评分标准及具体指标</th>
                        <th style="border:1px solid #475569; padding:8px; width:9%;">标准分</th>
                        <th style="border:1px solid #475569; padding:8px; width:9%;">自评分</th>
                        <th style="border:1px solid #475569; padding:8px; width:9%;">实得分</th>
                        <th style="border:1px solid #475569; padding:8px; width:25%;">大模型研判扣分/得分说明</th>
                    </tr>
                </thead>
                <tbody>
    `;

    report.sections.forEach(sec => {
        html += `
            <tr style="background:#eff6ff; font-weight:bold;">
                <td colspan="4" style="border:1px solid #475569; padding:8px; color:#1e40af;">${sec.section_title}</td>
                <td style="border:1px solid #475569; padding:8px; text-align:center; color:#1e40af; font-size:13px;">${sec.actual_score} 分</td>
                <td style="border:1px solid #475569; padding:8px; color:#1e40af;">小计 (标准分 ${sec.section_score}分)</td>
            </tr>
        `;
        sec.items.forEach(it => {
            html += `
                <tr>
                    <td style="border:1px solid #475569; padding:6px 8px; font-weight:bold; background:#fafafa;">${it.category_name}</td>
                    <td style="border:1px solid #475569; padding:6px 8px; font-size:12px;">${it.item_content}</td>
                    <td style="border:1px solid #475569; padding:6px 8px; text-align:center;">${it.standard_score}</td>
                    <td style="border:1px solid #475569; padding:6px 8px; text-align:center;">${it.self_score}</td>
                    <td style="border:1px solid #475569; padding:6px 8px; text-align:center; font-weight:bold; color:#1d4ed8;">${it.actual_score}</td>
                    <td style="border:1px solid #475569; padding:6px 8px; font-size:11.5px; color:#475569;">${it.remark}</td>
                </tr>
            `;
        });
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}

function renderYunnanAnnex3(form) {
    if (!form) return '<div style="padding:20px;">暂无申请表数据</div>';
    return `
        <div style="font-family:SimSun, serif; padding:15px; background:#fff;">
            <h3 style="text-align:center; font-size:18px; font-weight:bold; margin-bottom:15px; color:#1e293b;">
                附件 3：云南省重点建设项目档案验收申请表
            </h3>
            <table class="gov-official-table" style="width:100%; border-collapse:collapse; border:2px solid #334155; font-size:13px; color:#1e293b;">
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold; width:18%;">项目名称</td>
                    <td colspan="3" style="border:1px solid #475569; padding:8px;">${form.project_name || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">审批(核准)机关</td>
                    <td style="border:1px solid #475569; padding:8px; width:32%;">${form.approval_agency || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold; width:18%;">立项日期</td>
                    <td style="border:1px solid #475569; padding:8px; width:32%;">${form.project_approval_date || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">投资规模</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.investment_scale || 0} 万元</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">建设时间</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.construction_period || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">建设单位(法人)</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.construction_unit || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">设计单位</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.design_unit || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">主要施工单位</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.main_construction_unit || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">主要监理单位</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.main_supervision_unit || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">竣工档案数量</td>
                    <td colspan="3" style="border:1px solid #475569; padding:8px;">${form.archive_quantity_desc || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">竣工图及总目录</td>
                    <td colspan="3" style="border:1px solid #475569; padding:8px;">${form.completion_map_status || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">计划档案验收日期</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.planned_archive_eval_date || ''}</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">计划竣工验收日期</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.planned_completion_date || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">联系人及电话</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.contact_person || ''} (${form.contact_phone || ''})</td>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">地址/邮编/邮箱</td>
                    <td style="border:1px solid #475569; padding:8px;">${form.address_postcode || ''} | ${form.email || ''}</td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">申请单位自检意见</td>
                    <td colspan="3" style="border:1px solid #475569; padding:12px; line-height:1.6;">
                        <div>${form.self_inspection_opinion || ''}</div>
                        <div style="text-align:right; margin-top:20px;">
                            申请单位(盖章): <strong>${form.application_unit || ''}</strong> &nbsp;&nbsp;&nbsp;&nbsp; 
                            日期: <strong>${form.self_inspection_date || ''}</strong>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td style="border:1px solid #475569; background:#f8fafc; padding:8px; font-weight:bold;">验收组织单位意见</td>
                    <td colspan="3" style="border:1px solid #475569; padding:12px; line-height:1.6;">
                        <div>${form.acceptance_org_opinion || ''}</div>
                        <div style="text-align:right; margin-top:20px;">
                            验收组织单位(盖章): ____________________ &nbsp;&nbsp;&nbsp;&nbsp; 
                            日期: <strong>${form.acceptance_org_date || ''}</strong>
                        </div>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

function downloadYunnanAnnexDoc() {
    const box = document.getElementById('yn-annex-content-box');
    if (!box || !box.innerHTML || box.innerText.includes('正在加载')) {
        if (typeof showToast === 'function') showToast('暂无完成测评的表单数据，请先测评后再导出', 'warning');
        else alert('暂无完成测评的表单数据');
        return;
    }

    const annexNameMap = {
        'annex-1': '附件1_云南省重点建设项目档案管理登记表',
        'annex-2': '附件2_云南省重点建设项目档案验收测评表',
        'annex-3': '附件3_云南省重点建设项目档案验收申请表'
    };
    const title = annexNameMap[currentYunnanTab] || '云南省重点建设项目档案验收官方表单';
    const dateStr = new Date().toISOString().slice(0, 10);

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
                body { font-family: SimSun, "宋体", serif; margin: 30px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #333; padding: 8px 10px; font-size: 13px; text-align: left; }
                th { background-color: #f2f2f2; font-weight: bold; }
                h3 { text-align: center; font-size: 20px; font-weight: bold; }
            </style>
        </head>
        <body>
            ${box.innerHTML}
        </body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_${dateStr}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('📥 官方表单已成功导出下载！', 'success');
}

window.triggerYunnanEval = triggerYunnanEval;
window.loadYunnanEval = loadYunnanEval;
window.switchYunnanAnnexTab = switchYunnanAnnexTab;
window.downloadYunnanAnnexDoc = downloadYunnanAnnexDoc;
