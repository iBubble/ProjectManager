package backend

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Database 内存数据库结构，映射 data/database.json
type Database struct {
	mu           sync.RWMutex
	filePath     string
	Users        map[string]User         `json:"users"`        // username -> User
	Projects     map[string]Project      `json:"projects"`     // projectID -> Project
	Files        map[string]FileMetadata `json:"files"`        // fileID -> FileMetadata
	Alerts       map[string]Alert        `json:"alerts"`       // alertID -> Alert
	AuditLogs    []AuditLog              `json:"audit_logs"`   // 审计日志列表
	SystemConfig SystemConfig            `json:"system_config"`// 系统配置
}

var (
	GlobalDB *Database
	once     sync.Once
)

// InitDB 初始化数据库实例并加载数据
func InitDB(dbDir string) (*Database, error) {
	var err error
	once.Do(func() {
		if err = os.MkdirAll(dbDir, 0755); err != nil {
			return
		}
		path := filepath.Join(dbDir, "database.json")
		db := &Database{
			filePath: path,
			Users:    make(map[string]User),
			Projects: make(map[string]Project),
			Files:    make(map[string]FileMetadata),
			Alerts:   make(map[string]Alert),
		}

		if _, statErr := os.Stat(path); os.IsNotExist(statErr) {
			// 初始化预载演示数据
			db.loadDefaultData()
			err = db.Save()
		} else {
			err = db.load()
		}
		GlobalDB = db
	})
	return GlobalDB, err
}

// load 从本地JSON加载数据库
func (db *Database) load() error {
	db.mu.Lock()
	defer db.mu.Unlock()

	data, err := ioutil.ReadFile(db.filePath)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, db)
}

// Save 将数据库持久化到磁盘
func (db *Database) Save() error {
	db.mu.Lock()
	defer db.mu.Unlock()

	data, err := json.MarshalIndent(db, "", "  ")
	if err != nil {
		return err
	}

	return ioutil.WriteFile(db.filePath, data, 0644)
}

