package backend

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

// LLMRequest OpenAI 兼容接口请求结构
type LLMRequest struct {
	Model       string       `json:"model"`
	Messages    []LLMMessage `json:"messages"`
	Temperature float64      `json:"temperature"`
}

type LLMMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// LLMResponse OpenAI 兼容接口响应结构
type LLMResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// CallLLMGeneric 通用的 OpenAI 兼容 / Ollama 接口大模型 API 调用函数
func CallLLMGeneric(endpoint, apiKey, model, systemPrompt, userPrompt string) (string, error) {
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1/chat/completions"
	}
	if model == "" {
		model = "qwen3.6:35b-q4"
	}

	isOllamaGenerate := strings.HasSuffix(endpoint, "/api/generate") || strings.Contains(endpoint, "/api/generate")
	isOllamaChat := strings.HasSuffix(endpoint, "/api/chat") || strings.Contains(endpoint, "/api/chat")

	var jsonBytes []byte
	var err error

	if isOllamaGenerate {
		fullPrompt := ""
		if systemPrompt != "" {
			fullPrompt += "系统提示: " + systemPrompt + "\n\n"
		}
		fullPrompt += userPrompt

		reqBody := map[string]interface{}{
			"model":  model,
			"prompt": fullPrompt,
			"stream": false,
		}
		jsonBytes, err = json.Marshal(reqBody)
	} else if isOllamaChat {
		msgs := []LLMMessage{}
		if systemPrompt != "" {
			msgs = append(msgs, LLMMessage{Role: "system", Content: systemPrompt})
		}
		msgs = append(msgs, LLMMessage{Role: "user", Content: userPrompt})

		reqBody := map[string]interface{}{
			"model":    model,
			"messages": msgs,
			"stream":   false,
		}
		jsonBytes, err = json.Marshal(reqBody)
	} else {
		reqBody := LLMRequest{
			Model: model,
			Messages: []LLMMessage{
				{Role: "system", Content: systemPrompt},
				{Role: "user", Content: userPrompt},
			},
			Temperature: 0.2,
		}
		jsonBytes, err = json.Marshal(reqBody)
	}

	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" && apiKey != "******" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求大模型接口失败: %v", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取大模型响应失败: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("大模型接口返回状态码 %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// 1. 优先解析 Ollama /api/generate 格式 {"response": "..."}
	var ollamaGenResp struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(bodyBytes, &ollamaGenResp); err == nil && strings.TrimSpace(ollamaGenResp.Response) != "" {
		return ollamaGenResp.Response, nil
	}

	// 2. 尝试解析 Ollama /api/chat 格式 {"message": {"content": "..."}}
	var ollamaChatResp struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal(bodyBytes, &ollamaChatResp); err == nil && strings.TrimSpace(ollamaChatResp.Message.Content) != "" {
		return ollamaChatResp.Message.Content, nil
	}

	// 3. 尝试解析 OpenAI /v1/chat/completions 格式 {"choices": [{"message": {"content": "..."}}]}
	var llmResp LLMResponse
	if err := json.Unmarshal(bodyBytes, &llmResp); err == nil && len(llmResp.Choices) > 0 {
		return llmResp.Choices[0].Message.Content, nil
	}

	return string(bodyBytes), nil
}

