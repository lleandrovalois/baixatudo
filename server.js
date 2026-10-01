const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cross-platform binary detection (Windows vs Linux Docker)
const isWindows = process.platform === 'win32';
const BIN_DIR = path.join(__dirname, 'bin');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

app.get('/favicon.ico', (req, res) => res.status(204).end());

function getYtdlpPath() {
  const localWin = path.join(BIN_DIR, 'yt-dlp.exe');
  const localLinux = path.join(BIN_DIR, 'yt-dlp');
  if (isWindows && fs.existsSync(localWin)) return localWin;
  if (!isWindows && fs.existsSync(localLinux)) return localLinux;
  if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
  if (fs.existsSync('/usr/bin/yt-dlp')) return '/usr/bin/yt-dlp';
  return 'yt-dlp';
}

function getFfmpegArgs() {
  const localWin = path.join(BIN_DIR, 'ffmpeg.exe');
  const localLinux = path.join(BIN_DIR, 'ffmpeg');
  if (isWindows && fs.existsSync(localWin)) {
    return ['--ffmpeg-location', BIN_DIR];
  }
  if (!isWindows && fs.existsSync(localLinux)) {
    return ['--ffmpeg-location', BIN_DIR];
  }
  return [];
}

function getBaseYtdlpArgs() {
  const args = [
    '--no-playlist',
    '--geo-bypass',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    '--extractor-args', 'youtube:player_client=ios,android,web',
    ...getFfmpegArgs()
  ];

  // Optional cookies support for Datacenter / VPS IPs
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }

  return args;
}

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Active download jobs: jobId -> { process, status, progress, speed, eta, size, filename, error, listeners }
const activeJobs = new Map();

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format view count to compact string (e.g. 1.2M)
 */