// loadDefaultData 载入默认的4个权限用户与3个演示项目档案
func (db *Database) loadDefaultData() {
	// 默认安全配置
	db.SystemConfig = SystemConfig{
		WatermarkText:   "政务内网安全审计",
		IPAllowList:     "127.0.0.1,localhost",
		FileAutoEncrypt: true,
		LLMProvider:     "mock",
	}

	// 1. 初始化四个权限级角色用户，超级管理员默认密码: admin123
	db.Users["admin"] = User{
		ID:           "u1",
		Username:     "admin",
		PasswordHash: HashPassword("admin123"),
		Role:         "super_admin",
		Name:         "张主任 (信息中心主任)",
		WechatID:     "wx_director_zhang",
	}
	db.Users["manager"] = User{
		ID:           "u2",
		Username:     "manager",
		PasswordHash: HashPassword("12345678"),
		Role:         "project_admin",
		Name:         "李科长 (项目管理员)",
		WechatID:     "wx_section_li",
	}
	db.Users["owner"] = User{
		ID:           "u3",
		Username:     "owner",
		PasswordHash: HashPassword("12345678"),
		Role:         "project_owner",
		Name:         "小王 (项目负责人)",
		WechatID:     "wx_owner_wang",
	}
	db.Users["leader"] = User{
		ID:           "u4",
		Username:     "leader",
		PasswordHash: HashPassword("12345678"),
		Role:         "reader",
		Name:         "赵局长 (分管领导)",
		WechatID:     "wx_leader_zhao",
	}

	nowStr := time.Now().Format("2006-01-02 15:04:05")

	// 2. 项目一: 政务云数据中心升级项目 (健康度: 95分 - 正常)
	p1ID := "p1"
	db.Projects[p1ID] = Project{
		ID:             p1ID,
		Name:           "政务云数据中心升级项目",
		ApprovalDocNum: "国发〔2026〕102号",
		Owner:          "小王 (项目负责人)",
		Budget:         12000000,
		ConstructionContent: "采购国产高性能服务器30台，高可用存储2套，完成政务外网核心网备份，并对物理机房环境温湿度及安防系统进行升级改造。",
		ConstructionPeriod:  12,
		ApprovedDuration:    365,
		FundingSource:       "区级财政信息化专项基金",
		AcceptanceStandard:  "设备全面上线稳定运行2周；数据备份丢包率小于0.01%；机房安防联动报警延迟低于1秒，且通过第三方等保测评。",
		Vendor:              "华夏信息云技术有限公司",
		WinAmount:           11500000,
		ServiceScope:        "提供服务器与存储设备供货、物理机房改造工程、核心网改造监理，以及3年的系统硬件维保服务。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "合同签订并提供履约保函后，支付首付款", Ratio: 30, Amount: 3450000, IsPaid: true, InvoiceFile: "inv_p1_01.pdf"},
			{NodeIndex: 2, Description: "全部硬件设备到货并完成初验后，支付进度款", Ratio: 40, Amount: 4600000, IsPaid: true, InvoiceFile: "inv_p1_02.pdf"},
			{NodeIndex: 3, Description: "项目整体终验合格且稳定运行半年后，支付尾款", Ratio: 30, Amount: 3450000, IsPaid: false},
		},
		CompletionTime: "2026-12-15",
		WarrantyPeriod: 36,
		ChangeTerms:    "任何追加变更金额均不得超过合同总价的 8%，且必须经由信息中心主任和区财政评审中心联合审批方可生效。",
		Stage:          "实施",
		Labels:         []string{"硬件采购", "机房改造"},
		HealthScore:    95,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{Status: "正常", DelayDays: 0, RiskLevel: "低", DelayReasons: []string{}},
			Finance:  ProjectFinance{PaidAmount: 8050000, UnpaidAmount: 3450000, IsOverBudget: false, IsOverPayment: false, MissingDocs: []string{}},
			Quality:  ProjectQuality{UnresolvedIssuesCount: 0, RepeatedFailures: []string{}, ImpactAcceptance: false},
			Change:   ProjectChange{HasChanges: false, ChangeDetails: []string{}, UnapprovedChanges: false, TotalChangeAmount: 0, IsOverGaisan: false},
		},
	}

	// 预载项目1的部分文件
	f1 := FileMetadata{ID: "f1_1", ProjectID: p1ID, FileName: "1.立项批复文件-政务云数据中心.pdf", SavedName: "f1_1_mock", FileSize: 1024000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-01-10 10:00:00", StageFolder: "立项", Hash: "hash1"}
	f2 := FileMetadata{ID: "f1_2", ProjectID: p1ID, FileName: "2.招标文件-政务云数据中心.pdf", SavedName: "f1_2_mock", FileSize: 2048000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-02-15 14:00:00", StageFolder: "招标", Hash: "hash2"}
	f3 := FileMetadata{ID: "f1_3", ProjectID: p1ID, FileName: "3.中标通知书-华夏信息云.pdf", SavedName: "f1_3_mock", FileSize: 512000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-03-05 09:30:00", StageFolder: "招标", Hash: "hash3"}
	f4 := FileMetadata{ID: "f1_4", ProjectID: p1ID, FileName: "4.采购合同-政务云数据中心.pdf", SavedName: "f1_4_mock", FileSize: 4096000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-03-20 16:00:00", StageFolder: "合同", Hash: "hash4"}
	f5 := FileMetadata{ID: "f1_5", ProjectID: p1ID, FileName: "5.硬件到货初验报告.pdf", SavedName: "f1_5_mock", FileSize: 1536000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-06-10 11:00:00", StageFolder: "实施", Hash: "hash5"}
	f6 := FileMetadata{ID: "f1_6", ProjectID: p1ID, FileName: "6.第一期付款凭证与发票.pdf", SavedName: "f1_6_mock", FileSize: 850000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-04-01 10:00:00", StageFolder: "过程", Hash: "hash6"}
	f7 := FileMetadata{ID: "f1_7", ProjectID: p1ID, FileName: "7.第二期付款凭证与发票.pdf", SavedName: "f1_7_mock", FileSize: 920000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-06-25 15:30:00", StageFolder: "过程", Hash: "hash7"}
	
	db.Files[f1.ID] = f1
	db.Files[f2.ID] = f2
	db.Files[f3.ID] = f3
	db.Files[f4.ID] = f4
	db.Files[f5.ID] = f5
	db.Files[f6.ID] = f6
	db.Files[f7.ID] = f7

	// 3. 项目二: 智慧城市运行指挥平台建设 (健康度: 72分 - 中度风险)
	p2ID := "p2"
	db.Projects[p2ID] = Project{
		ID:             p2ID,
		Name:           "智慧城市运行指挥平台建设",
		ApprovalDocNum: "市政办发〔2026〕44号",
		Owner:          "小王 (项目负责人)",
		Budget:         8000000,
		ConstructionContent: "开发集融合通信、视频调度、应急指挥、事件流转、多屏联动于一体的智慧城市运行可视化指挥平台，并适配接入多地市探头接口。",
		ConstructionPeriod:  8,
		ApprovedDuration:    240,
		FundingSource:       "市级智慧城市专项规划拨付资金",
		AcceptanceStandard:  "系统能够支持100路视频会议无卡顿，且完成安全漏洞修复，无中高级漏洞，具备健全的数据脱敏逻辑，测试用例覆盖率达80%以上并提供阶段测试报告。",
		Vendor:              "中科政务信息技术有限公司",
		WinAmount:           7800000,
		ServiceScope:        "前端页面设计开发、应急模块、GIS地图聚合中间件、监理月报及售后1年维保。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "合同签订后支付启动资金", Ratio: 20, Amount: 1560000, IsPaid: true, InvoiceFile: "inv_p2_01.pdf"},
			{NodeIndex: 2, Description: "系统核心功能开发完毕并通过阶段测试后，支付进度款", Ratio: 40, Amount: 3120000, IsPaid: true}, // 未提供测试报告，发票等，触发研判扣分
			{NodeIndex: 3, Description: "整体验收通过后支付尾款", Ratio: 40, Amount: 3120000, IsPaid: false},
		},
		CompletionTime: "2026-09-30",
		WarrantyPeriod: 12,
		ChangeTerms:    "变更需提前发起立项审核，超过合同金额5%的重大调整需重新开展需求评审并走补充合同报备程序。",
		Stage:          "实施",
		Labels:         []string{"软件开发", "政务平台建设"},
		HealthScore:    72,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{
				Status:       "滞后",
				DelayDays:    14,
				RiskLevel:    "中",
				DelayReasons: []string{"由于第三方接口迟迟未开放，开发进度已延期 14 天"},
			},
			Finance: ProjectFinance{
				PaidAmount:    4680000,
				UnpaidAmount:  3120000,
				IsOverBudget:  false,
				IsOverPayment: false,
				MissingDocs:   []string{"第二期进度款未上传阶段测试报告", "第二期进度款未见有效增值税发票"},
			},
			Quality: ProjectQuality{
				UnresolvedIssuesCount: 2,
				RepeatedFailures:      []string{"视频会商模块偶发掉线", "GIS聚合图层存在部分内存泄露"},
				ImpactAcceptance:      true,
			},
			Change: ProjectChange{
				HasChanges:        false,
				ChangeDetails:     []string{},
				UnapprovedChanges: false,
				TotalChangeAmount: 0,
				IsOverGaisan:      false,
			},
		},
		SavedDocs: []SavedDoc{
			{ID: "sd2_1", Title: "10.举报处理结果告知书_2026-07-03 15:37", Content: "市监举报告字〔2026〕第45号\n\n关于反映智慧城市会商系统存在数据泄露与偶发掉线情况的举报已调查完毕。\n经核实，我信息中心已督促承建方中科政务完成可视化图层内存泄漏补丁升级，项目整体工期依规顺延。", UpdatedAt: "2026-07-03 15:37:10", WordCount: 1136},
			{ID: "sd2_2", Title: "9.投诉调解书_2026-07-03 15:36", Content: "市监投诉调字〔2026〕第32号\n\n投诉人反映的视频会商模块偶发掉线一事，经我信息中心多方调解，各方达成如下协议：\n1. 承建方中科政务信息技术有限公司于10个工作日内免费放开接口协议联调；\n2. 监理单位加强对接入数据的安全等保审计。", UpdatedAt: "2026-07-03 15:36:18", WordCount: 4389},
			{ID: "sd2_3", Title: "4.限期提供身份证明材料通知书_2026-07-03 15:34", Content: "关于限期提供身份证明及企业资质材料的通知\n\n中科政务信息技术有限公司：\n在系统日常合规审计中，发现贵司未上传第二期进度款付款所需的阶段性测试报告与合法增值税发票。请在接到本通知起3日内予以补齐。", UpdatedAt: "2026-07-03 15:34:57", WordCount: 1365},
			{ID: "sd2_4", Title: "5.投诉受理决定书_2026-06-29 15:58", Content: "关于智慧城市可视化会商系统延期的投诉受理决定\n\n本级信息中心已正式受理有关开发工期延误的诉求，并经初步核实决定启动AI风险健康检查。我们将组织监理单位对第三方接口延迟开放的客观原因进行联合核实。", UpdatedAt: "2026-06-29 15:58:15", WordCount: 1281},
		},
	}

	// 预载项目2的部分文件
	f2_1 := FileMetadata{ID: "f2_1", ProjectID: p2ID, FileName: "1.立项批复-智慧城市运行平台.pdf", SavedName: "f2_1_mock", FileSize: 950000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-02-10 10:00:00", StageFolder: "立项", Hash: "h2_1"}
	f2_2 := FileMetadata{ID: "f2_2", ProjectID: p2ID, FileName: "2.招标文件-智慧城市可视化指挥.pdf", SavedName: "f2_2_mock", FileSize: 3100000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-03-01 11:00:00", StageFolder: "招标", Hash: "h2_2"}
	f2_3 := FileMetadata{ID: "f2_3", ProjectID: p2ID, FileName: "3.采购合同-智慧城市运行可视化平台.pdf", SavedName: "f2_3_mock", FileSize: 2200000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-03-25 10:00:00", StageFolder: "合同", Hash: "h2_3"}
	f2_4 := FileMetadata{ID: "f2_4", ProjectID: p2ID, FileName: "4.监理日志-第3周.txt", SavedName: "f2_4_mock", FileSize: 12000, FileType: "txt", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-07-10 14:00:00", StageFolder: "监理", Hash: "h2_4"}
	f2_5 := FileMetadata{ID: "f2_5", ProjectID: p2ID, FileName: "5.会议纪要-开发协调会.txt", SavedName: "f2_5_mock", FileSize: 8500, FileType: "txt", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-07-15 16:30:00", StageFolder: "过程", Hash: "h2_5"}
	
	db.Files[f2_1.ID] = f2_1
	db.Files[f2_2.ID] = f2_2
	db.Files[f2_3.ID] = f2_3
	db.Files[f2_4.ID] = f2_4
	db.Files[f2_5.ID] = f2_5

	// 4. 项目三: 电子政务外网骨干网升级项目 (健康度: 55分 - 高度风险)
	p3ID := "p3"
	db.Projects[p3ID] = Project{
		ID:             p3ID,
		Name:           "电子政务外网骨干网升级项目",
		ApprovalDocNum: "信中发〔2026〕8号",
		Owner:          "小王 (项目负责人)",
		Budget:         5000000,
		ConstructionContent: "对核心网络交换机和接入路由器进行全面国产替代升级，增加网闸隔离并扩容出口骨干带宽至 10Gbps，改善科室办公网络体验。",
		ConstructionPeriod:  4,
		ApprovedDuration:    120,
		FundingSource:       "本级预算信息化改造资金",
		AcceptanceStandard:  "所有改造边界网闸阻断率达100%，骨干带宽实测吞吐量不低于 9.5Gbps，新采购路由器具备完整的3层路由配置能力。",
		Vendor:              "神州网络系统集成有限公司",
		WinAmount:           4800000,
		ServiceScope:        "核心万兆路由交换设备采购、安装调测、光纤铺设及整体验收。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "合同生效且提交履约担保后支付预付款", Ratio: 30, Amount: 1440000, IsPaid: true, InvoiceFile: "inv_p3_01.pdf"},
			{NodeIndex: 2, Description: "竣工初验合格后支付进度款", Ratio: 50, Amount: 2400000, IsPaid: false},
			{NodeIndex: 3, Description: "质保期满1年且运行正常无违约情况后支付余款", Ratio: 20, Amount: 960000, IsPaid: false},
		},
		CompletionTime: "2026-07-15", // 当前时间为2026-07-20，意味着已逾期！
		WarrantyPeriod: 12,
		ChangeTerms:    "变更累计金额需在合同总额10%内。超10%属超概算，根据政府项目管理办法需重走招投标审核。",
		Stage:          "实施",
		Labels:         []string{"网络升级"},
		HealthScore:    55,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{
				Status:       "滞后",
				DelayDays:    5,
				RiskLevel:    "高",
				DelayReasons: []string{"合同约定竣工初验时间为2026-07-15，截至当前2026-07-20尚未进行初验申请，构成红色严重逾期"},
			},
			Finance: ProjectFinance{
				PaidAmount:    1440000,
				UnpaidAmount:  3360000,
				IsOverBudget:  false,
				IsOverPayment: false,
				MissingDocs:   []string{},
			},
			Quality: ProjectQuality{
				UnresolvedIssuesCount: 1,
				RepeatedFailures:      []string{"国产替换路由器丢包率偏高"},
				ImpactAcceptance:      true,
			},
			Change: ProjectChange{
				HasChanges:        true,
				ChangeDetails:     []string{"新增路由备用板卡和部分端口扩容"},
				UnapprovedChanges: true, // 无审批变更
				TotalChangeAmount: 800000, // 80万，超合同的10%
				IsOverGaisan:        true, // 80万/480万 = 16.7% > 10%
			},
		},
	}


	// 预载项目3的文件
	f3_1 := FileMetadata{ID: "f3_1", ProjectID: p3ID, FileName: "1.立项建议书-骨干网升级.pdf", SavedName: "f3_1_mock", FileSize: 1800000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-02-01 10:00:00", StageFolder: "立项", Hash: "h3_1"}
	f3_2 := FileMetadata{ID: "f3_2", ProjectID: p3ID, FileName: "2.中标通知书-神州网络.pdf", SavedName: "f3_2_mock", FileSize: 450000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-02-28 10:00:00", StageFolder: "招标", Hash: "h3_2"}
	f3_3 := FileMetadata{ID: "f3_3", ProjectID: p3ID, FileName: "3.采购合同-骨干网采购调测.pdf", SavedName: "f3_3_mock", FileSize: 1950000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-03-10 14:00:00", StageFolder: "合同", Hash: "h3_3"}
	f3_4 := FileMetadata{ID: "f3_4", ProjectID: p3ID, FileName: "4.骨干网补充协议-03.pdf", SavedName: "f3_4_mock", FileSize: 850000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-06-05 10:00:00", StageFolder: "合同", Hash: "h3_4"}
	db.Files[f3_1.ID] = f3_1
	db.Files[f3_2.ID] = f3_2
	db.Files[f3_3.ID] = f3_3
	db.Files[f3_4.ID] = f3_4

	// 5. 项目四: 一网通办便民服务小程序 (健康度: 88分 - 轻微缺陷)
	p4ID := "p4"
	db.Projects[p4ID] = Project{
		ID:             p4ID,
		Name:           "一网通办便民服务小程序",
		ApprovalDocNum: "信中发〔2026〕12号",
		Owner:          "小王 (项目负责人)",
		Budget:         2000000,
		ConstructionContent: "针对移动端政务办事场景，开发面向普通市民的一网通办微信小程序，支持线上社保查询、违章缴费和公积金自助提取。",
		ConstructionPeriod:  6,
		ApprovedDuration:    180,
		FundingSource:       "区县数字政务深化发展基金",
		AcceptanceStandard:  "应用在主流机型上滑动流畅，主要办事接口响应时间低于1.5秒，且通过安全性与兼容性评测。",
		Vendor:              "众联政务软件开发有限公司",
		WinAmount:           1900000,
		ServiceScope:        "小程序系统架构设计、核心API集成、UI界面美化及初验终验全套文档整理。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "合同签订后支付启动资金", Ratio: 30, Amount: 570000, IsPaid: true, InvoiceFile: "inv_p4_01.pdf"},
			{NodeIndex: 2, Description: "系统全面提报初验合格后支付进度款", Ratio: 50, Amount: 950000, IsPaid: true, InvoiceFile: "inv_p4_02.pdf"},
			{NodeIndex: 3, Description: "终验合格且运行半年后结清尾款", Ratio: 20, Amount: 380000, IsPaid: false},
		},
		CompletionTime: "2026-08-01",
		WarrantyPeriod: 12,
		ChangeTerms:    "严控无序变更，单次变更申请上限为2万元，累计变更金额不得突破合同额的5%。",
		Stage:          "验收",
		Labels:         []string{"软件开发", "政务平台建设"},
		HealthScore:    88,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{Status: "正常", DelayDays: 0, RiskLevel: "低"},
			Finance:  ProjectFinance{PaidAmount: 1520000, UnpaidAmount: 380000},
			Quality: ProjectQuality{
				UnresolvedIssuesCount: 1,
				RepeatedFailures:      []string{"部分用户反映老旧Android机型微信授权登录偶发超时限制"},
				ImpactAcceptance:      false,
			},
			Change: ProjectChange{HasChanges: false},
		},
	}
	f4_1 := FileMetadata{ID: "f4_1", ProjectID: p4ID, FileName: "1.立项批复文件-便民小程序.pdf", SavedName: "f4_1_mock", FileSize: 1100000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-02-15 10:00:00", StageFolder: "立项", Hash: "h4_1"}
	f4_2 := FileMetadata{ID: "f4_2", ProjectID: p4ID, FileName: "2.采购合同-一网通办小程序开发.pdf", SavedName: "f4_2_mock", FileSize: 2500000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-03-01 14:00:00", StageFolder: "合同", Hash: "h4_2"}
	f4_3 := FileMetadata{ID: "f4_3", ProjectID: p4ID, FileName: "3.初验测评合格报告-众联政务.pdf", SavedName: "f4_3_mock", FileSize: 3100000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-07-02 09:30:00", StageFolder: "验收", Hash: "h4_3"}
	db.Files[f4_1.ID] = f4_1
	db.Files[f4_2.ID] = f4_2
	db.Files[f4_3.ID] = f4_3

	// 6. 项目五: 数字政府网络安全大脑系统 (健康度: 100分 - 正常)
	p5ID := "p5"
	db.Projects[p5ID] = Project{
		ID:             p5ID,
		Name:           "数字政府网络安全大脑系统",
		ApprovalDocNum: "国发〔2026〕204号",
		Owner:          "李科长 (项目管理员)",
		Budget:         6000000,
		ConstructionContent: "构建全区一体化数字政府网络安全监测与联动处置大脑，支持主动防御、态势感知及内网流量威胁审计分析。",
		ConstructionPeriod:  10,
		ApprovedDuration:    300,
		FundingSource:       "国家数字政府安全统筹专项款",
		AcceptanceStandard:  "覆盖全区核心交换节点流量审计率达100%，具备微秒级威胁阻断响应时延，完成等保三级备案及测评。",
		Stage:          "合同",
		Labels:         []string{"网络升级", "软件开发"},
		HealthScore:    100,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{Status: "正常", RiskLevel: "低"},
			Finance:  ProjectFinance{PaidAmount: 0, UnpaidAmount: 6000000},
			Quality:  ProjectQuality{UnresolvedIssuesCount: 0},
			Change:   ProjectChange{HasChanges: false},
		},
	}
	f5_1 := FileMetadata{ID: "f5_1", ProjectID: p5ID, FileName: "1.立项批复与预算评审意见.pdf", SavedName: "f5_1_mock", FileSize: 4200000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-04-10 10:00:00", StageFolder: "立项", Hash: "h5_1"}
	db.Files[f5_1.ID] = f5_1

	// 7. 项目六: 政务数据备份一体机采购项目 (健康度: 98分 - 正常)
	p6ID := "p6"
	db.Projects[p6ID] = Project{
		ID:             p6ID,
		Name:           "政务数据备份一体机采购项目",
		ApprovalDocNum: "信中发〔2026〕15号",
		Owner:          "李科长 (项目管理员)",
		Budget:         1500000,
		ConstructionContent: "为确保核心业务数据库高可靠，采购高性能国产自主可控备份一体机2台，并配置数据同步增量备份授权软件。",
		ConstructionPeriod:  3,
		ApprovedDuration:    90,
		FundingSource:       "信息中心年度备用设备采购资金",
		AcceptanceStandard:  "一体机顺利通电上架，实现跨机房数据备份链路畅通，完成物理磁盘冗余阵列配置并出具厂商到货验收单。",
		Vendor:              "国产红星存储技术有限公司",
		WinAmount:           1450000,
		ServiceScope:        "提供备份一体机硬件供货、机架部署服务、数据灾备策略设计及3年质保支持。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "设备到货并完成安装调试后一次性付清90%", Ratio: 90, Amount: 1305000, IsPaid: false},
			{NodeIndex: 2, Description: "质保期届满1年后支付尾款10%", Ratio: 10, Amount: 145000, IsPaid: false},
		},
		Stage:          "招标",
		Labels:         []string{"硬件采购"},
		HealthScore:    98,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{Status: "正常", RiskLevel: "低"},
			Finance:  ProjectFinance{PaidAmount: 0, UnpaidAmount: 1450000},
			Quality:  ProjectQuality{UnresolvedIssuesCount: 0},
			Change:   ProjectChange{HasChanges: false},
		},
	}
	f6_1 := FileMetadata{ID: "f6_1", ProjectID: p6ID, FileName: "1.招标文件-备份一体机采购.pdf", SavedName: "f6_1_mock", FileSize: 1500000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-06-01 10:00:00", StageFolder: "招标", Hash: "h6_1"}
	f6_2 := FileMetadata{ID: "f6_2", ProjectID: p6ID, FileName: "2.中标通知书-红星存储.pdf", SavedName: "f6_2_mock", FileSize: 420000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-06-20 15:00:00", StageFolder: "招标", Hash: "h6_2"}
	db.Files[f6_1.ID] = f6_1
	db.Files[f6_2.ID] = f6_2

	// 8. 项目七: 区县融媒体大屏改造工程 (健康度: 92分 - 正常)
	p7ID := "p7"
	db.Projects[p7ID] = Project{
		ID:             p7ID,
		Name:           "区县融媒体大屏改造工程",
		ApprovalDocNum: "融媒字〔2026〕3号",
		Owner:          "张主任 (信息中心主任)",
		Budget:         3500000,
		ConstructionContent: "针对老旧演播大厅及监控指挥大屏进行小间距LED升级，更换分布式大屏中控调度主机，实现画面无缝切换和低延时分屏显示。",
		ConstructionPeriod:  5,
		ApprovedDuration:    150,
		FundingSource:       "宣传部融媒体改造专项基金",
		AcceptanceStandard:  "LED屏体无死点、坏点，分布式调度系统无画面畸变或声画不同步，通过电磁兼容及消防安全标准验收。",
		Vendor:              "视讯科技大屏系统有限公司",
		WinAmount:           3400000,
		ServiceScope:        "LED屏体采购安装、演播室中控系统集成、综合音响改造及售后2年全包维保。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "合同签订后支付预付款", Ratio: 30, Amount: 1020000, IsPaid: true, InvoiceFile: "inv_p7_01.pdf"},
			{NodeIndex: 2, Description: "屏体安装通电通过初验支付进度款", Ratio: 50, Amount: 1700000, IsPaid: true, InvoiceFile: "inv_p7_02.pdf"},
			{NodeIndex: 3, Description: "终验合格且运行满1年后支付尾款", Ratio: 20, Amount: 680000, IsPaid: true, InvoiceFile: "inv_p7_03.pdf"},
		},
		CompletionTime: "2026-01-10",
		WarrantyPeriod: 24,
		Stage:          "运维",
		Labels:         []string{"机房改造", "硬件采购"},
		HealthScore:    92,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{Status: "正常", RiskLevel: "低"},
			Finance:  ProjectFinance{PaidAmount: 3400000, UnpaidAmount: 0},
			Quality: ProjectQuality{
				UnresolvedIssuesCount: 0,
				RepeatedFailures:      []string{},
				ImpactAcceptance:      false,
			},
			Change: ProjectChange{HasChanges: false},
		},
	}
	f7_1 := FileMetadata{ID: "f7_1", ProjectID: p7ID, FileName: "1.大屏改造采购合同.pdf", SavedName: "f7_1_mock", FileSize: 2800000, FileType: "pdf", UploadedBy: "张主任 (信息中心主任)", UploadedAt: "2025-06-15 10:00:00", StageFolder: "合同", Hash: "h7_1"}
	f7_2 := FileMetadata{ID: "f7_2", ProjectID: p7ID, FileName: "2.项目整体验收鉴定书.pdf", SavedName: "f7_2_mock", FileSize: 1900000, FileType: "pdf", UploadedBy: "张主任 (信息中心主任)", UploadedAt: "2026-01-10 14:00:00", StageFolder: "验收", Hash: "h7_2"}
	db.Files[f7_1.ID] = f7_1
	db.Files[f7_2.ID] = f7_2

	// 9. 项目八: 数字乡村综合治理平台 (健康度: 100分 - 正常)
	p8ID := "p8"
	db.Projects[p8ID] = Project{
		ID:             p8ID,
		Name:           "数字乡村综合治理平台",
		ApprovalDocNum: "农基发〔2026〕5号",
		Owner:          "小王 (项目负责人)",
		Budget:         2800000,
		ConstructionContent: "面向乡村网格化治理需求，开发集网格上报、随手拍、智慧党建、村务公开及农产品电商推介于一体的综合治理云平台。",
		ConstructionPeriod:  8,
		ApprovedDuration:    240,
		FundingSource:       "省财政厅数字乡村建设专项补助",
		AcceptanceStandard:  "小程序端办事流转率达98%以上，符合政务云数据传输加密技术要求，具备用户数据防篡改、防窃取保护机制。",
		Stage:          "立项",
		Labels:         []string{"软件开发"},
		HealthScore:    100,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{Status: "正常", RiskLevel: "低"},
			Finance:  ProjectFinance{PaidAmount: 0, UnpaidAmount: 2800000},
			Quality:  ProjectQuality{UnresolvedIssuesCount: 0},
			Change:   ProjectChange{HasChanges: false},
		},
	}
	f8_1 := FileMetadata{ID: "f8_1", ProjectID: p8ID, FileName: "1.可行性研究批复与财政立项意见.pdf", SavedName: "f8_1_mock", FileSize: 2200000, FileType: "pdf", UploadedBy: "小王 (项目负责人)", UploadedAt: "2026-07-15 10:00:00", StageFolder: "立项", Hash: "h8_1"}
	db.Files[f8_1.ID] = f8_1

	// 10. 项目九: 政府外网接入交换机扩容服务 (健康度: 60分 - 中度风险)
	p9ID := "p9"
	db.Projects[p9ID] = Project{
		ID:             p9ID,
		Name:           "政府外网接入交换机扩容服务",
		ApprovalDocNum: "信中发〔2026〕22号",
		Owner:          "李科长 (项目管理员)",
		Budget:         4000000,
		ConstructionContent: "扩容改造多栋政府大楼接入交换机，实现千兆桌面上联至万兆骨干通道，提供冗余光纤链路联调及测试服务。",
		ConstructionPeriod:  5,
		ApprovedDuration:    150,
		FundingSource:       "信息中心基础网改造备用金",
		AcceptanceStandard:  "所有改造点桌面接入速率实测不低于900Mbps，万兆链路丢包率为0，核心日志上报无死锁。",
		Vendor:              "迅捷网络设备有限公司",
		WinAmount:           3800000,
		ServiceScope:        "提供100台千兆PoE交换机、200个万兆光模块采购及全网策略调优部署。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "合同生效支付首付款", Ratio: 30, Amount: 1140000, IsPaid: true, InvoiceFile: "inv_p9_01.pdf"},
			{NodeIndex: 2, Description: "硬件设备到场完成布线支付进度款", Ratio: 50, Amount: 1900000, IsPaid: true}, // 缺失发票，扣分
			{NodeIndex: 3, Description: "全网竣工验收合格支付尾款", Ratio: 20, Amount: 760000, IsPaid: false},
		},
		CompletionTime: "2026-10-15",
		WarrantyPeriod: 12,
		ChangeTerms:    "变更追加最高不可超合同额 10% 红线。",
		Stage:          "实施",
		Labels:         []string{"网络升级", "运维服务"},
		HealthScore:    60,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{Status: "正常", DelayDays: 0, RiskLevel: "低"},
			Finance: ProjectFinance{
				PaidAmount:    3040000,
				UnpaidAmount:  760000,
				IsOverBudget:  false,
				IsOverPayment: false,
				MissingDocs:   []string{"第二期进度款未见增值税发票，存在挂账隐患"},
			},
			Quality: ProjectQuality{
				UnresolvedIssuesCount: 0,
				RepeatedFailures:      []string{},
				ImpactAcceptance:      false,
			},
			Change: ProjectChange{
				HasChanges:        true,
				ChangeDetails:     []string{"因旧楼光纤老化增改铺设多模光纤"},
				UnapprovedChanges: true,
				TotalChangeAmount: 600000, // 60万，超过3.8M的10%
				IsOverGaisan:        true, // 超过10%
			},
		},
	}
	f9_1 := FileMetadata{ID: "f9_1", ProjectID: p9ID, FileName: "1.外网接入采购合同.pdf", SavedName: "f9_1_mock", FileSize: 1800000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-05-10 10:00:00", StageFolder: "合同", Hash: "h9_1"}
	f9_2 := FileMetadata{ID: "f9_2", ProjectID: p9ID, FileName: "2.交换机改造变更备忘录-01.pdf", SavedName: "f9_2_mock", FileSize: 450000, FileType: "pdf", UploadedBy: "李科长 (项目管理员)", UploadedAt: "2026-06-25 15:30:00", StageFolder: "合同", Hash: "h9_2"}
	db.Files[f9_1.ID] = f9_1
	db.Files[f9_2.ID] = f9_2

	// 11. 项目十: 信息中心年度办公设备租赁与运维服务 (健康度: 45分 - 高度风险)
	p10ID := "p10"
	db.Projects[p10ID] = Project{
		ID:             p10ID,
		Name:           "信息中心年度办公设备租赁与运维服务",
		ApprovalDocNum: "信中发〔2026〕2号",
		Owner:          "张主任 (信息中心主任)",
		Budget:         800000,
		ConstructionContent: "租赁信息中心各科室日常办公用电脑、多功能数码复印机、打印机，并提供全年的桌面IT软硬件运维包干技术支持。",
		ConstructionPeriod:  12,
		ApprovedDuration:    365,
		FundingSource:       "信息中心经常性公用经费",
		AcceptanceStandard:  "打印机和复印机月度故障率低于3次，日常桌面技术支持响应时效低于30分钟，月度满意度评分不低于90分。",
		Vendor:              "恒利办公设备租赁公司",
		WinAmount:           780000,
		ServiceScope:        "提供电脑与打印机设备租赁维护、局域网安全排障、机房例行巡检及耗材配送。",
		PaymentNodes: []PaymentNode{
			{NodeIndex: 1, Description: "第一季度服务费", Ratio: 25, Amount: 195000, IsPaid: true, InvoiceFile: "inv_p10_01.pdf"},
			{NodeIndex: 2, Description: "第二季度服务费", Ratio: 25, Amount: 195000, IsPaid: false}, // 逾期未付
			{NodeIndex: 3, Description: "第三季度服务费", Ratio: 25, Amount: 195000, IsPaid: false},
			{NodeIndex: 4, Description: "第四季度服务费", Ratio: 25, Amount: 195000, IsPaid: false},
		},
		CompletionTime: "2026-12-31",
		WarrantyPeriod: 0,
		Stage:          "运维",
		Labels:         []string{"运维服务"},
		HealthScore:    45,
		CreatedAt:      nowStr,
		HealthReport: HealthReportData{
			Progress: ProjectProgress{
				Status:       "滞后",
				DelayDays:    30,
				RiskLevel:    "高",
				DelayReasons: []string{"因第二季度租赁服务款逾期30天未付，供应商发起服务违约警告，运维工程师已暂停机房例行巡检与部分故障响应"},
			},
			Finance: ProjectFinance{
				PaidAmount:    195000,
				UnpaidAmount:  585000,
				IsOverBudget:  false,
				IsOverPayment: false,
				MissingDocs:   []string{"第二季度租赁款付款凭证及财务发票缺失，付款流程受阻"},
			},
			Quality: ProjectQuality{
				UnresolvedIssuesCount: 3,
				RepeatedFailures:      []string{"多科室反馈故障报修无人受理", "局域网打印机缺粉无法正常打印"},
				ImpactAcceptance:      true,
			},
			Change: ProjectChange{HasChanges: false},
		},
	}
	f10_1 := FileMetadata{ID: "f10_1", ProjectID: p10ID, FileName: "1.办公租赁服务合同.pdf", SavedName: "f10_1_mock", FileSize: 1200000, FileType: "pdf", UploadedBy: "张主任 (信息中心主任)", UploadedAt: "2026-01-05 10:00:00", StageFolder: "合同", Hash: "h10_1"}
	f10_2 := FileMetadata{ID: "f10_2", ProjectID: p10ID, FileName: "2.第一季度运维满意度测评表.xlsx", SavedName: "f10_2_mock", FileSize: 450000, FileType: "xlsx", UploadedBy: "张主任 (信息中心主任)", UploadedAt: "2026-04-01 10:00:00", StageFolder: "运维", Hash: "h10_2"}
	f10_3 := FileMetadata{ID: "f10_3", ProjectID: p10ID, FileName: "3.服务暂停告知函-恒利办公.pdf", SavedName: "f10_3_mock", FileSize: 620000, FileType: "pdf", UploadedBy: "张主任 (信息中心主任)", UploadedAt: "2026-07-15 11:00:00", StageFolder: "运维", Hash: "h10_3"}
	db.Files[f10_1.ID] = f10_1
	db.Files[f10_2.ID] = f10_2
	db.Files[f10_3.ID] = f10_3

	// 5. 预载初始预警记录
	db.Alerts["a1"] = Alert{
		ID:          "a1",
		ProjectID:   p2ID,
		ProjectName: "智慧城市运行指挥平台建设",
		Title:       "第二期进度款付款资料缺失",
		Message:     "大模型智能研判发现：您已申请支付第二期进度款，但系统内尚未上传关键的‘阶段测试报告’，存在财务审计不合规风险。",
		Severity:    "red",
		AlertType:   "risk_quality",
		TriggerDate: "2026-07-16",
		Status:      "unread",
	}

	db.Alerts["a2"] = Alert{
		ID:          "a2",
		ProjectID:   p3ID,
		ProjectName: "电子政务外网骨干网升级项目",
		Title:       "项目竣工初验严重超期",
		Message:     "截止当前日期2026-07-20，合同原定初验截止日期为2026-07-15已过期。请立即组织监理单位出具工期延误评估报告并提起延期审批流程。",
		Severity:    "red",
		AlertType:   "risk_delay",
		TriggerDate: "2026-07-16",
		Status:      "unread",
	}

	db.Alerts["a3"] = Alert{
		ID:          "a3",
		ProjectID:   p3ID,
		ProjectName: "电子政务外网骨干网升级项目",
		Title:       "变更违规超概算红线",
		Message:     "系统对比合同与‘骨干网补充协议-03.pdf’发现：变更金额累计80万元，占合同额 16.7%，超出 10% 限制，且目前缺少区财政评审中心联合批复文件。",
		Severity:    "red",
		AlertType:   "risk_change",
		TriggerDate: "2026-07-18",
		Status:      "unread",
	}

	db.Alerts["a4"] = Alert{
		ID:          "a4",
		ProjectID:   p1ID,
		ProjectName: "政务云数据中心升级项目",
		Title:       "项目保修期临近到期提醒",
		Message:     "温馨提示：项目质保节点预计下周到期。请提前联系华夏信息云技术有限公司确认资产移交清单及售后运维对接工作。",
		Severity:    "blue",
		AlertType:   "node_warranty",
		TriggerDate: "2026-07-20",
		Status:      "unread",
	}

	db.Alerts["a5"] = Alert{
		ID:          "a5",
		ProjectID:   p9ID,
		ProjectName: "政府外网接入交换机扩容服务",
		Title:       "变更超支导致审计警示",
		Message:     "大模型智能对比原外网接入合同与补充文件后计算得出：变更项目金额累加已超15%红线，突破概算金额限额，请尽快补齐相关评审纪要。",
		Severity:    "red",
		AlertType:   "risk_change",
		TriggerDate: "2026-07-19",
		Status:      "unread",
	}

	db.Alerts["a6"] = Alert{
		ID:          "a6",
		ProjectID:   p10ID,
		ProjectName: "信息中心年度办公设备租赁与运维服务",
		Title:       "运维服务停摆警报",
		Message:     "系统研判指出：由于租赁服务费未能足额按季度拨付（逾期30天），承建方恒利公司已发函宣告暂停运维服务并撤走工程师，造成各科室大范围IT报修停滞。",
		Severity:    "red",
		AlertType:   "risk_delay",
		TriggerDate: "2026-07-18",
		Status:      "unread",
	}

	// 6. 预载初始操作日志
	db.AuditLogs = append(db.AuditLogs, AuditLog{
		ID:        "log1",
		User:      "admin",
		Action:    "系统初始化",
		IP:        "127.0.0.1",
		Details:   "创建超级管理员 admin 并载入默认政务安全防护参数",
		CreatedAt: nowStr,
	})
	db.AuditLogs = append(db.AuditLogs, AuditLog{
		ID:        "log2",
		User:      "manager",
		Action:    "上传立项资料",
		IP:        "127.0.0.1",
		Details:   "上传文件 [1.立项批复文件-政务云数据中心.pdf]，AI自动识别归入【立项阶段】",
		CreatedAt: nowStr,
	})
}

// GetUser 获取指定用户
func (db *Database) GetUser(username string) (User, bool) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	u, ok := db.Users[username]
	return u, ok
}

// GetProject 获取项目详情
func (db *Database) GetProject(id string) (Project, bool) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	p, ok := db.Projects[id]
	return p, ok
}

// ListProjects 获取全部项目
func (db *Database) ListProjects() []Project {
	db.mu.RLock()
	defer db.mu.RUnlock()
	list := make([]Project, 0, len(db.Projects))
	for _, p := range db.Projects {
		list = append(list, p)
	}
	return list
}

// SaveProject 创建或修改项目并保存数据库
func (db *Database) SaveProject(p Project) error {
	db.mu.Lock()
	db.Projects[p.ID] = p
	db.mu.Unlock()
	return db.Save()
}

// DeleteProject 删除项目及其关联文件
func (db *Database) DeleteProject(projectID string) {
	db.mu.Lock()
	delete(db.Projects, projectID)
	// 删除关联文件
	for fid, f := range db.Files {
		if f.ProjectID == projectID {
			delete(db.Files, fid)
		}
	}
	// 删除关联预警
	for aid, a := range db.Alerts {
		if a.ProjectID == projectID {
			delete(db.Alerts, aid)
		}
	}
	db.mu.Unlock()
	_ = db.Save()
}

// SaveFile 保存文件元数据
func (db *Database) SaveFile(f FileMetadata) error {
	db.mu.Lock()
	db.Files[f.ID] = f
	db.mu.Unlock()
	return db.Save()
}

// ListFiles 获取项目的所有归档文件
func (db *Database) ListFiles(projID string) []FileMetadata {
	db.mu.RLock()
	defer db.mu.RUnlock()
	var list []FileMetadata
	for _, f := range db.Files {
		if f.ProjectID == projID {
			list = append(list, f)
		}
	}
	return list
}

// GetFileMetadata 获取单份文件元数据
func (db *Database) GetFileMetadata(fileID string) (FileMetadata, bool) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	f, ok := db.Files[fileID]
	return f, ok
}

// DeleteFile 从数据库中移除文件关联
func (db *Database) DeleteFile(fileID string) error {
	db.mu.Lock()
	delete(db.Files, fileID)
	db.mu.Unlock()
	return db.Save()
}

// ListAlerts 获取系统预警消息
func (db *Database) ListAlerts() []Alert {
	db.mu.RLock()
	defer db.mu.RUnlock()
	list := make([]Alert, 0, len(db.Alerts))
	for _, a := range db.Alerts {
		list = append(list, a)
	}
	return list
}

// SaveAlert 新增预警
func (db *Database) SaveAlert(a Alert) error {
	db.mu.Lock()
	db.Alerts[a.ID] = a
	db.mu.Unlock()
	return db.Save()
}

// AcknowledgeAlert 确认预警 (已阅回执)
func (db *Database) AcknowledgeAlert(id string, readBy string) error {
	db.mu.Lock()
	a, ok := db.Alerts[id]
	if !ok {
		db.mu.Unlock()
		return errors.New("预警记录未找到")
	}
	a.Status = "read"
	a.ReadBy = readBy
	a.ReadAt = time.Now().Format("2006-01-02 15:04:05")
	db.Alerts[id] = a
	db.mu.Unlock()
	return db.Save()
}

// AddAuditLog 记录一条安全审计日志
func (db *Database) AddAuditLog(user, action, ip, details string) error {
	db.mu.Lock()
	log := AuditLog{
		ID:        fmt.Sprintf("log_%d", time.Now().UnixNano()),
		User:      user,
		Action:    action,
		IP:        ip,
		Details:   details,
		CreatedAt: time.Now().Format("2006-01-02 15:04:05"),
	}
	db.AuditLogs = append([]AuditLog{log}, db.AuditLogs...) // 新日志插在最前
	db.mu.Unlock()
	return db.Save()
}

// ListAuditLogs 获取所有审计日志
func (db *Database) ListAuditLogs() []AuditLog {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.AuditLogs
}

// GetConfig 获取当前配置
func (db *Database) GetConfig() SystemConfig {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.SystemConfig
}

// SaveConfig 保存新配置
func (db *Database) SaveConfig(cfg SystemConfig) error {
	db.mu.Lock()
	db.SystemConfig = cfg
	db.mu.Unlock()
	return db.Save()
}
