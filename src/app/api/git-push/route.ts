import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function runGit(args: string[], cwd: string) {
  return execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
  });
}

export async function POST() {
  const cwd = process.cwd();
  try {
    await runGit(['add', '-A'], cwd);

    const { stdout: statusOut } = await runGit(['status', '--porcelain'], cwd);
    if (!statusOut.trim()) {
      return NextResponse.json({
        ok: true,
        message: 'プッシュする新しい変更はありません（最新状態です）。',
      });
    }

    const stamp = new Date().toLocaleString('ja-JP', { hour12: false });
    await runGit(['commit', '-m', `管理画面から更新 (${stamp})`], cwd);
    await runGit(['push'], cwd);

    return NextResponse.json({
      ok: true,
      message: 'GitHubへプッシュしました。',
    });
  } catch (err: unknown) {
    const execErr = err as { message?: string; stderr?: string; stdout?: string };
    const detail = execErr.stderr || execErr.stdout || execErr.message || 'Gitコマンド失敗';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}