function formatViews(count) {
  if (!count || isNaN(count)) return null;
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(count);
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * API: Check server and tools health
 */
app.get('/api/health', (req, res) => {
  const ytdlpBin = getYtdlpPath();
  const ytdlpExists = ytdlpBin === 'yt-dlp' ? true : fs.existsSync(ytdlpBin);
  const ffmpegArgs = getFfmpegArgs();
  const ffmpegExists = ffmpegArgs.length === 0 ? true : fs.existsSync(path.join(BIN_DIR, isWindows ? 'ffmpeg.exe' : 'ffmpeg'));
  res.json({
    status: 'ok',
    platform: process.platform,
    ytdlp: ytdlpExists,
    ffmpeg: ffmpegExists,
    downloadsDir: DOWNLOADS_DIR
  });
});

/**
 * API: Extract video information
 */
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL do YouTube inválida ou não informada.' });
  }

  // Validate URL pattern
  const ytRegex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?.*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w\-]+/i;
  if (!ytRegex.test(url.trim())) {
    return res.status(400).json({ error: 'Por favor, insira um link válido do YouTube (vídeo, shorts ou ao vivo).' });
  }

  const args = [
    '--dump-single-json',
    '--skip-download',
    ...getBaseYtdlpArgs(),
    url.trim()
  ];

  const ytdlp = spawn(getYtdlpPath(), args, { windowsHide: true });
  let stdoutData = '';
  let stderrData = '';

  ytdlp.stdout.on('data', (chunk) => {
    stdoutData += chunk.toString('utf8');
  });

  ytdlp.stderr.on('data', (chunk) => {
    stderrData += chunk.toString('utf8');
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp info error:', stderrData);
      let errorMsg = 'Não foi possível obter informações do vídeo.';
      if (stderrData.includes('Private video')) {
        errorMsg = 'Este vídeo é privado e não pode ser acessado.';
      } else if (stderrData.includes('Video unavailable')) {
        errorMsg = 'Vídeo indisponível ou excluído no YouTube.';
      } else if (stderrData.includes('Sign in to confirm your age')) {
        errorMsg = 'Este vídeo requer confirmação de idade no YouTube.';
      } else if (stderrData.includes('Sign in to confirm you’re not a bot') || stderrData.includes('bot')) {
        errorMsg = 'O YouTube bloqueou temporariamente o IP do servidor (Detecção de Bot da VPS).';
      } else if (stderrData.includes('429')) {
        errorMsg = 'Muitas requisições ao YouTube (HTTP 429). Aguarde alguns instantes.';
      }

      const cleanDetails = stderrData
        .split(/[\r\n]+/)
        .filter(l => l.includes('ERROR:') || l.includes('WARNING:'))
        .slice(-2)
        .join(' | ') || stderrData.slice(0, 300);

      return res.status(500).json({ error: errorMsg, details: cleanDetails });
    }

    try {
      const data = JSON.parse(stdoutData);
      
      // Determine best resolutions available
      const heights = new Set();
      if (Array.isArray(data.formats)) {
        data.formats.forEach((f) => {
          if (f.vcodec !== 'none' && f.height) {
            heights.add(f.height);
          }
        });
      }

      const availableQualities = [2160, 1440, 1080, 720, 480, 360].filter(h => heights.has(h));
      if (availableQualities.length === 0 && data.height) {
        availableQualities.push(data.height);
      }

      const videoInfo = {
        id: data.id,
        title: data.title || 'Vídeo do YouTube',
        uploader: data.uploader || data.channel || 'Canal Desconhecido',
        uploaderUrl: data.uploader_url || data.channel_url || '',
        duration: data.duration || 0,
        durationFormatted: formatDuration(data.duration),
        thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : ''),
        viewCount: data.view_count || 0,
        viewCountFormatted: formatViews(data.view_count),
        uploadDate: data.upload_date ? `${data.upload_date.slice(6, 8)}/${data.upload_date.slice(4, 6)}/${data.upload_date.slice(0, 4)}` : null,
        availableQualities: availableQualities.length > 0 ? availableQualities : [1080, 720, 480, 360],
        webpageUrl: data.webpage_url || url.trim()
      };

      res.json(videoInfo);
    } catch (parseError) {
      console.error('Failed to parse yt-dlp JSON:', parseError);
      res.status(500).json({ error: 'Erro ao processar os dados do vídeo.', raw: stdoutData.slice(0, 500) });
    }
  });

  ytdlp.on('error', (err) => {
    console.error('Spawn error:', err);
    res.status(500).json({ error: 'Erro interno ao executar o utilitário yt-dlp.' });
  });
});

/**
 * API: Start video/audio download
 */
