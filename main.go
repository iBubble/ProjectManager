package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"projectmanager/backend"
)

// DispatcherRequest 分流和动态路由解析器
func DispatcherRequest(w http.ResponseWriter, r *http.Request) {
	// 设置通用的安全相关的 HTTP 响应头 (Security Headers)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("X-XSS-Protection", "1; mode=block")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';")
	
	path := r.URL.Path

	// 1. 静态资源托管 (frontend/ 目录)
	if !strings.HasPrefix(path, "/api") {
		if path == "/" || path == "" || path == "/admin" {
			http.ServeFile(w, r, "frontend/index.html")
			return
		}
		// 检查前端文件是否存在
		staticPath := filepath.Join("frontend", path)
		if _, err := os.Stat(staticPath); err == nil {
			http.ServeFile(w, r, staticPath)
			return
		}
		// 默认单页路由回退
		http.ServeFile(w, r, "frontend/index.html")
		return
	}

	// 2. 身份验证接口
	switch path {
	case "/api/auth/login":
		backend.HandlerLogin(w, r)
		return
	case "/api/auth/logout":
		backend.HandlerLogout(w, r)
		return
	case "/api/auth/me":
		backend.HandlerAuthMe(w, r)
		return
	case "/api/projects":
		backend.HandlerProjects(w, r)
		return
	case "/api/alerts":
		backend.HandlerAlerts(w, r)
		return
	case "/api/audit-logs", "/api/audit/logs":
		backend.HandlerAuditLogs(w, r)
		return
	case "/api/system/config":
		backend.HandlerSystemConfig(w, r)
		return
	case "/api/system/users":
		if r.Method == "POST" {
			backend.HandlerCreateUser(w, r)
		} else {
			backend.HandlerSystemUsers(w, r)
		}
		return
	case "/api/projects/brief":
		backend.HandlerLedgerBrief(w, r)
		return
	case "/api/search":
		backend.HandlerSearch(w, r)
		return
	case "/api/system/stats":
		backend.HandlerSystemStats(w, r)
		return
	case "/api/system/learning-stats":
		backend.HandlerLearningStats(w, r)
		return
	case "/api/export":
		backend.HandlerExport(w, r)
		return
	case "/api/projects/batch-update":
		backend.HandlerBatchUpdateProjects(w, r)
		return
	case "/api/system/llm/test":
		backend.HandlerTestLLM(w, r)
		return
	}

	// 3. 动态 RESTful 路由拆解 (解析 /api/projects/:id 及子路由)
	if strings.HasPrefix(path, "/api/projects/") {
		parts := strings.Split(strings.Trim(path, "/"), "/") // [api projects :id ...]
		if len(parts) >= 3 {
			projectID := parts[2]

			// /api/projects/:id
			if len(parts) == 3 {
				backend.HandlerProjectDetails(w, r, projectID)
				return
			}

			// /api/projects/:id/files/compare
			if len(parts) == 5 && parts[3] == "files" && parts[4] == "compare" {
				backend.HandlerFileCompare(w, r, projectID)
				return
			}

			// /api/projects/:id/files
			if len(parts) == 4 && parts[3] == "files" {
				backend.HandlerProjectFiles(w, r, projectID)
				return
			}

			// /api/projects/:id/analyze
			if len(parts) == 4 && parts[3] == "analyze" {
				backend.HandlerProjectAnalyze(w, r, projectID)
				return
			}

			// /api/projects/:id/generate
			if len(parts) == 4 && parts[3] == "generate" {
				backend.HandlerProjectGenerate(w, r, projectID)
				return
			}

			// /api/projects/:id/chat
			if len(parts) == 4 && parts[3] == "chat" {
				backend.HandlerProjectChat(w, r, projectID)
				return
			}

			// /api/projects/:id/learn
			if len(parts) == 4 && parts[3] == "learn" {
				backend.HandlerProjectLearn(w, r, projectID)
				return
			}

			// /api/projects/:id/knowledge-graph
			if len(parts) == 4 && parts[3] == "knowledge-graph" {
				backend.HandlerProjectKnowledgeGraph(w, r, projectID)
				return
			}

			// /api/projects/:id/saved-docs
			if len(parts) == 4 && parts[3] == "saved-docs" {
				backend.HandlerSavedDocs(w, r, projectID)
				return
			}

			// /api/projects/:id/saved-docs/:docId
			if len(parts) == 5 && parts[3] == "saved-docs" {
				docID := parts[4]
				backend.HandlerSavedDocDetails(w, r, projectID, docID)
				return
			}

			// /api/projects/:id/files/:fileId 及子路由
			if len(parts) >= 5 && parts[3] == "files" {
				fileID := parts[4]
				if len(parts) == 6 && parts[5] == "download" {
					backend.HandlerFileDownload(w, r, projectID, fileID)
					return
				}
				if len(parts) == 6 && parts[5] == "summary" {
					backend.HandlerFileSummary(w, r, projectID, fileID)
					return
				}
				if len(parts) == 5 {
					// 支持删除文件
					backend.HandlerFileDelete(w, r, projectID, fileID)
					return
				}
			}
		}
	}

	// 4. 动态路由拆解 (解析 /api/alerts/:id/read)
	if strings.HasPrefix(path, "/api/alerts/") {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 4 && parts[3] == "read" {
			alertID := parts[2]
			backend.HandlerAlertRead(w, r, alertID)
			return
		}
	}

	// 5. 动态系统管理路由
	if strings.HasPrefix(path, "/api/system/users/") {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 5 && parts[4] == "reset-password" {
			username := parts[3]
			backend.HandlerUserResetPassword(w, r, username)
			return
		}
		if len(parts) == 4 {
			username := parts[3]
			if r.Method == "DELETE" {
				backend.HandlerDeleteUser(w, r, username)
				return
			}
			if r.Method == "PUT" {
				backend.HandlerUpdateUser(w, r, username)
				return
			}
		}
	}

	// 默认未匹配的 API 返回 404
	http.NotFound(w, r)
}

func main() {
	// 初始化目录结构
	_ = os.MkdirAll("data", 0755)
	_ = os.MkdirAll("data/uploads", 0700)
	_ = os.MkdirAll("static", 0755)

	// 初始化数据源及密码安全密钥
	db, err := backend.InitDB("data")
	if err != nil {
		log.Fatalf("无法加载系统JSON数据库: %v", err)
	}
	backend.InitializeKeys("data")
	backend.InitUploadDir("data/uploads")

	log.Printf("成功加载项目管理平台数据库，当前在办项目共: %d 个", len(db.Projects))

	// 单入口请求监听
	http.HandleFunc("/", DispatcherRequest)

	// 启动本地监听
	addr := "127.0.0.1:7897"
	log.Printf("[政务智管] 服务器正在监听: http://%s ...", addr)
	
	// 在测试/运行时保证只绑定本地 127.0.0.1 防止外部非授权连接，符合安全规范
	err = http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}
