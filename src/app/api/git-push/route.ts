import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function POST() {
  try {
    // 1. public/data/ の変更をステージング
    await execPromise('git add public/data/');

    // 2. コミット（変更がない場合のエラーは無視する）
    try {
      await execPromise('git commit -m "【自動更新】管理画面からのデータ収集・保存"');
    } catch (e) {
      console.log('コミット対象の変更がないか、すでにコミットされています');
    }

    // 3. GitHubへプッシュ
    const { stdout, stderr } = await execPromise('git push');

    return NextResponse.json({ success: true, stdout, stderr });
  } catch (error: any) {
    console.error('Git Push Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}