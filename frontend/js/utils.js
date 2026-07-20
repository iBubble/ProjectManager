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

function updateAIStatusIndicator() {
    const indicator = document.getElementById("ai-status-indicator");
    if (!indicator) return;

    // 默认显示黄色闪烁 (正在加载)
    indicator.innerHTML = `
        <span class="status-dot dot-yellow-pulse" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #eab308; box-shadow: 0 0 8px #eab308; animation: pulse 1.5s infinite;"></span>
    `;
    indicator.setAttribute("title", "正在探测大模型网关通信状态...");

    apiFetch("/api/system/llm/test")
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
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
                            indicator.setAttribute("title", `🟢 远端大模型网关已成功连通\n厂商：${data.provider}\n端点：${data.endpoint}\n模型：${displayModel}\n延时：${data.latency_ms} ms`);
                        });
                }
            } else {
                indicator.innerHTML = `
                    <span class="status-dot" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #ef4444; box-shadow: 0 0 8px #ef4444;"></span>
                `;
                indicator.setAttribute("title", `🔴 远端大模型网关连通失败\n错误：${data.message}`);
            }
        })
        .catch(err => {
            indicator.innerHTML = `
                <span class="status-dot" style="width: 12px; height: 12px; border-radius: 50%; display: inline-block; background-color: #ef4444; box-shadow: 0 0 8px #ef4444;"></span>
            `;
            indicator.setAttribute("title", `🔴 网关通信故障\n错误：${err.message}`);
        });
}

window.updateAIStatusIndicator = updateAIStatusIndicator;
