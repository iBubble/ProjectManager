// ==========================================================================
// 政务智管 - 公用工具函数库 (utils.js)
// ==========================================================================

// 全局共享状态变量 (全项目统一提升定义)
var currentSession = null;
var currentProject = null;
var currentProjectFiles = [];
var csrfToken = "";
var alertsList = [];
var globalProjects = [];
var wechatActiveUser = "zhao";
var editingDocId = "";
var chatThinkingMode = "fast";


/**
 * HTML转义 - 防XSS
 */
function escapeHtml(str) {
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

// 兼容旧名
const escapeHTML = escapeHtml;

/**
 * 截断文本
 */
function truncateText(s, max) {
    if (!s) return '';
    if (s.length > max) return s.slice(0, max) + '...';
    return s;
}

/**
 * 格式化货币(人民币)
 */
function formatCurrency(num) {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(num);
}

/**
 * 格式化文件大小
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取Cookie
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
}

/**
 * 格式化角色名称
 */
function formatRole(role) {
    switch(role) {
        case 'super_admin': return '信息中心主任';
        case 'project_admin': return '项目管理员';
        case 'project_owner': return '项目负责人';
        case 'reader': return '只读领导';
        default: return role;
    }
}

/**
 * 格式化项目阶段
 */
function formatStage(stage) {
    const stageMap = {
        '立项': '📋 立项阶段', '招标': '📢 招标阶段', '合同': '📝 合同阶段',
        '实施': '🔨 实施阶段', '监理': '🔍 监理阶段', '过程': '📂 过程资料',
        '验收': '✅ 验收阶段', '运维': '🛠️ 质保运维',
    };
    return stageMap[stage] || stage;
}

/**
 * 格式化日期 (ISO→YYYY-MM-DD HH:mm)
 */
function formatDate(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
}

/**
 * 统一的带CSRF的fetch封装
 */
function apiFetch(url, options = {}) {
    const headers = options.headers || {};
    if (typeof csrfToken !== 'undefined' && csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    return fetch(url, { credentials: "same-origin", ...options, headers })
        .then(res => {
            if (res.status === 401) {
                sessionStorage.clear();
                localStorage.clear();
                if (!window.location.pathname.endsWith("index.html") && window.location.pathname !== "/") {
                    window.location.href = "/index.html";
                }
            }
            return res;
        });
}

/**
 * 显示全局加载遮罩
 */
function showLoading(text) {
    const el = document.getElementById('loading-text');
    const overlay = document.getElementById('loading-overlay');
    if (el) el.textContent = text;
    if (overlay) overlay.classList.remove('hidden');
}

/**
 * 隐藏全局加载遮罩
 */
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

/**
 * 显示Toast通知
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = { success: '#16a34a', error: '#dc2626', info: '#0b2559', warning: '#ea580c' };
    toast.style.cssText = `background:${colors[type]||colors.info};color:#fff;padding:12px 20px;border-radius:6px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:380px;animation:slideIn 0.3s ease;`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

/**
 * 开合高级功能下拉菜单
 */
function toggleAdvancedMenu(e) {
    if (e) e.stopPropagation();
    const list = document.getElementById("advanced-menu-list");
    if (list) {
        list.classList.toggle("hidden");
    }
}

/**
 * 关闭高级功能下拉菜单
 */
function closeAdvancedMenu() {
    const list = document.getElementById("advanced-menu-list");
    if (list) {
        list.classList.add("hidden");
    }
}

// 自动注册点击非菜单区域收起下拉菜单
document.addEventListener("click", (e) => {
    const box = document.querySelector(".dropdown-trigger-box");
    if (box && !box.contains(e.target)) {
        closeAdvancedMenu();
    }
});

function openAlertsModal() {
    closeAlertsModal();

    apiFetch("/api/alerts")
        .then(res => res.ok ? res.json() : [])
        .then(alerts => {
            const sorted = (alerts || []).sort((a,b) => (b.trigger_date || "").localeCompare(a.trigger_date || ""));

            let itemsHtml = sorted.map(a => {
                const isRead = a.status === "read";
                return `
                    <div class="alerts-modal-item ${a.level}-level" style="margin-bottom:12px; padding:12px; border:1px solid #cbd5e1; border-radius:6px; background:${isRead ? '#f8fafc' : '#fff'}; border-left:4px solid ${a.level === 'danger' ? '#ef4444' : (a.level === 'warning' ? '#f59e0b' : '#3b82f6')};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:14px; color:${a.level === 'danger' ? '#dc2626' : (a.level === 'warning' ? '#d97706' : '#2563eb')}">
                                ${escapeHtml(a.title)}
                            </strong>
                            <span style="font-size:12px; color:var(--text-muted); font-family:monospace;">${escapeHtml(a.trigger_date || "")}</span>
                        </div>
                        <p style="font-size:13px; color:#334155; margin:6px 0; line-height:1.5;">${escapeHtml(a.content || "")}</p>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                            <button class="btn-gov-secondary" onclick="closeAlertsModal(); window.location.href='/detail.html?id=${a.project_id}';" style="font-size:12px; padding:3px 8px;">🔍 查看关联项目</button>
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
        });
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
            }
        });
}

window.openAlertsModal = openAlertsModal;
window.closeAlertsModal = closeAlertsModal;
window.ackAlertReadModal = ackAlertReadModal;
window.toggleAdvancedMenu = toggleAdvancedMenu;
window.closeAdvancedMenu = closeAdvancedMenu;
if (!window.handleLogout) {
    window.handleLogout = function() {
        try { sessionStorage.clear(); localStorage.clear(); } catch(e){}
        fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
            .finally(() => { window.location.href = "/index.html"; });
    };
}

function applyWatermark() {
    apiFetch("/api/system/config")
        .then(res => res.ok ? res.json() : null)
        .then(cfg => {
            if (!cfg) return;
            const container = document.getElementById("global-watermark");
            if (!container) return;
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
        })
        .catch(err => console.warn("applyWatermark error:", err));
}

window.applyWatermark = applyWatermark;

// 网关连通状态探测（带自动重试机制）
let _statusRetryTimer = null;
let _statusRetryCount = 0;
const _STATUS_MAX_RETRIES = 5;
const _STATUS_RETRY_DELAYS = [10000, 20000, 30000, 60000, 60000]; // 10s, 20s, 30s, 60s, 60s

function updateStatusIndicator(isAutoRetry) {
    const indicator = document.getElementById("engine-status-indicator") || document.getElementById("ai-status-indicator");
    if (!indicator) return;

    // 手动调用时重置重试计数
    if (!isAutoRetry) {
        _statusRetryCount = 0;
        if (_statusRetryTimer) {
            clearTimeout(_statusRetryTimer);
            _statusRetryTimer = null;
        }
    }

    // 默认显示黄色闪烁 (正在加载)
    indicator.innerHTML = `
        <span class="status-dot dot-yellow-pulse" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #eab308; box-shadow: 0 0 8px #eab308; animation: pulse 1.5s infinite;"></span>
    `;
    indicator.setAttribute("title", _statusRetryCount > 0
        ? `正在重新探测网关通信状态... (第 ${_statusRetryCount} 次重试)`
        : "正在探测网关通信状态...");

    apiFetch("/api/system/llm/test")
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                // 连接成功，停止重试
                _statusRetryCount = 0;
                if (_statusRetryTimer) {
                    clearTimeout(_statusRetryTimer);
                    _statusRetryTimer = null;
                }
                if (data.provider === "mock") {
                    indicator.innerHTML = `
                        <span class="status-dot" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #eab308; box-shadow: 0 0 6px #eab308;"></span>
                    `;
                    indicator.setAttribute("title", `🤖 离线智能研判内置引擎已就绪\n接口：本地沙箱规则引擎\n模型：DeepSeek-R1 (内置规则模拟)`);
                } else {
                    apiFetch("/api/system/config")
                        .then(resCfg => resCfg.ok ? resCfg.json() : null)
                        .then(cfg => {
                            const savedModel = cfg ? cfg.llm_model : "";
                            const displayModel = savedModel || (data.models && data.models.length > 0 ? data.models[0] : "默认");
                            indicator.innerHTML = `
                                <span class="status-dot" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #22c55e; box-shadow: 0 0 8px #22c55e;"></span>
                            `;
                            indicator.setAttribute("title", `🟢 远端网关已成功连通\n厂商：${data.provider}\n端点：${data.endpoint}\n模型：${displayModel}\n延时：${data.latency_ms} ms`);
                        });
                }
            } else {
                _scheduleStatusRetry(indicator, data.message);
            }
        })
        .catch(err => {
            _scheduleStatusRetry(indicator, err.message);
        });
}

function _scheduleStatusRetry(indicator, errorMsg) {
    if (_statusRetryCount < _STATUS_MAX_RETRIES) {
        const delay = _STATUS_RETRY_DELAYS[_statusRetryCount] || 60000;
        const nextSec = Math.round(delay / 1000);
        indicator.innerHTML = `
            <span class="status-dot" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #ef4444; box-shadow: 0 0 8px #ef4444;"></span>
        `;
        indicator.setAttribute("title", `🔴 远端网关连通失败\n错误：${errorMsg}\n⏳ 将在 ${nextSec} 秒后自动重试 (${_statusRetryCount + 1}/${_STATUS_MAX_RETRIES})`);
        _statusRetryCount++;
        _statusRetryTimer = setTimeout(() => updateStatusIndicator(true), delay);
    } else {
        // 重试用尽，显示最终错误
        indicator.innerHTML = `
            <span class="status-dot" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #ef4444; box-shadow: 0 0 8px #ef4444;"></span>
        `;
        indicator.setAttribute("title", `🔴 远端网关连通失败 (已重试 ${_STATUS_MAX_RETRIES} 次)\n错误：${errorMsg}\n💡 请检查 Ollama 宿主机网络后刷新页面`);
    }
}

window.updateStatusIndicator = updateStatusIndicator;
window.updateAIStatusIndicator = updateStatusIndicator;

// ==========================================
// 全局独立文件/目录上传弹窗核心逻辑 (支持图三/图四/图五规范)
// ==========================================
window.modalUploadQueue = window.modalUploadQueue || [];
window.isModalUploading = false;

window.processDroppedItems = async function(dataTransfer) {
    const fileList = [];
    const items = dataTransfer ? dataTransfer.items : null;

    if (!items || items.length === 0) {
        return Array.from((dataTransfer && dataTransfer.files) || []);
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
};

window.resolveFileStageCategory = function(file) {
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
};

window.openUploadModal = function() {
    let modal = document.getElementById("modal-upload-files");
    if (!modal) {
        const modalHtml = `
        <div class="admin-modal-overlay" id="modal-upload-files" onclick="if(event.target===this) closeUploadModal();" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.6); backdrop-filter:blur(3px); z-index:999999; display:none; align-items:center; justify-content:center;">
            <div class="admin-modal" style="max-width:760px; width:92%; background:#ffffff; border-radius:10px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); display:flex; flex-direction:column; max-height:90vh; overflow:hidden; animation: adminFadeIn 0.2s ease;">
                <!-- 弹窗头部 -->
                <div class="admin-modal-header" style="padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                    <h3 style="margin:0; font-size:16px; color:#1e293b; font-weight:700; display:flex; align-items:center; gap:8px;">
                        <span>📤</span> 上传项目文件/资料
                    </h3>
                    <button class="admin-modal-close" onclick="closeUploadModal()" style="background:none; border:none; font-size:20px; cursor:pointer; color:#64748b; padding:0 6px;">✕</button>
                </div>
                
                <!-- 弹窗主体 -->
                <div class="admin-modal-body" style="padding:20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px;">
                    <!-- 拖拽/选择区域 (匹配图四) -->
                    <div id="modal-drop-area" style="border:2px dashed #c7d2fe; background:#faf5ff; border-radius:10px; padding:24px 16px; text-align:center; transition:all 0.2s ease;">
                        <div style="width:52px; height:52px; background:#ede9fe; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 12px auto; font-size:26px; color:#6366f1;">
                            ☁️
                        </div>
                        <div style="font-size:15px; font-weight:700; color:#312e81; margin-bottom:12px;">
                            拖拽 <span style="color:#4f46e5;">任意项目目录</span> 或各类文档至此区域
                        </div>
                        <div style="display:flex; justify-content:center; gap:12px; margin-bottom:16px;">
                            <button class="btn-gov-secondary" type="button" onclick="document.getElementById('modal-file-input').click();" style="font-size:13px; padding:7px 16px; border:1px solid #cbd5e1; background:#ffffff; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                                📄 上传文件
                            </button>
                            <button class="btn-gov-primary" type="button" onclick="document.getElementById('modal-folder-input').click();" style="font-size:13px; padding:7px 16px; background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; border-radius:6px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;">
                                📁 按目录层级上传项目目录
                            </button>
                        </div>
                        <input type="file" id="modal-file-input" multiple class="hidden" accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,.txt,.md,.pptx,.ppt,.caj,.zip,.rar,.7z" onchange="handleModalFilesSelected(this.files)">
                        <input type="file" id="modal-folder-input" webkitdirectory directory multiple class="hidden" onchange="handleModalFilesSelected(this.files)">
                        <div style="font-size:11.5px; color:#4b5563; max-width:600px; margin:0 auto; line-height:1.6;">
                            🛡️ <b>政务安全级存储管道</b>：全面支持 <b>PDF、Word (.docx/.doc)、Excel (.xlsx/.xls)、图片扫描件 (.png/.jpg/.jpeg/.bmp/.tif/.webp)</b> 及其它常规办公公文。文件上传后自动加密落盘并审计留痕。
                        </div>
                    </div>

                    <!-- 文件队列列表与进度展示区 (图四/图五上传队列) -->
                    <div id="modal-upload-queue-section" class="hidden" style="border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#ffffff;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
                            <span id="modal-queue-summary-text" style="font-size:13px; font-weight:600; color:#334155;">已就绪文件队列 (0)</span>
                            <div style="display:flex; gap:8px;">
                                <button class="btn-gov-secondary" id="btn-modal-retry-all" onclick="retryAllFailedUploads()" style="font-size:11.5px; padding:3px 10px; color:#dc2626; border-color:#fca5a5; background:#fef2f2; display:none;">🔄 全部重试</button>
                                <button class="btn-gov-secondary" onclick="clearModalQueue()" style="font-size:11.5px; padding:3px 10px; color:#64748b;">🗑️ 清空列表</button>
                            </div>
                        </div>
                        
                        <div style="max-height:220px; overflow-y:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                                <thead>
                                    <tr style="background:#f8fafc; color:#64748b; text-align:left; border-bottom:1px solid #e2e8f0;">
                                        <th style="padding:6px 8px;">文件名</th>
                                        <th style="padding:6px 8px;">相对路径 / 预判大类</th>
                                        <th style="padding:6px 8px; width:70px;">大小</th>
                                        <th style="padding:6px 8px; width:140px;">状态 / 进度</th>
                                        <th style="padding:6px 8px; width:80px; text-align:center;">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="modal-upload-queue-tbody">
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 弹窗底部操作按钮 -->
                <div class="admin-modal-footer" style="padding:14px 20px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;">
                    <div id="modal-upload-status-tip" style="font-size:12px; color:#64748b;">
                        请添加文件/目录后点击右下角“开始上传”
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-gov-secondary" onclick="closeUploadModal()" style="padding:7px 16px; font-size:13px; cursor:pointer;">取消</button>
                        <button class="btn-gov-primary" id="btn-start-upload-action" onclick="startModalUploadProcessing()" style="padding:7px 22px; font-size:13px; background:#2563eb; color:#ffffff; font-weight:600; border-radius:6px; cursor:pointer; border:none;" disabled>开始上传</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML("beforeend", modalHtml);
        modal = document.getElementById("modal-upload-files");
    }

    if (modal) {
        modal.classList.remove("hidden");
        modal.style.setProperty("display", "flex", "important");
        modal.style.setProperty("z-index", "999999", "important");
    }

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

    if (typeof renderModalUploadQueueTable === "function") {
        renderModalUploadQueueTable();
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

    // 选定目录或文件后，0 秒自动开启上传与智能分类流转
    setTimeout(() => {
        if (!window.isModalUploading) {
            startModalUploadProcessing();
        }
    }, 50);
};

window.renderModalUploadQueueTable = function() {
    const queueSection = document.getElementById("modal-upload-queue-section");
    const tbody = document.getElementById("modal-upload-queue-tbody");
    const summaryText = document.getElementById("modal-queue-summary-text");
    const retryAllBtn = document.getElementById("btn-modal-retry-all");
    const startBtn = document.getElementById("btn-start-upload-action");
    const statusTip = document.getElementById("modal-upload-status-tip");

    if (!queueSection || !tbody) return;

    if (window.modalUploadQueue.length === 0) {
        queueSection.classList.add("hidden");
        if (startBtn) startBtn.disabled = true;
        if (statusTip) statusTip.textContent = "已就绪，可拖拽或选择目录进行极速上传与智能归档";
        return;
    }

    queueSection.classList.remove("hidden");

    let pendingCount = 0;
    let uploadingCount = 0;
    let categorizingCount = 0;
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    tbody.innerHTML = window.modalUploadQueue.map((item) => {
        if (item.status === "pending") pendingCount++;
        else if (item.status === "uploading") uploadingCount++;
        else if (item.status === "categorizing" || item.status === "uploaded") categorizingCount++;
        else if (item.status === "success") successCount++;
        else if (item.status === "duplicate") duplicateCount++;
        else if (item.status === "error") errorCount++;

        let statusHtml = "";
        if (item.status === "pending") {
            statusHtml = `<span style="color:#64748b; background:#f8fafc; padding:2px 8px; border-radius:4px; border:1px solid #cbd5e1; font-size:11.5px;">⏳ 准备就绪</span>`;
        } else if (item.status === "uploading") {
            statusHtml = `<div style="display:flex; align-items:center; gap:6px;">
                <div style="flex:1; background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden;">
                    <div style="width:35%; background:#2563eb; height:100%; transition:width 0.2s;"></div>
                </div>
                <span style="font-size:11px; color:#2563eb; font-weight:600;">35% 上传中...</span>
            </div>`;
        } else if (item.status === "uploaded" || item.status === "categorizing") {
            statusHtml = `<div style="display:flex; align-items:center; gap:6px;">
                <div style="flex:1; background:#feefc3; height:6px; border-radius:3px; overflow:hidden;">
                    <div style="width:75%; background:#d97706; height:100%; transition:width 0.2s;"></div>
                </div>
                <span style="font-size:11px; color:#d97706; font-weight:600;">75% 分类中...</span>
            </div>`;
        } else if (item.status === "success") {
            statusHtml = `<div style="display:flex; align-items:center; gap:6px;">
                <div style="flex:1; background:#bbf7d0; height:6px; border-radius:3px; overflow:hidden;">
                    <div style="width:100%; background:#16a34a; height:100%;"></div>
                </div>
                <span style="font-size:11px; color:#16a34a; font-weight:700;">100% 完成</span>
            </div>`;
        } else if (item.status === "duplicate") {
            statusHtml = `<span style="color:#b45309; background:#fffbeb; padding:2px 8px; border-radius:4px; border:1px solid #fde68a; font-size:11.5px;" title="${escapeHtml(item.errorMsg)}">⚠️ 相同文档已存在 (已自动跳过)</span>`;
        } else if (item.status === "error") {
            statusHtml = `<span style="color:#dc2626; background:#fef2f2; padding:2px 8px; border-radius:4px; border:1px solid #fecaca; font-size:11.5px;" title="${escapeHtml(item.errorMsg)}">❌ 失败: ${escapeHtml(item.errorMsg || '失败')}</span>`;
        }

        let actionHtml = "";
        if (item.status === "pending") {
            actionHtml = `<button onclick="removeSingleQueueItem('${item.id}')" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px;" title="移除">✕</button>`;
        } else if (item.status === "uploading") {
            actionHtml = `<span style="color:#2563eb; font-size:11px; font-weight:600;">上传中...</span>`;
        } else if (item.status === "uploaded" || item.status === "categorizing") {
            actionHtml = `<span style="color:#d97706; font-size:11px; font-weight:600;">分类中...</span>`;
        } else if (item.status === "success") {
            actionHtml = `<span style="color:#16a34a; font-size:11px; font-weight:700;">完成</span>`;
        } else if (item.status === "duplicate") {
            actionHtml = `<span style="color:#b45309; font-size:11px; font-weight:600;">重复跳过</span>`;
        } else if (item.status === "error") {
            actionHtml = `<button onclick="retrySingleUpload('${item.id}')" style="background:#fef2f2; border:1px solid #fca5a5; color:#dc2626; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 重试</button>`;
        }

        return `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:6px 8px; font-weight:600; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.name)}">
                    📄 ${escapeHtml(item.name)}
                </td>
                <td style="padding:6px 8px; color:#64748b; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.relativePath)} -> ${item.stage}">
                    <span style="font-size:11px; background:#f1f5f9; color:#1e40af; padding:1px 5px; border-radius:3px; margin-right:4px;">${escapeHtml(item.stage)}</span>
                    ${escapeHtml(item.relativePath)}
                </td>
                <td style="padding:6px 8px; color:#64748b;">${formatBytes(item.size)}</td>
                <td style="padding:6px 8px;">${statusHtml}</td>
                <td style="padding:6px 8px; text-align:center;">${actionHtml}</td>
            </tr>
        `;
    }).join("");

    if (summaryText) {
        summaryText.textContent = `已就绪文件队列 (${window.modalUploadQueue.length} 个: 完成 ${successCount} / 重复跳过 ${duplicateCount} / 失败 ${errorCount} / 处理中 ${uploadingCount + categorizingCount})`;
    }

    if (retryAllBtn) {
        retryAllBtn.style.display = errorCount > 0 ? "inline-block" : "none";
    }

    if (startBtn) {
        if (window.isModalUploading) {
            startBtn.disabled = true;
            startBtn.textContent = "正在处理中...";
            startBtn.onclick = null;
        } else if (pendingCount === 0 && (successCount > 0 || duplicateCount > 0)) {
            startBtn.disabled = false;
            startBtn.textContent = "完成";
            startBtn.onclick = function() {
                window.closeUploadModal();
            };
        } else {
            startBtn.disabled = pendingCount === 0 && errorCount === 0;
            startBtn.textContent = "开始上传";
            startBtn.onclick = function() {
                startModalUploadProcessing();
            };
        }
    }

    if (statusTip) {
        if (uploadingCount > 0) {
            statusTip.textContent = `⚡ [第一阶段] 正在全量传输文件字节... (${successCount + duplicateCount + categorizingCount + uploadingCount}/${window.modalUploadQueue.length})`;
        } else if (categorizingCount > 0) {
            statusTip.textContent = `✨ [第二阶段] 全量传输完毕，正在按文档内容智能分类归档中...`;
        } else if (successCount > 0 || duplicateCount > 0) {
            statusTip.textContent = `🎉 处理完成 (成功归档 ${successCount} 个` + (duplicateCount > 0 ? ` / 自动跳过重复文档 ${duplicateCount} 个` : '') + `)，点击下方“完成”按钮关闭窗口`;
        } else if (pendingCount > 0 || errorCount > 0) {
            statusTip.textContent = `队列中包含 ${pendingCount + errorCount} 个文件，系统正准备自动传输...`;
        }
    }
};

window.removeSingleQueueItem = function(itemId) {
    window.modalUploadQueue = window.modalUploadQueue.filter(item => item.id !== itemId);
    renderModalUploadQueueTable();
};

window.clearModalQueue = function() {
    if (window.isModalUploading) return;
    window.modalUploadQueue = [];
    renderModalUploadQueueTable();
};

window.retrySingleUpload = function(itemId) {
    const item = window.modalUploadQueue.find(i => i.id === itemId);
    if (item) {
        item.status = "pending";
        item.progress = 0;
        item.errorMsg = "";
        renderModalUploadQueueTable();
        startModalUploadProcessing();
    }
};

window.retryAllFailedUploads = function() {
    window.modalUploadQueue.forEach(item => {
        if (item.status === "error") {
            item.status = "pending";
            item.progress = 0;
            item.errorMsg = "";
        }
    });
    renderModalUploadQueueTable();
    startModalUploadProcessing();
};

window.startModalUploadProcessing = async function() {
    if (window.isModalUploading) return;

    const itemsToUpload = window.modalUploadQueue.filter(i => i.status === "pending" || i.status === "error");
    if (itemsToUpload.length === 0) return;

    window.isModalUploading = true;
    renderModalUploadQueueTable();

    const projId = (typeof currentProject !== "undefined" && currentProject && currentProject.id) || window.currentProjectId || (typeof currentDetailProjectId !== "undefined" ? currentDetailProjectId : null) || 'p1';
    const token = (typeof csrfToken !== "undefined" ? csrfToken : "");

    // 采用 5 并发 Worker 池流式传输，保证进度条平滑即时更新
    const CONCURRENCY = 5;
    let queueIdx = 0;

    async function uploadWorker() {
        while (queueIdx < itemsToUpload.length) {
            const item = itemsToUpload[queueIdx++];
            if (!item) break;

            item.status = "uploading";
            item.progress = 35;
            renderModalUploadQueueTable();

            const formData = new FormData();
            formData.append("file", item.file);
            formData.append("stage", item.stage || "auto");

            try {
                const res = await fetch(`/api/projects/${projId}/files`, {
                    method: "POST",
                    headers: { "X-CSRF-Token": token },
                    body: formData
                });

                if (res.status === 409) {
                    const err = await res.json().catch(() => ({}));
                    item.status = "duplicate";
                    item.errorMsg = err.error || "项目内已存在相同特征码的文档";
                } else if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    item.status = "uploaded";
                    item.progress = 50;
                    if (data && data.stage_folder) {
                        item.stage = data.stage_folder;
                    }
                } else {
                    const err = await res.json().catch(() => ({}));
                    item.status = "error";
                    item.errorMsg = err.error || "上传失败";
                }
            } catch (e) {
                item.status = "error";
                item.errorMsg = "网络超时或连接失败";
            }
            renderModalUploadQueueTable();
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, itemsToUpload.length); i++) {
        workers.push(uploadWorker());
    }

    await Promise.all(workers);

    // =========================================================
    // 阶段 2：统一智能分类归档 (Categorization Phase)
    // 全量传输成功后，触发文档内容全维度分类归档
    // =========================================================
    const uploadedItems = itemsToUpload.filter(i => i.status === "uploaded");
    if (uploadedItems.length > 0) {
        uploadedItems.forEach(item => {
            item.status = "categorizing";
            item.progress = 75;
        });
        renderModalUploadQueueTable();

        // 后台异步触发 AI 研判与深度学习管线（不阻塞上传弹窗的 0ms 完成状态）
        fetch(`/api/projects/${projId}/analyze`, {
            method: "POST",
            headers: { "X-CSRF-Token": token }
        }).catch(e => {});

        // 拉取最新物理元数据并回填准确阶段分类
        try {
            const resProj = await fetch(`/api/projects/${projId}/files`);
            if (resProj.ok) {
                const updatedFiles = await resProj.json();
                uploadedItems.forEach(item => {
                    const matched = updatedFiles.find(f => f.file_name === item.name || f.id === item.id);
                    if (matched && matched.stage_folder) {
                        item.stage = matched.stage_folder;
                    }
                });
            }
        } catch (e) {}

        uploadedItems.forEach(item => {
            item.status = "success";
            item.progress = 100;
        });
    }

    window.isModalUploading = false;
    renderModalUploadQueueTable();

    // 触发刷新前台项目主界面
    const hasSuccess = window.modalUploadQueue.some(i => i.status === "success");
    if (hasSuccess) {
        if (typeof window.refreshProjectFilesData === "function") {
            window.refreshProjectFilesData(projId);
        }
        if (typeof loadProjectAnalysis === "function") loadProjectAnalysis(projId);
        if (typeof loadYunnanEval === "function") loadYunnanEval(projId);
    }
};

window.triggerPostUploadAsyncPipeline = function(projId) {
    // 步骤 1：文件极速上传完成，立即刷新项目原文件列表，不阻塞用户
    fetch(`/api/projects/${projId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && data.files) {
                if (typeof currentProjectFiles !== "undefined") currentProjectFiles = data.files;
                if (typeof renderProjectFilesDirectory === "function") {
                    renderProjectFilesDirectory(data.files);
                }
            }
        }).catch(e => {});

    if (typeof showToast === "function") {
        showToast("📦 文件全量上传完成！系统正在后台异步进行智能分阶段归档、风险研判与大模型学习...", "info");
    }

    // 步骤 2：后台异步触发：分阶段归档目录推演 + 大模型合规研判 + 深度学习管线入队
    const token = (typeof csrfToken !== "undefined" ? csrfToken : "");
    fetch(`/api/projects/${projId}/analyze`, {
        method: "POST",
        headers: { "X-CSRF-Token": token }
    })
    .then(res => res.ok ? res.json() : null)
    .then(() => {
        // 步骤 3：后台研判与学习完成后，自动刷新归档目录树与研判面板
        fetch(`/api/projects/${projId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.files) {
                    if (typeof currentProjectFiles !== "undefined") currentProjectFiles = data.files;
                    if (typeof renderProjectFilesDirectory === "function") {
                        renderProjectFilesDirectory(data.files);
                    }
                }
            });

        if (typeof loadProjectAnalysis === "function") {
            loadProjectAnalysis(projId);
        }
        if (typeof loadYunnanEval === "function") {
            loadYunnanEval(projId);
        }
        if (typeof showToast === "function") {
            showToast("✨ 分阶段归档目录推演、大模型合规研判及后台学习已全部完成！", "success");
        }
    })
    .catch(e => console.warn("Async post-upload pipeline error:", e));
};

window.updateBatchDeleteUIState = function() {
    const checkboxes = Array.from(document.querySelectorAll("#national-archiving-tree input[type='checkbox'], .file-item-checkbox"));
    const checkedCount = checkboxes.filter(cb => cb.checked).length;
    const totalCount = checkboxes.length;

    const countBadge = document.getElementById("selected-file-count-badge");
    const batchBtn = document.getElementById("btn-batch-delete-files");
    const selectAllCb = document.getElementById("checkbox-select-all-files");

    if (countBadge) {
        countBadge.textContent = `已选 ${checkedCount} 份文件`;
    }

    if (batchBtn) {
        if (checkedCount > 0) {
            batchBtn.removeAttribute("disabled");
            batchBtn.disabled = false;
            batchBtn.style.opacity = "1";
            batchBtn.style.cursor = "pointer";
            batchBtn.style.background = "#fef2f2";
            batchBtn.style.color = "#dc2626";
            batchBtn.style.borderColor = "#fca5a5";
        } else {
            batchBtn.disabled = true;
            batchBtn.style.opacity = "0.5";
            batchBtn.style.cursor = "not-allowed";
            batchBtn.style.background = "#f8fafc";
            batchBtn.style.color = "#94a3b8";
            batchBtn.style.borderColor = "#cbd5e1";
        }
    }

    if (selectAllCb) {
        selectAllCb.checked = (totalCount > 0 && checkedCount === totalCount);
    }
};

window.toggleSelectAllProjectFiles = function(isChecked) {
    const checkboxes = document.querySelectorAll("#national-archiving-tree input[type='checkbox'], .file-item-checkbox");
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
    });
    window.updateBatchDeleteUIState();
};

