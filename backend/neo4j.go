package backend

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"sync"
	"time"
)

// Neo4jClient Neo4j 图数据库客户端 (封装 REST API / Cypher 查询引擎)
type Neo4jClient struct {
	Endpoint string // e.g. http://127.0.0.1:7474
	Username string // e.g. neo4j
	Password string // e.g. neo4j
	Enabled  bool
	client   *http.Client
	mu       sync.RWMutex
}

var GlobalNeo4j *Neo4jClient

// InitNeo4j 初始化 Neo4j 客户端引擎
func InitNeo4j(endpoint, user, password string) *Neo4jClient {
	if endpoint == "" {
		endpoint = "http://127.0.0.1:7474"
	}
	GlobalNeo4j = &Neo4jClient{
		Endpoint: endpoint,
		Username: user,
		Password: password,
		Enabled:  true,
		client: &http.Client{
			Timeout: 4 * time.Second,
		},
	}
	return GlobalNeo4j
}

// ExecuteCypher 执行 Neo4j Cypher 语句 (支持 HTTP Transaction API)
func (n *Neo4jClient) ExecuteCypher(statement string, parameters map[string]interface{}) (map[string]interface{}, error) {
	if n == nil || !n.Enabled {
		return nil, fmt.Errorf("Neo4j 图数据库驱动未启用")
	}

	url := fmt.Sprintf("%s/db/neo4j/tx/commit", n.Endpoint)

	payload := map[string]interface{}{
		"statements": []map[string]interface{}{
			{
				"statement":  statement,
				"parameters": parameters,
			},
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	if n.Username != "" && n.Password != "" {
		req.SetBasicAuth(n.Username, n.Password)
	}

	resp, err := n.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var res map[string]interface{}
	if err := json.Unmarshal(respBytes, &res); err != nil {
		return nil, err
	}

	return res, nil
}

// SyncProjectGraphToNeo4j 将项目的实体节点与三元组数据库真实同步推送到 Neo4j
func (n *Neo4jClient) SyncProjectGraphToNeo4j(projID string, projName string, entities []KGEntity, relations []KGRelation) error {
	if n == nil {
		return nil
	}

	// 1. 创建/更新 Project 项目根节点
	projCypher := `MERGE (p:Project {id: $proj_id}) SET p.name = $proj_name, p.updated_at = $updated_at`
	_, _ = n.ExecuteCypher(projCypher, map[string]interface{}{
		"proj_id":    projID,
		"proj_name":  projName,
		"updated_at": time.Now().Format("2006-01-02 15:04:05"),
	})

	// 2. 批量 MERGE 实体节点 Node
	for _, e := range entities {
		cypher := `MERGE (e:Entity {name: $name, project_id: $proj_id}) 
                   ON CREATE SET e.id = $id, e.category = $category
                   ON MATCH SET e.category = $category`
		_, _ = n.ExecuteCypher(cypher, map[string]interface{}{
			"id":       e.ID,
			"name":     e.Name,
			"category": e.Category,
			"proj_id":  projID,
		})

		// 关联实体节点至项目根节点
		relProjCypher := `MATCH (p:Project {id: $proj_id}), (e:Entity {name: $name, project_id: $proj_id})
                          MERGE (p)-[r:CONTAINS]->(e)`
		_, _ = n.ExecuteCypher(relProjCypher, map[string]interface{}{
			"proj_id": projID,
			"name":    e.Name,
		})
	}

	// 3. 批量 MERGE 三元组关系 Link
	for _, r := range relations {
		relCypher := `MATCH (a:Entity {name: $source, project_id: $proj_id}), (b:Entity {name: $target, project_id: $proj_id})
                      MERGE (a)-[rel:KNOWLEDGE_RELATION {name: $relation_name, project_id: $proj_id}]->(b)`
		_, _ = n.ExecuteCypher(relCypher, map[string]interface{}{
			"source":        r.Source,
			"target":        r.Target,
			"relation_name": r.Relation,
			"proj_id":       projID,
		})
	}

	return nil
}
