# Agent Rules & Guidelines

## Execution Rules
- **禁止使用 `pkill -f server` 命令**：`pkill -f server` 会模糊匹配所有命令行包含 `server` 的进程（包括 IDE 远程连接服务、Web 终端后台等），从而导致服务器掉线断开连接。
- **替代方案**：停止或重启后台服务时，应采用更精确的杀进程命令：
  - 按服务端口号清理：`fuser -k <port>/tcp` 或 `kill $(lsof -t -i:<port>)`
  - 仅按精确进程名终止：`pkill -x server`
  - 记录并指定具体 PID 进行终止。
