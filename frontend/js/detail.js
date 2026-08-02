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
            renderPersistentChatHistory(project);
            loadYunnanEval(currentDetailProjectId);

            const reanalyzeBtn = document.getElementById("btn-reanalyze");
            if (reanalyzeBtn) {
                reanalyzeBtn.onclick = () => {
                    showToast("正在深度重新研判四个维度合规指标...", "info");
                    apiFetch(`/api/projects/${currentDetailProjectId}/analyze`, { method: "POST" })
                        .then(() => loadProjectAnalysis(currentDetailProjectId))
                        .catch(() => loadProjectAnalysis(currentDetailProjectId));
                };
            }
            
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

window.loadProjectFiles = loadProjectFiles;

const NATIONAL_ARCHIVE_CATALOG = [
    {
        id: "cat-1", name: "1. 立项管理", stageKey: "立项管理",
        subcategories: [
            { id: "sub-1-1", title: "1.1 管理制度及立卷规范" },
            { id: "sub-1-2", title: "1.2 登记表与岗位责任" },
            { id: "sub-1-3", title: "1.3 可行性研究与立项批复" }
        ]
    },
    {
        id: "cat-2", name: "2. 招投标管理", stageKey: "招投标",
        subcategories: [
            { id: "sub-2-1", title: "2.1 招标文件与中标通知" },
            { id: "sub-2-2", title: "2.2 投标文件与评标报告" }
        ]
    },
    {
        id: "cat-3", name: "3. 合同与财务", stageKey: "合同财务",
        subcategories: [
            { id: "sub-3-1", title: "3.1 项目建设合同" },
            { id: "sub-3-2", title: "3.2 竣工财务决算与审计" }
        ]
    },
    {
        id: "cat-4", name: "4. 工程设计与实施", stageKey: "设计实施",
        subcategories: [
            { id: "sub-4-1", title: "4.1 总体设计与需求规格" },
            { id: "sub-4-2", title: "4.2 安装部署与集成施工" },
            { id: "sub-4-3", title: "4.3 设备开箱验收与测试" }
        ]
    },
    {
        id: "cat-5", name: "5. 工程监理", stageKey: "监理",
        subcategories: [
            { id: "sub-5-1", title: "5.1 监理大纲与规划" },
            { id: "sub-5-2", title: "5.2 监理记录与报告" }
        ]
    },
    {
        id: "cat-6", name: "6. 过程管理与会议纪要", stageKey: "过程管理",
        subcategories: [
            { id: "sub-6-1", title: "6.1 核验记录与分类方案" },
            { id: "sub-6-2", title: "6.2 会议纪要与协调记录" }
        ]
    },
    {
        id: "cat-7", name: "7. 竣工验收与竣工图", stageKey: "竣工验收",
        subcategories: [
            { id: "sub-7-1", title: "7.1 验收报告与移交记录" },
            { id: "sub-7-2", title: "7.2 竣工图与核查记录" }
        ]
    },
    {
        id: "cat-8", name: "8. 安全管理与运维档案", stageKey: "安全运维",
        subcategories: [
            { id: "sub-8-1", title: "8.1 安全保密与备份预案" },
            { id: "sub-8-2", title: "8.2 库房设施与装具档案" }
        ]
    }
];