app.post('/api/download', (req, res) => {
  const { url, type, quality, title } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL do vídeo é obrigatória.' });
  }

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const cleanTitle = sanitizeFilename(title || 'video');
  const outputTemplate = path.join(DOWNLOADS_DIR, `${cleanTitle} [%(id)s].%(ext)s`);

  let formatArgs = [];
  let expectedExt = 'mp4';

  if (type === 'audio') {
    if (quality === 'm4a') {
      expectedExt = 'm4a';
      formatArgs = [
        '-x',
        '--audio-format', 'm4a',
        '--audio-quality', '0'
      ];
    } else {
      expectedExt = 'mp3';
      const bitrate = quality === '320' ? '0' : '2'; // 0 = ~320k VBR/CBR, 2 = ~190k
      formatArgs = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', bitrate
      ];
    }
  } else {
    // Video type (MP4)
    expectedExt = 'mp4';
    const targetHeight = parseInt(quality, 10);
    if (!isNaN(targetHeight) && targetHeight > 0) {
      formatArgs = [
        '-f',
        `bestvideo[height<=${targetHeight}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]/best`,
        '--merge-output-format', 'mp4'
      ];
    } else {
      // Best quality
      formatArgs = [
        '-f',
        'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4'
      ];
    }
  }

  const args = [
    ...getBaseYtdlpArgs(),
    '--newline',
    '--progress',
    '--no-mtime',
    ...formatArgs,
    '-o', outputTemplate,
    url.trim()
  ];

  console.log(`Starting job ${jobId} with command yt-dlp ${args.join(' ')}`);

  const proc = spawn(getYtdlpPath(), args, { windowsHide: true });

  const job = {
    id: jobId,
    url,
    type,
    quality,
    title: cleanTitle,
    expectedExt,
    process: proc,
    status: 'iniciando',
    statusText: 'Iniciando download...',
    progress: 0,
    speed: '--',
    eta: '--',
    totalSize: '--',
    downloadedSize: '--',
    filename: null,
    error: null,
    completed: false,
    listeners: new Set()
  };

  activeJobs.set(jobId, job);

  // Notify listeners via SSE
  function broadcast() {
    const payload = JSON.stringify({
      id: job.id,
      status: job.status,
      statusText: job.statusText,
      progress: job.progress,
      speed: job.speed,
      eta: job.eta,
      totalSize: job.totalSize,
      downloadedSize: job.downloadedSize,
      filename: job.filename,
      error: job.error,
      completed: job.completed
    });

    job.listeners.forEach(send => send(payload));
  }

  // Regex patterns for parsing yt-dlp output
  // [download]  45.2% of 25.40MiB at 4.52MiB/s ETA 00:03
  const progressRegex = /\[download\]\s+([\d\.]+)%\s+of\s+([~]?[\d\.]+\w+)(?:\s+at\s+([\d\.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/i;
  const destRegex = /\[(?:download|Merger|ExtractAudio)\]\s+(?:Destination:\s+|Merging formats into\s+)"?([^"\r\n]+)"?/i;

  proc.stdout.on('data', (data) => {
    const lines = data.toString('utf8').split(/[\r\n]+/);
    for (const line of lines) {
      if (!line.trim()) continue;

      // Check destination file
      const destMatch = line.match(destRegex);
      if (destMatch && destMatch[1]) {
        const fullDest = destMatch[1].trim();
        job.filename = path.basename(fullDest);
      }

      // Check progress
      const match = line.match(progressRegex);
      if (match) {
        job.status = 'baixando';
        job.statusText = type === 'audio' ? 'Baixando áudio...' : 'Baixando vídeo e áudio...';
        job.progress = Math.min(100, Math.max(0, parseFloat(match[1])));
        if (match[2]) job.totalSize = match[2];
        if (match[3]) job.speed = match[3];
        if (match[4]) job.eta = match[4];
        broadcast();
      } else if (line.includes('[Merger]')) {
        job.status = 'processando';
        job.statusText = 'Mesclando áudio e vídeo com FFmpeg...';
        job.progress = 98;
        broadcast();
      } else if (line.includes('[ExtractAudio]')) {
        job.status = 'processando';
        job.statusText = 'Convertendo faixa de áudio com FFmpeg...';
        job.progress = 98;
        broadcast();
      }
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString('utf8');
    console.warn(`[job ${jobId} stderr]:`, text);
  });

  proc.on('close', (code) => {
    console.log(`[job ${jobId}] exited with code ${code}`);
    if (code === 0) {
      job.status = 'concluido';
      job.statusText = 'Download concluído com sucesso!';
      job.progress = 100;
      job.completed = true;

      // Extract video ID from URL
      const idMatch = job.url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_\-]+)/);
      const videoId = idMatch ? idMatch[1] : '';

      try {
        const files = fs.readdirSync(DOWNLOADS_DIR);
        // Find file that contains the video ID and is not .part or intermediate stream
        const matching = files.filter(f => {
          if (videoId && !f.includes(`[${videoId}]`)) return false;
          if (f.endsWith('.part') || f.endsWith('.ytdl')) return false;
          if (/\.f\d+\./.test(f)) return false;
          return true;
        });

        if (matching.length > 0) {
          const sorted = matching
            .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
          job.filename = sorted[0].name;
        }
      } catch (e) {
        console.error('Error scanning downloads directory:', e);
      }
    } else {
      job.status = 'erro';
      job.statusText = 'Falha no download.';
      job.error = 'Ocorreu um erro ao baixar o vídeo. Tente novamente.';
    }
    broadcast();
  });

  res.json({ jobId });
});