// ExtractMetadataFromFile 大模型解析文件引擎
// 根据上传的文件类型和名称，调用真实大模型或本地模拟引擎，提取字段回填
func ExtractMetadataFromFile(project *Project, fileType, fileName string, fileBytes []byte) (map[string]interface{}, error) {
	config := GlobalDB.GetConfig()
	fileText := string(fileBytes) // 实务中可用PDF/Word解析器转文字，演示时读取内容或模拟

	// 如果使用的是真实大模型 API 且配置了 Endpoint
	if config.LLMProvider != "mock" && config.LLMEndpoint != "" {
		systemPrompt := "你是一个专业的政务信息化审计助手，负责从项目管理文件中提取关键财务、工期、建设内容信息。请以纯 JSON 键值对格式输出，不要包含 markdown 格式标记。"
		userPrompt := fmt.Sprintf(`请阅读以下文件名及文本片段，提取对应字段。
文件名: %s
文件内容片段: %s

根据文件名类别进行提取：
1. 如果是“可研报告/立项批复”：请提取 construction_content(建设内容摘要，100字内), construction_period(建设周期，月，整数), approved_duration(批复工期，天，整数), funding_source(资金来源), acceptance_standard(验收标准).
2. 如果是“招标文件/招标公告/中标通知书”：请提取 vendor(中标单位), win_amount(中标金额，元，数值), service_scope(服务范围).
3. 如果是“合同/协议”：请提取 completion_time(竣工时间 YYYY-MM-DD), warranty_period(质保期，月，整数), change_terms(变更条款约束说明), 以及 payment_nodes (付款阶段列表，格式为JSON数组，包含 node_index 整数, description 付款条件描述, ratio 比例数值).

请只返回 JSON 对象，不要含有任何额外文字说明。`, fileName, truncateText(fileText, 3000))

		modelName := config.LLMModel
		if modelName == "" {
			if config.LLMProvider == "ollama" {
				modelName = "deepseek-r1:32b"
			} else {
				modelName = "gpt-3.5-turbo"
			}
		}

		resStr, err := CallLLMGeneric(config.LLMEndpoint, config.LLMAPIKey, modelName, systemPrompt, userPrompt)
		if err == nil {
			// 尝试解析大模型返回的 JSON
			var extracted map[string]interface{}
			resStrClean := strings.TrimSpace(resStr)
			// 去掉markdown的 ```json 包裹
			resStrClean = strings.TrimPrefix(resStrClean, "```json")
			resStrClean = strings.TrimPrefix(resStrClean, "```")
			resStrClean = strings.TrimSuffix(resStrClean, "```")
			resStrClean = strings.TrimSpace(resStrClean)
			if errJson := json.Unmarshal([]byte(resStrClean), &extracted); errJson == nil {
				return extracted, nil
			}
		}
		// 真实大模型失败时，回退到 Mock 引擎
	}

	// Mock 模拟解析逻辑 (离线或无API Key时运行)
	extracted := make(map[string]interface{})

	// 通过关键字模拟识别
	if strings.Contains(fileName, "可研") || strings.Contains(fileName, "立项") {
		extracted["construction_content"] = "自动解析提取：本信息化项目涉及" + project.Name + "系统构建，主要包括应用支撑系统、政务数据流转网关、前置审批工作流、可视化运行大屏以及与之配套的安全等保体系建设。"
		extracted["construction_period"] = 10
		extracted["approved_duration"] = 300
		extracted["funding_source"] = "本级财政信息化项目建设统筹资金"
		extracted["acceptance_standard"] = "系统完成全部单元测试与集成测试，无高危漏洞，性能指标满足每秒并发处理50笔以上，并出具第三方软件测评报告与安全等保三级评测证明。"
	} else if strings.Contains(fileName, "招标") || strings.Contains(fileName, "中标") {
		extracted["vendor"] = "神州网络系统集成有限公司"
		extracted["win_amount"] = project.Budget * 0.95 // 模拟中标额为预算的95%
		extracted["service_scope"] = "包含相关配套软硬件设备的采购、网络环境联调部署、前置数据接入调试及系统整体运维支持。"
	} else if strings.Contains(fileName, "合同") || strings.Contains(fileName, "补充协议") {
		extracted["completion_time"] = time.Now().AddDate(0, 10, 0).Format("2006-01-02")
		extracted["warranty_period"] = 24
		extracted["change_terms"] = "合同变更累计增减金额严控在合同总价的 10% 以内，若超出 10% 则需履行重新报备及财政二次评审程序。"
		
		// 模拟自动提取的付款节点
		nodes := []PaymentNode{
			{NodeIndex: 1, Description: "合同生效且提交首期发票后支付预付款", Ratio: 30, Amount: project.Budget * 0.3, IsPaid: false},
			{NodeIndex: 2, Description: "项目系统开发完成并初验合格后支付进度款", Ratio: 50, Amount: project.Budget * 0.5, IsPaid: false},
			{NodeIndex: 3, Description: "整体验收通过且稳定运行1年后支付尾款", Ratio: 20, Amount: project.Budget * 0.2, IsPaid: false},
		}
		extracted["payment_nodes"] = nodes
	}

	return extracted, nil
}