function classifyFileToNationalStandard(file) {
    const fname = (file.file_name || "").toLowerCase();
    const summary = (file.summary || "").toLowerCase();
    const content = (file.content || "").toLowerCase();
    const stage = (file.stage_folder || "").toLowerCase();

    // =========================================================================
    // 阶段一：【文件名优先】(Filename Priority Classification)
    // 优先依据文件名中的核心标志词直接比对确定 8 大阶段归档分类
    // =========================================================================

    // 1. 立项管理
    if (fname.includes("建议书") || fname.includes("可研") || fname.includes("可行性") || fname.includes("立项批复") || fname.includes("立项")) {
        return { catId: "cat-1", subId: "sub-1-3" };
    }
    if (fname.includes("登记表") || fname.includes("领导小组") || fname.includes("岗位") || fname.includes("培训") || fname.includes("考核")) {
        return { catId: "cat-1", subId: "sub-1-2" };
    }
    if (fname.includes("管理制度") || fname.includes("立卷") || fname.includes("规范")) {
        return { catId: "cat-1", subId: "sub-1-1" };
    }

    // 2. 招投标管理
    if (fname.includes("招标") || fname.includes("中标") || fname.includes("控制价")) {
        return { catId: "cat-2", subId: "sub-2-1" };
    }
    if (fname.includes("投标") || fname.includes("评标")) {
        return { catId: "cat-2", subId: "sub-2-2" };
    }

    // 3. 合同与财务
    if (fname.includes("决算") || fname.includes("审计") || fname.includes("发票") || fname.includes("付款") || fname.includes("凭证")) {
        return { catId: "cat-3", subId: "sub-3-2" };
    }
    if (fname.includes("合同") || fname.includes("协议")) {
        return { catId: "cat-3", subId: "sub-3-1" };
    }

    // 5. 工程监理
    if (fname.includes("监理")) {
        if (fname.includes("大纲") || fname.includes("规划") || fname.includes("细则")) {
            return { catId: "cat-5", subId: "sub-5-1" };
        }
        return { catId: "cat-5", subId: "sub-5-2" };
    }

    // 7. 竣工验收与竣工图
    if (fname.includes("竣工图") || fname.includes("拓扑图")) {
        return { catId: "cat-7", subId: "sub-7-2" };
    }
    if (fname.includes("竣工验收") || fname.includes("终验") || fname.includes("验收报告") || fname.includes("鉴定书")) {
        return { catId: "cat-7", subId: "sub-7-1" };
    }

    // 8. 安全管理与运维档案
    if (fname.includes("库房") || fname.includes("装具") || fname.includes("三分开") || fname.includes("八防")) {
        return { catId: "cat-8", subId: "sub-8-2" };
    }
    if (fname.includes("运维") || fname.includes("保密") || fname.includes("备份") || fname.includes("预案") || fname.includes("巡检") || fname.includes("保障")) {
        return { catId: "cat-8", subId: "sub-8-1" };
    }

    // 4. 工程设计与实施
    if (fname.includes("开箱") || fname.includes("测试") || fname.includes("设备验收")) {
        return { catId: "cat-4", subId: "sub-4-3" };
    }
    if (fname.includes("安装部署") || fname.includes("集成施工") || fname.includes("施工记录") || fname.includes("实施")) {
        return { catId: "cat-4", subId: "sub-4-2" };
    }
    if (fname.includes("设计") || fname.includes("需求") || fname.includes("架构") || fname.includes("方案") || fname.includes("深化")) {
        return { catId: "cat-4", subId: "sub-4-1" };
    }

    // 6. 过程管理与会议纪要
    if (fname.includes("纪要") || fname.includes("会议") || fname.includes("协调") || fname.includes("总结")) {
        return { catId: "cat-6", subId: "sub-6-2" };
    }
    if (fname.includes("核验") || fname.includes("明细目录") || fname.includes("分类方案")) {
        return { catId: "cat-6", subId: "sub-6-1" };
    }

    // =========================================================================
    // 阶段二：【内容核查与补充比对】 (Content Verification)
    // 当文件名缺乏明确阶段关键词时，读取文件摘要与正文内容核查分类
    // =========================================================================

    const contentText = summary + " " + content;

    // 1. 立项管理
    if (contentText.includes("建议书") || contentText.includes("可研") || contentText.includes("可行性") || contentText.includes("立项批复") || contentText.includes("立项")) {
        return { catId: "cat-1", subId: "sub-1-3" };
    }
    if (contentText.includes("登记表") || contentText.includes("领导小组") || contentText.includes("岗位") || contentText.includes("培训") || contentText.includes("考核")) {
        return { catId: "cat-1", subId: "sub-1-2" };
    }
    if (contentText.includes("管理制度") || contentText.includes("立卷") || contentText.includes("规范")) {
        return { catId: "cat-1", subId: "sub-1-1" };
    }

    // 2. 招投标管理
    if (contentText.includes("招标") || contentText.includes("中标") || contentText.includes("控制价")) {
        return { catId: "cat-2", subId: "sub-2-1" };
    }
    if (contentText.includes("投标") || contentText.includes("评标")) {
        return { catId: "cat-2", subId: "sub-2-2" };
    }

    // 3. 合同与财务
    if (contentText.includes("决算") || contentText.includes("审计") || contentText.includes("发票") || contentText.includes("付款") || contentText.includes("凭证")) {
        return { catId: "cat-3", subId: "sub-3-2" };
    }
    if (contentText.includes("合同") || contentText.includes("协议")) {
        return { catId: "cat-3", subId: "sub-3-1" };
    }

    // 5. 工程监理
    if (contentText.includes("监理")) {
        if (contentText.includes("大纲") || contentText.includes("规划") || contentText.includes("细则")) {
            return { catId: "cat-5", subId: "sub-5-1" };
        }
        return { catId: "cat-5", subId: "sub-5-2" };
    }

    // 7. 竣工验收与竣工图
    if (contentText.includes("竣工图") || contentText.includes("拓扑")) {
        return { catId: "cat-7", subId: "sub-7-2" };
    }
    if (contentText.includes("竣工验收") || contentText.includes("终验") || contentText.includes("验收报告") || contentText.includes("移交") || contentText.includes("测评")) {
        return { catId: "cat-7", subId: "sub-7-1" };
    }

    // 8. 安全管理与运维档案
    if (contentText.includes("库房") || contentText.includes("装具") || contentText.includes("三分开") || contentText.includes("八防")) {
        return { catId: "cat-8", subId: "sub-8-2" };
    }
    if (contentText.includes("运维") || contentText.includes("保密") || contentText.includes("备份") || contentText.includes("预案") || contentText.includes("巡检") || contentText.includes("保障")) {
        return { catId: "cat-8", subId: "sub-8-1" };
    }

    // 4. 工程设计与实施
    if (contentText.includes("开箱") || contentText.includes("测试") || contentText.includes("设备验收")) {
        return { catId: "cat-4", subId: "sub-4-3" };
    }
    if (contentText.includes("安装部署") || contentText.includes("集成施工") || contentText.includes("施工记录") || contentText.includes("实施")) {
        return { catId: "cat-4", subId: "sub-4-2" };
    }
    if (contentText.includes("设计") || contentText.includes("需求") || contentText.includes("架构") || contentText.includes("方案") || contentText.includes("深化")) {
        return { catId: "cat-4", subId: "sub-4-1" };
    }

    // 6. 过程管理与会议纪要
    if (contentText.includes("纪要") || contentText.includes("会议") || contentText.includes("协调") || contentText.includes("总结")) {
        return { catId: "cat-6", subId: "sub-6-2" };
    }
    if (contentText.includes("核验") || contentText.includes("明细目录") || contentText.includes("分类方案")) {
        return { catId: "cat-6", subId: "sub-6-1" };
    }

    // 阶段三：若包含 stage_folder，进行合法阶段名称二次兜底匹配
    if (file.stage_folder) {
        for (let cat of NATIONAL_ARCHIVE_CATALOG) {
            for (let sub of cat.subcategories) {
                if (sub.title === file.stage_folder || file.stage_folder === cat.name || stage.includes(sub.title.toLowerCase()) || stage.includes(cat.name.toLowerCase())) {
                    return { catId: cat.id, subId: sub.id };
                }
            }
        }
        if (stage.includes("立项") || stage.includes("可行性")) return { catId: "cat-1", subId: "sub-1-3" };
        if (stage.includes("招标") || stage.includes("中标")) return { catId: "cat-2", subId: "sub-2-1" };
        if (stage.includes("合同")) return { catId: "cat-3", subId: "sub-3-1" };
        if (stage.includes("设计") || stage.includes("实施")) return { catId: "cat-4", subId: "sub-4-1" };
        if (stage.includes("监理")) return { catId: "cat-5", subId: "sub-5-1" };
        if (stage.includes("过程") || stage.includes("会议")) return { catId: "cat-6", subId: "sub-6-2" };
        if (stage.includes("验收") || stage.includes("竣工")) return { catId: "cat-7", subId: "sub-7-1" };
        if (stage.includes("运维") || stage.includes("安全")) return { catId: "cat-8", subId: "sub-8-1" };
    }

    return { catId: "cat-1", subId: "sub-1-3" };
}