/**
 * API: Server-Sent Events (SSE) for real-time progress
 */
app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Download não encontrado ou expirado.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${data}\n\n`);
  };

  // Immediate first state
  send(JSON.stringify({
    id: job.id,
    status: job.status,
    statusText: job.statusText,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    totalSize: job.totalSize,
    filename: job.filename,
    error: job.error,
    completed: job.completed
  }));

  job.listeners.add(send);

  // Keep-alive ping every 15s
  const interval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    job.listeners.delete(send);
  });
});

/**
 * API: Download the downloaded file to browser
 */
app.get(['/api/file/:filename', '/api/file'], (req, res) => {
  const rawFilename = req.params.filename || req.query.name || '';
  const filename = path.basename(decodeURIComponent(rawFilename));

  if (!filename) {
    return res.status(400).send('Nome do arquivo não especificado.');
  }

  let matchedFile = null;
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    // 1. Direct exact match
    matchedFile = files.find(f => f === filename);

    // 2. Case-insensitive or normalized match
    if (!matchedFile) {
      matchedFile = files.find(f => f.toLowerCase() === filename.toLowerCase());
    }

    // 3. Fallback match by video ID inside brackets: [VIDEO_ID]
    if (!matchedFile) {
      const idMatch = filename.match(/\[([a-zA-Z0-9_\-]+)\]/);
      if (idMatch) {
        matchedFile = files.find(f => f.includes(`[${idMatch[1]}]`) && !f.endsWith('.part') && !/\.f\d+\./.test(f));
      }
    }
  } catch (err) {
    console.error('Error searching downloads:', err);
  }

  if (!matchedFile) {
    return res.status(404).send('Arquivo não encontrado no servidor.');
  }

  const filePath = path.join(DOWNLOADS_DIR, matchedFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo não encontrado no servidor.');
  }

  const stat = fs.statSync(filePath);
  const safeAscii = matchedFile.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(matchedFile);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedName}`);

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    console.error('File stream error:', err);
    if (!res.headersSent) res.status(500).send('Erro ao transmitir arquivo.');
  });
  stream.pipe(res);
});

/**
 * API: Open the downloads folder in Windows Explorer
 */
app.post('/api/open-folder', (req, res) => {
  if (isWindows) {
    exec(`explorer.exe "${DOWNLOADS_DIR}"`, (err) => {
      if (err) {
        console.error('Error opening folder:', err);
        return res.status(500).json({ error: 'Não foi possível abrir a pasta.' });
      }
      res.json({ success: true, path: DOWNLOADS_DIR });
    });
  } else {
    res.json({
      success: true,
      path: DOWNLOADS_DIR,
      message: 'Arquivos salvos no volume /app/downloads.'
    });
  }
});

/**
 * API: List downloaded files history
 */
app.get('/api/history', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const history = files
      .filter(name => !name.startsWith('.') && !name.endsWith('.part') && !name.endsWith('.ytdl') && !/\.f\d+\./.test(name))
      .map(name => {
        const fullPath = path.join(DOWNLOADS_DIR, name);
        const stats = fs.statSync(fullPath);
        return {
          name,
          size: stats.size,
          sizeFormatted: (stats.size / (1024 * 1024)).toFixed(1) + ' MB',
          date: stats.mtime
        };
      })
      .sort((a, b) => b.date - a.date);

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar histórico.' });
  }
});

/**
 * API: Cancel active job
 */
app.post('/api/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);
  if (job && job.process && !job.completed) {
    try {
      job.process.kill();
      job.status = 'cancelado';
      job.statusText = 'Download cancelado pelo usuário.';
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Não foi possível cancelar o processo.' });
    }
  } else {
    res.json({ success: false, message: 'Processo não estava em execução.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 YouTube Downloader Web rodando em: http://localhost:${PORT}`);
  console.log(`📂 Pasta de downloads: ${DOWNLOADS_DIR}`);
  console.log(`⚡ yt-dlp e FFmpeg integrados e prontos`);
  console.log(`======================================================\n`);
});
