package backend

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

var fileKey []byte

const salt = "gov_project_salt_2026"

// InitializeKeys 初始化加密密钥
func InitializeKeys(dbDir string) {
	// 尝试从环境变量读取
	envKey := os.Getenv("FILE_ENCRYPTION_KEY")
	if envKey != "" {
		keyBytes, err := hex.DecodeString(envKey)
		if err == nil && len(keyBytes) == 32 {
			fileKey = keyBytes
			return
		}
	}

	// 尝试从本地磁盘读取
	keyPath := filepath.Join(dbDir, "file_key.bin")
	if _, err := os.Stat(keyPath); err == nil {
		keyBytes, err := ioutil.ReadFile(keyPath)
		if err == nil && len(keyBytes) == 32 {
			fileKey = keyBytes
			return
		}
	}

	// 否则，自动生成一个安全的密钥并存盘 (警告日志)
	log.Println("[WARNING] 未配置 FILE_ENCRYPTION_KEY 环境变量，生成临时持久化密钥，将保存在本地 file_key.bin")
	fileKey = make([]byte, 32)
	if _, err := rand.Read(fileKey); err != nil {
		log.Fatalf("无法生成安全的随机加密密钥: %v", err)
	}

	_ = ioutil.WriteFile(keyPath, fileKey, 0600)
}

// MD5Hash 计算字符串的 MD5 哈希
func MD5Hash(text string) string {
	hasher := md5.New()
	hasher.Write([]byte(text))
	return hex.EncodeToString(hasher.Sum(nil))
}

// HashPassword 计算加盐密码哈希 (SHA-256)
func HashPassword(password string) string {
	hasher := sha256.New()
	hasher.Write([]byte(password + salt))
	return hex.EncodeToString(hasher.Sum(nil))
}

// EncryptData 使用 AES-GCM 256 加密二进制数据
func EncryptData(plaintext []byte) ([]byte, error) {
	if len(fileKey) != 32 {
		return nil, errors.New("密钥未正确初始化")
	}

	block, err := aes.NewCipher(fileKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	// nonce + seal
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// DecryptData 使用 AES-GCM 256 解密二进制数据
func DecryptData(ciphertext []byte) ([]byte, error) {
	if len(fileKey) != 32 {
		return nil, errors.New("密钥未正确初始化")
	}

	block, err := aes.NewCipher(fileKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("密文数据长度过小，格式不合法")
	}

	nonce, actualCiphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, actualCiphertext, nil)
}

// GenerateRandomToken 生成指定长度的随机Token (十六进制安全字符串)
func GenerateRandomToken(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		// 回退方案
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

// SanitizeInput XSS过滤辅助函数，对HTML关键字符转义，保证Vanilla JS渲染时的安全性
func SanitizeInput(input string) string {
	// 对常见XSS字符进行基本转义，虽然前端使用 textContent，后端双层防御更有保障
	var out []rune
	for _, r := range input {
		switch r {
		case '<':
			out = append(out, []rune("&lt;")...)
		case '>':
			out = append(out, []rune("&gt;")...)
		case '&':
			out = append(out, []rune("&amp;")...)
		case '"':
			out = append(out, []rune("&quot;")...)
		case '\'':
			out = append(out, []rune("&#x27;")...)
		case '/':
			out = append(out, []rune("&#x2F;")...)
		default:
			out = append(out, r)
		}
	}
	return string(out)
}

// SafeHTTPClient 创建带有 DNS 自动重试与公共 DNS 容错特性的 http.Client
// 当本地系统 DNS (如 systemd-resolved 127.0.0.53) 解析花生壳等动态域名 (vicp.net) 临时失败时，自动切换至公共 DNS 再次解析
func SafeHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			// 1. 优先使用系统默认 DNS 解析与连接
			conn, err := dialer.DialContext(ctx, network, addr)
			if err == nil {
				return conn, nil
			}

			// 2. 若默认 DNS 出现 Lookup 失败，提取 host/port 并尝试备用公共 DNS 服务器解析
			host, port, splitErr := net.SplitHostPort(addr)
			if splitErr != nil {
				return nil, err
			}

			if net.ParseIP(host) != nil {
				return nil, err
			}

			var lastDialErr error
			dnsServers := []string{"223.5.5.5:53", "114.114.114.114:53", "8.8.8.8:53", "1.1.1.1:53"}
			for _, dnsServer := range dnsServers {
				dnsAddr := dnsServer
				r := &net.Resolver{
					PreferGo: true,
					Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
						d := net.Dialer{Timeout: 2 * time.Second}
						return d.DialContext(ctx, "udp", dnsAddr)
					},
				}
				ips, lookupErr := r.LookupIPAddr(ctx, host)
				if lookupErr == nil && len(ips) > 0 {
					targetAddr := net.JoinHostPort(ips[0].IP.String(), port)
					targetConn, dialErr := dialer.DialContext(ctx, network, targetAddr)
					if dialErr == nil {
						return targetConn, nil
					}
					lastDialErr = dialErr
				}
			}

			if lastDialErr != nil {
				return nil, lastDialErr
			}
			return nil, err
		},
		MaxIdleConns:        100,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
	}

	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}
}
