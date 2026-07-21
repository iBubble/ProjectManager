// ==========================================================================
// 政务智管 - 用户认证与会话管理 (auth.js)
// ==========================================================================

function handleLogin(e) {
    if (e) e.preventDefault();

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
            
            showAppView();
        } else {
            let errMsg = data.error;
            if (!errMsg) {
                if (res.status === 401) {
                    errMsg = "账号或密码错误";
                } else if (res.status === 403) {
                    errMsg = "您无权访问或IP不在白名单内";
                } else {
                    errMsg = `服务器连接异常 (状态码: ${res.status})，请检查后端服务状态`;
                }
            }
            if (errorEl) errorEl.textContent = "❌ " + errMsg;
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
    try {
        sessionStorage.clear();
        localStorage.clear();
    } catch (e) {}

    fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
    }).finally(() => {
        window.location.href = "/index.html";
    });
}

function checkAuthAndInitHeader() {
    const savedSession = sessionStorage.getItem("currentSession") || localStorage.getItem("currentSession");
    const isLoggedIn = localStorage.getItem("isLoggedIn");

    if (isLoggedIn === "true" || savedSession) {
        if (savedSession) {
            try { currentSession = JSON.parse(savedSession); } catch(e){}
        }
        showAppView();
    } else {
        showLoginView();
    }

    apiFetch("/api/auth/me")
        .then(res => res.ok ? res.json() : null)
        .then(user => {
            if (user) {
                currentSession = user;
                sessionStorage.setItem("currentSession", JSON.stringify(user));
                localStorage.setItem("currentSession", JSON.stringify(user));
                localStorage.setItem("isLoggedIn", "true");
                showAppView();
            } else {
                sessionStorage.clear();
                localStorage.clear();
                showLoginView();
                if (!window.location.pathname.endsWith("index.html") && window.location.pathname !== "/") {
                    window.location.href = "/index.html";
                }
            }
        });
}

function showLoginView() {
    const loginBox = document.getElementById("login-container");
    const appBox = document.getElementById("app-container");
    if (loginBox) loginBox.classList.remove("hidden");
    if (appBox) appBox.classList.add("hidden");
}

function showAppView() {
    const loginBox = document.getElementById("login-container");
    const appBox = document.getElementById("app-container");
    if (loginBox) loginBox.classList.add("hidden");
    if (appBox) appBox.classList.remove("hidden");
    updateHeaderUserInfo();
    if (typeof applyWatermark === "function") {
        applyWatermark();
    }
    if (typeof loadProjectLedger === "function") {
        loadProjectLedger();
    }
}

function updateHeaderUserInfo() {
    if (!currentSession) return;
    const nameEl = document.getElementById("current-user-name");
    const roleEl = document.getElementById("current-user-role");
    if (nameEl) nameEl.textContent = currentSession.name || currentSession.username;
    if (roleEl) roleEl.textContent = formatRole(currentSession.role);
    if (typeof updateAIStatusIndicator === "function") {
        updateAIStatusIndicator();
    }
}

// 导出全局
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.checkAuthAndInitHeader = checkAuthAndInitHeader;
window.showLoginView = showLoginView;
window.showAppView = showAppView;
