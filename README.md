# 🎬 BaixaTudo - YouTube Downloader Pro

Uma aplicação web moderna, elegante e de alta performance para baixar vídeos e extrair músicas do YouTube com pré-visualização em tempo real e seleção de qualidade.

---

## ✨ Recursos

- ⚡ **Pré-visualização Instantânea**: Exibe thumbnail em alta definição, título, canal, visualizações, data e duração exata do vídeo antes de baixar.
- 🎥 **Vídeo (MP4)**: Suporte a diversas resoluções (Melhor qualidade disponível / 4K / 1080p Full HD / 720p HD / 480p SD).
- 🎵 **Áudio (MP3 / M4A)**: Extração em MP3 320 kbps (alta fidelidade), 192 kbps ou stream nativo AAC (M4A).
- 📊 **Progresso em Tempo Real**: Barra de progresso com Server-Sent Events (SSE), indicando porcentagem, velocidade (MB/s), tamanho estimado e tempo restante (ETA).
- 🐳 **Pronto para Docker**: Totalmente conteinerizado com Node 20, Python 3, FFmpeg e yt-dlp em Linux Debian/Ubuntu.
- 🎨 **Interface Moderna e Responsiva**: Dark mode refinado com glassmorphism, gradientes e micro-animações fluidas.

---

## 🐳 Deploy no Docker (Ubuntu 24.04 / Hostinger VPS)

### 1. Clonar o repositório no seu servidor
Conecte-se via SSH ao seu servidor na Hostinger e execute:
```bash
git clone https://github.com/lleandrovalois/baixatudo.git
cd baixatudo
```

### 2. Subir a aplicação com Docker Compose
```bash
docker compose up -d --build
```

A aplicação estará disponível em:
**`http://SEU_IP_DO_SERVIDOR:3000`**

### 3. Como atualizar no servidor após novos commits
Sempre que fizer alterações no GitHub, basta rodar no servidor:
```bash
git pull origin main
docker compose up -d --build
```

---

## 💻 Executando Localmente no Windows

### Início Rápido
Dê dois cliques no arquivo:
```
iniciar.bat
```
Ou via terminal:
```bash
npm install
npm start
```
Acesse: **`http://localhost:3333`**

---

## 📁 Estrutura do Projeto

```
baixatudo/
├── Dockerfile           # Imagem Linux com Node 20, FFmpeg, Python3 e yt-dlp
├── docker-compose.yml   # Orquestração do container e mapeamento de volumes
├── server.js            # Backend Express multiplataforma (Windows e Linux)
├── public/              # Interface Web moderna
│   ├── index.html       # HTML5 semântico
│   ├── style.css        # Dark mode e animações
│   └── app.js           # Lógica do cliente e SSE
├── downloads/           # Volume persistente para os arquivos baixados
├── package.json         # Dependências do Node.js
└── iniciar.bat          # Inicializador para Windows
```