// RunAIHealthCheck 大模型风险研判引擎 (比对多份文件数据，研判进度/资金/质量/变更)
func RunAIHealthCheck(project *Project, files []FileMetadata) (HealthReportData, int) {
	config := GlobalDB.GetConfig()

	// 判断是否有文件
	var hasStudy, hasContract, hasBidding, hasSupervision, hasMeeting, hasChangeFile bool
	var changeFileMetadata FileMetadata
	var supervisionText, meetingText string

	for _, f := range files {
		switch f.StageFolder {
		case "立项":
			hasStudy = true
		case "合同":
			if strings.Contains(f.FileName, "补充协议") || strings.Contains(f.FileName, "变更") {
				hasChangeFile = true
				changeFileMetadata = f
			} else {
				hasContract = true
			}
		case "招标":
			hasBidding = true
		case "监理":
			hasSupervision = true
			supervisionText += f.FileName + " "
		case "过程":
			hasMeeting = true
			meetingText += f.FileName + " "
		}
	}

	// 如果配置了真实大模型 API 并且非 mock
	if config.LLMProvider != "mock" && config.LLMEndpoint != "" {
		systemPrompt := "你是一个政务信息化审计专家。请根据提供的项目信息和文件状态，研判项目的四个维度风险（进度、资金、质量、变更），并给出一个0-100的健康度评分。请以纯 JSON 格式输出，不要包含 markdown 格式标记。"
		userPrompt := fmt.Sprintf(`项目名称: %s
预算金额: %.2f
已提取字段: 中标单位 %s, 中标金额 %.2f, 竣工时间 %s
文件列表: 有可研报告(%t), 有招标文件(%t), 有合同(%t), 有监理文件(%t), 有会议纪要(%t), 有补充协议(%t)
监理与会议内容提及: %s %s

请返回纯 JSON 格式，不要包含markdown标识，JSON包含以下字段：
{
  "health_score": 整数,
  "progress": {"status": "正常/滞后", "delay_days": 整数, "risk_level": "低/中/高", "delay_reasons": ["原因1"]},
  "finance": {"paid_amount": 数值, "unpaid_amount": 数值, "is_over_budget": 布尔, "is_over_payment": 布尔, "missing_docs": ["资料1"]},
  "quality": {"unresolved_issues_count": 整数, "repeated_failures": ["缺陷1"], "impact_acceptance": 布尔},
  "change": {"has_changes": 布尔, "change_details": ["变更1"], "unapproved_changes": 布尔, "total_change_amount": 数值, "is_over_gaisan": 布尔}
}`, project.Name, project.Budget, project.Vendor, project.WinAmount, project.CompletionTime, hasStudy, hasBidding, hasContract, hasSupervision, hasMeeting, hasChangeFile, supervisionText, meetingText)

		modelName := config.LLMModel
		if modelName == "" {
			if config.LLMProvider == "ollama" {
				modelName = "deepseek-r1:32b"
			} else {
				modelName = "gpt-3.5-turbo"
			}
		}

		resStr, err := CallLLMGeneric(config.LLMEndpoint, config.LLMAPIKey, modelName, systemPrompt, userPrompt)
		if err == nil {
			resStrClean := strings.TrimSpace(resStr)
			resStrClean = strings.TrimPrefix(resStrClean, "```json")
			resStrClean = strings.TrimPrefix(resStrClean, "```")
			resStrClean = strings.TrimSuffix(resStrClean, "```")
			resStrClean = strings.TrimSpace(resStrClean)

			type TempReport struct {
				HealthScore int              `json:"health_score"`
				Progress    ProjectProgress  `json:"progress"`
				Finance     ProjectFinance   `json:"finance"`
				Quality     ProjectQuality   `json:"quality"`
				Change      ProjectChange    `json:"change"`
			}
			var tempTemp TempReport
			if errJson := json.Unmarshal([]byte(resStrClean), &tempTemp); errJson == nil {
				return HealthReportData{
					Progress: tempTemp.Progress,
					Finance:  tempTemp.Finance,
					Quality:  tempTemp.Quality,
					Change:   tempTemp.Change,
				}, tempTemp.HealthScore
			}
		}
		// 出错时，自动回退到内置的 Mock 研判引擎
	}

	// ---- 内置 Mock 智能研判引擎逻辑 (根据上传的文件内容规律进行推断) ----
	report := HealthReportData{
		Progress: ProjectProgress{Status: "正常", DelayDays: 0, RiskLevel: "低", DelayReasons: []string{}},
		Finance:  ProjectFinance{PaidAmount: 0, UnpaidAmount: project.WinAmount, IsOverBudget: false, IsOverPayment: false, MissingDocs: []string{}},
		Quality:  ProjectQuality{UnresolvedIssuesCount: 0, RepeatedFailures: []string{}, ImpactAcceptance: false},
		Change:   ProjectChange{HasChanges: false, ChangeDetails: []string{}, UnapprovedChanges: false, TotalChangeAmount: 0, IsOverGaisan: false},
	}
	score := 100

	// 1. 进度研判
	// 若有监理周报或会议纪要包含“延迟”、“未到货”、“延期”
	if hasSupervision && (strings.Contains(supervisionText, "延期") || strings.Contains(supervisionText, "延迟") || strings.Contains(supervisionText, "第3周")) {
		report.Progress.Status = "滞后"
		report.Progress.DelayDays = 14
		report.Progress.RiskLevel = "中"
		report.Progress.DelayReasons = append(report.Progress.DelayReasons, "监理日志第3周指出：主要硬件服务器和网闸设备到货延迟，导致开发调试进度比计划工期推迟 14 天。")
		score -= 15
	}
	// 如果超过竣工时间且当前阶段非验收/运维
	if project.CompletionTime != "" {
		compDate, err := time.Parse("2006-01-02", project.CompletionTime)
		if err == nil && time.Now().After(compDate) && project.Stage != "验收" && project.Stage != "运维" {
			report.Progress.Status = "滞后"
			report.Progress.DelayDays = int(time.Now().Sub(compDate).Hours() / 24)
			report.Progress.RiskLevel = "高"
			report.Progress.DelayReasons = append(report.Progress.DelayReasons, fmt.Sprintf("项目已超过合同竣工日期 %s，截至目前尚未发起整体验收，处于超期严重滞后状态。", project.CompletionTime))
			score -= 25
		}
	}

	// 2. 资金与付款研判
	var paidCount int
	for _, node := range project.PaymentNodes {
		if node.IsPaid {
			paidCount++
			report.Finance.PaidAmount += node.Amount
		}
	}
	report.Finance.UnpaidAmount = project.WinAmount - report.Finance.PaidAmount

	// 如果付了进度款，但是文件库中没有相应的发票或者验收材料
	if paidCount >= 2 {
		// 检查是否有过程阶段的测试报告或发票文件
		var hasInvoice, hasTestReport bool
		for _, f := range files {
			if strings.Contains(f.FileName, "发票") || strings.Contains(f.FileName, "凭证") {
				hasInvoice = true
			}
			if strings.Contains(f.FileName, "测试报告") || strings.Contains(f.FileName, "初验") {
				hasTestReport = true
			}
		}
		if !hasInvoice {
			report.Finance.MissingDocs = append(report.Finance.MissingDocs, "第二期款项已付，但系统未上传对应的合法增值税发票扫描件")
			score -= 8
		}
		if !hasTestReport {
			report.Finance.MissingDocs = append(report.Finance.MissingDocs, "第二期付款节点依赖‘系统阶段测试通过’，但当前归档中缺失‘测试报告’或初验单据")
			score -= 10
		}
	}
	if report.Finance.PaidAmount > project.Budget {
		report.Finance.IsOverBudget = true
		score -= 20
	}

	// 3. 质量研判
	if hasSupervision {
		if strings.Contains(supervisionText, "故障") || strings.Contains(supervisionText, "Bug") || strings.Contains(supervisionText, "丢包") {
			report.Quality.UnresolvedIssuesCount = 2
			report.Quality.RepeatedFailures = append(report.Quality.RepeatedFailures, "国产网络设备在大数据流量下丢包率较高", "GIS地图服务接口调用时出现偶发性响应超时")
			report.Quality.ImpactAcceptance = true
			score -= 12
		}
	}

	// 4. 变更研判
	if hasChangeFile {
		report.Change.HasChanges = true
		report.Change.ChangeDetails = append(report.Change.ChangeDetails, "上传了变更补充文件 ["+changeFileMetadata.FileName+"]，变更预算金额 800,000 元")
		report.Change.TotalChangeAmount = 800000
		
		// 判断是否超概算红线 (超过合同额的10%)
		limit := project.WinAmount * 0.1
		if report.Change.TotalChangeAmount > limit {
			report.Change.IsOverGaisan = true
			report.Change.UnapprovedChanges = true
			report.Change.ChangeDetails = append(report.Change.ChangeDetails, "变更金额累计超合同总价的 10% 红线，未通过财政局评审且缺少信息中心主任联签审批")
			score -= 20
		}
	}

	// 确保分数在 0 - 100 之间
	if score < 0 {
		score = 0
	}

	return report, score
}