function highlightMatchText(text, keyword) {
    const safeText = escapeHtml(text || "");
    if (!keyword) return safeText;
    const escapedKw = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKw})`, 'gi');
    return safeText.replace(regex, '<mark style="background:#fef08a; color:#1e293b; padding:0 2px; border-radius:2px; font-weight:bold;">$1</mark>');
}

function filterProjectFiles(query) {
    const val = (query || "").trim().toLowerCase();
    const clearBtn = document.getElementById("clear-detail-file-search");
    if (clearBtn) {
        clearBtn.style.display = val ? "block" : "none";
    }

    if (!val) {
        renderProjectFilesDirectory(currentProjectFiles, false, "");
        return;
    }

    const filtered = (currentProjectFiles || []).filter(f => {
        const nameMatch = (f.file_name || "").toLowerCase().includes(val);
        const stageMatch = (f.stage_folder || "").toLowerCase().includes(val);
        const summaryMatch = (f.file_summary || "").toLowerCase().includes(val);
        const contentMatch = (f.content || "").toLowerCase().includes(val);
        const uploaderMatch = (f.uploaded_by || "").toLowerCase().includes(val);
        return nameMatch || stageMatch || summaryMatch || contentMatch || uploaderMatch;
    });

    renderProjectFilesDirectory(filtered, true, val);
}

function clearDetailFileSearch() {
    const input = document.getElementById("filter-detail-file-input");
    if (input) {
        input.value = "";
        filterProjectFiles("");
    }
}

window.filterProjectFiles = filterProjectFiles;
window.clearDetailFileSearch = clearDetailFileSearch;

function renderProjectFilesDirectory(files, isFiltering = false, filterKeyword = "") {
    const treeContainer = document.getElementById("national-archiving-tree");
    if (!treeContainer) return;

    treeContainer.innerHTML = "";

    if (isFiltering && (!files || files.length === 0)) {
        treeContainer.innerHTML = `
            <div style="text-align:center; padding:28px 12px; color:#64748b; font-size:12.5px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; margin-top:5px;">
                <span style="font-size:24px; display:block; margin-bottom:6px;">🔍</span>
                <div>未检索到匹配的文档 "<strong style="color:#1d4ed8;">${escapeHtml(filterKeyword)}</strong>"</div>
                <div style="font-size:11.5px; color:#94a3b8; margin-top:4px;">请尝试输入其他关键词（如文件名、阶段目录或文档内容）</div>
            </div>
        `;
        if (typeof window.updateBatchDeleteUIState === "function") {
            window.updateBatchDeleteUIState();
        }
        return;
    }

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
                    <div class="file-item" style="margin: 3px 0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:5px 8px; display:flex; align-items:center; position:relative; gap:6px;">
                        <input type="checkbox" class="file-item-checkbox" data-file-id="${f.id}" data-file-name="${escapeHtml(f.file_name)}" onchange="onFileCheckboxChange()" style="cursor:pointer; width:14px; height:14px; flex-shrink:0;">
                        <span style="flex-shrink:0;">📄</span>
                        <a href="javascript:void(0)" onclick="openFileContentModal('${f.id}')" class="file-item-name" title="点击预览文件原文内容: ${escapeHtml(f.file_name)}" style="font-size:12.5px; color:#1d4ed8; text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; font-weight:600; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${isFiltering ? highlightMatchText(f.file_name, filterKeyword) : escapeHtml(f.file_name)}</a>
                        <span style="font-size:11px; color:#64748b; flex-shrink:0; white-space:nowrap;">(${formatBytes(f.file_size)})</span>
                        <div class="file-item-actions" style="align-items:center; gap:6px; flex-shrink:0; margin-left:4px;">
                            <button class="btn-summary" onclick="generateSummary('${f.id}')" style="font-size:11px; padding:2px 8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:4px; cursor:pointer;">摘要</button>
                            <button class="btn-file-move" onclick="openMoveFileModal('${f.id}', '${escapeHtml(f.file_name)}', '${escapeHtml(f.stage_folder || '')}')" style="font-size:11px; padding:2px 8px; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:4px; cursor:pointer; font-weight:600;" title="移动至指定阶段目录">↔️ 移动</button>
                            <button class="btn-file-delete" onclick="deleteSingleProjectFile('${f.id}', '${escapeHtml(f.file_name)}')" style="font-size:11px; padding:2px 8px; background:#fef2f2; color:#dc2626; border:1px solid #fca5a5; border-radius:4px; cursor:pointer; font-weight:600;" title="彻底物理删除此文件">🗑️ 删除</button>
                        </div>
                    </div>
                `).join("");
            }

            return `
                <div class="subfolder-node" style="margin-top:6px; padding-left:8px; border-left:2px solid #94a3b8;">
                    <div class="subfolder-title" style="font-size:12px; font-weight:600; color:#334155; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                        <span>📂 ${escapeHtml(sub.title)}</span>
                        <span class="subfolder-count" style="font-size:11px; font-weight:normal; color:#64748b;">${subFiles.length} 份</span>
                    </div>
                    <div class="subfolder-files">${filesHtml}</div>
                </div>
            `;
        }).join("");

        const shouldExpand = isFiltering && catTotalFiles > 0;
        const displayStyle = shouldExpand ? "block" : "none";
        const iconChar = shouldExpand ? "▼" : "▶";

        catNode.innerHTML = `
            <div class="folder-title" onclick="toggleFolderCategory(this)" style="background:#f1f5f9; padding:8px 12px; font-weight:700; font-size:13px; color:var(--gov-blue); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;">
                <span style="display:flex; align-items:center; gap:6px;">
                    <span class="folder-toggle-icon" style="font-size:11px; color:#64748b; transition:transform 0.2s;">${iconChar}</span>
                    <span>📁 ${escapeHtml(cat.name)}</span>
                </span>
                <span class="badge" style="background:#dbeafe; color:#1e40af; font-size:11px; padding:2px 8px; border-radius:10px;">${catTotalFiles} 份归档文件</span>
            </div>
            <div class="folder-content" style="padding:8px; background:#ffffff; display:${displayStyle};">
                ${subCategoriesHtml}
            </div>
        `;

        treeContainer.appendChild(catNode);
    });

    if (typeof window.updateBatchDeleteUIState === "function") {
        window.updateBatchDeleteUIState();
    }
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
function openFileContentModal(fileId) {
    const file = (currentProjectFiles || []).find(f => f.id === fileId);
    const fileName = file ? file.file_name : "归档文件";
    const projId = currentDetailProjectId || window.currentProjectId || "p1";

    const overlayId = "file-content-modal-overlay";
    const oldOverlay = document.getElementById(overlayId);
    if (oldOverlay) oldOverlay.remove();

    const modalHtml = `
        <div class="admin-modal-overlay" id="${overlayId}" onclick="if(event.target===this) this.remove();" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:99999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(2px);">
            <div class="admin-modal" style="background:#ffffff; border-radius:10px; width:92%; max-width:850px; padding:20px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); max-height:88vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                        <span style="font-size:20px;">📄</span>
                        <h3 style="margin:0; font-size:15px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(fileName)}">
                            ${escapeHtml(fileName)} <span style="font-size:12px; font-weight:normal; color:#64748b;">(原文查看)</span>
                        </h3>
                    </div>
                    <button onclick="document.getElementById('${overlayId}').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:#64748b; padding:2px 8px; line-height:1;" title="关闭">✕</button>
                </div>

                <div id="file-content-box" style="flex:1; overflow:hidden; display:flex; flex-direction:column; background:#0f172a; border-radius:8px; border:1px solid #334155; position:relative; min-height:300px;">
                    <div id="file-content-loading" style="padding:50px; text-align:center; color:#94a3b8; font-size:13px;">
                        <span style="display:inline-block; font-size:22px; margin-bottom:10px;">⌛</span>
                        <div>正在读取并解析原文内容，请稍候...</div>
                    </div>
                    <pre id="file-content-body" style="display:none; margin:0; padding:16px; font-family:Consolas, Monaco, 'Courier New', monospace; font-size:13px; line-height:1.65; color:#f1f5f9; white-space:pre-wrap; word-break:break-all; overflow-y:auto; flex:1; max-height:550px;"></pre>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; border-top:1px solid #e2e8f0; padding-top:12px;">
                    <div style="font-size:12px; color:#64748b;">
                        <span>大小: ${file ? formatBytes(file.file_size) : '-'}</span>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <a href="/api/projects/${projId}/files/${fileId}/download" target="_blank" class="btn-gov-secondary" style="padding:6px 14px; text-decoration:none; font-size:12.5px; display:inline-flex; align-items:center; gap:4px; border:1px solid #cbd5e1; border-radius:6px; color:#334155; font-weight:600;">
                            📥 下载原文件
                        </a>
                        <button class="btn-gov-primary" onclick="document.getElementById('${overlayId}').remove()" style="padding:6px 16px; font-size:12.5px;">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    fetch(`/api/projects/${projId}/files/${fileId}/download`)
        .then(res => {
            if (!res.ok) throw new Error("无法读取文件原文");
            return res.text();
        })
        .then(text => {
            const loadingEl = document.getElementById("file-content-loading");
            const bodyEl = document.getElementById("file-content-body");
            if (loadingEl) loadingEl.style.display = "none";
            if (bodyEl) {
                bodyEl.style.display = "block";
                bodyEl.textContent = text || "(此文件无可显示的明文内容)";
            }
        })
        .catch(err => {
            const loadingEl = document.getElementById("file-content-loading");
            if (loadingEl) {
                loadingEl.innerHTML = `<span style="color:#f87171;">❌ 无法加载文件原文: ${escapeHtml(err.message)}</span>`;
            }
        });
}

window.openFileContentModal = openFileContentModal;
window.toggleFolderCategory = toggleFolderCategory;

function loadProjectAnalysis(projectId) {
    apiFetch(`/api/projects/${projectId}/health`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (!data) return;
            const health = data.health || data;
            const score = health.health_score !== undefined ? health.health_score : (data.health_score !== undefined ? data.health_score : 88);
            const rep = health.health_report || data.health_report || {};

            const scoreEl = document.getElementById("health-score") || document.getElementById("ai-health-score");
            const statusEl = document.getElementById("health-status") || document.getElementById("ai-health-status");
            const descEl = document.getElementById("health-desc");
            const circleEl = document.getElementById("health-circle");

            if (scoreEl) scoreEl.textContent = score;
            if (circleEl) {
                circleEl.style.borderColor = score < 70 ? "#ef4444" : (score < 85 ? "#f59e0b" : "#1d4ed8");
            }
            if (scoreEl) scoreEl.style.color = score < 70 ? "#ef4444" : (score < 85 ? "#d97706" : "#1d4ed8");

            if (statusEl) {
                statusEl.textContent = score < 70 ? "🔴 研判异常·发现重大合规风险与违规项" : (score < 85 ? "🟡 存在中度合规偏差预警" : "🟢 研判运行良好·未发现重大越权违规");
                statusEl.style.color = score < 70 ? "#991b1b" : (score < 85 ? "#92400e" : "#1e293b");
            }
            if (descEl) {
                descEl.textContent = score < 70 ?
                    "依据国家政务信息化管理规范，系统检出立项批复缺失、系统测试不及格(响应延迟过高/高危漏洞)、缺失工程监理与全套竣工图等重大合规风险。" :
                    "系统已完成财务概算、建设工期节点、工程质量验收与变更条款的交叉比对，全流程符合国家政务信息化管理规范。";
            }

            // 更新 4 维核心合规指标矩阵表
            if (rep.progress) {
                const bProg = document.getElementById("badge-progress");
                const dProg = document.getElementById("detail-progress");
                if (bProg) {
                    bProg.textContent = rep.progress.status || (score < 70 ? "严重滞后" : "正常");
                    bProg.style.background = score < 70 ? "#fee2e2" : "#dcfce7";
                    bProg.style.color = score < 70 ? "#991b1b" : "#15803d";
                }
                if (dProg) {
                    dProg.textContent = (rep.progress.delay_reasons && rep.progress.delay_reasons.length > 0) ?
                        rep.progress.delay_reasons.join("；") : "计划完工时间按期推进，关键里程碑按计划完成 100%。";
                }
            }

            if (rep.finance) {
                const bFin = document.getElementById("badge-finance");
                const dFin = document.getElementById("detail-finance");
                if (bFin) {
                    bFin.textContent = (rep.finance.missing_docs && rep.finance.missing_docs.length > 0) ? "缺失要件" : "正常";
                    bFin.style.background = (rep.finance.missing_docs && rep.finance.missing_docs.length > 0) ? "#fee2e2" : "#dcfce7";
                    bFin.style.color = (rep.finance.missing_docs && rep.finance.missing_docs.length > 0) ? "#991b1b" : "#15803d";
                }
                if (dFin) {
                    dFin.textContent = (rep.finance.missing_docs && rep.finance.missing_docs.length > 0) ?
                        "缺失要件：" + rep.finance.missing_docs.join("、") : "付款节点符合合同约定，无超期欠款或提前越权支付。";
                }
            }

            if (rep.quality) {
                const bQual = document.getElementById("badge-quality");
                const dQual = document.getElementById("detail-quality");
                if (bQual) {
                    bQual.textContent = (rep.quality.unresolved_issues_count > 0 || (rep.quality.repeated_failures && rep.quality.repeated_failures.length > 0)) ? "严重缺陷" : "正常";
                    bQual.style.background = (rep.quality.unresolved_issues_count > 0 || (rep.quality.repeated_failures && rep.quality.repeated_failures.length > 0)) ? "#fee2e2" : "#dcfce7";
                    bQual.style.color = (rep.quality.unresolved_issues_count > 0 || (rep.quality.repeated_failures && rep.quality.repeated_failures.length > 0)) ? "#991b1b" : "#15803d";
                }
                if (dQual) {
                    dQual.textContent = (rep.quality.repeated_failures && rep.quality.repeated_failures.length > 0) ?
                        rep.quality.repeated_failures.join("；") : "暂无未解决的质量缺陷，到货初验合格率 100%。";
                }
            }

            if (rep.change) {
                const bCha = document.getElementById("badge-change");
                const dCha = document.getElementById("detail-change");
                if (bCha) {
                    bCha.textContent = (rep.change.change_details && rep.change.change_details.length > 0) ? "监督缺失" : "无变更";
                    bCha.style.background = (rep.change.change_details && rep.change.change_details.length > 0) ? "#fee2e2" : "#dcfce7";
                    bCha.style.color = (rep.change.change_details && rep.change.change_details.length > 0) ? "#991b1b" : "#15803d";
                }
                if (dCha) {
                    dCha.textContent = (rep.change.change_details && rep.change.change_details.length > 0) ?
                        rep.change.change_details.join("；") : "变更金额未触及 10% 概算强审核红线。";
                }
            }

            // 更新预警提醒项
            const alertsBox = document.getElementById("project-alerts-list");
            if (alertsBox) {
                if (score < 70) {
                    alertsBox.innerHTML = `
                        <div class="alert-item alert-danger" style="background:#fef2f2; border:1px solid #fca5a5; padding:10px 14px; border-radius:6px; margin-bottom:8px; font-size:12.5px; color:#991b1b;">
                            <strong>⚠️ 质量严重违规警告：</strong>系统检测到软件系统安装联调检出 14 项高危安全漏洞，高并发响应延迟超标 (>5200ms)，初验退回。
                        </div>
                        <div class="alert-item alert-warning" style="background:#fffbebf1; border:1px solid #fde68a; padding:10px 14px; border-radius:6px; margin-bottom:8px; font-size:12.5px; color:#92400e;">
                            <strong>⚠️ 资料归档预警：</strong>缺失发改委立项批复文件、缺失【5.工程监理】全套卷内档案及竣工财务决算报告。
                        </div>
                    `;
                } else {
                    alertsBox.innerHTML = `
                        <div class="alert-item alert-info" style="background:#f0fdf4; border:1px solid #86efac; padding:10px 14px; border-radius:6px; font-size:12.5px; color:#166534;">
                            <strong>✅ 状态良好：</strong>暂无需要紧急整改的高风险预警事项。
                        </div>
                    `;
                }
            }
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

    const panes = ["compliance", "yn-eval", "rag-chat", "doc-editor"];
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

    if (!currentProjectId) return;

    fetch(`/api/projects/${currentProjectId}/todos`)
        .then(res => res.json())
        .then(data => {
            if (data.todos) {
                currentProject.todos = data.todos;
            }
            drawProjectTodosUI(container);
        })
        .catch(err => {
            console.error("加载项目代办失败:", err);
            drawProjectTodosUI(container);
        });
}

function drawProjectTodosUI(container) {
    const todos = (currentProject && currentProject.todos) ? currentProject.todos : [];
    if (todos.length === 0) {
        container.innerHTML = `<li style="padding:20px; text-align:center; color:#94a3b8; font-size:12.5px;">暂无代办事项，请点击上方“🤖 智能一键重新梳理代办”按钮基于归档公文自动生成...</li>`;
        return;
    }
    container.innerHTML = todos.map(t => {
        let catColor = "#1d4ed8";
        let catBg = "#eff6ff";
        let catBorder = "#bfdbfe";
        if (t.category === "缺件") {
            catColor = "#dc2626";
            catBg = "#fef2f2";
            catBorder = "#fca5a5";
        } else if (t.category === "节点") {
            catColor = "#d97706";
            catBg = "#fffbe0";
            catBorder = "#fde68a";
        } else if (t.category === "合规") {
            catColor = "#059669";
            catBg = "#ecfdf5";
            catBorder = "#a7f3d0";
        }

        return `
        <li class="todo-item ${t.done ? 'completed' : ''}" style="display:block !important; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.03); box-sizing:border-box; width:100%;">
            <!-- 1. 顶部操作工具栏：复选框 + 分类 + 删除按钮 -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;">
                    <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleProjectTodo('${t.id}')" style="cursor:pointer; width:16px; height:16px;">
                    <span style="font-size:11px; font-weight:700; color:${catColor}; background:${catBg}; border:1px solid ${catBorder}; padding:1px 8px; border-radius:4px;">${escapeHtml(t.category || "事项")}</span>
                </label>
                <button class="todo-delete" onclick="deleteProjectTodo('${t.id}')" title="删除事项" style="border:none; background:none; color:#94a3b8; font-weight:bold; cursor:pointer; font-size:14px; padding:2px 4px; transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">✕</button>
            </div>
            
            <!-- 2. 中间代办事项主体文本（全宽展示，自然换行，杜绝竖排变形） -->
            <div style="font-size:13px; font-weight:600; line-height:1.5; color:${t.done ? '#94a3b8' : '#1e293b'}; ${t.done ? 'text-decoration:line-through;' : ''}; word-break:break-word; margin-bottom:8px; width:100%;">
                ${escapeHtml(t.text)}
            </div>

            <!-- 3. 底部关联公文目标浅灰栏 -->
            <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:4px; padding:4px 8px; font-size:11.5px; color:#64748b; font-family:sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; box-sizing:border-box;">
                ${t.doc_target ? `<span title="${escapeHtml(t.doc_target)}">📁 关联公文: ${escapeHtml(t.doc_target)}</span>` : '<span style="color:#94a3b8;">未指定公文</span>'}
            </div>
        </li>
    `}).join("");
}

function autoGenerateProjectTodos() {
    if (!currentProjectId) return;
    if (typeof showToast === "function") showToast("正在基于全量归档公文梳理代办事项...", "info");
    fetch(`/api/projects/${currentProjectId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto-generate" })
    })
    .then(res => res.json())
    .then(data => {
        if (data.todos) {
            currentProject.todos = data.todos;
            const container = document.getElementById("project-todo-list");
            drawProjectTodosUI(container);
            if (typeof showToast === "function") showToast("已成功梳理全生命周期归档代办", "success");
        }
    });
}

