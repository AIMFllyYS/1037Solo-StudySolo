#!/bin/bash
# Trusted build only. No tenant data, Account grants or cloud secrets in a template.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export PLAYWRIGHT_BROWSERS_PATH=/opt/studysolo/browsers
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=60000
export PIP_DISABLE_PIP_VERSION_CHECK=1
mkdir -p /opt/studysolo/bin
for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.sources; do
  if test "${STUDYSOLO_APT_MIRROR:-aliyun}" != aliyun; then continue; fi
  if test -f "$source"; then
    sed -i -e 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g' \
      -e 's|http://security.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g' \
      -e 's|http://archive.ubuntu.com/ubuntu|https://mirrors.aliyun.com/ubuntu|g' \
      -e 's|http://security.ubuntu.com/ubuntu|https://mirrors.aliyun.com/ubuntu|g' "$source"
  fi
done
apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=0 -o Acquire::http::Timeout=30 update
audio_package=libasound2
if apt-cache show libasound2t64 >/dev/null 2>&1; then audio_package=libasound2t64; fi
apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=0 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
  python3-venv poppler-utils libreoffice-writer fonts-noto-cjk fonts-liberation \
  fontconfig git ca-certificates nodejs npm libnss3 libatk-bridge2.0-0 libxkbcommon0 libgbm1 "$audio_package"
python3 -m venv /opt/studysolo/venv
/opt/studysolo/venv/bin/pip install --retries 0 --timeout 30 \
  python-docx==1.2.0 pypdf==6.19.0 pypdfium2==5.13.0 Pillow==12.3.0 \
  numpy==2.5.3 pdf2image==1.17.0 reportlab==5.0.1 pdfplumber==0.11.10
npm install --prefix /opt/studysolo --ignore-scripts --no-audit --no-fund playwright@1.63.0 docx@9.8.1
/opt/studysolo/node_modules/.bin/playwright install --with-deps chromium
# Python discovers pyvenv.cfg relative to the invocation path. A symlink in a
# different bin directory can silently use the system prefix and lose packages.
# Publish a wrapper atomically so an older alias is never followed/overwritten.
for interpreter in python python3; do
  printf '#!/bin/sh\nexec /opt/studysolo/venv/bin/%s "$@"\n' "$interpreter" > "/opt/studysolo/bin/$interpreter.next"
  chmod 0755 "/opt/studysolo/bin/$interpreter.next"
  mv -f "/opt/studysolo/bin/$interpreter.next" "/opt/studysolo/bin/$interpreter"
done
chmod -R a+rX /opt/studysolo
printf '{"version":"skills-runtime-v1-20261004","renderer":"LibreOffice","wordWpsVerified":false}\n' > /opt/studysolo/runtime-ready.json