window.onFileCheckboxChange = function() {
    window.updateBatchDeleteUIState();
};

window.refreshProjectFilesData = async function(projId) {
    projId = projId || (typeof currentDetailProjectId !== "undefined" && currentDetailProjectId) || window.currentProjectId || (typeof currentProject !== "undefined" && currentProject ? currentProject.id : null) || 'p1';
    try {
        const res = await fetch(`/api/projects/${projId}/files`);
        if (res.ok) {
            const files = await res.json();
            if (typeof currentProjectFiles !== "undefined") currentProjectFiles = files || [];
            if (typeof renderProjectFilesDirectory === "function") {
                renderProjectFilesDirectory(files || []);
            }
        }
    } catch (e) {}
};

window.deleteSingleProjectFile = async function(fileId, fileName) {
    if (!confirm(`确定要物理彻底删除归档文件【${fileName}】吗？删除后不可恢复。`)) {
        return;
    }

    const projId = (typeof currentDetailProjectId !== "undefined" && currentDetailProjectId) || window.currentProjectId || (typeof currentProject !== "undefined" && currentProject ? currentProject.id : null) || 'p1';

    // 0ms 即时从前台 DOM 节点中移除，并即时重算父级文件夹与全项徽章数字
    const targetCb = document.querySelector(`.file-item-checkbox[data-file-id="${fileId}"]`);
    if (targetCb) {
        const itemRow = targetCb.closest(".file-item");
        if (itemRow) {
            const subfolderNode = itemRow.closest(".subfolder-node");
            const folderNode = itemRow.closest(".folder-node");
            itemRow.remove();

            if (subfolderNode) {
                const countEl = subfolderNode.querySelector(".subfolder-count");
                const remaining = subfolderNode.querySelectorAll(".file-item").length;
                if (countEl) countEl.textContent = `${remaining} 份`;
            }
            if (folderNode) {
                const badgeEl = folderNode.querySelector(".badge");
                const remainingTotal = folderNode.querySelectorAll(".file-item").length;
                if (badgeEl) badgeEl.textContent = `${remainingTotal} 份归档文件`;
            }
        }
    }
    window.updateBatchDeleteUIState();

    try {
        const token = (typeof csrfToken !== "undefined" ? csrfToken : "");
        const res = await fetch(`/api/projects/${projId}/files/${fileId}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": token }
        });

        if (res.ok) {
            if (typeof showToast === "function") {
                showToast(`🗑️ 归档文件【${fileName}】已彻底删除`, "success");
            }
            await window.refreshProjectFilesData(projId);
            if (typeof window.triggerPostUploadAsyncPipeline === "function") {
                window.triggerPostUploadAsyncPipeline(projId);
            }
        } else {
            const err = await res.json().catch(() => ({}));
            if (typeof showToast === "function") {
                showToast("删除失败: " + (err.error || "服务器错误"), "error");
            }
            await window.refreshProjectFilesData(projId);
        }
    } catch (e) {
        if (typeof showToast === "function") {
            showToast("删除请求异常: " + e.message, "error");
        }
        await window.refreshProjectFilesData(projId);
    }
};

window.batchDeleteSelectedFiles = async function() {
    const checkboxes = Array.from(document.querySelectorAll("#national-archiving-tree input[type='checkbox']:checked, .file-item-checkbox:checked"));
    if (checkboxes.length === 0) {
        if (typeof showToast === "function") {
            showToast("请先在下方归档目录树中勾选需要删除的文件", "warning");
        }
        return;
    }

    const selectedFiles = checkboxes.map(cb => ({
        id: cb.dataset.fileId || cb.getAttribute("data-file-id"),
        name: cb.dataset.fileName || cb.getAttribute("data-file-name"),
        cbEl: cb
    })).filter(item => item.id);

    if (selectedFiles.length === 0) {
        if (typeof showToast === "function") {
            showToast("未解析到勾选的文件ID", "warning");
        }
        return;
    }

    if (!confirm(`确定要批量物理彻底删除选中的 ${selectedFiles.length} 份归档文件吗？删除后不可恢复。`)) {
        return;
    }

    const projId = (typeof currentDetailProjectId !== "undefined" && currentDetailProjectId) || window.currentProjectId || (typeof currentProject !== "undefined" && currentProject ? currentProject.id : null) || 'p1';

    // 0ms 即时从前台 DOM 节点全量删除，无缝视觉响应并实时重算所有文件夹数字
    const affectedSubNodes = new Set();
    const affectedFolderNodes = new Set();

    selectedFiles.forEach(item => {
        if (item.cbEl) {
            const itemRow = item.cbEl.closest(".file-item");
            if (itemRow) {
                const subNode = itemRow.closest(".subfolder-node");
                const folderNode = itemRow.closest(".folder-node");
                if (subNode) affectedSubNodes.add(subNode);
                if (folderNode) affectedFolderNodes.add(folderNode);
                itemRow.remove();
            }
        }
    });

    affectedSubNodes.forEach(node => {
        const countEl = node.querySelector(".subfolder-count");
        const remaining = node.querySelectorAll(".file-item").length;
        if (countEl) countEl.textContent = `${remaining} 份`;
    });
    affectedFolderNodes.forEach(node => {
        const badgeEl = node.querySelector(".badge");
        const remainingTotal = node.querySelectorAll(".file-item").length;
        if (badgeEl) badgeEl.textContent = `${remainingTotal} 份归档文件`;
    });

    const selectAllCb = document.getElementById("checkbox-select-all-files");
    if (selectAllCb) selectAllCb.checked = false;
    window.updateBatchDeleteUIState();

    const token = (typeof csrfToken !== "undefined" ? csrfToken : "");
    const deletePromises = selectedFiles.map(f =>
        fetch(`/api/projects/${projId}/files/${f.id}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": token }
        }).then(res => res.ok).catch(() => false)
    );

    const results = await Promise.all(deletePromises);
    const deletedCount = results.filter(r => r === true).length;

    if (typeof showToast === "function") {
        showToast(`🗑️ 已成功批量彻底删除 ${deletedCount} 份归档文件！`, "success");
    }

    await window.refreshProjectFilesData(projId);
    if (typeof window.triggerPostUploadAsyncPipeline === "function") {
        window.triggerPostUploadAsyncPipeline(projId);
    }
};