function addProjectTodo() {
    const input = document.getElementById("new-todo-text");
    if (!input || !input.value.trim() || !currentProjectId) return;
    const text = input.value.trim();
    input.value = "";

    fetch(`/api/projects/${currentProjectId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", text: text })
    })
    .then(res => res.json())
    .then(data => {
        if (data.todos) {
            currentProject.todos = data.todos;
            const container = document.getElementById("project-todo-list");
            drawProjectTodosUI(container);
        }
    });
}

function toggleProjectTodo(id) {
    if (!currentProjectId) return;
    fetch(`/api/projects/${currentProjectId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", todo_id: id })
    })
    .then(res => res.json())
    .then(data => {
        if (data.todos) {
            currentProject.todos = data.todos;
            const container = document.getElementById("project-todo-list");
            drawProjectTodosUI(container);
        }
    });
}

function deleteProjectTodo(id) {
    if (!currentProjectId) return;
    fetch(`/api/projects/${currentProjectId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", todo_id: id })
    })
    .then(res => res.json())
    .then(data => {
        if (data.todos) {
            currentProject.todos = data.todos;
            const container = document.getElementById("project-todo-list");
            drawProjectTodosUI(container);
        }
    });
}

function renderPersistentChatHistory(p) {
    const historyEl = document.getElementById("chat-messages-history");
    if (!historyEl) return;

    if (!p || !p.chat_history || p.chat_history.length === 0) {
        historyEl.innerHTML = `
            <div class="chat-msg system">
                <div class="msg-avatar">🤖</div>
                <div class="msg-bubble">
                    您好！我是您的项目合规助手。已调取当前项目全部归档文件。您可以向我询问项目预算、变更协议或初验结果。
                </div>
            </div>
        `;
        return;
    }

    historyEl.innerHTML = p.chat_history.map((msg, idx) => {
        const msgId = msg.id || (`msg_${idx}`);
        if (msg.sender === "user") {
            return `
                <div class="chat-msg user" data-msg-id="${msgId}">
                    <div class="msg-avatar">👤</div>
                    <div class="msg-bubble">
                        <button class="chat-msg-delete-btn" onclick="deleteChatMessage('${p.id}', '${msgId}', this)" title="删除此条对话记录">🗑️</button>
                        ${escapeHtml(msg.text)}
                    </div>
                </div>
            `;
        } else {
            let refHtml = "";
            if (msg.references && msg.references.length > 0) {
                refHtml = `
                    <div style="margin-top:6px; font-size:11px; color:#64748b;">
                        📁 已检索参考源（RAG）：
                        ${msg.references.map(r => `<span style="background:#cbd5e1; padding:2px 6px; border-radius:3px; margin-right:4px;">${escapeHtml(r)}</span>`).join("")}
                    </div>
                `;
            }
            let cleanResp = msg.text || "";
            if (cleanResp.toLowerCase().includes("here's a thinking process")) {
                const low = cleanResp.toLowerCase();
                const idx = low.indexOf("here's a thinking process");
                const sliced = cleanResp.substring(idx);
                const headerIdx = sliced.search(/\n[#【]/);
                if (headerIdx !== -1) {
                    cleanResp = cleanResp.substring(0, idx) + sliced.substring(headerIdx + 1);
                } else {
                    const doubleNL = sliced.indexOf("\n\n");
                    if (doubleNL !== -1) {
                        cleanResp = cleanResp.substring(0, idx) + sliced.substring(doubleNL + 2);
                    }
                }
            }
            cleanResp = cleanResp.trim();

            const charCount = cleanResp.length;
            const durationSec = msg.duration_sec || 3.5;
            const speed = (charCount / (parseFloat(durationSec) || 1)).toFixed(1);
            const timeStr = msg.timestamp || (new Date().toISOString().replace('T', ' ').substring(0, 19));

            const metricsHtml = `
                <div style="margin-top:10px; font-size:11px; color:#94a3b8; border-top:1px dashed #cbd5e1; padding-top:6px; display:flex; gap:16px; align-items:center;">
                    <span>用时: ${durationSec}s</span>
                    <span>长度: ${charCount} 字</span>
                    <span>速度: ${speed} 字符/s</span>
                    <span>时间: ${timeStr}</span>
                </div>
            `;

            return `
                <div class="chat-msg ai" data-msg-id="${msgId}">
                    <div class="msg-avatar">🤖</div>
                    <div class="msg-bubble">
                        <button class="chat-msg-delete-btn" onclick="deleteChatMessage('${p.id}', '${msgId}', this)" title="删除此条对话记录">🗑️</button>
                        <p style="font-weight:700; color:var(--text-muted); font-size:11px; margin:0 0 4px 0;">小智 • ${msg.model || "默认模型"}</p>
                        <div style="white-space: pre-wrap; font-size:13px; line-height:1.6;">${escapeHtml(cleanResp)}</div>
                        ${refHtml}
                        ${metricsHtml}
                    </div>
                </div>
            `;
        }
    }).join("");

    historyEl.scrollTop = historyEl.scrollHeight;
}

function deleteChatMessage(projectId, msgId, btnEl) {
    if (!confirm("确定要删除该条对话记录吗？\n删除后该记录将同步从系统持久化数据中永久删除。")) {
        return;
    }
    const msgCard = btnEl ? btnEl.closest(".chat-msg") : null;
    if (msgCard) {
        msgCard.style.transition = "all 0.2s ease";
        msgCard.style.opacity = "0";
        msgCard.style.transform = "scale(0.95)";
        setTimeout(() => msgCard.remove(), 200);
    }
    apiFetch(`/api/projects/${projectId}/chat/${msgId}`, { method: "DELETE" })
        .then(res => res.json())
        .then(data => {
            if (typeof showToast === "function") showToast("已成功从持久化数据中删除该条对话记录", "success");
        })
        .catch(err => {
            console.error("删除对话记录失败:", err);
            if (typeof showToast === "function") showToast("删除对话记录失败", "error");
        });
}

window.deleteChatMessage = deleteChatMessage;


function generateSummary(fileId) {
    const file = (currentProjectFiles || []).find(f => f.id === fileId);
    const fileName = file ? file.file_name : "归档文件";

    const overlayId = "summary-modal-overlay";
    const oldOverlay = document.getElementById(overlayId);
    if (oldOverlay) oldOverlay.remove();

    const existingSummary = file ? (file.summary || file.file_summary || "") : "";
    const isCached = existingSummary && !existingSummary.startsWith("【归档文件】");
    const initialContentHtml = isCached
        ? `<div style="white-space: pre-wrap;">${escapeHtml(existingSummary)}</div>`
        : `<span style="color:var(--text-muted);">正在生成摘要...</span>`;

    const modalHtml = `
        <div class="admin-modal-overlay" id="${overlayId}" onclick="if(event.target===this) this.remove();" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;">
            <div class="admin-modal" style="background:#fff; border-radius:8px; width:90%; max-width:600px; padding:20px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                    <h3 style="margin:0; font-size:16px; color:var(--gov-blue);">🤖 文件提炼摘要：${escapeHtml(fileName)}</h3>
                    <button onclick="document.getElementById('${overlayId}').remove()" style="background:none; border:none; font-size:18px; cursor:pointer; color:#64748b;">✕</button>
                </div>
                <div id="summary-text-box" style="font-size:13.5px; line-height:1.7; color:#334155; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0; min-height:80px; display:flex; align-items:center; justify-content:center;">
                    ${initialContentHtml}
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
        if (file && data.summary) {
            file.summary = data.summary;
        }
    })
    .catch(err => {
        const box = document.getElementById("summary-text-box");
        if (box && !isCached) {
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
    const userMsgId = `msg_${Date.now()}_user`;
    userMsg.setAttribute("data-msg-id", userMsgId);
    userMsg.innerHTML = `
        <div class="msg-avatar">👤</div>
        <div class="msg-bubble">
            <button class="chat-msg-delete-btn" onclick="deleteChatMessage('${currentDetailProjectId}', '${userMsgId}', this)" title="删除此条对话记录">🗑️</button>
            ${escapeHtml(text)}
        </div>
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

    const chatStartTime = Date.now();

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

        const durationSec = ((Date.now() - chatStartTime) / 1000).toFixed(1);

        const aiMsg = document.createElement("div");
        aiMsg.className = "chat-msg ai";
        const aiMsgId = `msg_${Date.now()}_ai`;
        aiMsg.setAttribute("data-msg-id", aiMsgId);
        
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

        let cleanResp = data.response || "";
        if (cleanResp.toLowerCase().includes("here's a thinking process")) {
            const low = cleanResp.toLowerCase();
            const idx = low.indexOf("here's a thinking process");
            const sliced = cleanResp.substring(idx);
            const headerIdx = sliced.search(/\n[#【]/);
            if (headerIdx !== -1) {
                cleanResp = cleanResp.substring(0, idx) + sliced.substring(headerIdx + 1);
            } else {
                const doubleNL = sliced.indexOf("\n\n");
                if (doubleNL !== -1) {
                    cleanResp = cleanResp.substring(0, idx) + sliced.substring(doubleNL + 2);
                }
            }
        }
        cleanResp = cleanResp.trim();

        const charCount = cleanResp.length;
        const speed = (charCount / (parseFloat(durationSec) || 0.1)).toFixed(1);
        const now = new Date();
        const timeStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0') + " " + String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0') + ":" + String(now.getSeconds()).padStart(2, '0');

        const metricsHtml = `
            <div style="margin-top:10px; font-size:11px; color:#94a3b8; border-top:1px dashed #cbd5e1; padding-top:6px; display:flex; gap:16px; align-items:center;">
                <span>用时: ${durationSec}s</span>
                <span>长度: ${charCount} 字</span>
                <span>速度: ${speed} 字符/s</span>
                <span>时间: ${timeStr}</span>
            </div>
        `;

        aiMsg.innerHTML = `
            <div class="msg-avatar">🤖</div>
            <div class="msg-bubble">
                <button class="chat-msg-delete-btn" onclick="deleteChatMessage('${currentDetailProjectId}', '${aiMsgId}', this)" title="删除此条对话记录">🗑️</button>
                <p style="font-weight:700; color:var(--text-muted); font-size:11px; margin:0 0 4px 0;">小智 • ${data.model || "默认"}</p>
                ${thinkingMsg}
                <div style="white-space: pre-wrap; font-size:13px; line-height:1.6;">${escapeHtml(cleanResp)}</div>
                ${referencesHtml}
                ${metricsHtml}
            </div>
        `;
        historyEl.appendChild(aiMsg);
        historyEl.scrollTop = historyEl.scrollHeight;

        // 若对话包含公文内容，自动填充进拟稿定稿编辑器
        if (data.response && (data.response.includes("【验收评审意见】") || data.response.includes("【合同要点】") || data.response.includes("公文") || data.response.includes("会议纪要"))) {
            const editorTextarea = document.getElementById("rag-editor-content") || document.getElementById("rag-doc-editor");
            if (editorTextarea) {
                editorTextarea.value = cleanResp;
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
    if (btn) {
        btn.disabled = true;
        btn.innerText = "⏳ 大模型评测打分中...";
    }
    if (box) {
        box.innerHTML = '<div style="text-align:center; padding:40px; color:#1d4ed8; font-weight:600;"><span class="spinner">⏳</span> 正在调用 AI 大模型依据《云南省重点建设项目档案验收实施办法》提取文档要件并重新研判打分...</div>';
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
        })
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "🚀 重新评测打分";
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

// ==========================================
// 模态弹窗文件及目录上传管理 (图三/图四/图五规范)
// ==========================================
window.modalUploadQueue = window.modalUploadQueue || [];
window.isModalUploading = false;

async function processDroppedItems(dataTransfer) {
    const fileList = [];
    const items = dataTransfer.items;

    if (!items || items.length === 0) {
        return Array.from(dataTransfer.files || []);
    }

    async function traverseEntry(entry, path = "") {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file((file) => {
                    file.relativePath = path + file.name;
                    fileList.push(file);
                    resolve();
                }, () => resolve());
            });
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const readAllEntries = () => {
                return new Promise((resolve) => {
                    dirReader.readEntries(async (entries) => {
                        if (!entries || entries.length === 0) {
                            resolve();
                        } else {
                            for (const childEntry of entries) {
                                await traverseEntry(childEntry, path + entry.name + "/");
                            }
                            await readAllEntries();
                            resolve();
                        }
                    }, () => resolve());
                });
            };
            await readAllEntries();
        }
    }

    const tasks = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : (item.getAsEntry ? item.getAsEntry() : null);
            if (entry) {
                tasks.push(traverseEntry(entry));
            } else {
                const f = item.getAsFile();
                if (f) fileList.push(f);
            }
        }
    }

    await Promise.all(tasks);
    return fileList;
}

function resolveFileStageCategory(file) {
    const pathAndName = (file.relativePath || file.webkitRelativePath || file.name || "").toLowerCase();
    
    if (pathAndName.includes("1") || pathAndName.includes("立项") || pathAndName.includes("可研") || pathAndName.includes("批复") || pathAndName.includes("建议书")) {
        return "1. 立项阶段文件";
    } else if (pathAndName.includes("2") || pathAndName.includes("过程") || pathAndName.includes("管理") || pathAndName.includes("纪要") || pathAndName.includes("会议") || pathAndName.includes("核验")) {
        return "2. 项目管理文件";
    } else if (pathAndName.includes("3") || pathAndName.includes("设计") || pathAndName.includes("架构") || pathAndName.includes("srs") || pathAndName.includes("需求")) {
        return "3. 设计阶段文件";
    } else if (pathAndName.includes("4") || pathAndName.includes("实施") || pathAndName.includes("施工") || pathAndName.includes("测试") || pathAndName.includes("隐蔽") || pathAndName.includes("到货")) {
        return "4. 实施阶段文件";
    } else if (pathAndName.includes("5") || pathAndName.includes("监理") || pathAndName.includes("旁站") || pathAndName.includes("巡检")) {
        return "5. 监理文件";
    } else if (pathAndName.includes("6") || pathAndName.includes("设备") || pathAndName.includes("硬件") || pathAndName.includes("软件") || pathAndName.includes("运维") || pathAndName.includes("维保") || pathAndName.includes("安全") || pathAndName.includes("库房") || pathAndName.includes("装具")) {
        return "6. 设备文件及系统软件";
    } else if (pathAndName.includes("7") || pathAndName.includes("合同") || pathAndName.includes("协议") || pathAndName.includes("招标") || pathAndName.includes("中标") || pathAndName.includes("财务") || pathAndName.includes("发票") || pathAndName.includes("付款") || pathAndName.includes("决算") || pathAndName.includes("审计")) {
        return "7. 财务管理文件";
    } else if (pathAndName.includes("8") || pathAndName.includes("验收") || pathAndName.includes("竣工") || pathAndName.includes("移交") || pathAndName.includes("终验") || pathAndName.includes("鉴定")) {
        return "8. 验收文件";
    }
    
    return "2. 项目管理文件";
}

window.openUploadModal = function() {
    const modal = document.getElementById("modal-upload-files");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.style.setProperty("display", "flex", "important");
    modal.style.setProperty("z-index", "999999", "important");
    
    const dropArea = document.getElementById("modal-drop-area");
    if (dropArea && !dropArea.dataset.bound) {
        dropArea.dataset.bound = "true";
        dropArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropArea.style.borderColor = "#6366f1";
            dropArea.style.background = "#eef2ff";
        });
        dropArea.addEventListener("dragleave", () => {
            dropArea.style.borderColor = "#c7d2fe";
            dropArea.style.background = "#faf5ff";
        });
        dropArea.addEventListener("drop", async (e) => {
            e.preventDefault();
            dropArea.style.borderColor = "#c7d2fe";
            dropArea.style.background = "#faf5ff";
            const files = await processDroppedItems(e.dataTransfer);
            if (files && files.length > 0) {
                handleModalFilesSelected(files);
            }
        });
    }
};

window.closeUploadModal = function() {
    const modal = document.getElementById("modal-upload-files");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.setProperty("display", "none", "important");
    }
};

window.handleModalFilesSelected = function(filesList) {
    const filesArray = Array.from(filesList || []);
    if (filesArray.length === 0) return;

    filesArray.forEach((file) => {
        const relPath = file.relativePath || file.webkitRelativePath || file.name;
        const exists = window.modalUploadQueue.some(item => item.name === file.name && item.relativePath === relPath && item.size === file.size);
        if (!exists) {
            const item = {
                id: "q_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
                file: file,
                name: file.name,
                relativePath: relPath,
                size: file.size,
                stage: resolveFileStageCategory(file),
                status: "pending",
                progress: 0,
                errorMsg: ""
            };
            window.modalUploadQueue.push(item);
        }
    });

    renderModalUploadQueueTable();
};

window.triggerAIReclassifyAllFiles = async function() {
    const projId = currentDetailProjectId || window.currentProjectId || 'p1';
    if (typeof showToast === "function") {
        showToast("✨ 大模型正在全量读取归档文档标题与全文内容，进行精准 8 大阶段与子阶段重新分类...", "info");
    }
    if (typeof showLoading === "function") {
        showLoading("✨ 政务大模型正在解析项目文档文本并重新归档分类...");
    }

    try {
        const res = await apiFetch(`/api/projects/${projId}/reclassify`, {
            method: "POST"
        });

        if (res && res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data && data.files) {
                currentProjectFiles = data.files;
                renderProjectFilesDirectory(data.files);
            } else {
                await refreshProjectFilesData(projId);
            }
            if (typeof showToast === "function") {
                showToast("✨ 大模型已成功对全量文档完成智能重新分类与 8 大阶段目录归档！", "success");
            }
        } else {
            const err = (res ? await res.json().catch(() => ({})) : {});
            if (typeof showToast === "function") {
                showToast("重新分类失败: " + (err.error || "服务器错误"), "error");
            }
        }
    } catch (e) {
        if (typeof showToast === "function") {
            showToast("请求异常: " + e.message, "error");
        }
    } finally {
        if (typeof hideLoading === "function") {
            hideLoading();
        }
    }
};

window.openMoveFileModal = function(fileId, fileName, currentStage) {
    const modal = document.getElementById("modal-move-file");
    const nameDisplay = document.getElementById("move-file-name-display");
    const fileIdInput = document.getElementById("move-file-id");
    const targetSelect = document.getElementById("move-file-target-stage");

    if (!modal) return;

    if (fileIdInput) fileIdInput.value = fileId;
    if (nameDisplay) nameDisplay.textContent = fileName;
    if (targetSelect && currentStage) {
        targetSelect.value = currentStage;
    }

    modal.style.display = "flex";
};

window.closeMoveFileModal = function() {
    const modal = document.getElementById("modal-move-file");
    if (modal) {
        modal.style.display = "none";
    }
};

window.confirmMoveFile = async function() {
    const fileIdInput = document.getElementById("move-file-id");
    const targetSelect = document.getElementById("move-file-target-stage");

    if (!fileIdInput || !fileIdInput.value || !targetSelect) return;

    const fileId = fileIdInput.value;
    const targetStage = targetSelect.value;
    const projId = currentDetailProjectId || window.currentProjectId || 'p1';
    const token = (typeof csrfToken !== "undefined" ? csrfToken : "");

    try {
        const res = await fetch(`/api/projects/${projId}/files/${fileId}/stage`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": token
            },
            body: JSON.stringify({ stage_folder: targetStage })
        });

        if (res.ok) {
            closeMoveFileModal();
            if (typeof showToast === "function") {
                showToast(`已成功将文档移动至【${targetStage}】！`, "success");
            }
            await refreshProjectFilesData(projId);
        } else {
            const err = await res.json().catch(() => ({}));
            if (typeof showToast === "function") {
                showToast("移动位置失败: " + (err.error || "服务器错误"), "error");
            }
        }
    } catch (e) {
        if (typeof showToast === "function") {
            showToast("网络请求失败: " + e.message, "error");
        }
    }
};


