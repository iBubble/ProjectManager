# 后台学习系统（Background Learning System）移植与集成指南

本目录包含了通用 RAG（检索增强生成）系统中 **后台学习管道（Background Learning Pipeline）** 与 **进度监控及防呆自愈系统** 的完整核心源码。你可以参考本手册将该模块接入或移植至其他 RAG 系统中。

---

## 目录结构

```text
AILeaning/
├── README.md                                    # 本使用与移植说明文档
├── frontend/                                    # 前端 UI 组件
│   └── src/components/Admin/
│       ├── LearningProgress.tsx                 # 学习进度看板主界面
│       └── AdminLayout.tsx                      # 管理员看板路由布局配置
└── backend/                                     # 后端核心学习引擎、依赖组件与 API
    ├── worker.py                                # Celery 异步学习任务管道与防呆自愈 Worker
    ├── api/
    │   ├── admin.py                             # 学习进度汇总与自愈重试 API
    │   ├── projects.py                          # 项目维度学习状态与优先级 API
    │   └── knowledge.py                         # 知识库上传与学习任务触发 API
    ├── core/                                    # 核心组件与引擎库
    │   ├── celery_app.py                        # Celery 异步队列及定时自愈任务配置
    │   ├── vector_store.py                      # 文本切片与向量化存储/检索核心组件
    │   ├── graph_rag.py                         # GraphRAG 实体/关系抽取与图谱构建引擎
    │   ├── graph_qa.py                          # 知识图谱 QA 与拓扑链路检索
    │   ├── entity_resolution.py                 # 图谱实体消歧与节点对齐组件
    │   ├── community_summarizer.py              # 图谱社区划分与多层级摘要构建器
    │   ├── raptor.py                            # RAPTOR 递归层次聚类与高层摘要引擎
    │   ├── precompute.py                        # 知识库后台预计算与高频提炼组件
    │   ├── retrieval_pipeline.py                # 向量 + 图谱 + BM25 混合检索管道
    │   ├── reranker.py                          # 重排模型与相似度打分组件
    │   ├── llm_engine.py                        # 大模型与 Embedding 统一调用引擎
    │   └── extractors/                          # 多格式文档文本解析与提取器
    │       ├── __init__.py                      # 解析器统一路由分发器
    │       ├── pdf_parser.py                    # PDF 深度文本/表格解析器
    │       ├── docling_parser.py                # Docling 高阶文档结构提取器
    │       ├── office.py                        # Word / Excel / PPT 文档提取器
    │       └── plain.py                         # 纯文本提取器
    └── scripts/
        └── monitor_goal_progress.py             # 命令行学习进度监控与自动修复脚本

```

---

## 核心架构与功能特性

### 1. 三阶段异步学习管道 (3-Stage Asynchronous Learning Pipeline)
- **阶段一：文档切片与向量化入库 (Vectorization)**
  - 对上传文档进行语义分块（Chunking），提取 Embedding 向量存入 VectorDB（如 ChromaDB / Qdrant）。
- **阶段二：知识图谱实体抽取 (GraphRAG)**
  - 解析切片文本，调用 LLM 抽取实体节点与关系边，构建关联图谱。
- **阶段三：RAPTOR 层次化聚类与社区摘要 (Community Summary)**
  - 基于高斯混合模型（GMM）对节点与向量进行递归层次聚类，生成跨文档的高层概况与社区摘要。

### 2. 僵尸任务自动检测与自愈机制 (Stuck Job Auto-Recovery)
- **超时与卡死检测**：当后台 Celery Worker 因网络波动、内存爆表或硬件断连挂起时，API 或定时任务（`check_and_recover_learning_faults`）会自动检测处在 `pending` / `graph_queued` 状态超过阈值的文件。
- **自动防呆补发**：检测到僵尸任务后，系统会将状态静默物理重置并自动补发 Celery 任务，无需人工干预。

### 3. 底层依赖组件架构 (Core Dependent Components)
- **文档解析提取器 (Extractors)**
  - `extractors/__init__.py` + `pdf_parser.py` / `office.py` / `docling_parser.py`：自动识别多格式文档并进行深度解析与结构化提炼。
- **切片与向量存储 (Vectorization & Chunking)**
  - `vector_store.py`：智能语义切片，并与 VectorDB (ChromaDB / Qdrant) 交互存取向量索引。
- **知识图谱与实体对齐 (GraphRAG & Entity Resolution)**
  - `graph_rag.py` + `entity_resolution.py`：提取实体、关系三元组，完成实体对齐消歧与同义节点融合。
- **社区聚类与摘要引擎 (Community Summaries & RAPTOR)**
  - `community_summarizer.py` + `raptor.py`：将节点划分图社区并调用 GMM 聚类递归构建多级抽象摘要。