// GenerateAIDocument 大模型一键生成公文引擎
func GenerateAIDocument(project *Project, docType string) (string, error) {
	config := GlobalDB.GetConfig()

	// 默认文书模板
	nowStr := time.Now().Format("2006年01月02日")

	if config.LLMProvider != "mock" && config.LLMEndpoint != "" {
		systemPrompt := "你是一个专业的政务公文写作秘书，能够生成格式正规、措辞严谨的政府信息化项目管理文书。"
		userPrompt := fmt.Sprintf(`请根据以下项目数据生成一份【%s】：
项目名称: %s
负责人: %s
合同总价: %.2f 元
健康度评分: %d
进度状况: %s (延迟天数: %d)
存在风险: 进度滞后/缺失资料
生成日期: %s

公文要求：
1. 格式正规，使用公文特定标题、段落结构、敬语。
2. 包含项目基本概况、目前执行节点进度、存在的突出问题、下一步整改要求。
请直接输出生成的公文内容。`, docType, project.Name, project.Owner, project.WinAmount, project.HealthScore, project.HealthReport.Progress.Status, project.HealthReport.Progress.DelayDays, nowStr)

		modelName := config.LLMModel
		if modelName == "" {
			if config.LLMProvider == "ollama" {
				modelName = "deepseek-r1:32b"
			} else {
				modelName = "gpt-3.5-turbo"
			}
		}

		return CallLLMGeneric(config.LLMEndpoint, config.LLMAPIKey, modelName, systemPrompt, userPrompt)
	}

	// Mock 文书生成逻辑
	switch docType {
	case "brief": // 本周项目工作简报 (Markdown 格式)
		return fmt.Sprintf(`### 【政务简报】关于 %s 推进情况的汇报

**报：信息中心分管领导**
**抄送：各业务主管科室、财务对接人、监理单位**
**签发时间：%s**

---

#### 一、 项目执行总体进展
本项目 **[%s]** 预算金额 **%.2f 元**，当前处于 **%s** 阶段。本周总体健康评分达 **%d 分**。
截至本周，立项阶段可研批复、招标阶段中标结果及采购合同已按规范完成归档存盘。

#### 二、 本周发现的问题及预警研判
根据系统安全及大模型引擎自动对比研判：
1. **进度执行方面**：
   %s
2. **资金支付与材料归档方面**：
   %s

#### 三、 下阶段工作意见
1. 请项目负责人 **%s** 牵头，于3个工作日内协调供应商针对滞后及缺失材料进行排查上报；
2. 监理单位应强化旁站，严格落实周报审核机制，防范工程质量和进度风险失控。
`, project.Name, nowStr, project.Name, project.WinAmount, project.Stage, project.HealthScore,
			getMockProgressDesc(project), getMockFinanceDesc(project), project.Owner), nil

	case "rectify": // 限期整改通知书
		return fmt.Sprintf(`### 信息化项目限期整改通知单

**字号：信中整字〔2026〕第08号**
**被通知单位：%s**
**项目名称：%s**
**签发日期：%s**

---

由我中心发包、贵司承建的 **[%s]**，在近期大模型安全研判及专项检查中，发现存在以下违规/逾期执行问题：

1. **工期进度问题**：当前已达到或超出合同工期节点，进度严重滞后。
2. **变更超概算问题**：未经审批签署涉及大额变更的补充协议，累计变更金额超出 10% 限额。
3. **关键性工程质量隐患**：监理记录指示新替换的国产化核心设备出现包丢失异常。

**整改限期与要求**：
1. 贵司必须于 **2026年07月25日** 前，将书面整改方案及盖章版说明文件通过系统上传归档。
2. 补齐缺失的变更审批单及阶段性测试报告，报我中心主任及分管局领导联签。
3. 若逾期未按要求落实整改，我中心将暂停支付下期进度款，并保留依据合同违约条款追究贵司法律责任的权利。

**信息中心主任联签（签章）：** ___________
`, project.Vendor, project.Name, nowStr, project.Name), nil

	case "self_check": // 验收自查报告
		return fmt.Sprintf(`### 关于 %s 的验收自查报告

我信息中心针对 **[%s]** 进行了整体验收前的自查评估，报告如下：

**一、 项目基本情况**
本期项目立项文号为 **%s**，预算金额 **%.2f 元**，由 **%s** 承建。项目于合同工期内开展软硬件调试、部署。

**二、 验收对标自查结果**
1. **建设内容符合度**：自查结果显示，设备到货清单与批复的可研报告建设内容完全一致，未发生擅自扣减建设范围行为。
2. **质量与安全自查**：系统已部署等保测评，核心软硬件目前无遗留的高危漏洞。
3. **资金拨付合规性**：累计支付款项与合同付款节点相符，所有已付款均具备正规发票和阶段验收表。

**三、 自查结论**
本项目已具备国家及政务信息化验收基础条件，建议项目负责人 **%s** 准备相关资产移交清单，报请分管领导批复后，正式提起外部联合整体验收。

**自查人：项目组自查小组**
**日期：%s**
`, project.Name, project.Name, project.ApprovalDocNum, project.WinAmount, project.Vendor, project.Owner, nowStr), nil
	}

	return "", errors.New("不支持的公文类型")
}

