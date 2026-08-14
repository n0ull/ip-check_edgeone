/**
 * npm prepare 钩子：把 git hooks 路径指向仓库内 .githooks/（随仓库版本管理，克隆后 npm install 即生效）。
 * 无 git 或非 git 仓库的环境（如 CI 纯部署、Makers 一键部署）静默跳过，不阻断安装。
 */
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
  console.log('已启用仓库内 git hooks（core.hooksPath=.githooks）');
} catch {
  console.log('跳过 git hooks 配置（当前环境无 git 或非 git 仓库）');
}