- **多路检索与重排 (Hybrid Retrieval & Reranker)**
  - `retrieval_pipeline.py` + `reranker.py`：对后台学习产生的向量索引、图拓扑结构进行多路召回与二次重排打分。


## 环境与依赖要求

- **Python**: `>= 3.10`
- **Node.js**: `>= 18` (前端 Vite + React + Lucide Icons)
- **消息队列与中间件**: Redis / RabbitMQ (用于 Celery 任务调度与状态缓存)
- **核心 Python 依赖包**:
  ```bash
  pip install celery redis scikit-learn numpy fastapi pydantic chromadb networkx docling
  ```


---

## 移植与接入部署步骤

### 步骤 1：后端 Celery 任务配置与 Worker 部署
1. 将 `backend/core/celery_app.py` 引入你的 Backend 服务，配置 Redis URL。
2. 启动 Worker 进程：
   ```bash
   celery -A worker worker --loglevel=info -c 4
   ```
3. 启动 Celery Beat 定时自愈任务：
   ```bash
   celery -A core.celery_app beat --loglevel=info
   ```

### 步骤 2：API 路由注册
1. 在 FastAPI 或 Flask 主入口文件（如 `main.py`）中挂载路由：
   ```python
   from api.admin import router as admin_router
   app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
   ```
2. 接口路径 `/api/admin/learning-progress` 即会对外提供全站与各项目的实时学习进度 JSON。

### 步骤 3：前端看板引入
1. 拷贝 `frontend/src/components/Admin/LearningProgress.tsx` 到前端组件库。
2. 在前端管理后台路由中注册：
   ```tsx
   import LearningProgress from './components/Admin/LearningProgress';

   <Route path="/admin/learning-progress" element={<LearningProgress />} />
   ```
3. `LearningProgress.tsx` 支持可视化展示三大阶段的动态进度条、CPU/内存开销以及一键手动“重试失败文件”或“暂停/恢复学习”。

---

## 核心组件单独调用与代码示例 (Python Code Usage)

除了完整的 Celery 管道外，你也可以在项目中直接导入并单独使用 `core/` 下的独立组件：

### 1. 文档提取与文本切片向量化 (Extraction & Vectorization)

```python
from core.extractors import extract_text_from_file
from core.vector_store import VectorStore

# 1. 解析多格式文件内容 (PDF/Word/Text)
text_content = extract_text_from_file("/path/to/contract.pdf")

# 2. 初始化向量库并执行切片与 Embedding 入库
vector_store = VectorStore(project_id="proj_001")
chunks = vector_store.add_document_chunks(
    doc_id="doc_123",
    text=text_content,
    chunk_size=500,
    chunk_overlap=50
)
print(f"成功导入 {len(chunks)} 个向量切片")
```

### 2. 知识图谱实体抽取与社区摘要 (GraphRAG & Community Summarizer)

```python
from core.graph_rag import GraphRAGEngine
from core.entity_resolution import resolve_duplicate_entities
from core.community_summarizer import build_community_hierarchies

# 1. 抽取文本切片中的实体与关系边
graph_engine = GraphRAGEngine(project_id="proj_001")
entities, relations = graph_engine.extract_graph_from_chunks(chunks)

# 2. 执行同义实体消歧与合并
resolved_graph = resolve_duplicate_entities(project_id="proj_001")

# 3. 构建多层级社区摘要
summaries = build_community_hierarchies(project_id="proj_001")
print(f"已生成 {len(summaries)} 个层次社区摘要")
```

### 3. 多路混合检索与重排召回 (Hybrid Retrieval & Reranking)

```python
from core.retrieval_pipeline import HybridRetrievalPipeline

# 初始化混合检索管道 (向量 + 知识图谱拓扑 + BM25)
pipeline = HybridRetrievalPipeline(project_id="proj_001")

# 检索相关上下文并使用 Reranker 重排
results = pipeline.search(
    query="违约责任条款及赔偿上限是多少？",
    top_k=5,
    enable_graph=True,
    enable_vector=True
)

for res in results:
    print(f"得分: {res['score']:.4f} | 内容: {res['content'][:100]}...")
```


---

## 数据协议与 API 结构

GET `/api/admin/learning-progress` 响应示例：

```json
{
  "system": {
    "celery": { "fast_queue": 0, "slow_queue": 2, "active_tasks": 1 },
    "system": { "cpu_percent": 18.5, "memory_used_mb": 4096, "memory_total_mb": 16384 }
  },
  "projects": [
    {
      "id": "proj_001",
      "name": "合同审查知识库",
      "priority": 1,
      "vectorization": { "total": 100, "completed": 95, "failed": 0, "percent": 95.0 },
      "graph_rag": { "total": 100, "completed": 80, "failed": 2, "percent": 80.0 },
      "community_summary": { "total": 10, "completed": 5, "percent": 50.0 }
    }
  ]
}
```