// 全局事件委派：使用标准冒泡阶段处理 DOM 交互
document.addEventListener("change", function(e) {
    if (e.target && e.target.id === "checkbox-select-all-files") {
        window.toggleSelectAllProjectFiles(e.target.checked);
    } else if (e.target && (e.target.classList.contains("file-item-checkbox") || e.target.closest("#national-archiving-tree"))) {
        window.onFileCheckboxChange();
    }
});

document.addEventListener("click", function(e) {
    if (e.target && (e.target.classList.contains("file-item-checkbox") || e.target.id === "checkbox-select-all-files")) {
        setTimeout(() => window.updateBatchDeleteUIState(), 10);
    }

    const uploadBtn = e.target.closest(".modal-upload-trigger-btn, #btn-trigger-upload-modal");
    if (uploadBtn) {
        e.preventDefault();
        e.stopPropagation();
        window.openUploadModal();
        return;
    }

    const batchBtn = e.target.closest("#btn-batch-delete-files");
    if (batchBtn) {
        e.preventDefault();
        window.batchDeleteSelectedFiles();
        return;
    }

    const delBtn = e.target.closest(".btn-file-delete");
    if (delBtn) {
        e.preventDefault();
        const fileId = delBtn.getAttribute("data-file-id") || delBtn.dataset.fileId;
        const fileName = delBtn.getAttribute("data-file-name") || delBtn.dataset.fileName;
        if (fileId) {
            window.deleteSingleProjectFile(fileId, fileName || "文件");
        }
    }
});