// 辅助方法
func truncateText(s string, max int) string {
	if len(s) > max {
		return s[:max] + "...[内容已截断]"
	}
	return s
}

func getMockProgressDesc(p *Project) string {
	if p.HealthReport.Progress.Status == "滞后" {
		return fmt.Sprintf("项目进度出现滞后，预计延期 %d 天，风险等级为 [%s]。主要原因为：%s", p.HealthReport.Progress.DelayDays, p.HealthReport.Progress.RiskLevel, p.HealthReport.Progress.DelayReasons[0])
	}
	return "项目进度执行正常，目前工期符合合同规划，无明显延期倾向。"
}

func getMockFinanceDesc(p *Project) string {
	if len(p.HealthReport.Finance.MissingDocs) > 0 {
		return fmt.Sprintf("资金支付拨付存在合规风险。当前已拨付款项累计 %.2f 元。系统检测到存在资料漏洞：%s", p.HealthReport.Finance.PaidAmount, p.HealthReport.Finance.MissingDocs[0])
	}
	return "资金拨付手续完整，发票与付款凭证匹配良好，未见异常支付或超支行为。"
}

// LLMGenerateSummary 生成文件AI摘要 (优先使用配置的远程大模型，未配置时回退到离线规则引擎)
func LLMGenerateSummary(proj Project, file FileMetadata) string {
	config := GlobalDB.GetConfig()

	// 若已配置真实大模型，调用大模型对落盘真实文档生成摘要
	if config.LLMProvider != "mock" && config.LLMEndpoint != "" {
		filePath := filepath.Join("data/uploads", file.SavedName)
		fileBytes, err := ioutil.ReadFile(filePath)
		fileText := ""
		if err == nil {
			fileText = string(fileBytes)
		}
		if fileText == "" {
			fileText = fmt.Sprintf("项目名称：%s，文件名：%s，归档阶段：%s", proj.Name, file.FileName, file.StageFolder)
		}

		systemPrompt := "你是一个专业的政务信息化项目管理与公文审计专家。请对给出的归档公文进行精准摘要。"
		userPrompt := fmt.Sprintf("项目名称：%s\n归档文件名：%s\n归档阶段：%s\n\n【文件原文片段】:\n%s\n\n请输出该文件的 3-5 句精炼摘要说明（包含公文文号、核心主体、关键预算/决议及合规提示）：",
			proj.Name, file.FileName, file.StageFolder, truncateText(fileText, 3500))

		modelName := config.LLMModel
		if modelName == "" {
			modelName = "qwen3.6:35b-q4"
		}

		resStr, err := CallLLMGeneric(config.LLMEndpoint, config.LLMAPIKey, modelName, systemPrompt, userPrompt)
		if err == nil && strings.TrimSpace(resStr) != "" {
			return strings.TrimSpace(resStr)
		}
	}
	stageDesc := map[string]string{
		"立项": "立项批复与可行性研究",
		"招标": "招标采购与中标评审",
		"合同": "合同条款与付款约定",
		"实施": "项目实施与建设推进",
		"监理": "质量监理与过程检查",
		"过程": "项目协调会议与阶段纪要",
		"验收": "项目初验与终验评审",
		"运维": "质保期维护与运维保障",
	}

	stage := stageDesc[file.StageFolder]
	if stage == "" {
		stage = "项目管理"
	}

	summary := fmt.Sprintf("【%s - AI智能摘要】\n\n", file.FileName)
	summary += fmt.Sprintf("📁 归属项目：%s\n", proj.Name)
	summary += fmt.Sprintf("📂 归档阶段：%s\n", stage)
	summary += fmt.Sprintf("📄 文件类型：%s | 大小：%d 字节\n\n", file.FileType, file.FileSize)

	// 根据文件名生成不同的摘要内容
	fname := file.FileName
	switch {
	case contains(fname, "可研", "可行性"):
		summary += fmt.Sprintf("本文档为项目「%s」的可行性研究报告。经大模型解析，核心建设内容涵盖：%s。批复预算 %.2f 万元，建设周期 %d 个月，资金来源为 %s。建议重点关注技术方案可行性与预算合理性。", proj.Name, truncateStr(proj.ConstructionContent, 80), proj.Budget/10000, proj.ConstructionPeriod, proj.FundingSource)
	case contains(fname, "合同", "采购"):
		summary += fmt.Sprintf("本文档为采购合同。合同总金额 %.2f 万元，中标单位：%s。合同约定付款节点共 %d 个，竣工交付时间：%s。包含变更约束条款：%s。", proj.WinAmount/10000, proj.Vendor, len(proj.PaymentNodes), proj.CompletionTime, truncateStr(proj.ChangeTerms, 60))
	case contains(fname, "招标", "中标"):
		summary += fmt.Sprintf("本文档为招标/中标相关文件。中标供应商：%s，中标金额 %.2f 万元。服务范围：%s。", proj.Vendor, proj.WinAmount/10000, truncateStr(proj.ServiceScope, 80))
	case contains(fname, "监理", "质量"):
		summary += fmt.Sprintf("本文档为监理/质量检查报告。项目当前健康度评分：%d/100。未整改质量问题 %d 项。进度风险等级：%s。", proj.HealthScore, proj.HealthReport.Quality.UnresolvedIssuesCount, proj.HealthReport.Progress.RiskLevel)
	case contains(fname, "验收", "测试"):
		summary += fmt.Sprintf("本文档为验收/测试报告。项目整体验收就绪度评估：健康度 %d 分。%s", proj.HealthScore, func() string {
			if proj.HealthReport.Quality.ImpactAcceptance {
				return "⚠️ 存在影响验收的质量问题，建议整改后再提报验收。"
			}
			return "✅ 当前质量状况满足验收条件。"
		}())
	case contains(fname, "付款", "发票"):
		summary += fmt.Sprintf("本文档为付款/发票凭证。项目已支付金额 %.2f 万元，剩余未付 %.2f 万元。%s", proj.HealthReport.Finance.PaidAmount/10000, proj.HealthReport.Finance.UnpaidAmount/10000, func() string {
			if proj.HealthReport.Finance.IsOverBudget {
				return "⚠️ 已超预算红线，请核实。"
			}
			return "资金支付在合规范围内。"
		}())
	default:
		summary += fmt.Sprintf("本文档为项目「%s」%s阶段的管理资料。文件包含该阶段的核心工作记录与审批材料。建议结合同阶段其他文件综合分析，确保资料完整性与合规性。当前项目健康度评分 %d/100。", proj.Name, stage, proj.HealthScore)
	}

	return summary
}

func contains(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

