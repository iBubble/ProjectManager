package backend

// User 包含用户信息及权限角色
type User struct {
	ID           string `json:"id"`            // 用户唯一标识
	Username     string `json:"username"`      // 用户名
	PasswordHash string `json:"password_hash"` // 密码哈希
	Role         string `json:"role"`          // 角色: super_admin (超管), project_admin (项目管理员), project_owner (项目负责人), reader (只读领导)
	Name         string `json:"name"`          // 姓名
	WechatID     string `json:"wechat_id"`     // 微信号 (模拟微信推送)
	IsDisabled   bool   `json:"is_disabled"`   // 账号状态: 是否被禁用
}

// PaymentNode 包含付款节点与比例
type PaymentNode struct {
	NodeIndex   int     `json:"node_index"`  // 节点序号
	Description string  `json:"description"` // 条件描述
	Ratio       float64 `json:"ratio"`       // 付款比例 (%)
	Amount      float64 `json:"amount"`      // 应付金额 (元)
	IsPaid      bool    `json:"is_paid"`     // 是否已支付
	InvoiceFile string  `json:"invoice_file"`// 关联发票文件名
}

// ProjectProgress 进度研判详情
type ProjectProgress struct {
	Status       string   `json:"status"`        // 进度状态: 正常 / 滞后
	DelayDays    int      `json:"delay_days"`    // 预计滞后天数
	RiskLevel    string   `json:"risk_level"`    // 进度风险等级: 低 / 中 / 高
	DelayReasons []string `json:"delay_reasons"` // 滞后原因
}

// ProjectFinance 资金研判详情
type ProjectFinance struct {
	PaidAmount    float64  `json:"paid_amount"`    // 已支付金额
	UnpaidAmount  float64  `json:"unpaid_amount"`  // 剩余未付金额
	IsOverBudget  bool     `json:"is_over_budget"`  // 是否超预算
	IsOverPayment bool     `json:"is_over_payment"` // 是否超合同支付
	MissingDocs   []string `json:"missing_docs"`   // 缺失的付款资料
}

// ProjectQuality 质量研判详情
type ProjectQuality struct {
	UnresolvedIssuesCount int      `json:"unresolved_issues_count"` // 未整改质量问题数
	RepeatedFailures      []string `json:"repeated_failures"`       // 重复出现的技术缺陷/故障
	ImpactAcceptance      bool     `json:"impact_acceptance"`       // 是否影响整体验收
}

// ProjectChange 变更研判详情
type ProjectChange struct {
	HasChanges           bool     `json:"has_changes"`             // 是否存在变更
	ChangeDetails        []string `json:"change_details"`          // 变更详情说明
	UnapprovedChanges    bool     `json:"unapproved_changes"`      // 是否有未经审批的违规变更
	TotalChangeAmount    float64  `json:"total_change_amount"`     // 变更累计金额
	IsOverGaisan         bool     `json:"is_over_gaisan"`          // 是否超概算红线 (变更累计额超过合同的10%)
}

// HealthReportData 项目健康度四大维度研判报告
type HealthReportData struct {
	Progress ProjectProgress `json:"progress"` // 进度研判
	Finance  ProjectFinance  `json:"finance"`  // 资金研判
	Quality  ProjectQuality  `json:"quality"`  // 质量研判
	Change   ProjectChange   `json:"change"`   // 变更研判
}

// SavedDoc 包含大模型生成或修改后保存的文书信息
type SavedDoc struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	UpdatedAt string `json:"updated_at"`
	WordCount int    `json:"word_count"`
}

// Project 包含信息化项目的完整信息
type Project struct {
	ID                  string           `json:"id"`                   // 项目UUID
	Name                string           `json:"name"`                 // 项目名称
	ApprovalDocNum      string           `json:"approval_doc_num"`     // 立项文号
	Owner               string           `json:"owner"`                // 项目负责人
	Budget              float64          `json:"budget"`               // 预算金额(元)
	ConstructionContent string           `json:"construction_content"` // 建设内容 (AI提取)
	ConstructionPeriod  int              `json:"construction_period"`  // 建设周期(月) (AI提取)
	ApprovedDuration    int              `json:"approved_duration"`    // 批复工期(天) (AI提取)
	FundingSource       string           `json:"funding_source"`       // 资金来源 (AI提取)
	AcceptanceStandard  string           `json:"acceptance_standard"`  // 验收标准 (AI提取)
	Vendor              string           `json:"vendor"`               // 中标单位 (AI提取)
	WinAmount           float64          `json:"win_amount"`           // 中标金额(元) (AI提取)
	ServiceScope        string           `json:"service_scope"`        // 服务范围 (AI提取)
	PaymentNodes        []PaymentNode    `json:"payment_nodes"`        // 付款节点与比例 (AI提取)
	CompletionTime      string           `json:"completion_time"`      // 竣工时间 (YYYY-MM-DD) (AI提取)
	WarrantyPeriod      int              `json:"warranty_period"`      // 质保期限(月) (AI提取)
	ChangeTerms         string           `json:"change_terms"`         // 变更约束条款 (AI提取)
	Stage               string           `json:"stage"`                // 当前阶段: 立项/招标/合同/实施/监理/过程/验收/运维
	Labels              []string         `json:"labels"`               // 分类标签
	HealthScore           int              `json:"health_score"`         // 健康度评分 (0-100)
	HealthReport          HealthReportData `json:"health_report"`        // 详细研判报告
	SavedDocs             []SavedDoc       `json:"saved_docs"`           // 编辑保存的公文列表
	KnowledgeGraph        ProjectKnowledgeGraph `json:"knowledge_graph"` // 项目知识图谱学习成果
	Chunks                []DocumentChunk       `json:"chunks"`          // 项目文档切片知识库
	CreatedAt             string           `json:"created_at"`
	StartDate             string           `json:"start_date"`             // 开始日期 (YYYY-MM-DD)
	PlannedCompletionDate string           `json:"planned_completion_date"` // 计划完工日期 (YYYY-MM-DD)
}

