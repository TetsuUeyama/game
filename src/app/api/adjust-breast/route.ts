import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd());
const BLENDER = 'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe';

const HELENA_SRC      = 'E:\\MOdel\\Helena_Douglas_1.10.blend';
const QM_SRC          = 'E:\\MOdel\\QueenMarika_Rigged_MustardUI.blend';
const QM_ARM_NAME     = 'QueenMarika_rig';

const HELENA_ADJUSTED = 'F:\\ContactFormModel\\Helena_Douglas_adjusted.blend';
const QM_OUT          = 'F:\\ContactFormModel\\Helena_Douglas_QM.blend';

const RETARGET_CONFIG = 'config/clothing_retarget_helena_douglas_to_qm.json';
const VOXEL_OUT_DIR   = 'public/box5/helena_douglas_compare/helena_qm';

function runBlender(blendPath: string, pyScript: string, pyArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const allArgs = ['--background', blendPath, '--python', pyScript, '--', ...pyArgs];
    const proc = spawn(BLENDER, allArgs, { cwd: PROJECT_ROOT });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Blender exit ${code}\nstdout:\n${stdout.slice(-2000)}\nstderr:\n${stderr.slice(-1000)}`));
    });
    proc.on('error', err => reject(err));
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { left, right } = body as {
      left: [number, number, number];
      right: [number, number, number];
    };
    if (!Array.isArray(left) || left.length !== 3 ||
        !Array.isArray(right) || right.length !== 3) {
      return NextResponse.json({ error: 'left and right must be [x,y,z] arrays (Blender Z-up world)' }, { status: 400 });
    }

    const adjustScript = path.join(PROJECT_ROOT, 'scripts', 'blender', 'fitting',
      'adjust_helena_breast_anchor.py');
    const transplantScript = path.join(PROJECT_ROOT, 'scripts', 'blender', 'fitting',
      'transplant_qm_armature_to_helena.py');
    const voxelizeScript = path.join(PROJECT_ROOT, 'scripts', 'blender', 'voxelize',
      'voxelize_mustardui.py');

    const log: string[] = [];

    // [1] Adjust Helena breast verts based on user-picked source
    log.push('[1/3] adjust breast verts on Helena_Douglas...');
    await runBlender(HELENA_SRC, adjustScript, [
      HELENA_ADJUSTED, QM_SRC, QM_ARM_NAME,
      ...left.map(String), ...right.map(String),
    ]);

    // [2] Transplant QM armature (--no-lbs to preserve body shape)
    log.push('[2/3] transplant QM armature...');
    await runBlender(HELENA_ADJUSTED, transplantScript, [
      '--no-lbs', QM_SRC, QM_ARM_NAME, RETARGET_CONFIG, QM_OUT,
    ]);

    // [3] Voxelize body
    log.push('[3/3] voxelize body...');
    await runBlender(QM_OUT, voxelizeScript, [
      VOXEL_OUT_DIR, 'Body', 'body',
      '--resolution', '150',
      '--armature', 'QueenMarika_rig',
      '--no-interior',
      '--multi-sample', '8',
    ]);

    return NextResponse.json({
      ok: true,
      adjusted_blend: HELENA_ADJUSTED,
      voxel_path: `${VOXEL_OUT_DIR}/body.vox`,
      log,
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
