/**
 * AGENT 1 — generateVideos.ts
 * Batch generates all sign videos for the Ethiopian Driving Theory App.
 *
 * Each video is:
 *   - Sign image with Ken Burns zoom-in effect (15–30 seconds)
 *   - Amharic narration audio overlay
 *   - Dark navy background (#1a1a2e) for letterboxing
 *   - 720p, H.264, AAC audio, MP4 output
 *
 * Usage:
 *   npx ts-node scripts/generateVideos.ts
 *
 * Prerequisites:
 *   - FFmpeg installed and in PATH: https://ffmpeg.org/download.html
 *   - Sign images in:  assets/images/{sign.image_filename}
 *   - Audio files in:  assets/audio/{sign.audio_explanation_filename}
 *     (run generateAllAudio.ts first!)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sign {
  id: string;
  topic_id: string;
  image_filename: string;
  video_filename: string;
  audio_explanation_filename: string;
  name_amharic: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const IMAGES_DIR  = path.join(process.cwd(), 'assets', 'images');
const AUDIO_DIR   = path.join(process.cwd(), 'assets', 'audio');
const VIDEOS_DIR  = path.join(process.cwd(), 'assets', 'videos');
const SIGNS_PATH  = path.join(process.cwd(), 'content', 'signs.json');

// Video settings
const VIDEO_WIDTH   = 1280;
const VIDEO_HEIGHT  = 720;
const BG_COLOR      = '1a1a2e';    // Dark navy (matches app background)
const ZOOM_START    = 1.0;
const ZOOM_END      = 1.3;
const VIDEO_CRF     = 23;           // Quality: 18=best, 28=worst
const VIDEO_PRESET  = 'medium';     // Encoding speed vs compression

// ─── Helpers ─────────────────────────────────────────────────────────────────

function checkFFmpeg(): void {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('✅ FFmpeg found');
  } catch {
    console.error('❌ FFmpeg not found! Install from: https://ffmpeg.org/download.html');
    console.error('   Windows: winget install Gyan.FFmpeg');
    console.error('   Mac:     brew install ffmpeg');
    console.error('   Linux:   sudo apt install ffmpeg');
    process.exit(1);
  }
}

/**
 * Gets audio duration in seconds using FFprobe.
 * Falls back to 20 seconds if FFprobe fails.
 */
function getAudioDuration(audioPath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? 20 : Math.min(Math.max(duration + 1, 10), 35); // clamp 10–35s, +1s padding
  } catch {
    return 20; // Default fallback
  }
}

/**
 * Generates a single sign video using FFmpeg.
 * Ken Burns effect: slow zoom from ZOOM_START to ZOOM_END over video duration.
 */
function generateSignVideo(sign: Sign): boolean {
  const imagePath  = path.join(IMAGES_DIR, sign.image_filename);
  const audioPath  = path.join(AUDIO_DIR, sign.audio_explanation_filename);
  const outputPath = path.join(VIDEOS_DIR, sign.video_filename);

  // Skip if video already exists
  if (fs.existsSync(outputPath)) {
    console.log(`  ⏭  Skip (exists): ${sign.video_filename}`);
    return true;
  }

  // Validate inputs
  if (!fs.existsSync(imagePath)) {
    console.warn(`  ⚠️  Missing image: ${imagePath} — skipping ${sign.id}`);
    return false;
  }
  if (!fs.existsSync(audioPath)) {
    console.warn(`  ⚠️  Missing audio: ${audioPath} — run generateAllAudio.ts first!`);
    return false;
  }

  const duration = getAudioDuration(audioPath);
  // Frames needed for zoompan (25fps)
  const frameCount = Math.ceil(duration * 25);
  // Zoom increment per frame
  const zoomIncrement = ((ZOOM_END - ZOOM_START) / frameCount).toFixed(6);

  /**
   * FFmpeg filter chain:
   * 1. scale: resize image to fit within 720p, preserving aspect ratio
   * 2. pad: add background color to fill 1280x720
   * 3. zoompan: Ken Burns slow zoom-in effect
   * 4. format: ensure yuv420p for broad compatibility
   */
  const filterComplex = [
    `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,`,
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=#${BG_COLOR},`,
    `zoompan=`,
    `z='min(zoom+${zoomIncrement},${ZOOM_END})':`,
    `d=${frameCount}:`,
    `x='iw/2-(iw/zoom/2)':`,
    `y='ih/2-(ih/zoom/2)':`,
    `s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=25,`,
    `format=yuv420p[v]`,
  ].join('');

  const cmd = [
    'ffmpeg -y',
    `-loop 1 -i "${imagePath}"`,
    `-i "${audioPath}"`,
    `-filter_complex "${filterComplex}"`,
    `-map "[v]" -map 1:a`,
    `-c:v libx264 -preset ${VIDEO_PRESET} -crf ${VIDEO_CRF}`,
    `-c:a aac -b:a 128k`,
    `-t ${duration}`,
    `-movflags +faststart`,   // Web-optimised: moov atom at start for streaming
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
    const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ ${sign.video_filename} (${duration.toFixed(1)}s, ${size}MB)`);
    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Failed: ${sign.id} — ${msg.slice(0, 120)}`);
    // Remove partial output on failure
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function generateAll(): Promise<void> {
  console.log('🎬 Ethiopian Driving Theory App — Video Generator');
  console.log('─'.repeat(60));

  // Pre-flight checks
  checkFFmpeg();
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  const stripBOM = (s: string) => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
  const signs: Sign[] = JSON.parse(stripBOM(fs.readFileSync(SIGNS_PATH, 'utf-8')));

  let succeeded = 0;
  let skipped   = 0;
  let failed    = 0;

  // Group by topic for progress readability
  const byTopic: Record<string, Sign[]> = {};
  for (const sign of signs) {
    if (!byTopic[sign.topic_id]) byTopic[sign.topic_id] = [];
    byTopic[sign.topic_id].push(sign);
  }

  for (const [topicId, topicSigns] of Object.entries(byTopic)) {
    console.log(`\n📁 Topic: ${topicId} (${topicSigns.length} signs)`);

    for (const sign of topicSigns) {
      const alreadyExists = fs.existsSync(path.join(VIDEOS_DIR, sign.video_filename));

      if (alreadyExists) {
        skipped++;
        console.log(`  ⏭  Skip (exists): ${sign.video_filename}`);
        continue;
      }

      const ok = generateSignVideo(sign);
      if (ok) succeeded++;
      else failed++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('🎉 Video generation complete!');
  console.log(`   ✅ Generated : ${succeeded} videos`);
  console.log(`   ⏭  Skipped  : ${skipped} videos (already existed)`);
  console.log(`   ❌ Failed   : ${failed} videos`);
  console.log(`   📁 Output   : ${VIDEOS_DIR}`);

  if (failed > 0) {
    console.log('\n⚠️  Some videos failed. Check:');
    console.log('   1. Sign images exist in assets/images/');
    console.log('   2. Audio files exist in assets/audio/ (run generateAllAudio.ts first)');
    console.log('   3. FFmpeg is installed and working');
  }

  // ── Disk usage estimate ───────────────────────────────────────────────────
  const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.mp4'));
  if (files.length > 0) {
    const totalBytes = files.reduce((sum, f) => sum + fs.statSync(path.join(VIDEOS_DIR, f)).size, 0);
    const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
    console.log(`\n   💾 Total video size: ${totalMB}MB (${files.length} files)`);
  }

  console.log('─'.repeat(60));
}

generateAll().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