// DocumentChunk 智能文档语义切片
type DocumentChunk struct {
	ID          string `json:"id"`
	FileID      string `json:"file_id"`
	FileName    string `json:"file_name"`
	StageFolder string `json:"stage_folder"`
	ChunkIndex  int    `json:"chunk_index"`
	Content     string `json:"content"`    // 切片正文
	WordCount   int    `json:"word_count"` // 字符数
}

// KGEntity 知识图谱实体节点
type KGEntity struct {
	ID       string `json:"id"`
	Name     string `json:"name"`     // 实体名称 (如: 区发改委、中标单位、1200万元)
	Category string `json:"category"` // 实体类别: 单位 / 供应商 / 金额 / 时间 / 节点 / 法规 / 阶段
}

// KGRelation 知识图谱关系三元组 (Subject -> Relation -> Object)
type KGRelation struct {
	Source   string `json:"source"`   // 源实体 (Subject)
	Target   string `json:"target"`   // 目标实体 (Object)
	Relation string `json:"relation"` // 关系描述 (如: 批准立项、中标建设、约定期限、存在风险)
}

// ProjectKnowledgeGraph 项目整体智能图谱与学习结果
type ProjectKnowledgeGraph struct {
	Status      string       `json:"status"`       // 学习状态: unlearned (未学习) / learning (学习中) / learned (已学成)
	LearnedAt   string       `json:"learned_at"`   // 学习完成时间
	TotalChunks int          `json:"total_chunks"` // 提取的总切片数量
	Entities    []KGEntity   `json:"entities"`     // 实体节点集合
	Relations   []KGRelation `json:"relations"`    // 关系边集合
	Summary     string       `json:"summary"`      // 图谱全局分析摘要
}

// LLMCacheEntry 大模型通用持久化缓存条目 (RAG 对话、文件对比、工作简报等)
type LLMCacheEntry struct {
	Key         string `json:"key"`          // 缓存 Key (MD5)
	Content     string `json:"content"`      // 缓存生成的文本/JSON
	Model       string `json:"model"`        // 产生该结果的大模型名称
	ContextHash string `json:"context_hash"` // 对应的关联文件/上下文 Hash
	CreatedAt   string `json:"created_at"`   // 缓存创建时间
}

// FileMetadata 包含上传资料文件的元数据
type FileMetadata struct {
	ID           string `json:"id"`
	ProjectID    string `json:"project_id"`
	FileName     string `json:"file_name"`    // 原始文件名
	SavedName    string `json:"saved_name"`   // 磁盘加密存储的文件名 (UUID)
	FileSize     int64  `json:"file_size"`
	FileType     string `json:"file_type"`    // pdf/docx/xlsx/txt/png等
	UploadedBy   string `json:"uploaded_by"`
	UploadedAt   string `json:"uploaded_at"`
	StageFolder  string `json:"stage_folder"` // 对应的八个归档阶段
	Hash         string `json:"hash"`         // 文件sha256
	Summary      string `json:"summary"`      // 持久化缓存的 AI 摘要
	SummaryModel string `json:"summary_model"`// 产生摘要的大模型名称
	SummaryHash  string `json:"summary_hash"` // 产生摘要时的文件 Hash (用于自动判断是否失效)
}

// Alert 包含系统关键预警通知
type Alert struct {
	ID          string `json:"id"`
	ProjectID   string `json:"project_id"`
	ProjectName string `json:"project_name"`
	Title       string `json:"title"`
	Message     string `json:"message"`
	Severity    string `json:"severity"`    // blue (温馨), yellow (紧急), red (严重逾期/高风险)
	AlertType   string `json:"alert_type"`  // node_payment (付款), node_acceptance (验收), node_warranty (质保), risk_delay (进度滞后), risk_quality (质量隐患), risk_change (违规变更), risk_budget (预算超支)
	TriggerDate string `json:"trigger_date"`
	Status      string `json:"status"`      // unread, read
	ReadBy      string `json:"read_by"`     // 微信已阅人
	ReadAt      string `json:"read_at"`
}

// AuditLog 包含安全操作审计日志
type AuditLog struct {
	ID        string `json:"id"`
	User      string `json:"user"`
	Action    string `json:"action"` // 如: 上传文件, 下载文件, 登录, 导出台账, 风险研判
	IP        string `json:"ip"`
	Details   string `json:"details"`
	CreatedAt string `json:"created_at"`
}

// SystemConfig 包含系统管理安全及大模型配置
type SystemConfig struct {
	WatermarkText   string `json:"watermark_text"`    // 下载水印文本
	IPAllowList     string `json:"ip_allow_list"`     // 登录IP白名单 (半角逗号分隔)
	FileAutoEncrypt bool   `json:"file_auto_encrypt"` // 是否启用落盘加密
	LLMProvider     string `json:"llm_provider"`      // 大模型服务商 (mock/openai/ollama等)
	LLMAPIKey       string `json:"llm_api_key"`       // API Key
	LLMEndpoint     string `json:"llm_endpoint"`      // API Endpoint
	LLMModel        string `json:"llm_model"`         // 选中的大模型名称
}
